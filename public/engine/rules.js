// The decision rules: which cases fit a flat-fee plan, what the attorney must
// look at, which documents to generate, and what it costs.
//
// Severity:
//   stop     – outside the flat-fee package; the client is offered a consultation instead of checkout
//   attorney – allowed, but the reviewing attorney must resolve it before approving
//   note     – information for the client and attorney

import { ESTATE_RANGES, FEDERAL_EXEMPTION, FEES } from './constants.js';
import { context } from './questions.js';
import { ageOn, fullName, get, money } from './util.js';

const FAMILY_WORDS = /\b(wife|husband|spouse|son|daughter|child|grand(son|daughter|child)|mother|father|parent|grand(mother|father|parent))\b/i;

function flag(id, severity, title, detail, cite) {
  return { id, severity, title, detail, cite };
}

export function evaluate(a = {}) {
  const c = context(a);
  const flags = [];
  const add = (...args) => flags.push(flag(...args));
  const yes = (path) => get(a, path) === 'yes';

  // ---- Eligibility (stop) ----
  if (get(a, 'eligibility.miDomicile') === 'no') {
    add('not_michigan', 'stop', 'Not a Michigan resident', 'These documents are drafted under Michigan law for people whose permanent home is in Michigan. A will is generally governed by the law of your domicile, and the reviewing attorney is licensed in Michigan.', 'MCL 700.2506; MRPC 5.5');
  }
  if (get(a, 'eligibility.adult') === 'no') {
    add('minor', 'stop', 'Under 18', 'A person must be at least 18 to make a will, power of attorney, or patient advocate designation in Michigan.', 'MCL 700.2501; 700.5506(1)');
  }
  if (get(a, 'eligibility.self') === 'no') {
    add('not_self', 'stop', 'Completing for someone else', 'Only the person making the plan can make these decisions. An agent under a power of attorney cannot make a will for someone else. If a family member needs a plan, they should start their own session or schedule a consultation.', 'MCL 700.2501; MCL 556.301');
  }

  // ---- Size and complexity (stop) ----
  const range = ESTATE_RANGES.find((r) => r.value === get(a, 'assets.range'));
  if (range) {
    const exemptionCap = c.isCouple ? FEDERAL_EXEMPTION * 2 : FEDERAL_EXEMPTION;
    if (range.max > exemptionCap) {
      add('estate_tax', 'stop', 'Estate may owe federal estate tax', `The ${new Date().getFullYear()} federal estate tax exemption is ${money(FEDERAL_EXEMPTION)} per person. Estates near or above it need tax planning (trusts, portability elections) that a simple will does not provide.`, 'IRC 2010(c)');
    } else if (c.isCouple && range.max > FEDERAL_EXEMPTION) {
      add('portability', 'attorney', 'Combined estate above one exemption', `Your combined estate may exceed one person’s ${money(FEDERAL_EXEMPTION)} exemption. The attorney will discuss filing a federal estate tax return at the first death to preserve the unused exemption (portability) or using a credit-shelter trust.`, 'IRC 2010(c)(4)-(5)');
    }
  }
  if (yes('family.specialNeeds')) {
    add('special_needs', 'stop', 'Beneficiary with a disability or needs-based benefits', 'Leaving an inheritance outright can disqualify someone from SSI or Medicaid. Their share should go to a supplemental needs trust, which is drafted in a consultation.', 'SSI/Medicaid resource rules, 42 USC 1382b; 20 CFR 416.1201');
  }
  if (yes('assets.longTermCare')) {
    add('medicaid', 'stop', 'Medicaid or nursing-home planning', 'Planning for long-term-care costs and Medicaid eligibility involves look-back rules and specialized documents beyond this package.', 'Michigan BEM 405');
  }
  if (yes('assets.existingTrust')) {
    add('trust_plan', 'stop', 'Living trust', 'You have, or want, a revocable living trust. That plan needs a pour-over will and trust-funding instructions coordinated with the trust, prepared in a consultation.', 'MCL 700.2511; Michigan Trust Code');
  }

  // ---- Attorney must address ----
  if (yes('eligibility.helper')) {
    add('helper', 'attorney', 'A beneficiary is helping', 'Someone who may benefit is helping with the plan. The attorney will speak with the client privately to confirm the plan reflects the client’s own wishes and capacity before approving.', 'MCL 700.2501; Kar v Hogan, 399 Mich 529 (1976) (presumption of undue influence)');
  }
  if (yes('family.divorcePending')) {
    add('divorce_pending', 'attorney', 'Divorce case pending', 'Michigan revokes gifts and appointments to a former spouse only after the divorce judgment. Until then, the spouse keeps rights; a divorce court order may also restrict changes. The attorney will coordinate with the divorce case.', 'MCL 700.2807; MCL 556.210(2)(c); MCL 700.5510(1)(g)');
  }
  if (yes('family.maritalAgreement')) {
    add('marital_agreement', 'attorney', 'Prenuptial or postnuptial agreement', 'The attorney needs to review the agreement so the will and other documents are consistent with it.', 'MCL 700.2205');
  }
  if (yes('family.priorDivorceObligations')) {
    add('divorce_obligations', 'attorney', 'Obligations under a divorce judgment', 'A judgment may require life insurance or bequests to a former spouse or children. The attorney will review the judgment.', 'MCL 700.2807(1)');
  }
  if (c.married && !c.isCouple && get(a, 'will.plan') === 'custom') {
    const spouse = (c.spouseName || '').toLowerCase();
    const bens = get(a, 'will.beneficiaries') || [];
    const toSpouse = bens.filter((b) => spouse && fullName(b).toLowerCase() === spouse).reduce((s, b) => s + Number(b.share || 0), 0);
    add('spouse_election', 'attorney', toSpouse >= 50 ? 'Spouse’s elective share' : 'Plan may leave out your spouse', `A surviving spouse can elect to take half of their intestate share (reduced by half of non-probate property they receive) instead of what the will provides. ${toSpouse ? `The plan gives your spouse ${toSpouse}% of the residue.` : 'The plan does not name your spouse as a residuary beneficiary.'} The attorney will confirm this plan works.`, 'MCL 700.2202(2)');
  }
  if (yes('family.nonCitizenSpouse') && range && range.max > FEDERAL_EXEMPTION / 2) {
    add('noncitizen', 'attorney', 'Non-citizen spouse', 'The unlimited marital deduction is not available for a non-citizen spouse without a qualified domestic trust. The attorney will check whether the estate size makes this matter.', 'IRC 2056(d)');
  }
  if (yes('family.engaged')) {
    add('engaged', 'attorney', 'Planning to marry', 'A will made before marriage can give a later spouse an intestate share unless the will was made in contemplation of that marriage. The attorney will ask whether to state that.', 'MCL 700.2301');
  }
  if (yes('assets.outOfStateRealEstate')) {
    add('out_of_state', 'attorney', 'Real estate outside Michigan', 'Real estate in another state is probated there (ancillary probate). The attorney may suggest a trust or deed change; a will alone may be fine for small property.', 'Ancillary probate in the situs state');
  }
  if (yes('assets.business')) {
    add('business', 'attorney', 'Business or farm interest', 'Check the operating agreement or bylaws for transfer restrictions and buy-sell terms. Without court approval a personal representative may continue an unincorporated business only for 4 months, so the will may need to authorize continuation.', 'MCL 700.3715(z)');
  }
  if (yes('assets.communityProperty')) {
    add('community_property', 'attorney', 'Lived in a community-property state', 'Property acquired there while married may still be community property. The attorney will ask about it.', 'MCL 557.261 et seq. (Uniform Disposition of Community Property Rights at Death Act)');
  }
  if (yes('will.omit')) {
    add('omission', 'attorney', 'Intentionally leaving someone out', `The client wants to leave out: ${get(a, 'will.omitNames') || '(not named)'}. The will should name them and state the omission is intentional, without giving reasons.`, 'MCL 700.2302');
  }
  if (yes('family.beneficiaryConcern')) {
    add('spendthrift', 'attorney', 'Concern about a beneficiary', 'Consider holding that beneficiary’s share in a continuing trust with a spendthrift clause rather than distributing it outright at a set age.', 'MCL 700.7502');
  }
  const blended = c.children.some((k) => ['p1_only', 'p2_only', 'child_other', 'stepchild'].includes(k.relation));
  if (blended && c.hasSpouse) {
    add('blended', 'attorney', 'Blended family', c.isCouple
      ? 'With children from other relationships, matching wills let the surviving spouse change the plan after the first death and leave out the first spouse’s children. The attorney will discuss whether that is acceptable or whether a trust is needed.'
      : 'With children from other relationships, the attorney will confirm how your spouse and each child are treated.', 'MCL 700.2202; 700.2302');
  }
  for (const k of c.livingChildren) {
    const age = ageOn(k.dob);
    if (age !== null && age < 18 && k.otherParentLiving && ['child_other', 'p1_only', 'p2_only'].includes(k.relation)) {
      add(`guardian_other_parent_${fullName(k)}`, 'attorney', `Other parent of ${fullName(k)} is living`, 'A guardian named in a will takes effect only if no parent with parental rights is living and able to act. The nomination still matters if the other parent later dies or loses rights. The attorney will explain this.', 'MCL 700.5202(2); 700.5204');
    }
  }
  if (c.hasStepchildren && get(a, 'family.includeStepchildren') === 'no') {
    add('stepchildren_excluded', 'note', 'Stepchildren not included', 'Stepchildren will not inherit as “children” under the will. They may still be named individually as beneficiaries.', 'MCL 700.2114');
  }
  if (yes('assets.firearmsNfa')) {
    add('nfa', 'note', 'NFA firearms', 'Transfers of NFA firearms require ATF approval. The personal representative must not transfer them before approval. Consider a gun trust.', '26 USC 5812');
  }

  // Per-person powers of attorney and patient advocate designations.
  if (c.complete) {
    for (const p of c.people) {
      const who = c.isCouple ? `${a[p]?.firstName || p}: ` : '';
      if (get(a, `${p}.poa.gifts`) === 'attorney') {
        add(`poa_gifts_${p}`, 'attorney', `${who}Broad gifting power requested`, 'Broad gift authority is used for Medicaid and tax planning and creates risk of abuse. The attorney will tailor it.', 'MCL 556.301(1)(b); 556.317');
      }
      const agent = get(a, `${p}.poa.agent`);
      if (agent?.name && get(a, `${p}.poa.gifts`) === 'family_annual' && !FAMILY_WORDS.test(agent.relationship || '')) {
        add(`poa_nonfamily_${p}`, 'note', `${who}Agent is not a close family member`, 'An agent who is not your ancestor, spouse, or descendant cannot use gift power to benefit themselves unless you say so expressly. The form keeps that protection.', 'MCL 556.301(2)');
      }
      if (get(a, `${p}.poa.effective`) === 'springing') {
        add(`poa_springing_${p}`, 'note', `${who}Springing power of attorney`, 'The agent can act only after a physician or licensed psychologist determines in writing that you are incapacitated. Some institutions are slow to accept springing powers.', 'MCL 556.209');
      }
      const spouseAgent = c.hasSpouse && agent?.name && /spouse|wife|husband/i.test(agent.relationship || '');
      if (spouseAgent && !get(a, `${p}.poa.successor1.name`)) {
        add(`poa_no_successor_${p}`, 'note', `${who}No successor agent`, 'If your spouse is your only agent and a divorce or separation is filed, or your spouse can’t act, the power of attorney ends. Naming a successor is recommended.', 'MCL 556.210(2)(c)');
      }
      if (!get(a, `${p}.pad.successor1.name`)) {
        add(`pad_no_successor_${p}`, 'note', `${who}No successor patient advocate`, 'If your patient advocate can’t serve, there will be no one with authority. Naming a successor is strongly recommended.', 'MCL 700.5507(3)');
      }
    }
  }
  if (!get(a, 'will.prAlt.name') && !(c.hasSpouse && get(a, 'will.spouseAsPr') === 'yes')) {
    add('no_alt_pr', 'note', 'No alternate personal representative', 'If your personal representative can’t serve, the court will choose someone. Naming an alternate is recommended.', 'MCL 700.3203');
  }

  if (get(a, 'extras.courtesy') === 'yes') {
    const rs = (get(a, 'extras.recipients') || []).filter((r) => r?.name);
    const wholePlan = rs.filter((r) => r.share === 'plan').map((r) => r.name);
    add('courtesy', 'note', 'Courtesy packets authorized', `The client authorized sending packets to ${rs.length} ${rs.length === 1 ? 'person' : 'people'}${wholePlan.length ? `; ${wholePlan.join(', ')} will see the whole plan, including the will` : ''}. Each letter states that the firm represents the client and not the recipient.`, 'MRPC 1.6(a); MRPC 4.3');
  }
  if (get(a, 'extras.deposit') === 'yes') {
    add('deposit', 'note', 'Will deposit with probate court', `After signing, the client mails the original ${c.isCouple ? 'wills' : 'will'} to the firm for deposit with the ${a.address?.county || ''} County Probate Court. The $${FEES.depositCourtFee} court fee per will is a cost advanced by the client; handle it under MRPC 1.15.`, 'MCL 700.2515; MCL 600.880c(2)');
  }
  const stops = flags.filter((f) => f.severity === 'stop');
  return {
    context: c,
    flags,
    eligible: stops.length === 0,
    documents: documentList(a, c),
    price: price(a, c),
  };
}

export function documentList(a, c = context(a)) {
  const docs = [];
  for (const p of c.people) {
    const owner = c.isCouple ? (a[p]?.firstName || p) : null;
    docs.push({ id: `will:${p}`, type: 'will', person: p, owner, title: 'Last Will and Testament' });
    if (get(a, 'will.tppList') === 'yes') docs.push({ id: `tpp:${p}`, type: 'tpp', person: p, owner, title: 'Personal Property Memorandum (MCL 700.2513)' });
    if (c.complete) {
      docs.push({ id: `poa:${p}`, type: 'poa', person: p, owner, title: 'Durable Power of Attorney (Michigan Statutory Form)' });
      for (const k of ['agent', 'successor1', 'successor2']) {
        if (get(a, `${p}.poa.${k}.name`)) docs.push({ id: `ack:${p}:${k}`, type: 'agentAck', person: p, role: k, owner, title: `Agent’s Acknowledgment — ${get(a, `${p}.poa.${k}.name`)}` });
      }
      docs.push({ id: `pad:${p}`, type: 'pad', person: p, owner, title: 'Patient Advocate Designation' });
      for (const k of ['advocate', 'successor1', 'successor2']) {
        if (get(a, `${p}.pad.${k}.name`)) docs.push({ id: `padAccept:${p}:${k}`, type: 'padAccept', person: p, role: k, owner, title: `Acceptance of Patient Advocate — ${get(a, `${p}.pad.${k}.name`)}` });
      }
      docs.push({ id: `hipaa:${p}`, type: 'hipaa', person: p, owner, title: 'HIPAA Authorization' });
      if (get(a, `${p}.funeral.designate`) === 'yes') docs.push({ id: `funeral:${p}`, type: 'funeral', person: p, owner, title: 'Funeral Representative Designation' });
    }
  }
  docs.push({ id: 'signing', type: 'signing', person: null, owner: null, title: 'Signing Instructions' });
  if (get(a, 'extras.deposit') === 'yes') {
    docs.push({ id: 'deposit', type: 'deposit', person: null, owner: null, title: 'Will Deposit Instructions' });
  }
  if (get(a, 'extras.courtesy') === 'yes') {
    (get(a, 'extras.recipients') || []).forEach((r, i) => {
      if (r?.name) docs.push({ id: `courtesy:${i}`, type: 'courtesy', index: i, person: null, owner: null, title: `Courtesy letter — ${r.name}`, afterSigning: true });
    });
  }
  return docs;
}

export function price(a, c = context(a)) {
  const pkg = c.complete ? 'complete' : 'will';
  const size = c.isCouple ? 'couple' : 'single';
  const lines = [{ label: `${c.complete ? 'Complete plan' : 'Will'} — ${c.isCouple ? 'couple' : 'individual'}, including attorney review`, amount: FEES[pkg][size], kind: 'fee' }];
  if (get(a, 'checkout.rush')) lines.push({ label: 'Rush review (1 business day)', amount: FEES.rushReview, kind: 'fee' });
  if (get(a, 'extras.deposit') === 'yes') {
    const wills = c.people.length;
    if (FEES.depositService) lines.push({ label: `Probate court will deposit — handling${wills > 1 ? ` (${wills} wills)` : ''}`, amount: FEES.depositService * wills, kind: 'fee' });
    lines.push({ label: `Will deposit — probate court fee, paid to the court${wills > 1 ? ` (${wills} × ${money(FEES.depositCourtFee)})` : ''}`, amount: FEES.depositCourtFee * wills, kind: 'cost' });
  }
  if (get(a, 'extras.courtesy') === 'yes') {
    const rs = get(a, 'extras.recipients') || [];
    const mail = rs.filter((r) => r.delivery === 'mail').length;
    const email = rs.filter((r) => r.delivery === 'email').length;
    if (!FEES.courtesyMail && !FEES.courtesyEmail) {
      if (mail + email) lines.push({ label: `Courtesy packets (${mail + email})`, amount: 0, kind: 'fee' });
    } else {
      if (mail) lines.push({ label: `Courtesy packets by mail (${mail} × ${money(FEES.courtesyMail)})`, amount: mail * FEES.courtesyMail, kind: 'fee' });
      if (email) lines.push({ label: `Courtesy packets by email (${email} × ${money(FEES.courtesyEmail)})`, amount: email * FEES.courtesyEmail, kind: 'fee' });
    }
  }
  return { lines, total: lines.reduce((s, l) => s + l.amount, 0) };
}

// After approval: what the firm still has to do for the extra services.
export function fulfillmentItems(a, c = context(a)) {
  const items = [];
  if (get(a, 'extras.courtesy') === 'yes') {
    items.push({ key: 'ff:signed_copies', label: 'Signed copies received from client' });
    (get(a, 'extras.recipients') || []).forEach((r, i) => {
      if (r?.name) items.push({ key: `ff:courtesy:${i}`, label: `Courtesy packet sent to ${r.name} by ${r.delivery === 'email' ? 'email' : 'mail'}` });
    });
  }
  if (get(a, 'extras.deposit') === 'yes') {
    for (const o of c.people) {
      const n = fullName(a[o]);
      items.push({ key: `ff:original:${o}`, label: `Original will received — ${n}` });
      items.push({ key: `ff:deposited:${o}`, label: `Deposited with ${a.address?.county || ''} County Probate Court; certificate received — ${n}` });
      items.push({ key: `ff:certificate:${o}`, label: `Certificate of deposit sent to client — ${n}` });
    }
  }
  return items;
}
