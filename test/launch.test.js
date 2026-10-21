// Launch features: health check, security headers, email-code sign-in limits,
// attorney two-step sign-in, email content, PDF downloads, and data export.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { youngFamilyCouple } from './fixtures.js';
import { startServer } from './helpers.js';

let t; let totpCode;
before(async () => {
  t = await startServer({ ATTORNEY_EMAILS: 'luke@example.com, Second@Example.com', REQUIRE_ATTORNEY_2FA: '1', BASE_URL: 'https://example.test' });
  ({ totpCode } = await import('../server/security.js'));
});
after(() => t?.stop());

test('health check and security headers (server and vercel.json agree)', async () => {
  const c = t.client();
  assert.equal((await c('/healthz')).status, 200);
  const r = await c('/');
  assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
  assert.match(r.headers.get('content-security-policy'), /connect-src 'self' https:\/\/\*\.supabase\.co/);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal((await c('/api/me')).headers.get('cache-control'), 'no-store');
  const { SECURITY_HEADERS } = await import('../server/headers.js');
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url)));
  const all = Object.fromEntries(vercel.headers.find((x) => x.source === '/(.*)').headers.map((x) => [x.key, x.value]));
  assert.deepEqual(all, SECURITY_HEADERS);
});

test('sign-in codes: one use, wrong codes lock out, sessions end on sign-out', async () => {
  const c = t.client();
  assert.equal((await c('/api/auth/start', { method: 'POST', body: { email: 'not-an-email' } })).status, 400);
  await c('/api/auth/start', { method: 'POST', body: { email: 'Pat@Example.com' } });
  const mail = t.lastMailTo('pat@example.com');
  assert.match(mail.subject, /sign-in code/);
  const code = t.codeFor('pat@example.com');
  const wrong = code === '123456' ? '654321' : '123456';
  assert.equal((await c('/api/auth/verify', { method: 'POST', body: { email: 'pat@example.com', code: wrong } })).status, 401);
  const ok = await c('/api/auth/verify', { method: 'POST', body: { email: 'pat@example.com', code } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.role, 'client');
  assert.equal((await c('/api/matter')).status, 200);
  // Codes work once.
  assert.equal((await t.client()('/api/auth/verify', { method: 'POST', body: { email: 'pat@example.com', code } })).status, 401);
  // Name is asked once and saved.
  assert.equal(ok.data.needsName, true);
  await c('/api/me', { method: 'PUT', body: { name: 'Pat Doe' } });
  assert.equal((await c('/api/me')).data.user.name, 'Pat Doe');
  const again = await t.signIn('pat@example.com');
  assert.equal(again.verify.data.newUser, false);
  assert.equal(again.verify.data.needsName, false);
  // Sign out everywhere ends both sessions.
  await again('/api/auth/logout-everywhere', { method: 'POST' });
  assert.equal((await c('/api/matter')).status, 401);

  // Five wrong codes lock the address, even with the right code after.
  const x = t.client();
  await x('/api/auth/start', { method: 'POST', body: { email: 'lock@example.com' } });
  const good = t.codeFor('lock@example.com');
  const bad = good === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i += 1) assert.equal((await x('/api/auth/verify', { method: 'POST', body: { email: 'lock@example.com', code: bad } })).status, 401);
  assert.equal((await x('/api/auth/verify', { method: 'POST', body: { email: 'lock@example.com', code: good } })).status, 429);

  // Too many code requests for one address are refused.
  const y = t.client();
  let last;
  for (let i = 0; i < 6; i += 1) last = await y('/api/auth/start', { method: 'POST', body: { email: 'spam@example.com' } });
  assert.equal(last.status, 429);
});

test('attorney must turn on two-step sign-in; client emails carry no plan details; PDFs download; export works', async () => {
  // A paid client plan.
  const c = await t.signIn('jordan@example.com');
  await c('/api/matter/answers', { method: 'PUT', body: { answers: youngFamilyCouple } });
  await c('/api/matter/checkout', { method: 'POST', body: { acceptEngagement: true } });
  await c('/api/matter/test-pay', { method: 'POST' });
  assert.match(t.lastMailTo('luke@truckeynofsinger.com').subject, /New plan to review/);
  // Clients never reach attorney routes, even by guessing.
  assert.equal((await c('/api/attorney/matters')).status, 403);

  const att = await t.signIn('luke@example.com');
  assert.equal(att.verify.data.role, 'attorney');
  let r = await att('/api/attorney/matters');
  assert.equal(r.status, 403);
  assert.equal(r.data.needs2fa, true);

  const setup = (await att('/api/attorney/2fa/setup', { method: 'POST' })).data;
  assert.match(setup.qr, /^<svg/);
  assert.equal((await att('/api/attorney/2fa/enable', { method: 'POST', body: { code: '000000' } })).status, 400);
  assert.equal((await att('/api/attorney/2fa/enable', { method: 'POST', body: { code: totpCode(setup.secret) } })).status, 200);

  // Next sign-in: email code, then authenticator code. The half-signed-in state opens nothing.
  const att2 = await t.signIn('luke@example.com');
  assert.equal(att2.verify.data.needsTotp, true);
  assert.equal((await att2('/api/attorney/matters')).status, 403);
  assert.equal((await att2('/api/me')).data.pendingTotp, true);
  assert.equal((await att2('/api/auth/totp', { method: 'POST', body: { code: '000000' } })).status, 401);
  r = await att2('/api/auth/totp', { method: 'POST', body: { code: totpCode(setup.secret) } });
  assert.equal(r.status, 200);
  const list = (await att2('/api/attorney/matters')).data;
  const id = list[0].id;

  const pdf = await att2(`/api/attorney/matters/${id}/package.pdf?notes=1`, { raw: true });
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), '%PDF');
  const one = await att2(`/api/attorney/matters/${id}/doc/will%3Ap1.docx`, { raw: true });
  assert.equal(Buffer.from(await one.arrayBuffer()).subarray(0, 2).toString(), 'PK');

  await att2(`/api/attorney/matters/${id}/review`, { method: 'PUT', body: { checklist: { conflict_check: true, identity: true, documents_reviewed: true, notes_removed: true } } });
  assert.equal((await att2(`/api/attorney/matters/${id}/approve`, { method: 'POST' })).status, 200);
  const approvedMail = t.lastMailTo('jordan@example.com');
  assert.match(approvedMail.subject, /documents are ready/);
  assert.match(approvedMail.text, /https:\/\/example\.test\/app\.html#\/status/);
  assert.doesNotMatch(approvedMail.text, /Maria|Rivera|Kent County|\$/, 'no plan details in email');

  const cp = await c('/api/matter/download.pdf', { raw: true });
  assert.equal(cp.status, 200);
  assert.equal(Buffer.from(await cp.arrayBuffer()).subarray(0, 4).toString(), '%PDF');

  const exp = await att2('/api/attorney/export.json');
  assert.equal(exp.status, 200);
  assert.ok(exp.data.tables.matters.length >= 1);
  assert.ok(exp.data.tables.users.every((u) => !('totp_secret' in u)), 'no authenticator secrets in exports');

  // Removing an address from ATTORNEY_EMAILS takes away access immediately.
  const saved = process.env.ATTORNEY_EMAILS;
  process.env.ATTORNEY_EMAILS = 'someone-else@example.com';
  assert.equal((await att2('/api/attorney/matters')).status, 403);
  process.env.ATTORNEY_EMAILS = saved;
});

test('production refuses to run without its settings', async () => {
  const { missingConfig } = await import('../server/app.js');
  assert.deepEqual(missingConfig, [], 'test mode needs none');
});

test('Stripe payment notice marks the order paid once, and forged notices are refused', async () => {
  const { createHmac } = await import('node:crypto');
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  const c = await t.signIn('stripe-client@example.com');
  await c('/api/matter/answers', { method: 'PUT', body: { answers: youngFamilyCouple } });
  await c('/api/matter/checkout', { method: 'POST', body: { acceptEngagement: true } });
  const { id } = (await c('/api/matter')).data;
  const event = JSON.stringify({ type: 'checkout.session.completed', data: { object: { metadata: { matter_id: String(id) }, payment_intent: 'pi_123', amount_total: 94500, payment_status: 'paid' } } });
  const sign = (body, secret = 'whsec_test') => {
    const ts = Math.floor(Date.now() / 1000);
    return `t=${ts},v1=${createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')}`;
  };
  const post = (body, sig) => fetch(`${t.base}/api/stripe/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sig }, body });
  assert.equal((await post(event, sign(event, 'wrong'))).status, 400);
  assert.equal((await c('/api/matter')).data.status, 'awaiting_payment');
  assert.equal((await post(event, sign(event))).status, 200);
  assert.equal((await post(event, sign(event))).status, 200, 'repeat notices are fine');
  const m = (await c('/api/matter')).data;
  assert.equal(m.status, 'in_review');
  assert.ok(m.paidAt);
  delete process.env.STRIPE_WEBHOOK_SECRET;
});
