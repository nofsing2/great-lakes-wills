// Attorney dashboard: review queue, matter review, checklist, approve / request changes / decline.
const main = document.getElementById('main');
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const when = (s) => { if (!s) return '—'; const d = new Date(s); return Number.isNaN(d.getTime()) ? String(s) : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); };

async function api(path, opts = {}) {
  const r = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'greatlakeswills', ...(opts.headers || {}) },
    body: opts.body && typeof opts.body === 'object' && !(opts.body instanceof ArrayBuffer) && !(opts.body instanceof Blob) ? JSON.stringify(opts.body) : opts.body,
  });
  const data = r.headers.get('content-type')?.includes('json') ? await r.json() : null;
  if (!r.ok) throw Object.assign(new Error(data?.error || `Request failed (${r.status})`), { data });
  return data;
}
function toast(m) { const t = document.getElementById('toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3000); }

const STATUS = { in_review: 'Ready for review', changes_requested: 'Waiting on client', approved: 'Approved', completed: 'Completed', declined: 'Declined', consult_requested: 'Consultation request', awaiting_payment: 'Awaiting payment' };

const BASE_CHECKS = [
  ['conflict_check', 'Conflict check cleared for the client(s) and everyone named in the documents'],
  ['identity', 'Client identity confirmed'],
  ['private_call', 'Spoke with the client privately (required when a beneficiary helped)'],
  ['documents_reviewed', 'Read every generated document'],
  ['notes_removed', 'Attorney notes addressed (they never print in the client’s copy)'],
];

async function queue() {
  let rows;
  try { rows = await api('/api/attorney/matters'); } catch (e) {
    if (e.data?.needs2fa) { twoFactorView(); return; }
    location.href = '/app.html#/login'; return;
  }
  const tf = await api('/api/attorney/2fa').catch(() => ({ enabled: true }));
  main.innerHTML = `<section style="padding:28px 0 64px">
    ${tf.enabled ? '' : '<div class="flag attorney"><strong>Turn on two-step sign-in</strong>Client files are confidential. <a href="#/2fa">Set it up now</a>; it is required on the live site.</div>'}
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap"><h1 style="font-size:2rem">Review queue</h1><a class="btn quiet" href="/api/attorney/export.json">Export all data</a></div>
    ${rows.length ? `<table class="q"><thead><tr><th>#</th><th>Client</th><th>Plan</th><th>Status</th><th>Flags</th><th>Paid</th></tr></thead><tbody>
    ${rows.map((r) => `<tr data-id="${r.id}" tabindex="0"><td>${r.id}</td><td>${esc(r.clients)}<div class="muted small">${esc(r.email)}</div></td><td>${esc(r.plan)}${r.rush ? ' <strong>· Rush</strong>' : ''}</td><td><span class="status-badge ${r.status}">${esc(STATUS[r.status] || r.status)}</span>${r.fulfillmentOpen ? `<div class="muted small">${r.fulfillmentOpen} after-signing task${r.fulfillmentOpen === 1 ? '' : 's'} open</div>` : ''}</td><td>${r.counts.stop ? `<span style="color:var(--cherry)">${r.counts.stop} stop</span> ` : ''}${r.counts.attorney ? `${r.counts.attorney} to resolve` : '—'}</td><td>${esc(when(r.paidAt))}</td></tr>`).join('')}
    </tbody></table>` : '<p class="muted">Nothing to review. Paid plans and consultation requests appear here.</p>'}</section>`;
  main.querySelectorAll('tr[data-id]').forEach((tr) => {
    const go = () => { location.hash = `#/m/${tr.dataset.id}`; };
    tr.addEventListener('click', go);
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  });
}

let tab = 'docs';

async function matterView(id) {
  const m = await api(`/api/attorney/matters/${id}`);
  const checks = m.review.checklist || {};
  const flagChecks = m.flags.filter((f) => f.severity !== 'note').map((f) => [`flag:${f.id}`, `Resolved: ${f.title}`]);
  const allChecks = [...BASE_CHECKS.filter(([k]) => k !== 'private_call' || m.flags.some((f) => f.id === 'helper')), ...flagChecks];
  const names = ['p1', 'p2'].map((k) => [m.answers[k]?.firstName, m.answers[k]?.lastName].filter(Boolean).join(' ')).filter(Boolean).join(' & ');
  const actionable = ['in_review', 'changes_requested'].includes(m.status);

  main.innerHTML = `<div class="att">
    <aside>
      <p><a href="#/">Back to queue</a></p>
      <h1 style="font-size:1.6rem">#${m.id} ${esc(names || m.email)}</h1>
      <p><span class="status-badge ${m.status}">${esc(STATUS[m.status] || m.status)}</span></p>
      <p class="small muted">${esc(m.email)}<br>Engagement ${esc(m.engagement.version || '—')} accepted ${esc(when(m.engagement.acceptedAt))} from ${esc(m.engagement.ip || '—')}<br>
      ${m.payments.map((p) => `${esc(p.provider)} ${esc(p.status)} $${(p.amount_cents / 100).toFixed(2)} ${esc(p.provider_ref || '')}`).join('<br>') || 'No payment'}</p>
      <h2 style="font-size:1.2rem;margin-top:20px">Review checklist</h2>
      <form id="cl">${allChecks.map(([k, l]) => `<label class="check"><input type="checkbox" name="${esc(k)}"${checks[k] ? ' checked' : ''}${actionable ? '' : ' disabled'}><span>${esc(l)}</span></label>`).join('')}
      <label class="field" style="margin-top:12px"><span class="field-label">Private notes</span><textarea name="notes" rows="5">${esc(m.review.notes)}</textarea></label>
      <button class="btn secondary" type="submit">Save checklist</button></form>
      ${m.fulfillment.length && ['approved', 'completed'].includes(m.status) ? `<h2 style="font-size:1.2rem;margin-top:24px">After signing</h2>
      <form id="ff">${m.fulfillment.map((i) => `<label class="check"><input type="checkbox" name="${esc(i.key)}"${i.done ? ' checked' : ''}${m.status === 'completed' ? ' disabled' : ''}><span>${esc(i.label)}</span></label>`).join('')}
      ${m.uploads.length ? `<p class="small" style="margin-top:8px"><strong>Signed copies from client</strong><br>${m.uploads.map((u) => `<a href="/api/attorney/matters/${m.id}/uploads/${u.id}">${esc(u.filename)}</a> <span class="muted">(${Math.max(1, Math.round(u.size / 1024))} KB, ${esc(when(u.created_at))})</span>`).join('<br>')}</p>` : '<p class="muted small">No signed copies uploaded yet.</p>'}
      ${m.status === 'approved' ? '<p style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn secondary" type="submit">Save progress</button><button class="btn" type="button" id="complete">Mark complete</button></p>' : ''}</form>` : ''}
      ${actionable ? `<h2 style="font-size:1.2rem;margin-top:24px">Decision</h2>
      <p><button class="btn" id="approve">Approve and release to client</button></p>
      <label class="field"><span class="field-label">Message to client</span><textarea id="msg" rows="4" placeholder="Required for requesting changes or declining"></textarea></label>
      <p style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn secondary" id="changes">Request changes</button><button class="btn secondary" id="send">Send message only</button><button class="btn danger" id="decline">Decline and refund</button></p>` : `<label class="field" style="margin-top:20px"><span class="field-label">Message to client</span><textarea id="msg" rows="4"></textarea></label><button class="btn secondary" id="send">Send message</button>`}
    </aside>
    <section>
      <div class="tabs" role="tablist">
        ${[['docs', 'Documents'], ['flags', `Flags (${m.flags.filter((f) => f.severity !== 'note').length})`], ['summary', 'Summary'], ['answers', 'Answers'], ['messages', `Messages (${m.messages.length})`], ['log', 'Activity']].map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${tab === k}">${esc(l)}</button>`).join('')}
      </div>
      <div id="tabbody"></div>
    </section></div>`;

  const body = document.getElementById('tabbody');
  const renderTab = () => {
    main.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    if (tab === 'docs') {
      body.innerHTML = `<div class="doc-tools"><a class="btn" href="/api/attorney/matters/${m.id}/package.docx?notes=1">Download full package (Word, with notes)</a><a class="btn secondary" href="/api/attorney/matters/${m.id}/package.docx?final=1">Clean final (Word)</a><a class="btn secondary" href="/api/attorney/matters/${m.id}/package.pdf?final=1">Clean final (PDF)</a></div>
        <p class="muted small">To change a document, download it, edit it in Word, and upload it. The client then receives your revised file instead of the generated one.</p>
        ${m.documents.map((d) => `<details style="margin-bottom:10px"><summary><strong>${esc(d.title)}</strong>${d.owner ? ` — ${esc(d.owner)}` : ''}${d.revised ? ` <span class="status-badge approved">Revised: ${esc(d.revised.filename)}</span>` : ''}</summary>
          <div class="doc-tools"><a class="btn secondary" href="/api/attorney/matters/${m.id}/doc/${encodeURIComponent(d.id)}.docx?notes=1">Download .docx</a><a class="btn secondary" href="/api/attorney/matters/${m.id}/doc/${encodeURIComponent(d.id)}.pdf?final=1">Download PDF</a>
          <label class="btn secondary">Upload revised .docx<input type="file" accept=".docx" data-upload="${esc(d.id)}" hidden></label>
          ${d.revised ? `<button class="btn quiet" data-unrevise="${esc(d.id)}">Remove revision</button>` : ''}</div>${d.html}</details>`).join('')}`;
    } else if (tab === 'flags') {
      body.innerHTML = m.flags.length ? m.flags.map((f) => `<div class="flag ${f.severity}"><strong>${esc(f.title)}</strong>${esc(f.detail)}<cite>${esc(f.cite)}</cite></div>`).join('') : '<p class="muted">No flags.</p>';
    } else if (tab === 'summary') {
      body.innerHTML = `<div class="summary">${m.summary.map((s) => `<h3>${esc(s.heading)}</h3><ul>${s.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`).join('')}</div>`;
    } else if (tab === 'answers') {
      body.innerHTML = `<pre class="answers">${esc(JSON.stringify(m.answers, null, 2))}</pre>`;
    } else if (tab === 'messages') {
      body.innerHTML = `<div class="msgs">${m.messages.map((x) => `<div class="msg"><div class="who">${x.role === 'attorney' ? 'You' : 'Client'} · ${esc(when(x.created_at))}</div>${esc(x.body)}</div>`).join('') || '<p class="muted">No messages.</p>'}</div>`;
    } else {
      body.innerHTML = `<ul>${m.events.map((e) => `<li>${esc(when(e.created_at))} — ${esc(e.action)} ${e.detail ? `<span class="muted small">${esc(e.detail)}</span>` : ''}</li>`).join('')}</ul>`;
    }
  };
  renderTab();
  main.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; renderTab(); }));

  body.addEventListener('change', async (e) => {
    const inp = e.target.closest('[data-upload]');
    if (!inp?.files?.[0]) return;
    const f = inp.files[0];
    if (f.size > 4 * 1024 * 1024) { toast('Word files can be up to 4 MB. Remove large images and try again.'); return; }
    try {
      await api(`/api/attorney/matters/${m.id}/revised/${encodeURIComponent(inp.dataset.upload)}`, { method: 'POST', body: await f.arrayBuffer(), headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': f.name.replace(/[^\x20-\x7e]/g, '') } });
      toast('Revised document uploaded.'); matterView(id);
    } catch (err) { toast(err.message); }
  });
  body.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-unrevise]');
    if (!b) return;
    await api(`/api/attorney/matters/${m.id}/revised/${encodeURIComponent(b.dataset.unrevise)}`, { method: 'DELETE' });
    toast('Revision removed.'); matterView(id);
  });

  const checksIn = (form) => {
    const out = {};
    form.querySelectorAll('input[type=checkbox]:not(:disabled)').forEach((el) => { out[el.name] = el.checked; });
    return out;
  };
  const saveChecklist = async () => {
    const form = document.getElementById('cl');
    await api(`/api/attorney/matters/${m.id}/review`, { method: 'PUT', body: { checklist: checksIn(form), notes: form.notes.value } });
  };
  const ff = document.getElementById('ff');
  ff?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await api(`/api/attorney/matters/${m.id}/review`, { method: 'PUT', body: { checklist: checksIn(ff), notes: document.getElementById('cl').notes.value } });
    toast('Progress saved.');
  });
  document.getElementById('complete')?.addEventListener('click', async () => {
    try {
      await api(`/api/attorney/matters/${m.id}/review`, { method: 'PUT', body: { checklist: checksIn(ff), notes: document.getElementById('cl').notes.value } });
      await api(`/api/attorney/matters/${m.id}/complete`, { method: 'POST' });
      toast('Marked complete.'); matterView(id);
    } catch (err) { toast(err.data?.missing ? `Still open: ${err.data.missing.length} item(s)` : err.message); }
  });
  document.getElementById('cl').addEventListener('submit', async (e) => { e.preventDefault(); await saveChecklist(); toast('Checklist saved.'); });
  const msg = () => document.getElementById('msg').value.trim();
  document.getElementById('approve')?.addEventListener('click', async () => {
    try { await saveChecklist(); await api(`/api/attorney/matters/${m.id}/approve`, { method: 'POST' }); toast('Approved. The client can now download.'); matterView(id); } catch (err) { toast(err.data?.missing ? `Still open: ${err.data.missing.length} checklist item(s)` : err.message); }
  });
  document.getElementById('changes')?.addEventListener('click', async () => {
    try { await api(`/api/attorney/matters/${m.id}/request-changes`, { method: 'POST', body: { message: msg() } }); toast('Sent to client.'); matterView(id); } catch (err) { toast(err.message); }
  });
  document.getElementById('decline')?.addEventListener('click', async () => {
    if (!confirm('Decline this matter and refund the client?')) return;
    try { await api(`/api/attorney/matters/${m.id}/decline`, { method: 'POST', body: { message: msg() } }); toast('Declined and refunded.'); matterView(id); } catch (err) { toast(err.message); }
  });
  document.getElementById('send')?.addEventListener('click', async () => {
    try { await api(`/api/attorney/matters/${m.id}/messages`, { method: 'POST', body: { body: msg() } }); toast('Message sent.'); matterView(id); } catch (err) { toast(err.message); }
  });
}

async function twoFactorView() {
  const st = await api('/api/attorney/2fa');
  if (st.enabled) {
    main.innerHTML = '<section style="padding:28px 0"><h1 style="font-size:2rem">Two-step sign-in is on</h1><p>You’ll enter a code from your authenticator app each time you sign in.</p><p><a class="btn" href="#/">Go to the review queue</a></p></section>';
    return;
  }
  const setup = await api('/api/attorney/2fa/setup', { method: 'POST' });
  main.innerHTML = `<section style="padding:28px 0 64px;max-width:640px">
    <h1 style="font-size:2rem">Turn on two-step sign-in</h1>
    <p>Client files hold private family, financial, and health information, so the attorney account needs a second step at sign-in.</p>
    <ol>
      <li>Open an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, 1Password, or Authy).</li>
      <li>Scan this code, or enter the key below by hand.</li>
      <li>Type the 6-digit code the app shows.</li>
    </ol>
    <div style="max-width:220px;background:#fff;padding:8px;border:1px solid var(--line)">${setup.qr}</div>
    <p class="small">Key: <code style="user-select:all">${esc(setup.secret)}</code></p>
    <form id="tf"><label class="field"><span class="field-label">6-digit code</span><input type="text" name="code" id="tf-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label>
    <p class="err" id="tferr" role="alert"></p><button class="btn" type="submit">Turn on</button></form>
  </section>`;
  document.getElementById('tf').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/attorney/2fa/enable', { method: 'POST', body: { code: new FormData(e.target).get('code') } });
      toast('Two-step sign-in is on.'); location.hash = '#/';
    } catch (err) { document.getElementById('tferr').textContent = err.message; }
  });
}

function route() {
  const h = location.hash.replace(/^#/, '');
  const mm = h.match(/^\/m\/(\d+)/);
  const go = h === '/2fa' ? twoFactorView() : mm ? matterView(mm[1]) : queue();
  go.catch((e) => { if (e.data?.needs2fa) { twoFactorView(); return; } toast(e.message); });
}
document.getElementById('logout').addEventListener('click', async (e) => { e.preventDefault(); await api('/api/auth/logout', { method: 'POST' }); location.href = '/'; });
window.addEventListener('hashchange', route);
// Only signed-in attorneys get past this point; everyone else goes to sign-in.
api('/api/me').then((r) => {
  if (r.user?.role !== 'attorney') { location.href = '/app.html#/login'; return; }
  route();
}).catch((e) => toast(e.message));
