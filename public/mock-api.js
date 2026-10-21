// Demo mode: answers the app's /api calls in the browser, so the questionnaire
// and generated documents can be tried without a server. Nothing is sent anywhere.
import { buildDocument, evaluate, fulfillmentItems, incompleteSteps, summarize } from '/engine/index.js';
import { FIRM } from '/engine/constants.js';
import { renderDocHtml } from '/engine/render-html.js';

const KEY = 'glw-demo';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
const persist = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } };
let state = load() || { status: 'draft', answers: {}, messages: [], paidAt: null, approvedAt: null, uploads: [] };
state.uploads = state.uploads || [];

function view() {
  const ev = evaluate(state.answers);
  return {
    id: 1, status: state.status, answers: state.answers, eligible: ev.eligible, flags: ev.flags, price: ev.price,
    documents: ev.documents.map(({ id, title, owner }) => ({ id, title, owner })), summary: summarize(state.answers),
    incomplete: incompleteSteps(state.answers).map((s) => ({ key: s.key, title: s.title })), paidAt: state.paidAt, approvedAt: state.approvedAt, paymentMode: 'test',
    fulfillment: state.status === 'approved' ? fulfillmentItems(state.answers).map((i) => ({ ...i, done: i.key === 'ff:signed_copies' && state.uploads.length > 0 })) : [],
    uploads: state.uploads,
    extras: { deposit: state.answers.extras?.deposit === 'yes', courtesy: state.answers.extras?.courtesy === 'yes' },
    firm: { name: FIRM.legalEntity, address: FIRM.address },
  };
}
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const now = () => new Date().toISOString();

export function resetDemo(answers = {}) {
  state = { status: 'draft', answers, messages: [], paidAt: null, approvedAt: null, uploads: [] };
  persist(state);
}

const realFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  if (!url.startsWith('/api/')) return realFetch(input, init);
  const method = (init.method || 'GET').toUpperCase();
  const path0 = url.split('?')[0];
  // Uploads: the file itself is never sent anywhere in the demo.
  if (path0 === '/api/demo-upload' && method === 'PUT') return json({ ok: true });
  if (path0 === '/api/matter/uploads/start' && method === 'POST') {
    const b = JSON.parse(init.body);
    return json({ url: '/api/demo-upload', headers: {}, path: `demo/${Date.now()}`, filename: b.filename });
  }
  if (path0 === '/api/matter/uploads/complete' && method === 'POST') {
    const b = JSON.parse(init.body);
    state.uploads.push({ id: Date.now(), filename: b.filename, mime: b.mime, size: b.size || 0, created_at: now() });
    persist(state);
    return json({ uploads: state.uploads });
  }
  if (path0.startsWith('/api/matter/uploads/') && method === 'DELETE') {
    state.uploads = state.uploads.filter((u) => String(u.id) !== path0.split('/').pop());
    persist(state);
    return json({ uploads: state.uploads });
  }
  const body = init.body ? JSON.parse(init.body) : {};
  const path = url.split('?')[0];
  const route = `${method} ${path}`;
  switch (route) {
    case 'GET /api/me': return json({ user: { id: 1, email: 'demo@example.com', name: 'Demo', role: 'client' } });
    case 'POST /api/auth/logout': return json({ ok: true });
    case 'GET /api/matter': return json(view());
    case 'PUT /api/matter/answers':
      if (!['draft', 'changes_requested', 'awaiting_payment'].includes(state.status)) return json({ error: 'Your plan is with the attorney and can’t be edited right now.' }, 409);
      state.answers = body.answers; state.status = state.status === 'awaiting_payment' ? 'draft' : state.status; persist(state); return json(view());
    case 'GET /api/matter/engagement':
      return json({ version: 'demo', text: 'DEMO — On the live site, Truckey Nofsinger, LLP’s limited-scope engagement agreement appears here. It explains that representation begins only after a conflict check, what the flat fee covers, and that the fee is earned upon receipt but refunded in full if the attorney declines the matter.' });
    case 'POST /api/matter/checkout': {
      const a = { ...state.answers, checkout: { rush: !!body.rush } };
      if (!evaluate(a).eligible) return json({ error: 'This plan needs a consultation instead of the flat-fee package.' }, 409);
      if (incompleteSteps(a).length) return json({ error: 'Please finish every section first.' }, 409);
      state.answers = a; state.status = 'awaiting_payment'; persist(state);
      return json({ mode: 'test', url: null, total: evaluate(a).price.total });
    }
    case 'POST /api/matter/test-pay':
      state.uploads = [];
      state.status = 'approved'; state.paidAt = now(); state.approvedAt = now();
      state.messages.push({ id: 1, role: 'attorney', name: 'Demo', body: 'Demo mode: on the live site your plan would now wait for a Michigan attorney to review and approve it. Here it is released immediately so you can read the documents. They are marked DRAFT.', created_at: now() });
      persist(state); return json(view());
    case 'POST /api/matter/consult': state.status = 'consult_requested'; persist(state); return json(view());
    case 'POST /api/matter/resubmit': state.status = 'in_review'; persist(state); return json(view());
    case 'GET /api/matter/messages': return json(state.messages);
    case 'POST /api/matter/messages': state.messages.push({ id: Date.now(), role: 'client', body: body.body, created_at: now() }); persist(state); return json({ ok: true });
    case 'GET /api/matter/documents': {
      if (state.status !== 'approved') return json({ error: 'Documents are available after attorney approval.' }, 403);
      const ev = evaluate(state.answers);
      // The demo also shows the courtesy letters, which on the live site go from the firm to each recipient.
      return json(ev.documents.map((d) => ({ id: d.id, title: d.title, owner: d.owner, revised: false, html: renderDocHtml(buildDocument(state.answers, d), { showAttorneyNotes: true }) })));
    }
    default: return json({ error: 'Not available in the demo.' }, 404);
  }
};
window.__GLW_DEMO = { resetDemo };
