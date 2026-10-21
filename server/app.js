// Great Lakes Wills & Estate — web server (Express). Runs on Vercel in production
// (see ../server.js) and with `npm start` locally.
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import { many, one, query, logEvent, TABLES } from './db.js';
import {
  cookieHeader, createSession, destroySession, destroyUserSessions, isAttorneyEmail, requireAjaxHeader, requireAttorney,
  requireUser, sessionMiddleware,
} from './auth.js';
import { sendCode, verifyCode } from './signin.js';
import { checkLocalToken, localRead, localWrite, putObject, removeObject, signedDownload, signedUpload, storageMode, exists } from './storage.js';
import { ENGAGEMENT_VERSION, engagementText } from './engagement.js';
import { createCheckout, mode as paymentMode, refund, verifyWebhook } from './payments.js';
import { renderDocx } from './render-docx.js';
import { renderPdf } from './render-pdf.js';
import { emails, firmInbox, sendMail } from './mail.js';
import { clearLimit, limited, newTotpSecret, otpauthUrl, overLimit, rateLimit, verifyTotp } from './security.js';
import { SECURITY_HEADERS } from './headers.js';
import { buildDocument, evaluate, fulfillmentItems, generatePackage, incompleteSteps, summarize } from '../public/engine/index.js';
import { renderDocHtml } from '../public/engine/render-html.js';
import { FIRM } from '../public/engine/constants.js';
import { fullName, get, listJoin } from '../public/engine/util.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PROD = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
const app = express();
app.disable('x-powered-by');
// Vercel sits in front of the app and sets the client's address and HTTPS headers.
app.set('trust proxy', 1);

// Wraps async route handlers so a thrown error reaches the error handler.
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// In production every one of these must be set, or the site refuses to take orders.
const REQUIRED = ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY',
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'BASE_URL', 'ATTORNEY_EMAILS'];
export const missingConfig = PROD ? REQUIRED.filter((k) => !process.env[k]) : [];
if (missingConfig.length) console.error(`Setup incomplete. Missing environment variables: ${missingConfig.join(', ')}`);

app.get('/healthz', h(async (req, res) => {
  if (missingConfig.length) return res.status(503).json({ ok: false, missing: missingConfig });
  await query('SELECT 1');
  res.json({ ok: true });
}));
app.use('/api', (req, res, next) => (missingConfig.length
  ? res.status(503).json({ error: 'The site is being set up. Please check back soon.' })
  : next()));

// Stripe webhook needs the raw body, so it is registered before the JSON parser.
app.post('/api/stripe/webhook', express.raw({ type: '*/*', limit: '1mb' }), h(async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
  if (!verifyWebhook(raw, req.get('Stripe-Signature'))) return res.status(400).send('bad signature');
  const event = JSON.parse(raw);
  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    const matterId = Number(s.metadata?.matter_id);
    if (matterId && s.payment_status === 'paid') await markPaid(matterId, 'stripe', s.payment_intent, s.amount_total, null);
  }
  res.json({ received: true });
}));

app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.set(k, v);
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  next();
});
app.use(sessionMiddleware);
app.use('/api', requireAjaxHeader);
// On Vercel, files in public/ are served by its CDN before requests reach this app.
app.use(express.static(join(ROOT, 'public')));

const parse = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };
const EDITABLE = new Set(['draft', 'changes_requested', 'awaiting_payment']);
const safeName = (s, fallback) => String(s || '').replace(/[^\w.\- ]/g, '').slice(0, 120) || fallback;
const rid = () => randomBytes(9).toString('base64url');

// Sends one of the templates in mail.js. Mail failures are logged, never thrown.
async function notify(to, message) {
  await sendMail({ to, ...message });
}

async function currentMatter(userId) {
  let m = await one('SELECT * FROM matters WHERE user_id = ? ORDER BY id DESC LIMIT 1', [userId]);
  if (!m) {
    m = await one('INSERT INTO matters (user_id) VALUES (?) RETURNING *', [userId]);
    await logEvent(m.id, userId, 'matter_created');
  }
  return m;
}
const matterById = (id) => one('SELECT * FROM matters WHERE id = ?', [id]);

async function markPaid(matterId, provider, ref, amountCents, actorId) {
  // Only the first payment notice counts (Stripe may send the same event twice).
  const m = await one(`UPDATE matters SET status = 'in_review', paid_at = now(), updated_at = now()
    WHERE id = ? AND paid_at IS NULL RETURNING *`, [matterId]);
  if (!m) return;
  await query('INSERT INTO payments (matter_id, provider, provider_ref, amount_cents, status) VALUES (?, ?, ?, ?, ?)', [matterId, provider, ref || null, amountCents ?? m.price_cents, 'paid']);
  await logEvent(matterId, actorId, 'paid', { provider, ref });
  await notify(firmInbox(), emails.newOrder(matterId));
}

async function checklistFor(matterId) {
  const r = await one('SELECT checklist FROM reviews WHERE matter_id = ?', [matterId]);
  return parse(r?.checklist, {});
}

async function fulfillmentFor(m, answers) {
  const checks = await checklistFor(m.id);
  return fulfillmentItems(answers).map((i) => ({ ...i, done: !!checks[i.key] }));
}

const uploadsFor = (matterId) => many('SELECT id, filename, mime, size, created_at FROM uploads WHERE matter_id = ? ORDER BY id', [matterId]);

function extrasText(a) {
  const out = [];
  const couple = a.plan === 'couple';
  if (get(a, 'extras.deposit') === 'yes') out.push(`deposit your signed ${couple ? 'wills' : 'will'} with the ${a.address?.county || ''} County Probate Court for safekeeping and send you the certificate of deposit`);
  if (get(a, 'extras.courtesy') === 'yes') {
    const names = (get(a, 'extras.recipients') || []).map((r) => r?.name).filter(Boolean);
    out.push(`send courtesy packets, limited to the information you selected, to ${listJoin(names)}`);
  }
  return out;
}

async function clientView(m) {
  const answers = parse(m.answers, {});
  const evaluation = evaluate(answers);
  return {
    id: m.id,
    status: m.status,
    answers,
    eligible: evaluation.eligible,
    flags: evaluation.flags,
    price: evaluation.price,
    documents: evaluation.documents.map(({ id, title, owner }) => ({ id, title, owner })),
    summary: summarize(answers),
    incomplete: incompleteSteps(answers).map((s) => ({ key: s.key, title: s.title })),
    paidAt: m.paid_at,
    approvedAt: m.approved_at,
    paymentMode,
    fulfillment: ['approved', 'completed'].includes(m.status) ? await fulfillmentFor(m, answers) : [],
    uploads: await uploadsFor(m.id),
    extras: { deposit: get(answers, 'extras.deposit') === 'yes', courtesy: get(answers, 'extras.courtesy') === 'yes' },
    firm: { name: FIRM.legalEntity, address: FIRM.address },
  };
}

// ---------------- Sign-in (email code; attorneys also use an authenticator app) ----------------
const FIFTEEN_MIN = 15 * 60 * 1000;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const cleanEmail = (e) => String(e || '').trim().toLowerCase().slice(0, 254);

app.post('/api/auth/start', rateLimit('code-ip', 15, FIFTEEN_MIN), h(async (req, res) => {
  const email = cleanEmail(req.body?.email);
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email.' });
  if (await limited(`code-email:${email}`, 5, FIFTEEN_MIN)) return res.status(429).json({ error: 'Too many codes requested for this email. Please wait 15 minutes.' });
  try {
    await sendCode(email);
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message });
  }
  res.json({ ok: true });
}));

app.post('/api/auth/verify', rateLimit('verify-ip', 30, FIFTEEN_MIN), h(async (req, res) => {
  const email = cleanEmail(req.body?.email);
  const failKey = `verify-fail:${email}`;
  if (await overLimit(failKey, 5)) return res.status(429).json({ error: 'Too many wrong codes. Please wait 15 minutes and request a new one.' });
  let who;
  try {
    who = await verifyCode(email, req.body?.code);
  } catch (e) {
    await limited(failKey, 5, FIFTEEN_MIN);
    return res.status(e.status || 401).json({ error: e.message });
  }
  await clearLimit(failKey);
  const role = isAttorneyEmail(who.email) ? 'attorney' : 'client';
  let u = await one('SELECT * FROM users WHERE email = ?', [who.email]);
  const newUser = !u;
  if (u) {
    if (u.role !== role) u = await one('UPDATE users SET role = ? WHERE id = ? RETURNING *', [role, u.id]);
  } else {
    u = await one('INSERT INTO users (id, email, role) VALUES (?, ?, ?) RETURNING *', [who.id, who.email, role]);
    await logEvent(null, u.id, 'account_created');
  }
  if (u.role === 'attorney' && u.totp_enabled) {
    const pending = await createSession(u.id, 'totp');
    return res.set('Set-Cookie', cookieHeader(pending, { stage: 'totp' })).json({ needsTotp: true });
  }
  const token = await createSession(u.id);
  await logEvent(null, u.id, 'login', { ip: req.ip });
  res.set('Set-Cookie', cookieHeader(token)).json({ ok: true, role: u.role, newUser, needsName: !u.name });
}));

// Second step for attorneys: the 6-digit code from the authenticator app.
app.post('/api/auth/totp', h(async (req, res) => {
  const p = req.pendingUser;
  if (!p) return res.status(401).json({ error: 'Your sign-in expired. Start again.' });
  const failKey = `totp-fail:${p.id}`;
  if (await overLimit(failKey, 5)) return res.status(429).json({ error: 'Too many attempts. Please wait 15 minutes.' });
  const u = await one('SELECT * FROM users WHERE id = ?', [p.id]);
  if (!verifyTotp(u.totp_secret, req.body?.code)) {
    await limited(failKey, 5, FIFTEEN_MIN);
    return res.status(401).json({ error: 'That code didn’t work. Check your authenticator app and try again.' });
  }
  await clearLimit(failKey);
  await destroySession(req.sessionToken);
  const token = await createSession(u.id);
  await logEvent(null, u.id, 'login', { ip: req.ip, totp: true });
  res.set('Set-Cookie', cookieHeader(token)).json({ ok: true, role: u.role });
}));

app.post('/api/auth/logout', h(async (req, res) => {
  if (req.sessionToken) await destroySession(req.sessionToken);
  res.set('Set-Cookie', cookieHeader('', { clear: true })).json({ ok: true });
}));

app.post('/api/auth/logout-everywhere', requireUser, h(async (req, res) => {
  await destroyUserSessions(req.user.id);
  res.set('Set-Cookie', cookieHeader('', { clear: true })).json({ ok: true });
}));

app.get('/api/me', (req, res) => res.json({ user: req.user || null, pendingTotp: !!req.pendingUser, firm: FIRM }));

app.put('/api/me', requireUser, h(async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 120);
  if (!name) return res.status(400).json({ error: 'Enter your name.' });
  await query('UPDATE users SET name = ? WHERE id = ?', [name, req.user.id]);
  res.json({ ok: true });
}));

// ---------------- Client ----------------
app.get('/api/matter', requireUser, h(async (req, res) => res.json(await clientView(await currentMatter(req.user.id)))));

app.put('/api/matter/answers', requireUser, h(async (req, res) => {
  const m = await currentMatter(req.user.id);
  if (!EDITABLE.has(m.status)) return res.status(409).json({ error: 'Your plan is with the attorney and can’t be edited right now.' });
  const answers = req.body?.answers;
  if (!answers || typeof answers !== 'object') return res.status(400).json({ error: 'Missing answers.' });
  const status = m.status === 'awaiting_payment' ? 'draft' : m.status;
  const updated = await one('UPDATE matters SET answers = ?, status = ?, updated_at = now() WHERE id = ? RETURNING *', [JSON.stringify(answers), status, m.id]);
  res.json(await clientView(updated));
}));

app.get('/api/matter/engagement', requireUser, h(async (req, res) => {
  const m = await currentMatter(req.user.id);
  const a = parse(m.answers, {});
  const ev = evaluate(a);
  const names = ['p1', 'p2'].map((k) => fullName(a[k])).filter(Boolean).join(' and ');
  const docTitles = [...new Set(ev.documents.filter((d) => !['signing', 'deposit', 'courtesy'].includes(d.type)).map((d) => d.title.split(' — ')[0]))].join('; ');
  const costs = ev.price.lines.filter((l) => l.kind === 'cost').reduce((t, l) => t + l.amount, 0);
  res.json({ version: ENGAGEMENT_VERSION, text: engagementText({ clientNames: names || '(client)', documents: docTitles, total: ev.price.total, extras: extrasText(a), costs }) });
}));

app.post('/api/matter/checkout', requireUser, h(async (req, res) => {
  const m = await currentMatter(req.user.id);
  if (!['draft', 'awaiting_payment'].includes(m.status)) return res.status(409).json({ error: 'This plan has already been submitted.' });
  const a = parse(m.answers, {});
  a.checkout = { rush: !!req.body?.rush };
  const ev = evaluate(a);
  if (!ev.eligible) return res.status(409).json({ error: 'This plan needs a consultation instead of the flat-fee package.' });
  const missing = incompleteSteps(a);
  if (missing.length) return res.status(409).json({ error: `Please finish: ${missing.map((s) => s.title).join(', ')}.` });
  if (req.body?.acceptEngagement !== true) return res.status(400).json({ error: 'Please accept the engagement terms.' });
  const cents = ev.price.total * 100;
  await query(`UPDATE matters SET answers = ?, evaluation = ?, price_cents = ?, status = 'awaiting_payment', engagement_accepted_at = now(),
    engagement_ip = ?, engagement_version = ?, updated_at = now() WHERE id = ?`,
  [JSON.stringify(a), JSON.stringify({ flags: ev.flags, documents: ev.documents }), cents, req.ip, ENGAGEMENT_VERSION, m.id]);
  await logEvent(m.id, req.user.id, 'engagement_accepted', { version: ENGAGEMENT_VERSION, total: ev.price.total });
  try {
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const session = await createCheckout({ matterId: m.id, amountCents: cents, description: `Estate plan with attorney review (#${m.id})`, email: req.user.email, baseUrl });
    res.json({ mode: session.mode, url: session.url, total: ev.price.total });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}));

app.post('/api/matter/test-pay', requireUser, h(async (req, res) => {
  if (paymentMode !== 'test' || PROD) return res.status(404).json({ error: 'Not found' });
  const m = await currentMatter(req.user.id);
  if (m.status !== 'awaiting_payment') return res.status(409).json({ error: 'Nothing to pay.' });
  await markPaid(m.id, 'test', `test_${Date.now()}`, m.price_cents, req.user.id);
  res.json(await clientView(await matterById(m.id)));
}));

app.post('/api/matter/consult', requireUser, h(async (req, res) => {
  const m = await currentMatter(req.user.id);
  if (!['draft', 'awaiting_payment'].includes(m.status)) return res.status(409).json({ error: 'This plan has already been submitted.' });
  await query("UPDATE matters SET status = 'consult_requested', updated_at = now() WHERE id = ?", [m.id]);
  const body = String(req.body?.message || '').slice(0, 4000);
  if (body) await query('INSERT INTO messages (matter_id, author_id, body) VALUES (?, ?, ?)', [m.id, req.user.id, body]);
  await logEvent(m.id, req.user.id, 'consult_requested');
  await notify(firmInbox(), emails.consult(m.id));
  res.json(await clientView(await matterById(m.id)));
}));

app.post('/api/matter/resubmit', requireUser, h(async (req, res) => {
  const m = await currentMatter(req.user.id);
  if (m.status !== 'changes_requested') return res.status(409).json({ error: 'Nothing to resubmit.' });
  const a = parse(m.answers, {});
  const missing = incompleteSteps(a);
  if (missing.length) return res.status(409).json({ error: `Please finish: ${missing.map((s) => s.title).join(', ')}.` });
  if (!evaluate(a).eligible) return res.status(409).json({ error: 'Your changes moved this plan outside the flat-fee package. Please message the attorney.' });
  await query("UPDATE matters SET status = 'in_review', updated_at = now() WHERE id = ?", [m.id]);
  await logEvent(m.id, req.user.id, 'resubmitted');
  await notify(firmInbox(), emails.resubmitted(m.id));
  res.json(await clientView(await matterById(m.id)));
}));

const messagesFor = (matterId) => many('SELECT msg.id, msg.body, msg.created_at, u.role, u.name FROM messages msg JOIN users u ON u.id = msg.author_id WHERE matter_id = ? ORDER BY msg.id', [matterId]);

app.get('/api/matter/messages', requireUser, h(async (req, res) => {
  const m = await currentMatter(req.user.id);
  res.json(await messagesFor(m.id));
}));

app.post('/api/matter/messages', requireUser, rateLimit('client-msg', 30, FIFTEEN_MIN), h(async (req, res) => {
  const m = await currentMatter(req.user.id);
  const body = String(req.body?.body || '').trim().slice(0, 4000);
  if (!body) return res.status(400).json({ error: 'Message is empty.' });
  await query('INSERT INTO messages (matter_id, author_id, body) VALUES (?, ?, ?)', [m.id, req.user.id, body]);
  await notify(firmInbox(), emails.clientMessage(m.id));
  res.json({ ok: true });
}));

// Documents for the client: available only after attorney approval.
async function packageFor(m, { draft, notes } = {}) {
  const a = parse(m.answers, {});
  const ev = evaluate(a);
  const rows = await many('SELECT doc_id, id, filename, storage_path FROM revised_docs WHERE matter_id = ? ORDER BY id', [m.id]);
  const revised = new Map(rows.map((r) => [r.doc_id, r]));
  return { a, ev, revised, docs: ev.documents.map((d) => ({ ...d, model: buildDocument(a, d), draft, notes })) };
}

const released = (m) => ['approved', 'completed'].includes(m.status);

app.get('/api/matter/documents', requireUser, h(async (req, res) => {
  const m = await currentMatter(req.user.id);
  if (!released(m)) return res.status(403).json({ error: 'Documents are available after attorney approval.' });
  const { docs, revised } = await packageFor(m, { draft: false });
  res.json(docs.filter((d) => d.type !== 'courtesy').map((d) => ({ id: d.id, title: d.title, owner: d.owner, revised: revised.has(d.id), html: revised.has(d.id) ? null : renderDocHtml(d.model) })));
}));

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

app.get('/api/matter/download.docx', requireUser, h(async (req, res) => {
  const m = await currentMatter(req.user.id);
  if (!released(m)) return res.status(403).send('Available after attorney approval.');
  const { docs, revised } = await packageFor(m, { draft: false });
  const buf = await renderDocx(docs.filter((d) => !revised.has(d.id) && d.type !== 'courtesy').map((d) => d.model), { draft: false, title: 'Estate plan' });
  res.set('Content-Type', DOCX).set('Content-Disposition', `attachment; filename="estate-plan-${m.id}.docx"`).send(buf);
}));

app.get('/api/matter/download.pdf', requireUser, h(async (req, res) => {
  const m = await currentMatter(req.user.id);
  if (!released(m)) return res.status(403).send('Available after attorney approval.');
  const { docs, revised } = await packageFor(m, { draft: false });
  const buf = await renderPdf(docs.filter((d) => !revised.has(d.id) && d.type !== 'courtesy').map((d) => d.model), { draft: false, title: 'Estate plan' });
  res.set('Content-Type', 'application/pdf').set('Content-Disposition', `attachment; filename="estate-plan-${m.id}.pdf"`).send(buf);
}));

app.get('/api/matter/revised/:docId', requireUser, h(async (req, res) => {
  const m = await currentMatter(req.user.id);
  if (!released(m)) return res.status(403).end();
  const r = await one('SELECT * FROM revised_docs WHERE matter_id = ? AND doc_id = ? ORDER BY id DESC LIMIT 1', [m.id, req.params.docId]);
  if (!r) return res.status(404).end();
  res.redirect(303, await signedDownload(r.storage_path, safeName(r.filename, 'document.docx')));
}));

// Signed copies uploaded by the client after signing (used for courtesy packets).
// The browser sends the file straight to private storage with a one-time link, so
// large phone photos never pass through the web server.
const UPLOAD_TYPES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic' };
const MAX_UPLOAD = 25 * 1024 * 1024;

app.post('/api/matter/uploads/start', requireUser, rateLimit('upload', 40, FIFTEEN_MIN), h(async (req, res) => {
  const m = await currentMatter(req.user.id);
  if (!released(m)) return res.status(409).json({ error: 'You can upload signed documents after your attorney approves them.' });
  const { mime, size } = req.body || {};
  if (!UPLOAD_TYPES[mime]) return res.status(400).json({ error: 'Upload a PDF, JPG, PNG, or HEIC file.' });
  if (!(size > 0) || size > MAX_UPLOAD) return res.status(400).json({ error: 'Files can be up to 25 MB.' });
  const filename = safeName(req.body?.filename, `signed.${UPLOAD_TYPES[mime]}`);
  const path = `matters/${m.id}/signed/${rid()}.${UPLOAD_TYPES[mime]}`;
  const target = await signedUpload(path, mime);
  res.json({ path, filename, ...target });
}));

app.post('/api/matter/uploads/complete', requireUser, h(async (req, res) => {
  const m = await currentMatter(req.user.id);
  const { path, mime, size } = req.body || {};
  if (!released(m)) return res.status(409).json({ error: 'Not available yet.' });
  if (!new RegExp(`^matters/${m.id}/signed/[\\w-]+\\.(pdf|jpg|png|heic)$`).test(String(path)) || !UPLOAD_TYPES[mime]) return res.status(400).json({ error: 'Upload not recognized.' });
  if (!(await exists(path))) return res.status(400).json({ error: 'The upload didn’t finish. Please try again.' });
  if (await one('SELECT 1 FROM uploads WHERE storage_path = ?', [path])) return res.json({ uploads: await uploadsFor(m.id) });
  const filename = safeName(req.body?.filename, 'signed');
  await query('INSERT INTO uploads (matter_id, filename, mime, size, storage_path, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)', [m.id, filename, mime, Math.min(Number(size) || 0, MAX_UPLOAD), path, req.user.id]);
  await logEvent(m.id, req.user.id, 'signed_uploaded', { filename });
  await notify(firmInbox(), emails.signedUploaded(m.id));
  res.json({ uploads: await uploadsFor(m.id) });
}));

app.delete('/api/matter/uploads/:uid', requireUser, h(async (req, res) => {
  const m = await currentMatter(req.user.id);
  const u = await one('DELETE FROM uploads WHERE id = ? AND matter_id = ? RETURNING storage_path', [Number(req.params.uid), m.id]);
  if (u) await removeObject(u.storage_path);
  res.json({ uploads: await uploadsFor(m.id) });
}));

// Local stand-in for Supabase Storage's signed links (development and tests only).
if (storageMode === 'local') {
  app.put('/api/local-storage/upload', express.raw({ type: () => true, limit: '25mb' }), (req, res) => {
    const path = checkLocalToken(req.query.token, 'put');
    if (!path) return res.status(403).json({ error: 'Link expired.' });
    localWrite(path, req.body);
    res.json({ ok: true });
  });
  app.get('/api/local-storage/download', (req, res) => {
    const path = checkLocalToken(req.query.token, 'get');
    const buf = path && localRead(path);
    if (!buf) return res.status(404).end();
    res.set('Content-Disposition', `attachment; filename="${safeName(req.query.name, 'file')}"`).type('application/octet-stream').send(buf);
  });
}

// ---------------- Attorney ----------------
const attorney = express.Router();
attorney.use(requireAttorney);

// Two-step sign-in for attorney accounts. Required in production before any client data is shown.
const REQUIRE_2FA = PROD || process.env.REQUIRE_ATTORNEY_2FA === '1';
attorney.get('/2fa', h(async (req, res) => {
  const u = await one('SELECT totp_enabled FROM users WHERE id = ?', [req.user.id]);
  res.json({ enabled: !!u.totp_enabled, required: REQUIRE_2FA });
}));
attorney.post('/2fa/setup', h(async (req, res) => {
  const u = await one('SELECT totp_enabled FROM users WHERE id = ?', [req.user.id]);
  if (u.totp_enabled) return res.status(409).json({ error: 'Two-step sign-in is already on.' });
  const secret = newTotpSecret();
  await query('UPDATE users SET totp_secret = ? WHERE id = ?', [secret, req.user.id]);
  const url = otpauthUrl(secret, req.user.email, FIRM.name);
  res.json({ secret, qr: await QRCode.toString(url, { type: 'svg', margin: 1 }) });
}));
attorney.post('/2fa/enable', h(async (req, res) => {
  const u = await one('SELECT totp_secret FROM users WHERE id = ?', [req.user.id]);
  if (!u.totp_secret || !verifyTotp(u.totp_secret, req.body?.code)) return res.status(400).json({ error: 'That code didn’t match. Enter the current 6-digit code from your app.' });
  await query('UPDATE users SET totp_enabled = TRUE WHERE id = ?', [req.user.id]);
  await logEvent(null, req.user.id, '2fa_enabled');
  res.json({ ok: true });
}));
attorney.use(h(async (req, res, next) => {
  if (!REQUIRE_2FA) return next();
  const u = await one('SELECT totp_enabled FROM users WHERE id = ?', [req.user.id]);
  if (!u.totp_enabled) return res.status(403).json({ error: 'Turn on two-step sign-in before viewing client files.', needs2fa: true });
  next();
}));

// Everything in the database as one JSON file, for the firm's own off-site copy.
// Contains client data: store it securely. (Uploaded files stay in Supabase Storage.)
attorney.get('/export.json', h(async (req, res) => {
  const out = { exportedAt: new Date().toISOString(), firm: FIRM.name, tables: {} };
  for (const t of TABLES) {
    const rows = await many(`SELECT * FROM ${t} ORDER BY 1`);
    out.tables[t] = t === 'users' ? rows.map(({ totp_secret, ...r }) => r) : rows;
  }
  await logEvent(null, req.user.id, 'export_downloaded');
  res.set('Content-Disposition', `attachment; filename="greatlakeswills-export-${out.exportedAt.slice(0, 10)}.json"`).json(out);
}));

attorney.get('/matters', h(async (req, res) => {
  const rows = await many(`SELECT m.id, m.status, m.answers, m.price_cents, m.paid_at, m.updated_at, m.approved_at, u.email,
      COALESCE(r.checklist, '{}') AS checklist
    FROM matters m JOIN users u ON u.id = m.user_id LEFT JOIN reviews r ON r.matter_id = m.id
    WHERE m.status != 'draft'
    ORDER BY CASE m.status WHEN 'in_review' THEN 0 WHEN 'consult_requested' THEN 1 WHEN 'changes_requested' THEN 2 ELSE 3 END, m.updated_at DESC`);
  res.json(rows.map((r) => {
    const a = parse(r.answers, {});
    const ev = evaluate(a);
    const checks = parse(r.checklist, {});
    return {
      id: r.id, status: r.status, email: r.email, price: (r.price_cents || 0) / 100, paidAt: r.paid_at, updatedAt: r.updated_at, approvedAt: r.approved_at,
      clients: ['p1', 'p2'].map((k) => fullName(a[k])).filter(Boolean).join(' & ') || r.email,
      plan: `${a.plan === 'couple' ? 'Couple' : 'Individual'} · ${a.package === 'complete' ? 'Complete' : 'Will only'}`,
      rush: !!a.checkout?.rush,
      counts: { stop: ev.flags.filter((f) => f.severity === 'stop').length, attorney: ev.flags.filter((f) => f.severity === 'attorney').length },
      fulfillmentOpen: r.status === 'approved' ? fulfillmentItems(a).filter((i) => !checks[i.key]).length : 0,
    };
  }));
}));

async function loadMatter(req, res) {
  const id = Number(req.params.id);
  const m = Number.isInteger(id) && await one('SELECT m.*, u.email FROM matters m JOIN users u ON u.id = m.user_id WHERE m.id = ?', [id]);
  if (!m) { res.status(404).json({ error: 'Not found' }); return null; }
  return m;
}

attorney.get('/matters/:id', h(async (req, res) => {
  const m = await loadMatter(req, res); if (!m) return;
  const { a, ev, docs, revised } = await packageFor(m, { draft: true });
  const review = await one('SELECT * FROM reviews WHERE matter_id = ?', [m.id]) || { checklist: '{}', notes: '' };
  res.json({
    id: m.id, status: m.status, email: m.email, answers: a, flags: ev.flags, price: ev.price, summary: summarize(a),
    engagement: { acceptedAt: m.engagement_accepted_at, ip: m.engagement_ip, version: m.engagement_version },
    paidAt: m.paid_at, approvedAt: m.approved_at,
    review: { checklist: parse(review.checklist, {}), notes: review.notes },
    documents: docs.map((d) => ({ id: d.id, title: d.title, owner: d.owner, html: renderDocHtml(d.model, { showAttorneyNotes: true }), revised: revised.get(d.id) ? { filename: revised.get(d.id).filename } : null })),
    messages: await messagesFor(m.id),
    events: await many('SELECT action, detail, created_at FROM events WHERE matter_id = ? ORDER BY id', [m.id]),
    payments: await many('SELECT provider, provider_ref, amount_cents, status, created_at FROM payments WHERE matter_id = ?', [m.id]),
    fulfillment: await fulfillmentFor(m, a),
    uploads: await uploadsFor(m.id),
  });
}));

attorney.get('/matters/:id/uploads/:uid', h(async (req, res) => {
  const m = await loadMatter(req, res); if (!m) return;
  const u = await one('SELECT * FROM uploads WHERE id = ? AND matter_id = ?', [Number(req.params.uid), m.id]);
  if (!u) return res.status(404).end();
  res.redirect(303, await signedDownload(u.storage_path, u.filename));
}));

attorney.post('/matters/:id/complete', h(async (req, res) => {
  const m = await loadMatter(req, res); if (!m) return;
  if (m.status !== 'approved') return res.status(409).json({ error: 'Only approved matters can be marked complete.' });
  const open = (await fulfillmentFor(m, parse(m.answers, {}))).filter((i) => !i.done);
  if (open.length) return res.status(409).json({ error: 'Finish the fulfillment checklist first.', missing: open.map((i) => i.key) });
  await query("UPDATE matters SET status = 'completed', updated_at = now() WHERE id = ?", [m.id]);
  await logEvent(m.id, req.user.id, 'completed');
  await notify(m.email, emails.completed());
  res.json({ ok: true });
}));

attorney.put('/matters/:id/review', h(async (req, res) => {
  const m = await loadMatter(req, res); if (!m) return;
  // Merge, so saving one section of the checklist never clears another.
  const checklist = JSON.stringify({ ...(await checklistFor(m.id)), ...(req.body?.checklist || {}) });
  const notes = String(req.body?.notes || '').slice(0, 20000);
  await query(`INSERT INTO reviews (matter_id, checklist, notes) VALUES (?, ?, ?)
    ON CONFLICT (matter_id) DO UPDATE SET checklist = excluded.checklist, notes = excluded.notes, updated_at = now()`, [m.id, checklist, notes]);
  res.json({ ok: true });
}));

attorney.post('/matters/:id/messages', h(async (req, res) => {
  const m = await loadMatter(req, res); if (!m) return;
  const body = String(req.body?.body || '').trim().slice(0, 4000);
  if (!body) return res.status(400).json({ error: 'Message is empty.' });
  await query('INSERT INTO messages (matter_id, author_id, body) VALUES (?, ?, ?)', [m.id, req.user.id, body]);
  await notify(m.email, emails.attorneyMessage());
  res.json({ ok: true });
}));

attorney.post('/matters/:id/request-changes', h(async (req, res) => {
  const m = await loadMatter(req, res); if (!m) return;
  const body = String(req.body?.message || '').trim();
  if (!body) return res.status(400).json({ error: 'Tell the client what to change.' });
  await query("UPDATE matters SET status = 'changes_requested', updated_at = now() WHERE id = ?", [m.id]);
  await query('INSERT INTO messages (matter_id, author_id, body) VALUES (?, ?, ?)', [m.id, req.user.id, body]);
  await logEvent(m.id, req.user.id, 'changes_requested');
  await notify(m.email, emails.changes());
  res.json({ ok: true });
}));

export const REQUIRED_CHECKS = ['conflict_check', 'identity', 'documents_reviewed', 'notes_removed'];

attorney.post('/matters/:id/approve', h(async (req, res) => {
  const m = await loadMatter(req, res); if (!m) return;
  if (!['in_review', 'changes_requested'].includes(m.status)) return res.status(409).json({ error: `Can't approve a matter that is ${m.status}.` });
  const ev = evaluate(parse(m.answers, {}));
  const checks = await checklistFor(m.id);
  const missing = REQUIRED_CHECKS.filter((k) => !checks[k]);
  ev.flags.filter((f) => f.severity !== 'note').forEach((f) => { if (!checks[`flag:${f.id}`]) missing.push(`flag:${f.id}`); });
  if (ev.flags.some((f) => f.id === 'helper') && !checks.private_call) missing.push('private_call');
  if (missing.length) return res.status(409).json({ error: 'Complete the review checklist first.', missing });
  await query("UPDATE matters SET status = 'approved', approved_at = now(), approved_by = ?, updated_at = now() WHERE id = ?", [req.user.id, m.id]);
  await logEvent(m.id, req.user.id, 'approved');
  await notify(m.email, emails.approved());
  res.json({ ok: true });
}));

attorney.post('/matters/:id/decline', h(async (req, res) => {
  const m = await loadMatter(req, res); if (!m) return;
  const body = String(req.body?.message || '').trim();
  if (!body) return res.status(400).json({ error: 'Explain the reason to the client.' });
  const pay = await one("SELECT * FROM payments WHERE matter_id = ? AND status = 'paid'", [m.id]);
  try {
    if (pay) {
      await refund(pay.provider === 'stripe' ? pay.provider_ref : null);
      await query("UPDATE payments SET status = 'refunded' WHERE matter_id = ? AND status = 'paid'", [m.id]);
    }
  } catch (e) {
    return res.status(502).json({ error: `Refund failed: ${e.message}` });
  }
  await query("UPDATE matters SET status = 'declined', updated_at = now() WHERE id = ?", [m.id]);
  await query('INSERT INTO messages (matter_id, author_id, body) VALUES (?, ?, ?)', [m.id, req.user.id, body]);
  await logEvent(m.id, req.user.id, 'declined', { refunded: !!pay });
  await notify(m.email, emails.declined());
  res.json({ ok: true });
}));

async function sendRendered(res, kind, models, opts, filename) {
  const buf = kind === 'pdf' ? await renderPdf(models, opts) : await renderDocx(models, opts);
  res.set('Content-Type', kind === 'pdf' ? 'application/pdf' : DOCX).set('Content-Disposition', `attachment; filename="${filename}.${kind}"`).send(buf);
}
const renderOpts = (req) => ({ draft: req.query.final !== '1', showAttorneyNotes: req.query.notes === '1' });

attorney.get('/matters/:id/package.:kind(pdf|docx)', h(async (req, res) => {
  const m = await loadMatter(req, res); if (!m) return;
  const { docs } = await packageFor(m);
  await sendRendered(res, req.params.kind, docs.map((d) => d.model), renderOpts(req), `matter-${m.id}-package`);
}));

attorney.get('/matters/:id/doc/:docId.:kind(pdf|docx)', h(async (req, res) => {
  const m = await loadMatter(req, res); if (!m) return;
  const { docs } = await packageFor(m);
  const d = docs.find((x) => x.id === req.params.docId);
  if (!d) return res.status(404).end();
  await sendRendered(res, req.params.kind, [d.model], renderOpts(req), `matter-${m.id}-${d.id.replace(/:/g, '-')}`);
}));

// A Word file the attorney edited by hand replaces the generated version for the client.
attorney.post('/matters/:id/revised/:docId', express.raw({ type: 'application/octet-stream', limit: '4mb' }), h(async (req, res) => {
  const m = await loadMatter(req, res); if (!m) return;
  if (!req.body?.length) return res.status(400).json({ error: 'Empty file.' });
  if (req.body.subarray(0, 2).toString() !== 'PK') return res.status(400).json({ error: 'Upload a .docx file.' });
  const filename = safeName(req.get('X-Filename'), `${req.params.docId.replace(/:/g, '-')}.docx`);
  const path = `matters/${m.id}/revised/${rid()}.docx`;
  await putObject(path, req.body, DOCX);
  await query('INSERT INTO revised_docs (matter_id, doc_id, filename, storage_path, uploaded_by) VALUES (?, ?, ?, ?, ?)', [m.id, req.params.docId, filename, path, req.user.id]);
  await logEvent(m.id, req.user.id, 'revised_uploaded', { doc: req.params.docId, filename });
  res.json({ ok: true });
}));

attorney.delete('/matters/:id/revised/:docId', h(async (req, res) => {
  const m = await loadMatter(req, res); if (!m) return;
  const rows = await many('DELETE FROM revised_docs WHERE matter_id = ? AND doc_id = ? RETURNING storage_path', [m.id, req.params.docId]);
  for (const r of rows) await removeObject(r.storage_path);
  await logEvent(m.id, req.user.id, 'revised_removed', { doc: req.params.docId });
  res.json({ ok: true });
}));

app.use('/api/attorney', attorney);

// Public: price and eligibility for anonymous answers (no storage).
app.post('/api/preview', rateLimit('preview', 120, FIFTEEN_MIN), (req, res) => {
  const pkg = generatePackage(req.body?.answers || {});
  res.json({ eligible: pkg.eligible, flags: pkg.flags, price: pkg.price });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, _next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That file is too large.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
});

export default app;
