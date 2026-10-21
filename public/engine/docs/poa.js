// Michigan statutory form power of attorney (MCL 556.401) and the
// Agent's Acknowledgment template (MCL 556.402). Statutory text is reproduced
// from the Michigan Compiled Laws; only the blanks are filled in.

import { box, doc, h, h2, list, p, pageBreak, sig, title } from './model.js';
import { partyFor } from './people.js';
import { firmLines } from '../constants.js';
import { fullName, get } from '../util.js';

const SUBJECTS = [
  'Real Property', 'Tangible Personal Property', 'Stocks and Bonds', 'Commodities and Options',
  'Banks and Other Financial Institutions', 'Operation of Entity or Business', 'Insurance and Annuities',
  'Estates, Trusts, and Other Beneficial Interests', 'Claims and Litigation', 'Personal and Family Maintenance',
  'Benefits from Governmental Programs or Civil or Military Service', 'Retirement Plans', 'Taxes',
];

export const SPECIFIC = [
  { key: 'trust', text: 'Create, amend, revoke, or terminate an inter vivos trust' },
  { key: 'gifts', text: 'Make a gift as limited by section 217 of the uniform power of attorney act, MCL 556.317, and any special instructions in this power of attorney' },
  { key: 'survivorship', text: 'Create or change rights of survivorship by, for example, creating a joint account' },
  { key: 'beneficiary', text: 'Create or change a beneficiary designation' },
  { key: 'delegate', text: 'Authorize another person to exercise the authority granted under this power of attorney' },
  { key: 'annuity', text: 'Waive the principal\'s right to be a beneficiary of a joint and survivor annuity, including a survivor benefit under a retirement plan' },
  { key: 'fiduciary', text: 'Exercise fiduciary powers that the principal has authority to delegate' },
  { key: 'ecomm', text: 'Access the content of electronic communications' },
  { key: 'foreign', text: 'Exercise authority over any "bank, securities, or other financial account in a foreign country" within the meaning of 31 CFR 1010.350' },
];

const blank = (v, w = 40) => (v && String(v).trim() ? String(v).trim() : '_'.repeat(w));

export function poaSelections(a, pKey) {
  const hot = new Set(get(a, `${pKey}.poa.hotPowers`) || []);
  if (get(a, `${pKey}.poa.gifts`) === 'family_annual') hot.add('gifts');
  return SPECIFIC.filter((s) => hot.has(s.key)).map((s) => s.key);
}

export function specialInstructions(a, pKey) {
  const P = partyFor(a, pKey);
  const out = [];
  const eff = get(a, `${pKey}.poa.effective`);
  const gifts = get(a, `${pKey}.poa.gifts`);
  if (eff === 'springing') {
    out.push('1. This power of attorney becomes effective only when I am incapacitated. My incapacity shall be determined in a record signed by a physician or licensed psychologist who has examined me, as provided in MCL 556.209(3). I authorize any physician, psychologist, or health care provider to disclose my protected health information to my agent and successor agents for the limited purpose of making that determination.');
  }
  if (gifts === 'family_annual') {
    out.push(`${out.length + 1}. My agent may make gifts only to or for the benefit of my spouse and my descendants. Gifts to or for any one person in a calendar year may not exceed the federal gift tax annual exclusion amount under IRC 2503(b) for that year, or twice that amount if my spouse agrees to split gifts under IRC 2513. Within these limits, an agent who is my spouse or descendant may make gifts to himself or herself.`);
  } else {
    out.push(`${out.length + 1}. My agent may not make gifts of my property.`);
  }
  if (get(a, `${pKey}.poa.compensation`) === 'none') {
    out.push(`${out.length + 1}. My agent is not entitled to compensation but is entitled to reimbursement of reasonable expenses incurred on my behalf.`);
  }
  out.push(`${out.length + 1}. A successor agent may act on the successor's signed statement that each prior agent has died, resigned, become incapacitated, or declined to act, and any person may rely on that statement.`);
  if (get(a, `${pKey}.poa.revokePrior`) !== 'no') {
    out.push(`${out.length + 1}. This power of attorney revokes every general power of attorney for property that I signed before this date. It does not revoke any power of attorney given to a financial institution for a single account, any patient advocate designation, or any power of attorney limited to a specific transaction.`);
  }
  out.push(`${out.length + 1}. A photocopy or electronically transmitted copy of this signed power of attorney has the same effect as the original.`);
  return { lines: out, principal: P.name };
}

export function buildPoa(a, pKey) {
  const P = partyFor(a, pKey);
  const agent = get(a, `${pKey}.poa.agent`) || {};
  const s1 = get(a, `${pKey}.poa.successor1`) || {};
  const s2 = get(a, `${pKey}.poa.successor2`) || {};
  const nominateAgent = get(a, `${pKey}.poa.nominateAgentAsConservator`) === 'yes';
  const advocate = get(a, `${pKey}.pad.advocate`) || {};
  const si = specialInstructions(a, pKey);
  const addr = [P.address.street, `${P.address.city}, MI ${P.address.zip || ''}`.trim()].filter(Boolean).join(', ');

  const B = [];
  B.push(title('MICHIGAN\nSTATUTORY FORM POWER OF ATTORNEY'));
  B.push(h('IMPORTANT INFORMATION'));
  [
    'This power of attorney authorizes another person (your agent) to make decisions concerning your property for you (the principal). It is, therefore, an important legal document, and you are taking a serious step if you decide to make use of this form without seeking legal advice; for if the person you designate as your agent accepts authority granted under this power of attorney, the agent will be able to make decisions and act with respect to your property (including your money). The extent of your agent\'s authority over subjects listed on this form is explained in the uniform power of attorney act, MCL 556.201 to 556.505.',
    'This power of attorney does not authorize the agent to make health care decisions for you and it does not authorize the agent to exercise powers you have as a parent or guardian regarding care, custody, or property of a minor child or ward.',
    'You should select someone you trust to serve as your agent and you should ask yourself as you review each section of this form, whether you have chosen the right person(s) to act in that capacity. If your signature on this form is notarized or witnessed as provided below, then unless you specify otherwise, the agent\'s authority will generally continue until you die or revoke the power of attorney or the agent resigns or is unable to act for you.',
    'Your agent is entitled to reasonable compensation unless you state otherwise in the Special Instructions.',
    'This form provides for designation of an agent and successor agent(s) who serve one at a time, as opposed to coagents who serve simultaneously. If you wish to name coagents, you may do so in the Special Instructions. Coagents are not required to act together unless you include that requirement in the Special Instructions.',
    'If your agent is unable or unwilling to act for you, your power of attorney will end unless you have named a successor agent. You may also name a second successor agent.',
    'This power of attorney becomes effective immediately unless you state otherwise in the Special Instructions. And unless you state otherwise in the Special Instructions, this power of attorney does not revoke any other power of attorney you may have created.',
    'If you have questions about the power of attorney or the authority it grants to your agent, you should seek legal advice before signing this form.',
  ].forEach((t) => B.push(p(t)));

  B.push(h('DESIGNATION OF AGENT'));
  B.push(p(`I **${P.name}** (Name of Principal) name the following person as my agent:`));
  B.push(p(`Name of Agent: **${blank(fullName(agent))}**\nAgent's Address: ${blank(agent.address || agent.city)}\nAgent's Telephone Number: ${blank(agent.phone, 20)}`));
  B.push(h('DESIGNATION OF SUCCESSOR AGENT(S) (OPTIONAL)'));
  B.push(p('If my agent is unable or unwilling to act for me, I name as my successor agent:'));
  B.push(p(`Name of Successor Agent: **${blank(fullName(s1))}**\nSuccessor Agent's Address: ${blank(s1.address || s1.city)}\nSuccessor Agent's Telephone Number: ${blank(s1.phone, 20)}`));
  B.push(p('If my successor agent is unable or unwilling to act for me, I name as my second successor agent:'));
  B.push(p(`Name of Second Successor Agent: **${blank(fullName(s2))}**\nSecond Successor Agent's Address: ${blank(s2.address || s2.city)}\nSecond Successor Agent's Telephone Number: ${blank(s2.phone, 20)}`));

  B.push(h('GRANT OF GENERAL AUTHORITY'));
  B.push(p('I grant my agent and any successor agent general authority to act for me with respect to the following subjects as defined in the uniform power of attorney act, MCL 556.201 to 556.505:'));
  B.push(p('(INITIAL each subject you want to include in the agent\'s general authority. If you wish to grant general authority over all of the subjects, you may simply initial "All Preceding Subjects.")'));
  B.push(list([...SUBJECTS, 'All Preceding Subjects (regardless of whether any of the preceding subjects are initialed)'].map((t) => `(______) ${t}`), { plain: true }));

  B.push(h('GRANT OF SPECIFIC AUTHORITY (OPTIONAL)'));
  B.push(p('My agent MAY NOT do any of the following specific acts for me UNLESS I have INITIALED the specific authority listed below:'));
  B.push(p('CAUTION! Granting any of the following will give your agent the authority to take actions that could significantly reduce your property or change how your property is distributed at your death. Furthermore, depending on the amount in one or more of the accounts mentioned in the last item listed below (which refers to 31 CFR 1010.350), granting that particular power may subject your agent to burdensome federal reporting obligations that are subject to stiff penalties.'));
  B.push(p('INITIAL ONLY the specific authority you WANT to give your agent. If you have questions about the wisdom of granting any specific authority to your agent, you should seek legal advice before signing this form. If you are inclined to grant specific authority but doubt the wisdom of granting that authority to a particular person you have designated as your agent or successor agent, you should ask yourself whether you have designated the right person(s).'));
  B.push(list(SPECIFIC.map((s) => `(______) ${s.text}`), { plain: true }));

  B.push(h('LIMITATION ON AGENT\'S AUTHORITY'));
  B.push(p('Even if I have authorized my agent to make a gift (by initialing the relevant line above), an agent who is not my ancestor, spouse, or descendant MAY NOT use my property to benefit the agent or a person to whom the agent owes an obligation of support unless I have included that authority in the Special Instructions.'));

  B.push(h('SPECIAL INSTRUCTIONS (OPTIONAL)'));
  B.push(p('You may give special instructions on the following lines.'));
  B.push(p('CAUTION! Special instructions are liable to cause ambiguities that may impair the effectiveness of this power of attorney. You are taking a solemn step if you decide to make any use of this form without seeking legal advice; you should be especially wary of providing special instructions without the benefit of legal counsel.'));
  B.push(box(si.lines.join('\n\n')));

  B.push(h('EFFECTIVE DATE'));
  B.push(p('This power of attorney is effective immediately unless I have stated otherwise in the Special Instructions.'));
  B.push(h('EFFECT ON PREVIOUS POWERS OF ATTORNEY'));
  B.push(p('Unless I have said otherwise in the Special Instructions, the execution of this power of attorney does not revoke any prior power of attorney.'));

  B.push(h('NOMINATION OF CONSERVATOR OR GUARDIAN (OPTIONAL)'));
  B.push(p('If it becomes necessary for a court to appoint a conservator or guardian of my estate or guardian of my person, I nominate the following person(s) for appointment:'));
  const consName = nominateAgent ? fullName(agent) : '';
  const gpName = nominateAgent ? (fullName(advocate) || fullName(agent)) : '';
  B.push(p(`Name of Nominee for Conservator or Guardian of My Estate: **${blank(consName)}**\nNominee's Address: ${blank(nominateAgent ? (agent.address || agent.city) : '')}\nNominee's Telephone Number: ${blank(nominateAgent ? agent.phone : '', 20)}`));
  B.push(p(`Name of Nominee for Guardian of My Person: **${blank(gpName)}**\nNominee's Address: ${blank(nominateAgent ? ((fullName(advocate) ? advocate : agent).address || (fullName(advocate) ? advocate : agent).city) : '')}\nNominee's Telephone Number: ${blank('', 20)}`));

  B.push(h('RELIANCE ON THIS POWER OF ATTORNEY'));
  B.push(p('Any person, including my agent, may rely upon the validity of this power of attorney or a copy of it unless that person knows that the power has terminated or is invalid.'));

  B.push(h('SIGNATURE OF PRINCIPAL, SIGNATURES OF WITNESSES, AND ACKNOWLEDGMENT'));
  B.push(p('CAUTION! Unless you provide otherwise in the Special Instructions, this form will create a "durable" power of attorney if you sign it either before a notary public (or other individual authorized to take acknowledgments) or in the presence of two witnesses neither of whom is designated as your agent or successor agent, both of whom sign below (and one of whom may be the notary public or other individual authorized by law to take acknowledgments who also signs below in his or her official capacity). The power\'s being "durable" means that unless the power is revoked or the agent\'s authority is otherwise terminated beforehand, your agent\'s authority will continue during any period in which you are alive but incapacitated. If you have questions about the wisdom of making this power durable, you should seek legal advice before signing this form.'));
  B.push(p('CAUTION! You have an important motivation to acknowledge your signature before a notary public (or other individual authorized to take acknowledgments) regardless of the question of durability (described above): doing so will make it harder, under section 120 of the uniform power of attorney act, MCL 556.220, for someone to whom the power is presented to decline to accept the power and your agent\'s authority to act on your behalf.'));
  B.push(sig([
    { label: 'Your Signature', date: true },
    { label: 'Your Name Printed', value: P.name },
    { label: 'Your Address', value: addr },
    { label: 'Your Telephone Number', value: P.me.phone || '' },
    { label: 'Witness No. 1\'s Signature', date: true },
    { label: 'Witness No. 1\'s Name Printed' },
    { label: 'Witness No. 1\'s Address' },
    { label: 'Witness No. 2\'s Signature', date: true },
    { label: 'Witness No. 2\'s Name Printed' },
    { label: 'Witness No. 2\'s Address' },
  ]));
  B.push(p(`State of Michigan\nCounty of ${blank('', 24)}\nThis document was acknowledged before me on ____________________ (Date) by **${P.name}** (Name of Principal).`, { keep: true }));
  B.push(sig([{ label: 'Signature of Notary' }, { label: 'Notary\'s printed name; Notary public, State of Michigan, County of ________' }, { label: 'My commission expires' }, { label: 'Acting in the County of' }]));
  B.push(p(`This document prepared by:\n${firmLines().filter((x) => !x.includes('@')).join('\n')}`));

  B.push(pageBreak());
  B.push(h('IMPORTANT INFORMATION FOR AGENT'));
  B.push(h2('Agent\'s Duties'));
  B.push(p('When you accept authority granted under this power of attorney, a special legal relationship is created between you and the principal. This relationship imposes upon you legal duties that continue until you resign or the power or your authority under it is terminated by a termination event described in the uniform power of attorney act, MCL 556.201 to 556.505. You must:'));
  B.push(list([
    '(1) Do what you know the principal reasonably expects you to do with the principal\'s property or, if you do not know the principal\'s expectations, act in the principal\'s best interest;',
    '(2) Act in good faith;',
    '(3) Do nothing beyond the authority granted in this power of attorney;',
    '(4) Keep a record of receipts, disbursements, and transactions made on behalf of the principal;',
    '(5) Disclose your identity as an agent whenever you act for the principal by, for example, writing or printing the name of the principal and signing your own name as "agent" in the following manner: (Principal\'s Name) by (Your Signature) as Agent;',
    '(6) And if the power is "durable" in the sense described below, you must, before acting as agent under the power, sign an acknowledgment of your duties as agent that contains all the declarations contained in the optional template "Agent\'s Acknowledgment" provided in section 302 of the uniform power of attorney act, MCL 556.402, in substantially the form of that optional template.',
  ], { plain: true }));
  B.push(p('Unless the Special Instructions in this power of attorney state otherwise, you must also:'));
  B.push(list([
    '(1) Act loyally for the principal\'s benefit;',
    '(2) Avoid conflicts that would impair your ability to act in the principal\'s best interest;',
    '(3) Act with care, competence, and diligence;',
    '(4) Cooperate with any person that has authority to make health care decisions for the principal to do what you know the principal reasonably expects concerning health care or, if you do not know the principal\'s expectations, to act in the principal\'s best interest; and',
    '(5) Attempt, to the extent of the powers you have been granted as agent, to preserve the principal\'s estate plan if you know the plan and preserving the plan is consistent with the principal\'s best interest.',
  ], { plain: true }));
  B.push(h2('Termination of Agent\'s Authority'));
  B.push(p('You must stop acting on behalf of the principal if you learn of any event that terminates this power of attorney or your authority under it. Events that terminate a power of attorney or your authority to act under such a power include:'));
  B.push(list([
    '(1) Death of the principal;',
    '(2) The principal\'s revocation of the power of attorney or your authority;',
    '(3) The occurrence of a termination event stated in the power;',
    '(4) If the power is intended only for a specified, limited purpose, the specified purpose of the power is fully accomplished; or',
    '(5) If you are married to the principal, a legal action is filed with a court to end your marriage, or for your legal separation, unless the Special Instructions in this power of attorney state that such an action will not terminate your authority.',
  ], { plain: true }));
  B.push(h2('Statutory Duty to Acknowledge Agent\'s Duties under "Durable" Power'));
  B.push(p('Unless the Special Instructions in this power of attorney state otherwise, this form will create a "durable" power of attorney (meaning that unless the power is revoked or your authority is otherwise terminated beforehand, your authority as agent will continue during any period in which the principal is alive but incapacitated) if the principal signs it either before a notary public (or other individual authorized to take acknowledgments) or in the presence of two witnesses neither of whom is designated as the principal\'s agent or successor agent and both of whom also sign the form. If this power of attorney is durable, then before you act as agent under the power, you must execute an acknowledgment of your duties as agent that contains all the declarations contained in the optional template "Agent\'s Acknowledgment" provided in section 302 of the uniform power of attorney act, MCL 556.402, in substantially the form of that optional template.'));
  B.push(h2('Liability of Agent'));
  B.push(p('The meaning of the authority granted to you is defined in the uniform power of attorney act, MCL 556.201 to 556.505. If you violate that act or the terms of this power, you may be liable for any damages caused by your violation.'));
  B.push(p('If there is anything about this document or your duties under it that you do not understand, you should seek legal advice.'));

  return doc({ type: 'poa', person: pKey, title: 'Durable Power of Attorney', owner: P.name, footer: `Power of Attorney of ${P.name}`, initials: true }, B);
}

export function buildAgentAck(a, pKey, role) {
  const P = partyFor(a, pKey);
  const agent = get(a, `${pKey}.poa.${role}`) || {};
  const B = [];
  B.push(title('AGENT\'S ACKNOWLEDGMENT', 'MCL 556.402 — sign before acting under the power of attorney'));
  B.push(p(`I, **${fullName(agent)}**, have been appointed agent for **${P.name}** (Name of Principal) under a durable power of attorney dated ____________________. By signing this document, I acknowledge that if and when I act as agent under the power, all of the following apply:`));
  B.push(h2('MY DUTIES AS AGENT'));
  B.push(p('I must:'));
  B.push(list([
    'Do what I know the principal reasonably expects me to do with the principal\'s property or, if I do not know the principal\'s expectations, act in the principal\'s best interest.',
    'Act in good faith.',
    'Do nothing beyond the authority granted in the durable power of attorney.',
    'Keep reasonable records of receipts, disbursements, and transactions I make on behalf of the principal.',
    'Disclose my identity as an agent whenever I act for the principal by writing or printing the principal\'s name and signing my own name as "agent".',
    'And depending on the terms of the power of attorney, I may have additional duties described in section 114 of the uniform power of attorney act, MCL 556.201 to 556.505, including the presumptive duties to act loyally for the principal\'s benefit, avoid conflicts of interest that would make it hard for me to act in the principal\'s best interest, and act with care, competence, and diligence.',
  ], { numbered: true }));
  B.push(h2('POWERS REQUIRING SPECIFIC AUTHORITY'));
  B.push(p('Unless specifically provided in the durable power of attorney or by judicial order, I cannot do any of the following:'));
  B.push(list([
    'Create, amend, revoke, or terminate an inter vivos trust.',
    'Make a gift of the principal\'s property to someone else, let alone to myself.',
    'Create or change rights of survivorship by, for example, creating a joint account.',
    'Create or change a beneficiary designation.',
    'Delegate authority granted under the durable power of attorney.',
    'Exercise fiduciary powers that the principal has authority to delegate.',
    'Waive the principal\'s right to be a beneficiary of a joint and survivor annuity, including a survivor benefit under a retirement plan.',
    'Exercise authority over the content of electronic communications, as defined in 18 USC 2510, sent or received by the principal.',
    'Exercise authority over any bank, securities, or other financial account in a foreign country within the meaning of 31 CFR 1010.350.',
  ], { numbered: true }));
  B.push(h2('TERMINATION OF MY AUTHORITY'));
  B.push(p('I must stop acting on behalf of the principal if I learn of any event that terminates the durable power of attorney or my authority under the power, including the death of the principal or the principal\'s revocation of either the power or my authority to act under it.'));
  B.push(h2('MY POTENTIAL LIABILITY AS AGENT'));
  B.push(p('If I violate the uniform power of attorney act, MCL 556.201 to 556.505, or act outside the authority granted in the durable power, I may be liable to the principal or the principal\'s successors for damages caused by my violation and to civil or criminal penalties. An exoneration clause in the power (if any) does not relieve me of liability for acts or omissions committed in bad faith or, in some cases, for acts or omissions committed with reckless indifference to the purposes of the power of attorney or the interests of the principal.'));
  B.push(sig([{ label: 'Signature', date: true }, { label: 'Printed name', value: fullName(agent) }]));
  B.push(p('If there is anything about this document or your duties that you do not understand, you should seek legal advice.'));
  B.push(p('Optional: If the agent may sign deeds or other recordable documents, have this acknowledgment notarized so it can be recorded with the power of attorney.', { small: true }));
  B.push(sig([{ label: 'Notary signature' }, { label: 'Notary public, State of Michigan, County of ________; acting in ________ County; commission expires ________' }]));
  return doc({ type: 'agentAck', person: pKey, title: 'Agent\'s Acknowledgment', owner: P.name, footer: `Agent's Acknowledgment — ${fullName(agent)}` }, B);
}
