import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { singleCustom, youngFamilyCouple } from './fixtures.js';
import { startServer } from './helpers.js';

let t;
before(async () => { t = await startServer(); });
after(() => t?.stop());

// Client upload: ask for a one-time link, send the file to it, then confirm.
async function upload(c, buf, filename, mime) {
  const start = await c('/api/matter/uploads/start', { method: 'POST', body: { filename, mime, size: buf.length } });
  if (start.status !== 200) return start;
  // Plain browser request to the signed link: no cookie, no site header.
  const put = await fetch(new URL(start.data.url, t.base), { method: 'PUT', body: buf, headers: start.data.headers });
  assert.equal(put.status, 200);
  return c('/api/matter/uploads/complete', { method: 'POST', body: { path: start.data.path, filename: start.data.filename, mime, size: buf.length } });
}

test('full flow: questionnaire → checkout → attorney approval → download', async () => {
  const c = await t.signIn('jordan@example.com', { name: 'Jordan' });
  assert.equal(c.verify.status, 200);
  assert.equal(c.verify.data.newUser, true);
  let r = await c('/api/matter');
  assert.equal(r.data.status, 'draft');
  r = await c('/api/matter/answers', { method: 'PUT', body: { answers: youngFamilyCouple } });
  assert.equal(r.status, 200);
  assert.equal(r.data.eligible, true);
  assert.deepEqual(r.data.incomplete, []);

  const eng = (await c('/api/matter/engagement')).data;
  assert.match(eng.text, /earned upon receipt/);
  assert.match(eng.text, /Truckey Nofsinger, LLP, 38 N. Main St., Three Rivers, Michigan 49093, offering this service as Great Lakes Wills & Estate/);
  assert.equal(eng.version, '2026-10-v1');
  assert.match(eng.text, /Court fees of \$50 are not part of the Firm's fee/);
  assert.match(eng.text, /The flat fee is \$895\./);
  assert.match(eng.text, /\(f\) deposit your signed wills with the Kent County Probate Court/);
  assert.match(eng.text, /\(g\) send courtesy packets, limited to the information you selected, to Maria Lopez and Sam Rivera/);
  // Must accept engagement.
  assert.equal((await c('/api/matter/checkout', { method: 'POST', body: {} })).status, 400);
  r = await c('/api/matter/checkout', { method: 'POST', body: { acceptEngagement: true, rush: true } });
  assert.equal(r.status, 200);
  assert.equal(r.data.mode, 'test');
  assert.equal(r.data.total, 895 + 50 + 125);

  // Documents are locked until approval.
  assert.equal((await c('/api/matter/documents')).status, 403);
  r = await c('/api/matter/test-pay', { method: 'POST' });
  assert.equal(r.data.status, 'in_review');
  // Client cannot edit while under review.
  assert.equal((await c('/api/matter/answers', { method: 'PUT', body: { answers: youngFamilyCouple } })).status, 409);
  // Client cannot reach attorney routes.
  assert.equal((await c('/api/attorney/matters')).status, 403);

  const att = await t.signIn('attorney@example.com');
  assert.equal(att.verify.data.role, 'attorney');
  const list = (await att('/api/attorney/matters')).data;
  assert.equal(list.length, 1);
  const id = list[0].id;
  assert.equal(list[0].rush, true);
  const m = (await att(`/api/attorney/matters/${id}`)).data;
  assert.ok(m.documents.length >= 18);
  assert.ok(m.engagement.acceptedAt);

  // Approval is blocked until the checklist is complete.
  r = await att(`/api/attorney/matters/${id}/approve`, { method: 'POST' });
  assert.equal(r.status, 409);
  assert.ok(r.data.missing.includes('conflict_check'));

  const docx = await att(`/api/attorney/matters/${id}/package.docx?notes=1`, { raw: true });
  assert.equal(docx.status, 200);
  assert.equal(Buffer.from(await docx.arrayBuffer()).subarray(0, 2).toString(), 'PK');

  await att(`/api/attorney/matters/${id}/review`, { method: 'PUT', body: { checklist: { conflict_check: true, identity: true, documents_reviewed: true, notes_removed: true }, notes: 'ok' } });
  r = await att(`/api/attorney/matters/${id}/approve`, { method: 'POST' });
  assert.equal(r.status, 200, JSON.stringify(r.data));

  r = await c('/api/matter/documents');
  assert.equal(r.status, 200);
  assert.ok(r.data.some((d) => /Last Will/.test(d.title)));
  assert.doesNotMatch(JSON.stringify(r.data), /Attorney note/);
  const dl = await c('/api/matter/download.docx', { raw: true });
  assert.equal(dl.status, 200);
  assert.ok((await dl.arrayBuffer()).byteLength > 10000);
  // Courtesy letters go out from the firm; the client's download leaves them out.
  assert.ok(!r.data.some((d) => d.id.startsWith('courtesy:')));
  assert.ok(r.data.some((d) => d.id === 'deposit'));

  // After signing: client uploads signed copies; attorney works the fulfillment list.
  let me = (await c('/api/matter')).data;
  assert.equal(me.fulfillment.length, 1 + 2 + 6);
  assert.equal((await upload(c, Buffer.from('x'), 'a.exe', 'application/x-msdownload')).status, 400);
  r = await upload(c, Buffer.from('%PDF-1.4 test'), 'signed will.pdf', 'application/pdf');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.uploads[0].filename, 'signed will.pdf');
  assert.equal(r.data.uploads[0].size, 13);
  // A client can't register a file outside their own matter's folder.
  const forged = await c('/api/matter/uploads/complete', { method: 'POST', body: { path: 'matters/999/signed/abc.pdf', filename: 'x.pdf', mime: 'application/pdf', size: 1 } });
  assert.equal(forged.status, 400);
  const full = (await att(`/api/attorney/matters/${id}`)).data;
  assert.equal(full.uploads.length, 1);
  const up = await att(`/api/attorney/matters/${id}/uploads/${full.uploads[0].id}`, { raw: true });
  assert.equal(up.status, 200);
  assert.equal(Buffer.from(await up.arrayBuffer()).toString(), '%PDF-1.4 test');
  // Download links expire and can't be reused for other files.
  assert.equal((await t.client()('/api/local-storage/download?token=bad', { raw: true })).status, 404);

  // Attorney-revised Word file replaces the generated one for the client.
  const revisedFile = Buffer.concat([Buffer.from('PK'), Buffer.alloc(100)]);
  r = await att(`/api/attorney/matters/${id}/revised/will%3Ap1`, { method: 'POST', body: revisedFile, headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': 'Will (revised).docx' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const docs2 = (await c('/api/matter/documents')).data;
  assert.equal(docs2.find((d) => d.id === 'will:p1').revised, true);
  const rev = await c('/api/matter/revised/will%3Ap1', { raw: true });
  assert.equal(rev.status, 200);
  assert.equal((await rev.arrayBuffer()).byteLength, 102);
  r = await att(`/api/attorney/matters/${id}/complete`, { method: 'POST' });
  assert.equal(r.status, 409);
  const ff = Object.fromEntries(full.fulfillment.map((i) => [i.key, true]));
  await att(`/api/attorney/matters/${id}/review`, { method: 'PUT', body: { checklist: ff } });
  // Saving fulfillment must not clear the approval checklist.
  assert.equal((await att(`/api/attorney/matters/${id}`)).data.review.checklist.conflict_check, true);
  assert.equal((await att(`/api/attorney/matters/${id}/complete`, { method: 'POST' })).status, 200);
  me = (await c('/api/matter')).data;
  assert.equal(me.status, 'completed');
  assert.ok(me.fulfillment.every((i) => i.done));
});

test('helper flag requires a private call before approval; changes round-trip', async () => {
  const c = await t.signIn('pat@example.com');
  await c('/api/matter/answers', { method: 'PUT', body: { answers: singleCustom } });
  await c('/api/matter/checkout', { method: 'POST', body: { acceptEngagement: true } });
  await c('/api/matter/test-pay', { method: 'POST' });

  const att = await t.signIn('attorney@example.com');
  const id = (await att('/api/attorney/matters')).data.find((x) => x.email === 'pat@example.com').id;
  await att(`/api/attorney/matters/${id}/review`, { method: 'PUT', body: { checklist: { conflict_check: true, identity: true, documents_reviewed: true, notes_removed: true } } });
  let r = await att(`/api/attorney/matters/${id}/approve`, { method: 'POST' });
  assert.equal(r.status, 409);
  assert.ok(r.data.missing.includes('private_call'));
  assert.ok(r.data.missing.includes('flag:helper'));

  r = await att(`/api/attorney/matters/${id}/request-changes`, { method: 'POST', body: { message: 'Please add an alternate personal representative.' } });
  assert.equal(r.status, 200);
  const updated = structuredClone(singleCustom);
  updated.will.prAlt = { name: 'Sam Kowalski', relationship: 'nephew' };
  assert.equal((await c('/api/matter/answers', { method: 'PUT', body: { answers: updated } })).status, 200);
  assert.equal((await c('/api/matter/resubmit', { method: 'POST' })).data.status, 'in_review');
  const msgs = (await c('/api/matter/messages')).data;
  assert.match(msgs[0].body, /alternate personal representative/);

  r = await att(`/api/attorney/matters/${id}/decline`, { method: 'POST', body: { message: 'Not a fit.' } });
  assert.equal(r.status, 200);
  assert.equal((await c('/api/matter')).data.status, 'declined');
});

test('ineligible plans cannot check out; requests need the ajax header', async () => {
  const c = await t.signIn('out@example.com');
  const a = structuredClone(singleCustom);
  a.eligibility.miDomicile = 'no';
  await c('/api/matter/answers', { method: 'PUT', body: { answers: a } });
  assert.equal((await c('/api/matter/checkout', { method: 'POST', body: { acceptEngagement: true } })).status, 409);
  assert.equal((await c('/api/matter/consult', { method: 'POST', body: { message: 'Moving soon' } })).data.status, 'consult_requested');
  const r = await c('/api/matter/messages', { method: 'POST', body: { body: 'x' }, headers: { 'X-Requested-With': '' } });
  assert.equal(r.status, 403);
});
