// Courtesy letters to people named in the plan, and the client's will-deposit instructions.

import { box, doc, h, h2, list, p, sig, title } from './model.js';
import { context } from '../questions.js';
import { namedPeople, ROLE_LABEL } from '../roles.js';
import { FEES, FIRM, firmLines } from '../constants.js';
import { fullName, get, listJoin, money } from '../util.js';

const ORDER = ['', 'first choice', 'alternate', 'second alternate'];
const key = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

function clientNames(a, c) { return c.people.map((o) => fullName(a[o])); }
function firstName(a, o) { return a[o]?.firstName || fullName(a[o]); }

// Pronoun set for one client, or for both spouses when their roles are identical.
function voice(a, owners) {
  if (owners.length === 1) {
    const o = owners[0];
    const first = firstName(a, o);
    return { subj: `${fullName(a[o])} has`, first, poss: `${first}'s`, obj: first, wills: `${first}'s will`, isAre: 'is', remains: `${first} remains in charge and may revoke it`, wishes: `${first}'s` };
  }
  const names = owners.map((o) => fullName(a[o]));
  return { subj: `${listJoin(names)} have each`, first: 'either of them', poss: 'their', obj: 'either of them', wills: 'their wills', isAre: 'is', remains: 'each remains in charge and may revoke it', wishes: 'their' };
}

function roleParagraph(a, r, owners) {
  const v = voice(a, owners);
  const ord = ORDER[r.order] || '';
  const later = ord && ord !== 'first choice';
  const as = (label) => (later ? `${ord} ${label}` : label);
  const successor = (label) => (later ? `${ord.replace('alternate', 'successor')} ${label}` : label);
  const one = owners.length === 1;
  switch (r.role) {
    case 'pr':
      return `**Personal representative.** ${v.subj} nominated you as ${as('personal representative')} (executor) under ${v.wills}${later ? ', to serve if those named before you cannot' : ''}. You have no duties now. After ${one ? `${v.first}'s death` : 'the death of either of them'}, you would ask the probate court in the county where ${one ? v.first : 'that person'} lived to appoint you. You would then collect the property, pay valid debts, expenses, and taxes, and distribute what remains as the will directs. You may decline to serve, and you may hire a lawyer, whose reasonable fees are paid by the estate.`;
    case 'trustee':
      return `**Trustee.** ${v.subj} named you as ${as('trustee')} of any trust created by ${v.wills} for a young beneficiary. If that happens, you would invest and manage the beneficiary's share and spend it for their health, education, maintenance, and support until the ages stated in the will, then distribute it to them.`;
    case 'guardian':
      return `**Guardian.** ${v.subj} appointed you as ${as('guardian')} of ${v.poss} minor children. The appointment takes effect only if no parent with parental rights is living and able to care for the children. You would then file an acceptance with the probate court (MCL 700.5202). A child 14 or older may object to the appointment.`;
    case 'agent': {
      const springing = owners.every((o) => get(a, `${o}.poa.effective`) === 'springing');
      return `**Financial agent.** ${v.subj} named you as ${successor('agent')} under a durable power of attorney for property. ${springing ? `It takes effect only if a physician or licensed psychologist determines in writing that ${one ? v.first : 'the person who signed it'} is incapacitated.` : `It is effective now, but ${v.remains}.`} Before you ever act as agent, you must sign the enclosed Agent's Acknowledgment (MCL 556.213). As agent you must act in good faith, only within the authority granted, and in ${one ? `${v.first}'s` : 'that person\'s'} interest, and you must keep records of what you do.`;
    }
    case 'advocate':
      return `**Patient advocate.** ${v.subj} named you as ${successor('patient advocate')} to make medical decisions if ${one ? v.first : 'that person'} cannot. Your authority begins only after the attending physician and another physician or licensed psychologist determine in writing that ${one ? v.first : 'the patient'} is unable to participate in medical treatment decisions. Before acting, you must sign the enclosed Acceptance (MCL 700.5507). Please read the stated wishes in the designation, because you are expected to follow them.`;
    case 'funeral':
      return `**Funeral representative.** ${v.subj} designated you as ${as('funeral representative')}, giving you first say over funeral arrangements and the handling of remains (MCL 700.3206). Please read the instructions in the designation.`;
    case 'beneficiary':
      return r.gift
        ? `**Beneficiary.** ${one ? `${v.first}'s will includes` : 'Their wills include'} a gift to you.`
        : `**Beneficiary.** You are named as a beneficiary in ${v.wills}${r.contingent ? (one ? `, generally after ${v.first}'s spouse` : ', after both spouses') : ''}.`;
    default:
      return '';
  }
}

// Combine identical roles from both spouses' plans into one paragraph.
function roleParagraphs(a, roles) {
  const groups = new Map();
  for (const r of roles) {
    const k = `${r.role}|${r.order || ''}|${r.gift ? 1 : 0}|${r.contingent ? 1 : 0}`;
    if (!groups.has(k)) groups.set(k, { r, owners: [] });
    if (!groups.get(k).owners.includes(r.owner)) groups.get(k).owners.push(r.owner);
  }
  return [...groups.values()].map(({ r, owners }) => roleParagraph(a, r, owners)).filter(Boolean);
}

// Third-person overview of the plan for a recipient the client chose to tell.
export function planOverview(a) {
  const c = context(a);
  const names = clientNames(a, c);
  const plan = get(a, 'will.plan');
  const kids = c.livingChildren.map((k) => k.name);
  const out = [];
  const subject = c.isCouple ? `${listJoin(names)} have matching wills.` : `${names[0]}'s will`;
  if (plan === 'spouse_then_children') out.push(`${c.isCouple ? `${subject} Each leaves everything to the other spouse; after both have died, everything` : `${subject} leaves everything to ${c.spouseName}; if ${c.spouseName} has died, everything`} goes in equal shares to ${listJoin(kids)}, with a deceased child's share passing to that child's children.`);
  if (plan === 'children') out.push(`${subject} leaves everything in equal shares to ${listJoin(kids)}, with a deceased child's share passing to that child's children.`);
  if (plan === 'spouse_then_others' || plan === 'custom') {
    const bens = (get(a, 'will.beneficiaries') || []).map((b) => `${b.name} (${b.share}%)`);
    out.push(`${c.isCouple ? subject : `${subject} leaves`} ${plan === 'spouse_then_others' ? `everything to ${c.isCouple ? 'the surviving spouse' : c.spouseName}, and then ` : ''}the estate to ${listJoin(bens)}.`);
  }
  const gifts = get(a, 'will.specificGifts') || [];
  if (gifts.length) out.push(`There ${gifts.length === 1 ? 'is a specific gift' : 'are specific gifts'} to ${listJoin(gifts.map((g) => g.recipient))}.`);
  const yb = get(a, 'will.youngBeneficiaries');
  out.push({ utma21: 'A beneficiary under 21 receives their share through a custodian until age 21.', trust25: 'A beneficiary under 25 receives their share in a trust until age 25.', trust30: 'A beneficiary under 30 receives their share in a trust until age 30.', stagger: 'A young beneficiary\'s share is held in trust and paid out in stages at ages 25, 30, and 35.' }[yb] || '');
  const prs = [c.hasSpouse && get(a, 'will.spouseAsPr') === 'yes' ? (c.isCouple ? 'the surviving spouse' : c.spouseName) : '', get(a, 'will.pr.name'), get(a, 'will.prAlt.name')].filter(Boolean);
  if (prs.length) out.push(`The personal representative is ${prs.join(', then ')}.`);
  if (c.hasMinorChildren && get(a, 'will.guardian.name')) out.push(`The guardian named for minor children is ${[get(a, 'will.guardian.name'), get(a, 'will.guardianAlt.name')].filter(Boolean).join(', then ')}.`);
  if (c.complete) {
    for (const o of c.people) {
      const agents = ['agent', 'successor1', 'successor2'].map((k) => get(a, `${o}.poa.${k}.name`)).filter(Boolean);
      const advs = ['advocate', 'successor1', 'successor2'].map((k) => get(a, `${o}.pad.${k}.name`)).filter(Boolean);
      out.push(`${firstName(a, o)} has also signed a durable power of attorney naming ${agents.join(', then ')}, and a patient advocate designation naming ${advs.join(', then ')}.`);
    }
  }
  return out.filter(Boolean);
}

export function buildCourtesyLetter(a, index) {
  const c = context(a);
  const r = get(a, `extras.recipients.${index}`) || {};
  const names = clientNames(a, c);
  const roles = (namedPeople(a).find((x) => key(x.name) === key(r.name))?.roles) || [];
  const whole = r.share === 'plan';
  const B = [];
  B.push(p(`**${FIRM.legalEntity}**\n${firmLines().filter((x) => x !== FIRM.legalEntity && x !== FIRM.reviewingAttorney).join('\n')}`));
  B.push(p(`Date: ____________________\n\n${r.name}\n${r.delivery === 'email' ? r.email || '' : (r.address || '').trim()}`));
  B.push(p(`**Re: Estate plan of ${listJoin(names)}**`));
  B.push(p(`Dear ${r.name}:`));
  B.push(p(`Our firm prepared estate planning documents for ${listJoin(names)} of ${a.address?.city || ''}, Michigan. ${c.isCouple ? 'They' : names[0]} asked us to send you this letter so you know the ${roles.length > 1 ? 'roles' : 'role'} you have been given and what you may be asked to do.`));

  if (roles.length) {
    B.push(h2(roles.length > 1 ? 'Your roles' : 'Your role'));
    for (const t of roleParagraphs(a, roles)) B.push(p(t));
  } else {
    B.push(p(`${listJoin(names)} wanted you to know that ${c.isCouple ? 'they have' : 'an estate plan has been'} completed${c.isCouple ? ' their estate plans' : ''}.`));
  }

  if (whole) {
    B.push(h2('Overview of the plan'));
    for (const t of planOverview(a)) B.push(p(t));
  }

  const encl = [];
  const owners = [...new Set(roles.map((x) => x.owner))];
  for (const o of owners) {
    const fn = firstName(a, o);
    const has = (role) => roles.some((x) => x.owner === o && x.role === role);
    if (whole) encl.push(`Copy of ${fn}'s signed will`);
    if (has('agent')) encl.push(`Copy of ${fn}'s durable power of attorney`, `Agent's Acknowledgment for you to sign (MCL 556.402)`);
    if (has('advocate')) encl.push(`Copy of ${fn}'s patient advocate designation`, `Acceptance of Patient Advocate Designation for you to sign (MCL 700.5507)`);
    if (has('advocate') || has('agent')) encl.push(`Copy of ${fn}'s HIPAA authorization`);
    if (has('funeral')) encl.push(`Copy of ${fn}'s funeral representative designation`);
  }
  const toSign = encl.some((e) => /to sign/.test(e));

  B.push(h2('What to do now'));
  B.push(list([
    'Keep this letter and the enclosures with your important papers.',
    toSign ? `Sign the enclosed ${encl.filter((e) => /to sign/.test(e)).map((e) => e.split(' for you')[0]).join(' and ')}, keep a copy, and return the original to ${c.isCouple ? 'them' : names[0]}${r.delivery === 'mail' ? ' or to our office in the enclosed envelope, and we will forward it' : ''}.` : '',
    `If you are not willing or able to serve, please tell ${c.isCouple ? 'them' : names[0]} so the plan can be updated.`,
    'Keep your contact information current with them.',
  ].filter(Boolean)));

  B.push(h2('Where the documents are'));
  const deposited = get(a, 'extras.deposit') === 'yes';
  B.push(p(`The enclosed documents are copies. ${deposited ? `The original ${c.isCouple ? 'wills are' : 'will is'} on deposit for safekeeping with the ${a.address?.county || ''} County Probate Court (MCL 700.2515).` : `${c.isCouple ? 'They keep' : `${names[0]} keeps`} the signed originals.`} ${c.isCouple ? 'Either of them' : names[0]} may change or revoke these documents at any time, so this letter is not a promise of any inheritance or appointment.`));

  B.push(h2('Our role'));
  B.push(p(`We represent ${listJoin(names)} only. We are not your lawyers and cannot give you legal advice about your rights or duties. If you have questions about serving, you may want to talk with a lawyer of your own.`));
  B.push(p('Sincerely,'));
  B.push(sig([{ label: `${FIRM.reviewingAttorney}, ${FIRM.legalEntity}` }]));
  if (encl.length) B.push(p(`Enclosures:\n${[...new Set(encl)].map((e) => `• ${e}`).join('\n')}${toSign && r.delivery === 'mail' ? '\n• Return envelope' : ''}`));
  B.push(p(`cc: ${listJoin(names)}`, { small: true }));
  return doc({ type: 'courtesy', person: null, title: `Courtesy letter — ${r.name}`, owner: listJoin(names), footer: `Letter to ${r.name}` }, B);
}

export function buildDepositInstructions(a) {
  const c = context(a);
  const names = clientNames(a, c);
  const county = a.address?.county || '[county]';
  const B = [];
  B.push(title('DEPOSITING YOUR WILL WITH THE PROBATE COURT', `${listJoin(names)}\n${county} County Probate Court — MCL 700.2515`));
  B.push(p(`You asked us to deposit your signed ${c.isCouple ? 'wills' : 'will'} with the ${county} County Probate Court for safekeeping. The court keeps a deposited will sealed and gives a certificate of deposit. After your death, the court opens it and it is available for probate, so it can't be lost or misplaced at home.`));
  B.push(h('WHAT YOU DO'));
  B.push(list([
    `Sign your ${c.isCouple ? 'wills' : 'will'} exactly as the Signing Instructions describe. Do not unstaple, remove pages, or write on ${c.isCouple ? 'them' : 'it'} afterward.`,
    'Make a photocopy for your own records.',
    'Fill in the cover sheet below by hand. The court requires an identifying number on the sealed envelope; we write it there and do not store it on our website.',
    `Send the signed original ${c.isCouple ? 'wills' : 'will'} and the cover sheet to ${FIRM.legalEntity}, ${FIRM.address}, by certified mail or another tracked service, or drop ${c.isCouple ? 'them' : 'it'} off at our office.`,
  ], { numbered: true }));
  B.push(h('WHAT WE DO'));
  B.push(list([
    `Seal each will in a wrapper endorsed with your name, residence, identifying number, the date of delivery, and the name of the person delivering it, as MCL 700.2515 requires.`,
    `Deliver it to the ${county} County Probate Court with the court's ${money(FEES.depositCourtFee)} fee (MCL 600.880c).`,
    'Send you the court\'s certificate of deposit. Keep it with your copy of the will and tell your personal representative where the will is.',
  ], { numbered: true }));
  B.push(h('GOOD TO KNOW'));
  B.push(list([
    'During your lifetime the court releases the will only to you, or to someone you authorize in writing. Courts have their own authorization form and may charge to mail a will back.',
    'If you later sign a new will, retrieve the deposited will or deposit the new one, so there is no confusion about which is current.',
    'Your power of attorney, patient advocate designation, and other documents are not deposited. Keep the originals where your agents can find them.',
  ]));
  for (const o of c.people) {
    B.push(h(`COVER SHEET — ${fullName(a[o]).toUpperCase()}`));
    B.push(p(`Name: ${fullName(a[o])}\nResidence: ${[a.address?.street, a.address?.city, 'Michigan', a.address?.zip].filter(Boolean).join(', ')}\nMichigan driver's license number: ______________________________\nLast four digits of Social Security number: __________\nDate will signed: ______________________`));
    B.push(sig([{ label: `Signature of ${fullName(a[o])}`, date: true }]));
  }
  return doc({ type: 'deposit', person: null, title: 'Will Deposit Instructions', owner: listJoin(names), footer: 'Will Deposit Instructions' }, B);
}
