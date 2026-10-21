import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, generatePackage, incompleteSteps, intestateShares } from '../public/engine/index.js';
import { renderDocHtml } from '../public/engine/render-html.js';
import { blocked, singleCustom, youngFamilyCouple } from './fixtures.js';

const text = (doc) => doc.blocks.map((b) => b.text || (b.items || []).join('\n') || (b.lines || []).map((l) => `${l.label} ${l.value || ''}`).join('\n')).join('\n');
const findDoc = (pkg, id) => pkg.documents.find((d) => d.id === id).doc;

test('fixtures are complete questionnaires', () => {
  assert.deepEqual(incompleteSteps(youngFamilyCouple), []);
  assert.deepEqual(incompleteSteps(singleCustom), []);
});

test('intestacy follows MCL 700.2102 with 2026 amounts', () => {
  assert.equal(intestateShares({ spouse: true, ownChildren: 0, otherChildren: 0, parentLiving: false, estate: 900000 }).spouse, 900000);
  const b = intestateShares({ spouse: true, ownChildren: 2, otherChildren: 0, estate: 500000 });
  assert.equal(b.rule, 'MCL 700.2102(1)(b)');
  assert.equal(b.spouse, 301000 + (500000 - 301000) / 2);
  const c = intestateShares({ spouse: true, ownChildren: 0, otherChildren: 0, parentLiving: true, estate: 500000 });
  assert.equal(c.rule, 'MCL 700.2102(1)(c)');
  assert.equal(c.spouse, 301000 + 199000 * 0.75);
  const f = intestateShares({ spouse: true, ownChildren: 0, otherChildren: 2, estate: 500000 });
  assert.equal(f.rule, 'MCL 700.2102(1)(f)');
  assert.equal(f.spouse, 201000 + 299000 / 2);
  assert.equal(intestateShares({ spouse: true, ownChildren: 1, otherChildren: 1, estate: 200000 }).spouse, 200000);
  assert.equal(intestateShares({ spouse: false, ownChildren: 0, otherChildren: 2, estate: 100 }).descendants, 100);
});

test('stop flags block checkout', () => {
  const r = evaluate(blocked);
  assert.equal(r.eligible, false);
  const ids = r.flags.filter((f) => f.severity === 'stop').map((f) => f.id).sort();
  assert.deepEqual(ids, ['estate_tax', 'medicaid', 'not_michigan', 'special_needs']);
});

test('attorney flags for helper and out-of-state property', () => {
  const r = evaluate(singleCustom);
  assert.equal(r.eligible, true);
  assert.ok(r.flags.some((f) => f.id === 'helper' && f.severity === 'attorney'));
  assert.ok(r.flags.some((f) => f.id === 'out_of_state'));
});

test('married client leaving spouse out of a custom plan is flagged under MCL 700.2202', () => {
  const a = structuredClone(singleCustom);
  a.family = { ...a.family, maritalStatus: 'married', spouse: { name: 'Chris Kowalski' } };
  const f = evaluate(a).flags.find((x) => x.id === 'spouse_election');
  assert.ok(f);
  assert.match(f.cite, /700\.2202/);
});

test('blended couple gets an attorney flag and guardian caveat', () => {
  const a = structuredClone(youngFamilyCouple);
  a.family.children.push({ name: 'Mia Chen', dob: '2014-03-03', relation: 'p2_only', otherParentLiving: true });
  a.family.includeStepchildren = 'yes';
  const r = evaluate(a);
  assert.ok(r.flags.some((f) => f.id === 'blended'));
  assert.ok(r.flags.some((f) => f.id.startsWith('guardian_other_parent')));
  const will1 = text(findDoc(generatePackage(a), 'will:p1'));
  assert.match(will1, /Mia Chen/);
  assert.match(will1, /each of my stepchildren named in Article 1 is treated as my child/);
});

test('couple package has mirror documents and the right count', () => {
  const pkg = generatePackage(youngFamilyCouple);
  const ids = pkg.documents.map((d) => d.id);
  for (const id of ['will:p1', 'will:p2', 'poa:p1', 'poa:p2', 'pad:p1', 'pad:p2', 'hipaa:p1', 'funeral:p1', 'ack:p1:agent', 'ack:p1:successor1', 'padAccept:p2:advocate', 'signing']) assert.ok(ids.includes(id), id);
  assert.ok(!ids.includes('funeral:p2'));
  // 895 plan + 2 wills × $25 court fee; mailing, deposit handling, and courtesy packets are free
  assert.equal(pkg.price.total, 895 + 50);
  assert.ok(pkg.price.lines.some((l) => l.label === 'Courtesy packets (2)' && l.amount === 0));
  assert.ok(ids.includes('deposit') && ids.includes('courtesy:0') && ids.includes('courtesy:1'));
});

test('will contents track Michigan statutes', () => {
  const pkg = generatePackage(youngFamilyCouple);
  const w = text(findDoc(pkg, 'will:p1'));
  assert.match(w, /I certify \(or declare\) under penalty for perjury under the law of the state of Michigan/i, 'MCL 700.2504(5) self-proving language');
  assert.match(w, /MCL 700\.2513/);
  assert.match(w, /MCL 700\.2607/);
  assert.match(w, /MCL 700\.2718/);
  assert.match(w, /survive me by 30 days/);
  assert.match(w, /one-third \(1\/3\) of the trust property when the beneficiary reaches age 25/);
  assert.match(w, /I nominate my spouse, Casey Rivera, as personal representative/);
  assert.match(w, /MCL 700\.5202/);
  assert.match(w, /not made under any contract/);
  assert.match(w, /If my spouse does not survive me, I give the sum of \$5,000 to Kent County Humane Society/);
  assert.doesNotMatch(w, /RESIDUE_ARTICLE|YOUNG_ARTICLE|FINAL_DEFS|undefined|\[object/);
  const w2 = text(findDoc(pkg, 'will:p2'));
  assert.match(w2, /I nominate my spouse, Jordan A\. Rivera, as personal representative/);
});

test('UTMA plan uses custodianship to 21 under MCL 554.547(2)', () => {
  const w = text(findDoc(generatePackage(singleCustom), 'will:p1'));
  assert.match(w, /MCL 554\.547\(2\)/);
  assert.match(w, /60% to Dana Kowalski, my niece/);
  assert.match(w, /If an organization named above does not exist/);
  assert.doesNotMatch(w, /Northern Michigan Food Bank does not survive/);
});

test('power of attorney is the statutory form with tailored special instructions', () => {
  const pkg = generatePackage(youngFamilyCouple);
  const p1 = text(findDoc(pkg, 'poa:p1'));
  assert.match(p1, /STATUTORY FORM POWER OF ATTORNEY/);
  assert.match(p1, /does not authorize the agent to make health care decisions/);
  assert.match(p1, /annual exclusion amount under IRC 2503\(b\)/);
  assert.match(p1, /not entitled to compensation/);
  assert.match(p1, /revokes every general power of attorney/);
  const p2 = text(findDoc(pkg, 'poa:p2'));
  assert.match(p2, /effective only when I am incapacitated/);
  assert.match(p2, /may not make gifts/);
  assert.doesNotMatch(p2, /revokes every general power/);
  const ack = text(findDoc(pkg, 'ack:p1:successor1'));
  assert.match(ack, /Maria Lopez/);
  assert.match(ack, /Exercise authority over any bank, securities, or other financial account in a foreign country/);
});

test('patient advocate designation meets MCL 700.5506-.5509', () => {
  const pkg = generatePackage(youngFamilyCouple);
  const p1 = text(findDoc(pkg, 'pad:p1'));
  assert.match(p1, /exercisable only when I am unable to participate in medical treatment decisions/);
  assert.match(p1, /authority to make an anatomical gift remains exercisable after my death/);
  assert.match(p1, /clear and convincing manner/);
  assert.match(p1, /could or would allow my death/);
  assert.match(p1, /presumptive heir/);
  const p2 = text(findDoc(pkg, 'pad:p2'));
  assert.match(p2, /do NOT authorize my patient advocate to make a decision to withhold or withdraw/);
  assert.match(p2, /mental health treatment decisions/);
  const acc = findDoc(pkg, 'padAccept:p1:advocate');
  const list = acc.blocks.find((b) => b.type === 'list');
  assert.equal(list.items.length, 10, 'MCL 700.5507(5) has ten statements');
});

test('signing instructions name the initials for the statutory POA', () => {
  const s = text(findDoc(generatePackage(youngFamilyCouple), 'signing'));
  assert.match(s, /"All Preceding Subjects"/);
  assert.match(s, /"Create or change a beneficiary designation"/);
  assert.match(s, /"Make a gift"/);
  assert.match(s, /remote \(video\) witnessing/);
});

test('HTML renderer hides attorney notes unless asked', () => {
  const a = structuredClone(singleCustom);
  a.will.omit = 'yes';
  a.will.omitNames = 'Robert Kowalski';
  const will = findDoc(generatePackage(a), 'will:p1');
  assert.doesNotMatch(renderDocHtml(will), /Attorney note/);
  assert.match(renderDocHtml(will, { showAttorneyNotes: true }), /Attorney note/);
  assert.match(text(will), /intentionally make no provision in this will for Robert Kowalski/);
});

test('firm details print on the POA and signing instructions with no placeholders', () => {
  const pkg = generatePackage(youngFamilyCouple);
  const poa = text(findDoc(pkg, 'poa:p1'));
  assert.match(poa, /This document prepared by:\nLuke Nofsinger \(P79495\)\nTruckey Nofsinger, LLP\n38 N\. Main St\., Three Rivers, Michigan 49093\n\(269\) 273-5657/);
  for (const d of pkg.documents) assert.doesNotMatch(text(d.doc), /\[(Attorney|Law Firm|Street|Phone|Email)/, d.id);
});

test('signing instructions give the firm contact email', () => {
  assert.match(text(findDoc(generatePackage(youngFamilyCouple), 'signing')), /\(269\) 273-5657, luke@truckeynofsinger\.com\./);
});


test('courtesy letters describe each role and respect what the client chose to share', () => {
  const pkg = generatePackage(youngFamilyCouple);
  const maria = text(findDoc(pkg, 'courtesy:0'));
  assert.match(maria, /Personal representative/);
  assert.match(maria, /Trustee/);
  assert.match(maria, /Guardian/);
  assert.match(maria, /Financial agent/);
  assert.match(maria, /Patient advocate/);
  assert.match(maria, /Overview of the plan/);
  assert.match(maria, /Copy of Jordan's signed will/);
  assert.match(maria, /Agent's Acknowledgment for you to sign/);
  assert.match(maria, /We represent Jordan A\. Rivera and Casey Rivera only/);
  assert.match(maria, /on deposit for safekeeping with the Kent County Probate Court/);
  const sam = text(findDoc(pkg, 'courtesy:1'));
  assert.doesNotMatch(sam, /Overview of the plan|signed will/);
  assert.match(sam, /Jordan A\. Rivera and Casey Rivera have each nominated you as second alternate personal representative/);
  assert.equal((sam.match(/\*\*Personal representative\.\*\*/g) || []).length, 1, 'identical roles from both wills are combined');
  assert.match(sam, /sam@example\.com/);
});

test('deposit instructions follow MCL 700.2515 and the court fee statute', () => {
  const d = text(findDoc(generatePackage(youngFamilyCouple), 'deposit'));
  assert.match(d, /Kent County Probate Court/);
  assert.match(d, /MCL 700\.2515/);
  assert.match(d, /\$25 fee \(MCL 600\.880c\)/);
  assert.match(d, /COVER SHEET — JORDAN A\. RIVERA/);
  assert.match(d, /COVER SHEET — CASEY RIVERA/);
  const s = text(findDoc(generatePackage(youngFamilyCouple), 'signing'));
  assert.match(s, /Mail the signed original wills to us/);
  assert.match(s, /Upload scans/);
});

test('extras step requires recipients and consent when packets are ordered', () => {
  const a = structuredClone(youngFamilyCouple);
  a.extras.recipients = [];
  a.extras.shareConsent = false;
  const missing = incompleteSteps(a).find((s) => s.key === 'extras');
  assert.ok(missing.errors['extras.recipients']);
  assert.ok(missing.errors['extras.shareConsent']);
});
