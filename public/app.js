// Client app: sign-in, questionnaire, review, checkout, status, documents.
import {
  activeSteps, context, evaluate, fieldPath, resolve, summarize, validateStep, visibleFields,
} from '/engine/index.js';
import { renderDocHtml } from '/engine/render-html.js';
import { get, money, priceText, set } from '/engine/util.js';

const main = document.getElementById('main');
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const when = (s) => { const d = new Date(s); return Number.isNaN(d.getTime()) ? String(s ?? '') : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); };
let me = null;
let pendingTotp = false;
let matter = null;
let answers = {};
let showErrors = false;
let saveTimer = null;

async function api(path, opts = {}) {
  const r = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'greatlakeswills', ...(opts.headers || {}) },
    body: opts.body && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body,
  });
  const data = r.headers.get('content-type')?.includes('json') ? await r.json() : null;
  if (!r.ok) throw Object.assign(new Error(data?.error || `Request failed (${r.status})`), { data, status: r.status });
  return data;
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2600);
}

function nav() {
  if (window.__GLW_DEMO) {
    document.getElementById('topnav').innerHTML = '<a href="#/status">My plan</a><a href="#" id="sample">Sample family</a><a href="#" id="reset">Start over</a>';
    document.getElementById('sample').addEventListener('click', async (e) => { e.preventDefault(); window.__GLW_DEMO.resetDemo(structuredClone(window.__GLW_DEMO.sample)); await boot(); location.hash = '#/review'; route(); });
    document.getElementById('reset').addEventListener('click', async (e) => { e.preventDefault(); window.__GLW_DEMO.resetDemo({}); await boot(); location.hash = '#/q/start'; route(); });
    return;
  }
  document.getElementById('topnav').innerHTML = me
    ? `<a href="#/status">My plan</a><a href="#" id="logout">Sign out</a>`
    : '<a href="#/login">Sign in</a>';
  document.getElementById('logout')?.addEventListener('click', async (e) => {
    e.preventDefault(); await api('/api/auth/logout', { method: 'POST' }); me = null; location.hash = '#/login';
  });
}

function editable() { return matter && ['draft', 'changes_requested', 'awaiting_payment'].includes(matter.status); }

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try { matter = await api('/api/matter/answers', { method: 'PUT', body: { answers } }); } catch (e) { toast(e.message); }
  }, 700);
}
async function saveNow() {
  clearTimeout(saveTimer);
  matter = await api('/api/matter/answers', { method: 'PUT', body: { answers } });
}

// ---------- Sign-in (emailed code; attorneys add an authenticator code) ----------
const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };

function authView() {
  main.innerHTML = `<div class="auth">
    <h1>Sign in or create an account</h1>
    <p class="muted">We’ll email you a 6-digit code. There’s no password to remember, and your answers save as you go.</p>
    <form id="f" novalidate>
      <label class="field"><span class="field-label">Email</span><input type="email" name="email" id="f-email" autocomplete="email" required></label>
      <p class="small muted">By continuing you agree to the <a href="/terms.html" target="_blank" rel="noopener">terms of use</a> and <a href="/privacy.html" target="_blank" rel="noopener">privacy policy</a>.</p>
      <p class="err" id="ferr" role="alert"></p>
      <button class="btn" type="submit">Email me a code</button>
    </form></div>`;
  const input = document.getElementById('f-email');
  try { input.value = sessionStorage.getItem('glw-email') || ''; } catch { /* storage unavailable */ }
  input.focus();
  document.getElementById('f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = input.value.trim();
    const btn = e.target.querySelector('button'); btn.disabled = true;
    try {
      await api('/api/auth/start', { method: 'POST', body: { email } });
      try { sessionStorage.setItem('glw-email', email); } catch { /* storage unavailable */ }
      codeView(email);
    } catch (err) { document.getElementById('ferr').textContent = err.message; btn.disabled = false; }
  });
}

function codeView(email) {
  main.innerHTML = `<div class="auth">
    <h1>Check your email</h1>
    <p class="muted">We sent a sign-in code to <strong>${esc(email)}</strong>. Enter it within 10 minutes. If it isn’t there, check spam.</p>
    <form id="f" novalidate>
      <label class="field"><span class="field-label">Sign-in code</span><input type="text" name="code" id="f-code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" required></label>
      <p class="err" id="ferr" role="alert"></p>
      <button class="btn" type="submit">Sign in</button>
      <button class="btn quiet" type="button" id="resend">Send a new code</button>
      <a class="btn quiet" href="#/login" id="other">Use a different email</a>
    </form></div>`;
  document.getElementById('f-code').focus();
  document.getElementById('other').addEventListener('click', (e) => { e.preventDefault(); authView(); });
  document.getElementById('resend').addEventListener('click', async () => {
    try { await api('/api/auth/start', { method: 'POST', body: { email } }); toast('New code sent.'); } catch (err) { document.getElementById('ferr').textContent = err.message; }
  });
  document.getElementById('f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      const r = await api('/api/auth/verify', { method: 'POST', body: { email, code: document.getElementById('f-code').value } });
      if (r.needsTotp) { totpView(); return; }
      await afterSignIn(r);
    } catch (err) { document.getElementById('ferr').textContent = err.message; btn.disabled = false; }
  });
}

function totpView() {
  main.innerHTML = `<div class="auth">
    <h1>One more step</h1>
    <p class="muted">Enter the 6-digit code from your authenticator app.</p>
    <form id="f" novalidate>
      <label class="field"><span class="field-label">Authenticator code</span><input type="text" name="code" id="f-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label>
      <p class="err" id="ferr" role="alert"></p>
      <button class="btn" type="submit">Continue</button>
    </form></div>`;
  document.getElementById('f-code').focus();
  document.getElementById('f').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api('/api/auth/totp', { method: 'POST', body: { code: document.getElementById('f-code').value } });
      await afterSignIn(r);
    } catch (err) {
      if (err.status === 401 && /expired/.test(err.message)) { authView(); toast(err.message); return; }
      document.getElementById('ferr').textContent = err.message;
    }
  });
}

async function afterSignIn(r) {
  if (r.role === 'attorney') { location.href = '/attorney.html'; return; }
  if (r.needsName) { nameView(r.newUser); return; }
  await boot();
  go(r.newUser ? '#/q/start' : '#/status');
}

function nameView(newUser) {
  main.innerHTML = `<div class="auth">
    <h1>${newUser ? 'Welcome' : 'Welcome back'}</h1>
    <form id="f" novalidate>
      <label class="field"><span class="field-label">Your name</span><span class="help">So your attorney knows who they’re writing to.</span><input type="text" name="name" id="f-name" autocomplete="name" required></label>
      <p class="err" id="ferr" role="alert"></p>
      <button class="btn" type="submit">Continue</button>
    </form></div>`;
  document.getElementById('f-name').focus();
  document.getElementById('f').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/me', { method: 'PUT', body: { name: document.getElementById('f-name').value } });
      await boot();
      go(newUser ? '#/q/start' : '#/status');
    } catch (err) { document.getElementById('ferr').textContent = err.message; }
  });
}

// ---------- Field rendering ----------
function opts(f, a, c, step) { return resolve(f.options, a, c, step?.person) || []; }

function fieldHtml(f, path, value, err, a, c, step) {
  const label = resolve(f.label, a, c, step?.person);
  const help = f.help ? `<span class="help" id="${path}-help">${esc(resolve(f.help, a, c))}</span>` : '';
  const errHtml = err ? `<span class="err" id="${path}-err">${esc(err)}</span>` : '';
  const desc = [f.help ? `${path}-help` : '', err ? `${path}-err` : ''].filter(Boolean).join(' ');
  const aria = desc ? ` aria-describedby="${desc}"` : '';
  const cls = err ? ' has-err' : '';
  const v = value ?? '';
  switch (f.type) {
    case 'note': {
      const t = resolve(f.text, a, c);
      return t ? `<p class="${f.id.startsWith('note.p') ? 'subhead' : 'note'}">${esc(t)}</p>` : '';
    }
    case 'text': case 'email': case 'tel': case 'date': case 'number':
      return `<label class="field${cls}"><span class="field-label">${esc(label)}${f.required ? '' : ' <span class="muted">(optional)</span>'}</span>${help}<input type="${f.type}" data-path="${path}" value="${esc(v)}"${f.type === 'number' ? ` min="${f.min ?? 0}" max="${f.max ?? ''}" inputmode="decimal"` : ''}${f.type === 'email' ? ' autocomplete="email"' : ''}${aria}>${errHtml}</label>`;
    case 'textarea':
      return `<label class="field${cls}"><span class="field-label">${esc(label)}${f.required ? '' : ' <span class="muted">(optional)</span>'}</span>${help}<textarea data-path="${path}"${aria}>${esc(v)}</textarea>${errHtml}</label>`;
    case 'select':
      return `<label class="field${cls}"><span class="field-label">${esc(label)}</span>${help}<select data-path="${path}" data-rerender${aria}><option value="">Choose…</option>${opts(f, a, c, step).map((o) => `<option value="${esc(o.value)}"${o.value === v ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>${errHtml}</label>`;
    case 'radio':
      return `<fieldset class="${cls}"${aria}><legend>${esc(label)}</legend>${help}${opts(f, a, c, step).map((o) => {
        const ol = resolve(o.label, a, c); const oh = resolve(o.help, a, c);
        return `<label class="choice"><input type="radio" name="${path}" value="${esc(o.value)}" data-path="${path}" data-rerender${o.value === v ? ' checked' : ''}><div><b>${esc(ol)}</b>${oh ? `<span>${esc(oh)}</span>` : ''}</div></label>`;
      }).join('')}${errHtml}</fieldset>`;
    case 'yesno':
      return `<fieldset class="${cls}"${aria}><legend>${esc(label)}</legend>${help}<div class="yesno">${['yes', 'no'].map((x) => `<label class="choice"><input type="radio" name="${path}" value="${x}" data-path="${path}" data-rerender${v === x ? ' checked' : ''}><div><b>${x === 'yes' ? 'Yes' : 'No'}</b></div></label>`).join('')}</div>${errHtml}</fieldset>`;
    case 'checkbox':
      return `<div class="${cls}"><label class="choice"><input type="checkbox" data-path="${path}" data-rerender${v ? ' checked' : ''}><div><span style="color:var(--text)">${esc(label)}</span></div></label>${errHtml}</div>`;
    case 'checkboxes': {
      const set_ = new Set(Array.isArray(v) ? v : []);
      return `<fieldset${aria}><legend>${esc(label)}</legend>${help}${opts(f, a, c, step).map((o) => `<label class="choice"><input type="checkbox" data-multi="${path}" value="${esc(o.value)}"${set_.has(o.value) ? ' checked' : ''}><div><span style="color:var(--text)">${esc(o.label)}</span></div></label>`).join('')}${errHtml}</fieldset>`;
    }
    case 'person': {
      const pv = v || {};
      return `<fieldset class="${cls}"><legend>${esc(label)}${f.required ? '' : ' <span class="muted">(optional)</span>'}</legend>${help}<div class="person">
        <div class="row"><label class="field"><span class="field-label">Full name</span><input type="text" data-path="${path}.name" value="${esc(pv.name || '')}" autocomplete="off"></label>
        <label class="field"><span class="field-label">Relationship to you</span><input type="text" data-path="${path}.relationship" value="${esc(pv.relationship || '')}" placeholder="e.g., sister, friend"></label></div>
        <div class="row"><label class="field"><span class="field-label">City and state</span><input type="text" data-path="${path}.city" value="${esc(pv.city || '')}" placeholder="e.g., Lansing, MI"></label>
        <label class="field"><span class="field-label">Phone <span class="muted">(optional)</span></span><input type="tel" data-path="${path}.phone" value="${esc(pv.phone || '')}"></label></div>
      </div>${errHtml}</fieldset>`;
    }
    case 'list': {
      const items = Array.isArray(v) ? v : [];
      const itemHtml = items.map((item, i) => {
        const sub = f.fields.filter((sf) => (!sf.showIf || sf.showIf(a, c)) && (!sf.showIfItem || sf.showIfItem(item)));
        const inner = [];
        for (let k = 0; k < sub.length; k += 1) {
          const sf = sub[k];
          const html = fieldHtml({ ...sf, help: undefined }, `${path}.${i}.${sf.id}`, item[sf.id], showErrors ? currentErrors[`${path}.${i}.${sf.id}`] : null, a, c, step);
          if (sf.half && sub[k + 1]?.half) { inner.push(`<div class="row">${html}${fieldHtml({ ...sub[k + 1], help: undefined }, `${path}.${i}.${sub[k + 1].id}`, item[sub[k + 1].id], showErrors ? currentErrors[`${path}.${i}.${sub[k + 1].id}`] : null, a, c, step)}</div>`); k += 1; } else inner.push(html);
        }
        return `<div class="list-item"><header><span>${esc(f.itemLabel[0].toUpperCase() + f.itemLabel.slice(1))} ${i + 1}</span><button type="button" class="btn quiet" data-remove="${path}" data-index="${i}">Remove</button></header>${inner.join('')}</div>`;
      }).join('');
      return `<fieldset class="${cls}"><legend>${esc(label)}</legend>${help}${itemHtml}<button type="button" class="btn secondary" data-add="${path}">${esc(f.addLabel)}</button>${errHtml}</fieldset>`;
    }
    default: return '';
  }
}

let currentErrors = {};

function stepFieldsHtml(step) {
  const c = context(answers);
  const fields = visibleFields(step, answers);
  const out = [];
  for (let i = 0; i < fields.length; i += 1) {
    const f = fields[i];
    const path = fieldPath(step, f);
    const html = fieldHtml(f, path, get(answers, path), showErrors ? currentErrors[path] : null, answers, c, step);
    const next = fields[i + 1];
    if (f.half && next?.half) {
      const p2 = fieldPath(step, next);
      out.push(`<div class="row">${html}${fieldHtml(next, p2, get(answers, p2), showErrors ? currentErrors[p2] : null, answers, c, step)}</div>`);
      i += 1;
    } else out.push(html);
  }
  return out.join('');
}

function stepDone(s) { return Object.keys(validateStep(s, answers)).length === 0; }

function railHtml(steps, currentKey) {
  return `<aside class="rail" aria-label="Questionnaire sections"><ol>${steps.map((s) => {
    const t = resolve(s.title, answers, context(answers), s.who);
    const cls = [s.key === currentKey ? 'current' : '', stepDone(s) ? 'done' : ''].join(' ');
    return `<li><a href="#/q/${encodeURIComponent(s.key)}" class="${cls}"${s.key === currentKey ? ' aria-current="step"' : ''}>${esc(t)}</a></li>`;
  }).join('')}<li><a href="#/review" class="${currentKey === 'review' ? 'current' : ''}">Review and checkout</a></li></ol></aside>`;
}

function questionView(key) {
  if (!editable()) { location.hash = '#/status'; return; }
  const steps = activeSteps(answers);
  const idx = Math.max(0, steps.findIndex((s) => s.key === key));
  const step = steps[idx];
  if (step.key !== key) { location.replace(`#/q/${encodeURIComponent(step.key)}`); return; }
  currentErrors = validateStep(step, answers);
  const c = context(answers);
  const title = resolve(step.title, answers, c, step.who);
  main.innerHTML = `<div class="app">${railHtml(steps, step.key)}
    <section class="panel" aria-labelledby="step-h">
      <p class="progress-mobile">Step ${idx + 1} of ${steps.length + 1}</p>
      ${matter.status === 'changes_requested' ? '<p class="note">Your attorney asked for changes. Update your answers, then resubmit from the My plan page.</p>' : ''}
      <h1 id="step-h" style="font-size:2rem">${esc(title)}</h1>
      ${step.intro ? `<p class="intro">${esc(resolve(step.intro, answers, c))}</p>` : ''}
      <form id="stepform" novalidate>${stepFieldsHtml(step)}
        <div class="nav-row">
          ${idx > 0 ? `<a class="btn secondary" href="#/q/${encodeURIComponent(steps[idx - 1].key)}">Back</a>` : '<span></span>'}
          <button class="btn" type="submit">${idx === steps.length - 1 ? 'Review my plan' : 'Continue'}</button>
        </div>
      </form>
    </section></div>`;
  bindForm(step, steps, idx);
}

function bindForm(step, steps, idx) {
  const form = document.getElementById('stepform');
  const rerender = () => {
    const y = window.scrollY;
    const active = document.activeElement?.dataset?.path;
    questionView(step.key);
    window.scrollTo(0, y);
    if (active) document.querySelector(`[data-path="${CSS.escape(active)}"]`)?.focus({ preventScroll: true });
  };
  form.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.multi) return;
    if (!el.dataset.path) return;
    let val = el.type === 'checkbox' ? el.checked : el.value;
    if (el.type === 'number') val = el.value === '' ? '' : Number(el.value);
    set(answers, el.dataset.path, val);
    save();
  });
  form.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.multi) {
      const vals = [...form.querySelectorAll(`[data-multi="${CSS.escape(el.dataset.multi)}"]:checked`)].map((x) => x.value);
      set(answers, el.dataset.multi, vals); save(); return;
    }
    if (el.dataset.rerender !== undefined) rerender();
    else if (showErrors) rerender();
  });
  form.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    const rem = e.target.closest('[data-remove]');
    if (add) {
      const list = get(answers, add.dataset.add) || [];
      list.push({}); set(answers, add.dataset.add, list); save(); rerender();
      const items = document.querySelectorAll('.list-item');
      items[items.length - 1]?.querySelector('input,select')?.focus();
    }
    if (rem) {
      const list = get(answers, rem.dataset.remove) || [];
      list.splice(Number(rem.dataset.index), 1); set(answers, rem.dataset.remove, list); save(); rerender();
    }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errs = validateStep(step, answers);
    if (Object.keys(errs).length) {
      showErrors = true; rerender();
      document.querySelector('.has-err input, .has-err select, .has-err textarea, .err')?.scrollIntoView({ block: 'center' });
      toast('Please fix the highlighted answers.');
      return;
    }
    showErrors = false;
    try { await saveNow(); } catch (err) { toast(err.message); return; }
    const fresh = activeSteps(answers);
    const i = fresh.findIndex((s) => s.key === step.key);
    location.hash = i < fresh.length - 1 ? `#/q/${encodeURIComponent(fresh[i + 1].key)}` : '#/review';
  });
}

// ---------- Review ----------
function flagsHtml(flags, { client = true } = {}) {
  const groups = [
    ['stop', 'Needs a consultation instead'],
    ['attorney', client ? 'Your attorney will talk with you about' : 'Attorney must resolve'],
    ['note', 'Good to know'],
  ];
  return groups.map(([sev, head]) => {
    const fs = flags.filter((f) => f.severity === sev);
    if (!fs.length) return '';
    return `<h3>${head}</h3>${fs.map((f) => `<div class="flag ${sev}"><strong>${esc(f.title)}</strong>${esc(f.detail)}<cite>${esc(f.cite)}</cite></div>`).join('')}`;
  }).join('');
}

function summaryHtml(sum) {
  return `<div class="summary">${sum.map((s) => `<h3>${esc(s.heading)}</h3><ul>${s.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`).join('')}</div>`;
}

function reviewView() {
  if (!editable()) { location.hash = '#/status'; return; }
  const steps = activeSteps(answers);
  const ev = evaluate(answers);
  const missing = steps.filter((s) => !stepDone(s));
  const c = context(answers);
  main.innerHTML = `<div class="app">${railHtml(steps, 'review')}<section class="panel">
    <h1 style="font-size:2rem">Review your plan</h1>
    ${missing.length ? `<div class="flag attorney"><strong>A few sections still need answers</strong>${missing.map((s) => `<a href="#/q/${encodeURIComponent(s.key)}">${esc(resolve(s.title, answers, c, s.who))}</a>`).join(', ')}</div>` : ''}
    ${flagsHtml(ev.flags)}
    <h2 style="margin-top:28px">Your plan in plain English</h2>
    ${summaryHtml(summarize(answers))}
    <h2 style="margin-top:28px">Documents you’ll receive</h2>
    <ul>${ev.documents.map((d) => `<li>${esc(d.title)}${d.owner ? ` <span class="muted">— ${esc(d.owner)}</span>` : ''}</li>`).join('')}</ul>
    ${ev.eligible ? `
      <div class="totals">${ev.price.lines.map((l) => `<div><span>${esc(l.label)}</span><span>${priceText(l.amount)}</span></div>`).join('')}<div class="t"><span>Total</span><span>${money(ev.price.total)}</span></div></div>
      <div class="nav-row"><a class="btn secondary" href="#/q/${encodeURIComponent(steps[steps.length - 1].key)}">Back</a>
      ${matter.status === 'changes_requested' ? '<a class="btn" href="#/status">Back to My plan to resubmit</a>' : `<a class="btn${missing.length ? '" aria-disabled="true" tabindex="-1" style="pointer-events:none;opacity:.5' : ''}" href="#/checkout">Continue to checkout</a>`}</div>`
    : `<h2 style="margin-top:28px">Request a consultation</h2>
      <p>Your situation needs more than a flat-fee plan. You haven’t been charged. Send a note and the attorney will contact you to schedule a consultation.</p>
      <form id="consult"><label class="field"><span class="field-label">Anything the attorney should know? <span class="muted">(optional)</span></span><textarea name="message"></textarea></label>
      <button class="btn" type="submit">Request a consultation</button></form>`}
  </section></div>`;
  document.getElementById('consult')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await saveNow(); matter = await api('/api/matter/consult', { method: 'POST', body: { message: new FormData(e.target).get('message') } }); location.hash = '#/status'; } catch (err) { toast(err.message); }
  });
}

// ---------- Checkout ----------
async function checkoutView() {
  if (!editable() || matter.status === 'changes_requested') { location.hash = '#/status'; return; }
  await saveNow();
  const ev = evaluate(answers);
  if (!ev.eligible || matter.incomplete.length) { location.hash = '#/review'; return; }
  const eng = await api('/api/matter/engagement');
  main.innerHTML = `<section class="panel" style="padding:32px 0 64px">
    <h1 style="font-size:2rem">Checkout</h1>
    <p class="intro">Read the engagement terms. They explain what the attorney will and won’t do for this fee.</p>
    <div class="engagement" tabindex="0" aria-label="Engagement agreement">${esc(eng.text)}</div>
    <form id="co" style="margin-top:20px">
      <label class="choice"><input type="checkbox" name="accept" required><div><span style="color:var(--text)">I have read and agree to the limited-scope engagement agreement.</span></div></label>
      <label class="choice"><input type="checkbox" name="rush"><div><span style="color:var(--text)">Add rush review (one business day) — ${money(evaluate({ ...answers, checkout: { rush: true } }).price.lines.find((l) => /Rush/.test(l.label))?.amount || 0)}</span></div></label>
      <p class="err" id="coerr" role="alert"></p>
      <div class="totals" id="tot"></div>
      <div class="nav-row"><a class="btn secondary" href="#/review">Back</a><button class="btn" type="submit">Pay and submit for review</button></div>
    </form>
    <div id="testpay" hidden class="note" style="margin-top:20px"><p><strong>Test mode.</strong> No payment provider is configured, so no card is charged.</p><button class="btn" id="tp">Complete test payment</button></div>
  </section>`;
  const form = document.getElementById('co');
  const tot = () => {
    const pr = evaluate({ ...answers, checkout: { rush: form.rush.checked } }).price;
    document.getElementById('tot').innerHTML = `${pr.lines.map((l) => `<div><span>${esc(l.label)}</span><span>${priceText(l.amount)}</span></div>`).join('')}<div class="t"><span>Total</span><span>${money(pr.total)}</span></div>`;
  };
  form.rush.addEventListener('change', tot); tot();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.accept.checked) { document.getElementById('coerr').textContent = 'Please accept the engagement agreement to continue.'; return; }
    try {
      const r = await api('/api/matter/checkout', { method: 'POST', body: { acceptEngagement: true, rush: form.rush.checked } });
      if (r.url) { location.href = r.url; return; }
      document.getElementById('testpay').hidden = false;
      form.querySelector('button[type=submit]').disabled = true;
    } catch (err) { document.getElementById('coerr').textContent = err.message; }
  });
  document.getElementById('tp').addEventListener('click', async () => {
    try { matter = await api('/api/matter/test-pay', { method: 'POST' }); location.hash = '#/status'; } catch (err) { toast(err.message); }
  });
}

// ---------- Status ----------
const STATUS_TEXT = {
  draft: 'Not submitted yet',
  awaiting_payment: 'Waiting for payment',
  in_review: 'With your attorney',
  changes_requested: 'Changes requested',
  approved: 'Approved — ready to sign',
  completed: 'Complete',
  declined: 'Declined and refunded',
  consult_requested: 'Consultation requested',
};

async function statusView() {
  matter = await api('/api/matter');
  answers = matter.answers;
  const msgs = await api('/api/matter/messages');
  const s = matter.status;
  const order = ['submitted', 'review', 'approved'];
  const reached = { submitted: !!matter.paidAt, review: ['in_review', 'changes_requested', 'approved'].includes(s), approved: s === 'approved' };
  main.innerHTML = `<section class="panel" style="padding:32px 0 64px">
    <h1 style="font-size:2rem">My plan</h1>
    <p><span class="status-badge ${s}">${esc(STATUS_TEXT[s] || s)}</span></p>
    ${s === 'draft' || s === 'awaiting_payment' ? `<p>Your answers are saved. <a href="#/q/${encodeURIComponent(activeSteps(answers)[0].key)}">Continue the questionnaire</a> or <a href="#/review">review and check out</a>.</p>` : ''}
    ${matter.paidAt ? `<ol class="timeline">${order.map((k) => `<li class="${reached[k] ? 'on' : ''}">${{ submitted: 'Paid and submitted', review: 'Attorney review', approved: 'Approved — download and sign' }[k]}</li>`).join('')}</ol>` : ''}
    ${s === 'in_review' ? '<p>Your attorney is reviewing your plan. You’ll get an email if they have a question, and when your documents are ready.</p>' : ''}
    ${s === 'changes_requested' ? `<div class="flag attorney"><strong>Your attorney asked for changes</strong>Read the message below, update your answers, then resubmit.</div>
      <p><a class="btn secondary" href="#/q/${encodeURIComponent(activeSteps(answers)[0].key)}">Edit my answers</a> <button class="btn" id="resubmit">Resubmit for review</button></p>` : ''}
    ${['approved', 'completed'].includes(s) ? '<p><a class="btn" href="#/documents">View and download my documents</a></p>' : ''}
    ${['approved', 'completed'].includes(s) && matter.fulfillment.length ? afterSigningHtml() : ''}
    ${s === 'consult_requested' ? '<p>The attorney will contact you to schedule a consultation. You have not been charged.</p>' : ''}
    <h2 style="margin-top:28px">Messages</h2>
    <div class="msgs">${msgs.length ? msgs.map((m) => `<div class="msg"><div class="who">${m.role === 'attorney' ? 'Attorney' : 'You'} · ${esc(when(m.created_at))}</div>${esc(m.body)}</div>`).join('') : '<p class="muted">No messages yet.</p>'}</div>
    <form id="msgf" style="margin-top:12px"><label class="field"><span class="field-label">Send a message to your attorney</span><textarea name="body" required></textarea></label><button class="btn secondary" type="submit">Send message</button></form>
    <h2 style="margin-top:28px">Your plan</h2>${summaryHtml(matter.summary)}
  </section>`;
  document.getElementById('upl')?.addEventListener('change', async (e) => {
    const files = [...e.target.files];
    const label = e.target.closest('label');
    label?.classList.add('busy');
    for (const f of files) {
      try { await uploadFile(f); } catch (err) { toast(`${f.name}: ${err.message}`); label?.classList.remove('busy'); return; }
    }
    toast(files.length === 1 ? 'Uploaded.' : `${files.length} files uploaded.`);
    statusView();
  });
  main.querySelectorAll('[data-del-upload]').forEach((b) => b.addEventListener('click', async () => {
    await api(`/api/matter/uploads/${b.dataset.delUpload}`, { method: 'DELETE' }); statusView();
  }));
  document.getElementById('resubmit')?.addEventListener('click', async () => {
    try { matter = await api('/api/matter/resubmit', { method: 'POST' }); toast('Resubmitted for review.'); statusView(); } catch (err) { toast(err.message); }
  });
  document.getElementById('msgf').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/api/matter/messages', { method: 'POST', body: { body: new FormData(e.target).get('body') } }); toast('Message sent.'); statusView(); } catch (err) { toast(err.message); }
  });
}

// Sends a file straight to private storage with a one-time link from the server,
// then tells the server it arrived.
const EXT_TYPES = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic' };
async function uploadFile(f) {
  const mime = f.type || EXT_TYPES[f.name.split('.').pop().toLowerCase()] || '';
  const start = await api('/api/matter/uploads/start', { method: 'POST', body: { filename: f.name, mime, size: f.size } });
  const put = await fetch(start.url, { method: 'PUT', headers: start.headers, body: f });
  if (!put.ok) throw new Error('The upload didn’t go through. Check your connection and try again.');
  await api('/api/matter/uploads/complete', { method: 'POST', body: { path: start.path, filename: start.filename, mime, size: f.size } });
}

function afterSigningHtml() {
  const ex = matter.extras;
  const steps = [];
  if (ex.courtesy) steps.push(`<li><strong>Upload your signed documents.</strong> Scans or clear phone photos of every signed page. We use them for the courtesy packets you ordered.
    <label class="btn secondary" style="margin-top:8px">Choose files<input type="file" id="upl" accept="application/pdf,image/jpeg,image/png,image/heic" multiple hidden></label>
    ${matter.uploads.length ? `<ul class="small">${matter.uploads.map((u) => `<li>${esc(u.filename)} <button class="btn quiet" data-del-upload="${u.id}">Remove</button></li>`).join('')}</ul>` : ''}</li>`);
  if (ex.deposit) steps.push(`<li><strong>Mail us your signed original ${matter.answers.plan === 'couple' ? 'wills' : 'will'}</strong> with the cover sheet from the Will Deposit Instructions, to ${esc(matter.firm.name)}, ${esc(matter.firm.address)}. We deposit ${matter.answers.plan === 'couple' ? 'them' : 'it'} with the probate court and send you the certificate.</li>`);
  return `<h2 style="margin-top:28px">After you sign</h2><ol>${steps.join('')}</ol>
    <h3>Progress</h3><ol class="timeline">${matter.fulfillment.map((i) => `<li class="${i.done ? 'on' : ''}">${esc(i.label)}</li>`).join('')}</ol>`;
}

async function documentsView() {
  let docs;
  try { docs = await api('/api/matter/documents'); } catch (e) { main.innerHTML = `<section class="panel" style="padding:32px 0"><p>${esc(e.message)}</p><a href="#/status">Back to My plan</a></section>`; return; }
  main.innerHTML = `<section style="padding:32px 0 64px">
    <h1 style="font-size:2rem">Your documents</h1>
    <p class="intro">Approved by your attorney. Print single-sided, then follow the Signing Instructions exactly.</p>
    ${window.__GLW_DEMO ? '<p class="note">Demo: these are unreviewed drafts shown so you can read the drafting. On the live site, documents appear only after attorney approval and download as Word files. Yellow notes are visible only to the attorney.</p>' : '<p style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn" href="/api/matter/download.pdf">Download all (PDF, ready to print)</a><a class="btn secondary" href="/api/matter/download.docx">Download all (Word)</a></p>'}
    ${docs.filter((d) => d.revised).map((d) => `<p><a class="btn secondary" href="/api/matter/revised/${encodeURIComponent(d.id)}">Download ${esc(d.title)} (attorney-revised)</a></p>`).join('')}
    ${docs.filter((d) => d.html).map((d) => d.html).join('')}
  </section>`;
}

// ---------- Router ----------
async function boot() {
  const r = await api('/api/me');
  me = r.user;
  pendingTotp = !!r.pendingTotp;
  if (me?.role === 'attorney') { location.href = '/attorney.html'; return; }
  if (me) { matter = await api('/api/matter'); answers = matter.answers || {}; }
  nav();
}

async function route() {
  const h = location.hash.replace(/^#/, '') || '/status';
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
  if ((h === '/login' || h === '/register') && window.__GLW_DEMO) { location.hash = '#/q/start'; return undefined; }
  if (!me && pendingTotp) return totpView();
  if (h === '/login' || h === '/register') return me ? go('#/status') : authView();
  if (!me) { location.hash = '#/login'; return undefined; }
  if (h.startsWith('/q/')) { showErrors = false; return questionView(decodeURIComponent(h.slice(3))); }
  if (h === '/review') return reviewView();
  if (h === '/checkout') return checkoutView();
  if (h === '/documents') return documentsView();
  return statusView();
}

window.addEventListener('hashchange', () => route().catch((e) => toast(e.message)));
boot().then(route).catch((e) => toast(e.message));
// Exposed for debugging in the browser console.
window.__glw = { get answers() { return answers; }, renderDocHtml };
