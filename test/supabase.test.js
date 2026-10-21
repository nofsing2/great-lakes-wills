// Production wiring: sign-in codes and private files go through Supabase. This runs the
// server against a small stand-in for Supabase's Auth and Storage APIs, so the calls the
// site makes (paths, methods, bodies) are checked without a real Supabase project.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { youngFamilyCouple } from './fixtures.js';
import { startServer } from './helpers.js';

const calls = [];
const objects = new Map(); // "bucket/path" -> Buffer
const codes = new Map(); // email -> code
const users = new Map(); // email -> id
let fake; let fakeUrl; let t;

function readBody(req) {
  return new Promise((resolve) => { const parts = []; req.on('data', (c) => parts.push(c)); req.on('end', () => resolve(Buffer.concat(parts))); });
}

before(async () => {
  fake = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const body = await readBody(req);
    const json = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    calls.push(`${req.method} ${url.pathname}`);
    // Signed download links work without a key (that's their purpose); everything else needs one.
    if (!req.headers.apikey && !(req.method === 'GET' && url.pathname.startsWith('/storage/v1/object/sign/'))) return json(401, { message: 'no apikey' });
    // ---- Auth ----
    if (req.method === 'POST' && url.pathname === '/auth/v1/otp') {
      const { email } = JSON.parse(body);
      codes.set(email, '424242');
      return json(200, {});
    }
    if (req.method === 'POST' && url.pathname === '/auth/v1/verify') {
      const { email, token, type } = JSON.parse(body);
      if (type !== 'email' || codes.get(email) !== token) return json(403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' });
      codes.delete(email);
      if (!users.has(email)) users.set(email, `0000000${users.size}-aaaa-bbbb-cccc-dddddddddddd`);
      const user = { id: users.get(email), email, aud: 'authenticated', role: 'authenticated' };
      return json(200, { access_token: 'x', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'y', user });
    }
    // ---- Storage ----
    let m;
    if (req.method === 'GET' && (m = url.pathname.match(/^\/storage\/v1\/bucket\/(.+)$/))) {
      return objects.has(`bucket:${m[1]}`) ? json(200, { id: m[1], name: m[1], public: false }) : json(400, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' });
    }
    if (req.method === 'POST' && url.pathname === '/storage/v1/bucket') {
      const b = JSON.parse(body);
      assert.equal(b.public, false);
      objects.set(`bucket:${b.name}`, Buffer.alloc(0));
      return json(200, { name: b.name });
    }
    if (req.method === 'POST' && (m = url.pathname.match(/^\/storage\/v1\/object\/upload\/sign\/(.+)$/))) {
      return json(200, { url: `/object/upload/sign/${m[1]}?token=up-${encodeURIComponent(m[1])}` });
    }
    if (req.method === 'PUT' && (m = url.pathname.match(/^\/storage\/v1\/object\/upload\/sign\/(.+)$/))) {
      if (url.searchParams.get('token') !== `up-${m[1]}`) return json(400, { message: 'bad token' });
      objects.set(decodeURIComponent(m[1]), body);
      return json(200, { Key: m[1] });
    }
    if (req.method === 'POST' && (m = url.pathname.match(/^\/storage\/v1\/object\/sign\/(.+)$/))) {
      return json(200, { signedURL: `/object/sign/${m[1]}?token=dl` });
    }
    if (req.method === 'GET' && (m = url.pathname.match(/^\/storage\/v1\/object\/sign\/(.+)$/))) {
      const buf = objects.get(decodeURIComponent(m[1]));
      if (!buf) return json(404, { message: 'not found' });
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); return res.end(buf);
    }
    if (req.method === 'POST' && (m = url.pathname.match(/^\/storage\/v1\/object\/list\/(.+)$/))) {
      const { prefix, search } = JSON.parse(body);
      const names = [...objects.keys()].filter((k) => k.startsWith(`${m[1]}/${prefix}/`)).map((k) => k.split('/').pop());
      return json(200, names.filter((n) => !search || n.includes(search)).map((name) => ({ name, id: name })));
    }
    if (req.method === 'POST' && (m = url.pathname.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/))) {
      objects.set(`${m[1]}/${decodeURIComponent(m[2])}`, body);
      return json(200, { Key: `${m[1]}/${m[2]}` });
    }
    if (req.method === 'DELETE' && (m = url.pathname.match(/^\/storage\/v1\/object\/([^/]+)$/))) {
      const { prefixes } = JSON.parse(body);
      prefixes.forEach((p) => objects.delete(`${m[1]}/${p}`));
      return json(200, []);
    }
    return json(404, { message: `fake: no route ${req.method} ${url.pathname}` });
  });
  await new Promise((r) => fake.listen(0, r));
  fakeUrl = `http://127.0.0.1:${fake.address().port}`;
  t = await startServer({ SUPABASE_URL: fakeUrl, SUPABASE_ANON_KEY: 'anon-key', SUPABASE_SERVICE_ROLE_KEY: 'service-key', SUPABASE_BUCKET: 'client-files' });
});
after(() => { t?.stop(); fake?.close(); });

test('sign-in uses Supabase email codes and keeps Supabase user ids', async () => {
  const c = t.client();
  assert.equal((await c('/api/auth/start', { method: 'POST', body: { email: 'Jordan@Example.com' } })).status, 200);
  assert.ok(calls.includes('POST /auth/v1/otp'));
  assert.equal(codes.get('jordan@example.com'), '424242');
  assert.equal((await c('/api/auth/verify', { method: 'POST', body: { email: 'jordan@example.com', code: '111111' } })).status, 401);
  const ok = await c('/api/auth/verify', { method: 'POST', body: { email: 'jordan@example.com', code: '424242' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.newUser, true);
  assert.equal((await c('/api/me')).data.user.id, users.get('jordan@example.com'));
});

test('signed copies and revised documents live in the private Supabase bucket', async () => {
  // A client with an approved plan.
  codes.clear();
  const c = t.client();
  await c('/api/auth/start', { method: 'POST', body: { email: 'pat@example.com' } });
  await c('/api/auth/verify', { method: 'POST', body: { email: 'pat@example.com', code: codes.get('pat@example.com') } });
  await c('/api/matter/answers', { method: 'PUT', body: { answers: youngFamilyCouple } });
  await c('/api/matter/checkout', { method: 'POST', body: { acceptEngagement: true } });
  await c('/api/matter/test-pay', { method: 'POST' });
  const att = t.client();
  await att('/api/auth/start', { method: 'POST', body: { email: 'attorney@example.com' } });
  await att('/api/auth/verify', { method: 'POST', body: { email: 'attorney@example.com', code: codes.get('attorney@example.com') } });
  const id = (await att('/api/attorney/matters')).data[0].id;
  await att(`/api/attorney/matters/${id}/review`, { method: 'PUT', body: { checklist: { conflict_check: true, identity: true, documents_reviewed: true, notes_removed: true } } });
  assert.equal((await att(`/api/attorney/matters/${id}/approve`, { method: 'POST' })).status, 200);

  // Client upload goes straight to the bucket with a signed link.
  const file = Buffer.from('%PDF-1.4 signed');
  const start = await c('/api/matter/uploads/start', { method: 'POST', body: { filename: 'signed.pdf', mime: 'application/pdf', size: file.length } });
  assert.equal(start.status, 200, JSON.stringify(start.data));
  assert.ok(start.data.url.startsWith(`${fakeUrl}/storage/v1/object/upload/sign/client-files/matters/${id}/signed/`));
  assert.equal(start.data.headers.apikey, 'anon-key');
  // Before the file arrives, completing is refused.
  assert.equal((await c('/api/matter/uploads/complete', { method: 'POST', body: { path: start.data.path, filename: 'signed.pdf', mime: 'application/pdf', size: file.length } })).status, 400);
  const put = await fetch(start.data.url, { method: 'PUT', headers: start.data.headers, body: file });
  assert.equal(put.status, 200);
  const done = await c('/api/matter/uploads/complete', { method: 'POST', body: { path: start.data.path, filename: 'signed.pdf', mime: 'application/pdf', size: file.length } });
  assert.equal(done.status, 200, JSON.stringify(done.data));
  assert.ok(objects.has(`client-files/${start.data.path}`));

  // The attorney downloads through a short-lived signed link.
  const up = (await att(`/api/attorney/matters/${id}`)).data.uploads[0];
  const dl = await att(`/api/attorney/matters/${id}/uploads/${up.id}`, { raw: true, redirect: 'manual' });
  assert.equal(dl.status, 303);
  const loc = dl.headers.get('location');
  assert.match(loc, /\/storage\/v1\/object\/sign\/client-files\/matters\/\d+\/signed\/.+\?token=dl&download=signed\.pdf/);
  assert.equal(Buffer.from(await (await fetch(loc)).arrayBuffer()).toString(), '%PDF-1.4 signed');

  // Revised Word file: stored server-side, served to the client by signed link.
  const docx = Buffer.concat([Buffer.from('PK'), Buffer.alloc(50)]);
  assert.equal((await att(`/api/attorney/matters/${id}/revised/will%3Ap1`, { method: 'POST', body: docx, headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': 'Will.docx' } })).status, 200);
  assert.ok([...objects.keys()].some((k) => /^client-files\/matters\/\d+\/revised\/.+\.docx$/.test(k)));
  const rev = await c('/api/matter/revised/will%3Ap1', { raw: true, redirect: 'manual' });
  assert.equal(rev.status, 303);

  // Removing the client's upload deletes the stored file.
  await c(`/api/matter/uploads/${up.id}`, { method: 'DELETE' });
  assert.ok(!objects.has(`client-files/${start.data.path}`));
  assert.ok(calls.includes('POST /storage/v1/bucket'), 'bucket created as private on first use');
});
