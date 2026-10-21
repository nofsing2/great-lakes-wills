// Patient advocate designation (MCL 700.5506–.5515), the advocate's
// acceptance (statutory statements in MCL 700.5507(5)), and a HIPAA
// authorization (45 CFR 164.508).

import { box, doc, h, h2, initial, list, p, sig, title } from './model.js';
import { partyFor, personMid, personText } from './people.js';
import { fullName, get } from '../util.js';

const WITNESS_RULE = 'Each witness must be 18 or older and may NOT be: my spouse, parent, child, grandchild, sibling, presumptive heir, known devisee, physician, or patient advocate; or an employee of my life or health insurance provider, of a health facility treating me, of a home for the aged where I live, or of a community mental health services program or hospital providing mental health services to me (MCL 700.5506(4)).';

export function buildPad(a, pKey) {
  const P = partyFor(a, pKey);
  const adv = get(a, `${pKey}.pad.advocate`) || {};
  const s1 = get(a, `${pKey}.pad.successor1`) || {};
  const s2 = get(a, `${pKey}.pad.successor2`) || {};
  const ls = get(a, `${pKey}.pad.lifeSustaining`);
  const wishes = new Set(get(a, `${pKey}.pad.wishes`) || []);
  const mh = get(a, `${pKey}.pad.mentalHealth`) === 'yes';
  const anat = get(a, `${pKey}.pad.anatomical`) || 'none';
  const other = (get(a, `${pKey}.pad.otherWishes`) || '').trim();

  const B = [];
  B.push(title('PATIENT ADVOCATE DESIGNATION', `of ${P.name}\n(Michigan Health Care Power of Attorney)`));
  B.push(p(`I, **${P.name}**, of ${P.city}, ${P.county} County, Michigan, being 18 years of age or older and of sound mind, voluntarily make this patient advocate designation under MCL 700.5506 to 700.5515.`));

  B.push(h('1. MY PATIENT ADVOCATE'));
  B.push(p(`I designate ${personMid(adv) || '[patient advocate]'} as my patient advocate.`));
  if (s1.name) B.push(p(`If my patient advocate does not accept, is incapacitated, resigns, or is removed, I designate ${personMid(s1)} as my successor patient advocate.${s2.name ? ` If that person also does not accept, is incapacitated, resigns, or is removed, I designate ${personText(s2)}.` : ''}`));

  B.push(h('2. WHEN THIS DESIGNATION IS EFFECTIVE'));
  B.push(box(`The authority conferred by this designation is exercisable only when I am unable to participate in medical treatment decisions${mh ? ' or mental health treatment decisions, as applicable' : ''}, as determined under MCL 700.5508${mh ? ' and 700.5515' : ''}.${anat !== 'none' ? ' The authority to make an anatomical gift remains exercisable after my death.' : ''}`));
  B.push(p('Under Michigan law, my attending physician and another physician or licensed psychologist must examine me and determine in writing that I am unable to participate in medical treatment decisions before my patient advocate may act. I authorize my health care providers to make that determination and to share with my patient advocate the information needed to make it. If I regain the ability to participate, my patient advocate\'s authority is suspended.'));

  B.push(h('3. POWERS OF MY PATIENT ADVOCATE'));
  B.push(p('My patient advocate may make decisions concerning my care, custody, and medical treatment that I could make if I were able, including to:'));
  B.push(list([
    'consent to, refuse, or withdraw consent to any medical care, treatment, test, procedure, or medication, subject to section 4;',
    'employ and discharge physicians and other health care providers, and choose and change health care facilities, including hospitals, nursing homes, assisted living, and hospice;',
    'decide where I live, including at home with in-home care;',
    'sign releases, waivers, consents, admission and discharge papers, a do-not-resuscitate order, a physician orders for scope of treatment (POST) form, and a nonopioid directive form under MCL 333.9145;',
    'receive and review my medical records and authorize their release; for this purpose my patient advocate is my personal representative under the HIPAA privacy rule, 45 CFR 164.502(g);',
    'choose hospice care for me (MCL 700.5509(1)(f)).',
  ]));
  if (mh) {
    B.push(p('**Mental health treatment.** My patient advocate may also make decisions concerning my mental health treatment, but only after a physician and a mental health professional have each examined me and determined in writing that I am unable to give informed consent to mental health treatment (MCL 700.5515). My patient advocate may NOT consent to forced administration of medication or to inpatient hospitalization other than as a formal voluntary patient, because I have not authorized that in this designation. I do not waive my right to revoke this designation as to mental health treatment.'));
  } else {
    B.push(p('**Mental health treatment.** I do not give my patient advocate authority over mental health treatment decisions.'));
  }

  B.push(h('4. LIFE-SUSTAINING TREATMENT'));
  if (ls === 'authorize') {
    B.push(box('I expressly authorize my patient advocate to make decisions to withhold or withdraw treatment that would allow me to die. I acknowledge that such a decision could or would allow my death. I make this statement in a clear and convincing manner as required by MCL 700.5509(1)(e).'));
    B.push(initial('My initials here confirm the statement above'));
    const ws = [];
    if (wishes.has('terminal')) ws.push('If I have an incurable and irreversible condition that will result in my death within a relatively short time, I do not want treatment that would serve only to prolong the process of dying.');
    if (wishes.has('unconscious')) ws.push('If I am permanently unconscious and there is no reasonable hope that I will regain consciousness, I do not want life-sustaining treatment, including artificially administered nutrition and hydration (tube feeding).');
    if (wishes.has('comfort')) ws.push('I want medication and care to relieve pain and keep me comfortable, even if it may hasten my death.');
    if (wishes.has('hospice')) ws.push('I would prefer hospice care and, if reasonably possible, to spend my final days at home.');
    if (ws.length) {
      B.push(p('My wishes, which my patient advocate should follow:'));
      B.push(list(ws));
    }
  } else {
    B.push(box('I do NOT authorize my patient advocate to make a decision to withhold or withdraw treatment that would allow me to die.'));
    B.push(initial('My initials here confirm the statement above'));
  }
  B.push(p('This designation cannot be used to make a medical treatment decision to withhold or withdraw treatment from me if I am pregnant that would result in my death (MCL 700.5509(1)(d)). My current desire to receive specific life-extending care is binding on my patient advocate (MCL 700.5511(1)).'));
  if (other) {
    B.push(h2('Other instructions'));
    B.push(p(other));
  }

  B.push(h('5. ANATOMICAL GIFTS'));
  if (anat === 'none') B.push(p('I do not give my patient advocate authority to make an anatomical gift. This does not revoke any donor registration I have made.'));
  else {
    B.push(p(`I authorize my patient advocate to make an anatomical gift of all or part of my body ${anat === 'transplant' ? 'for transplantation only' : 'for transplantation, therapy, research, or education'}, under part 101 of the public health code, MCL 333.10101 to 333.10123. My patient advocate may resolve any conflict between this designation and the measures needed to keep an organ medically suitable for donation. This authority remains exercisable after my death.`));
    B.push(initial('My initials here confirm the anatomical gift authority'));
  }

  B.push(h('6. GENERAL'));
  B.push(list([
    'My patient advocate shall follow my known wishes and act in my best interests. My patient advocate shall not receive compensation but may be reimbursed for actual and necessary expenses.',
    'If a guardian is ever appointed for me, I ask that the court not give the guardian any power held by my patient advocate (MCL 700.5306(5)), and I nominate my patient advocate as my guardian.',
    'I may revoke this designation at any time and in any manner that communicates my intent to revoke. It revokes any earlier patient advocate designation or health care power of attorney I made.',
    'A photocopy or electronic copy of this designation is as valid as the original. This designation must be made part of my medical record before it is implemented.',
  ]));

  B.push(h('SIGNATURE'));
  B.push(p('I sign this patient advocate designation voluntarily, understanding its purpose and effect.'));
  B.push(sig([{ label: 'Signature', date: true }, { label: 'Printed name', value: P.name }, { label: 'Address', value: [P.address.street, P.address.city, 'Michigan', P.address.zip].filter(Boolean).join(', ') }]));
  B.push(h('STATEMENT OF WITNESSES'));
  B.push(p(`We sign below as witnesses. ${P.name} signed this designation in our presence and appears to be of sound mind and under no duress, fraud, or undue influence. None of us is the patient's spouse, parent, child, grandchild, sibling, presumptive heir, known devisee, physician, or patient advocate, or an employee of the patient's life or health insurance provider, of a health facility treating the patient, of a home for the aged where the patient resides, or of a community mental health services program or hospital providing mental health services to the patient.`));
  B.push(sig([
    { label: 'Witness 1 signature', date: true }, { label: 'Witness 1 printed name and address' },
    { label: 'Witness 2 signature', date: true }, { label: 'Witness 2 printed name and address' },
  ]));
  B.push(p(WITNESS_RULE, { small: true }));
  return doc({ type: 'pad', person: pKey, title: 'Patient Advocate Designation', owner: P.name, footer: `Patient Advocate Designation of ${P.name}`, initials: true }, B);
}

export function buildPadAcceptance(a, pKey, role) {
  const P = partyFor(a, pKey);
  const adv = get(a, `${pKey}.pad.${role}`) || {};
  const B = [];
  B.push(title('ACCEPTANCE OF PATIENT ADVOCATE DESIGNATION', 'MCL 700.5507 — sign before acting as patient advocate'));
  B.push(p(`I, **${fullName(adv)}**, accept my designation as ${role === 'advocate' ? 'patient advocate' : 'successor patient advocate'} for **${P.name}** (the patient) under the patient advocate designation dated ____________________. I have received a copy of the designation. I understand and agree to the following:`));
  B.push(list([
    'This patient advocate designation is not effective unless the patient is unable to participate in decisions regarding the patient\'s medical or mental health, as applicable. If this patient advocate designation includes the authority to make an anatomical gift as described in section 5506, the authority remains exercisable after the patient\'s death.',
    'A patient advocate shall not exercise powers concerning the patient\'s care, custody, and medical or mental health treatment that the patient, if the patient were able to participate in the decision, could not have exercised on the patient\'s own behalf.',
    'This patient advocate designation cannot be used to make a medical treatment decision to withhold or withdraw treatment from a patient who is pregnant that would result in the pregnant patient\'s death.',
    'A patient advocate may make a decision to withhold or withdraw treatment that would allow a patient to die only if the patient has expressed in a clear and convincing manner that the patient advocate is authorized to make such a decision, and that the patient acknowledges that such a decision could or would allow the patient\'s death.',
    'A patient advocate shall not receive compensation for the performance of the patient advocate\'s authority, rights, and responsibilities, but a patient advocate may be reimbursed for actual and necessary expenses incurred in the performance of the patient advocate\'s authority, rights, and responsibilities.',
    'A patient advocate shall act in accordance with the standards of care applicable to fiduciaries when acting for the patient and shall act consistent with the patient\'s best interests. The known desires of the patient expressed or evidenced while the patient is able to participate in medical or mental health treatment decisions are presumed to be in the patient\'s best interests.',
    'A patient may revoke the patient\'s patient advocate designation at any time and in any manner sufficient to communicate an intent to revoke.',
    'A patient may waive the patient\'s right to revoke the patient advocate designation as to the power to make mental health treatment decisions, and if the waiver is made, the patient\'s ability to revoke as to certain treatment will be delayed for 30 days after the patient communicates the patient\'s intent to revoke.',
    'A patient advocate may revoke the patient advocate\'s acceptance of the patient advocate designation at any time and in any manner sufficient to communicate an intent to revoke.',
    'A patient admitted to a health facility or agency has the rights enumerated in section 20201 of the public health code, 1978 PA 368, MCL 333.20201.',
  ], { numbered: true }));
  B.push(sig([{ label: 'Signature of patient advocate', date: true }, { label: 'Printed name', value: fullName(adv) }, { label: 'Address and telephone' }]));
  B.push(p('No witness or notary is required for this acceptance.', { small: true }));
  return doc({ type: 'padAccept', person: pKey, title: 'Acceptance of Patient Advocate Designation', owner: P.name, footer: `Acceptance — ${fullName(adv)}` }, B);
}

export function buildHipaa(a, pKey) {
  const P = partyFor(a, pKey);
  const names = ['advocate', 'successor1', 'successor2'].map((k) => get(a, `${pKey}.pad.${k}`)).filter((x) => x?.name);
  const extra = get(a, `${pKey}.pad.hipaaExtra`);
  if (extra?.name) names.push(extra);
  const poaAgent = get(a, `${pKey}.poa.agent`);
  if (poaAgent?.name && !names.some((n) => fullName(n) === fullName(poaAgent))) names.push(poaAgent);
  const B = [];
  B.push(title('AUTHORIZATION FOR RELEASE OF PROTECTED HEALTH INFORMATION', `of ${P.name}\n(HIPAA, 45 CFR 164.508)`));
  B.push(p(`I, **${P.name}**, born ${P.me.dob ? new Date(`${P.me.dob}T00:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '__________'}, authorize every physician, hospital, clinic, laboratory, pharmacy, health plan, and other covered entity or health care provider that has provided treatment or services to me, or paid for them, to disclose my individually identifiable health information to each of the following persons:`));
  B.push(list(names.map((n) => personText(n))));
  B.push(h2('Information covered'));
  B.push(p('All of my medical records and health information, including information about mental health (other than psychotherapy notes), substance use disorder treatment to the extent permitted by 42 CFR Part 2, HIV/AIDS, and genetic testing.'));
  B.push(h2('Purpose'));
  B.push(p('At my request, so that these persons may discuss my care with my providers, help me manage my health care, and, if needed, establish whether I am unable to participate in medical treatment decisions so that my patient advocate or agent may act for me. Each person may act alone. This authorization is effective immediately, whether or not I am incapacitated.'));
  B.push(h2('Expiration and revocation'));
  B.push(p('This authorization expires two years after my death, unless I revoke it sooner. I may revoke it at any time by written notice to a provider, but revocation does not affect action taken before the provider receives it.'));
  B.push(h2('Notices'));
  B.push(list([
    'My treatment, payment, enrollment, or eligibility for benefits may not be conditioned on whether I sign this authorization.',
    'Information disclosed under this authorization may be redisclosed by the recipient and may no longer be protected by federal privacy rules.',
    'I am entitled to a copy of this authorization. A copy is as valid as the original.',
  ]));
  B.push(sig([{ label: 'Signature', date: true }, { label: 'Printed name', value: P.name }]));
  B.push(p('No witness is legally required; witnesses or a notary make the authorization easier for providers to accept.', { small: true }));
  return doc({ type: 'hipaa', person: pKey, title: 'HIPAA Authorization', owner: P.name, footer: `HIPAA Authorization of ${P.name}` }, B);
}

export function buildFuneral(a, pKey) {
  const P = partyFor(a, pKey);
  const rep = get(a, `${pKey}.funeral.rep`) || {};
  const alt = get(a, `${pKey}.funeral.repAlt`) || {};
  const disp = get(a, `${pKey}.funeral.disposition`);
  const instr = (get(a, `${pKey}.funeral.instructions`) || '').trim();
  const B = [];
  B.push(title('FUNERAL REPRESENTATIVE DESIGNATION', `of ${P.name}\n(MCL 700.3206)`));
  B.push(p(`I, **${P.name}**, of ${P.city}, ${P.county} County, Michigan, being 18 years of age or older and of sound mind, voluntarily designate ${personMid(rep) || '[funeral representative]'} as my funeral representative.${alt.name ? ` If that person is not able, available, or willing to act within the time allowed by law, I designate ${personText(alt)}.` : ''}`));
  B.push(p('My funeral representative has the right and power to make decisions about my funeral arrangements and the handling, disposition, or disinterment of my body, including decisions about cremation and the right to retrieve my cremated remains from the funeral establishment, as provided in MCL 700.3206. Handling, disposition, or disinterment of my body must be supervised by a person licensed to practice mortuary science in Michigan.'));
  const pref = disp === 'burial' ? 'I prefer burial.' : disp === 'cremation' ? 'I prefer cremation.' : 'I leave the choice between burial and cremation to my funeral representative.';
  B.push(h2('My wishes'));
  B.push(p(`${pref}${instr ? ` ${instr}` : ''} My funeral representative should follow these wishes to the extent reasonably practical, considering available funds.`));
  B.push(p('Costs of my funeral and disposition are to be paid from my estate, any prepaid funeral contract, insurance, or other arrangement I have made. This designation does not affect any anatomical gift I have made. It revokes any earlier funeral representative designation I signed.'));
  B.push(sig([{ label: 'Signature of declarant', date: true }, { label: 'Printed name', value: P.name }]));
  B.push(h2('Execution — complete EITHER the witness section OR the notary section'));
  B.push(p(`**Witnesses.** ${P.name} signed this designation in our presence and appears to be of sound mind and under no duress, fraud, or undue influence. Neither of us is the funeral representative named above, or an officer, partner, owner, or employee of a funeral establishment, cemetery, or crematory serving the declarant, or a health professional or employee of a health or veterans facility that treated the declarant.`));
  B.push(sig([{ label: 'Witness 1 signature', date: true }, { label: 'Witness 1 printed name' }, { label: 'Witness 2 signature', date: true }, { label: 'Witness 2 printed name' }]));
  B.push(p(`**Notary.** State of Michigan, County of ______________. Acknowledged before me on ______________ by ${P.name}.`));
  B.push(sig([{ label: 'Notary signature' }, { label: 'Notary public, State of Michigan, County of ________; acting in ________ County; commission expires ________' }]));
  B.push(h2('Acceptance by funeral representative (recommended)'));
  B.push(p('I accept this designation and will act in good faith according to the declarant\'s wishes.'));
  B.push(sig([{ label: `Signature of ${fullName(rep) || 'funeral representative'}`, date: true }]));
  return doc({ type: 'funeral', person: pKey, title: 'Funeral Representative Designation', owner: P.name, footer: `Funeral Representative Designation of ${P.name}` }, B);
}

export function buildTpp(a, pKey) {
  const P = partyFor(a, pKey);
  const B = [];
  B.push(title('PERSONAL PROPERTY MEMORANDUM', `of ${P.name}\n(Referred to in my will under MCL 700.2513)`));
  B.push(p(`I, ${P.name}, make this written list under MCL 700.2513 and the tangible personal property article of my will. I give each item below to the person named, if that person survives me. Items not listed pass under my will.`));
  B.push(p('How to fill this in: describe each item clearly enough to identify it (for example, "my grandmother\'s gold locket with an engraved letter M") and give the recipient\'s full name. You may write this list by hand, or type it and sign at the end. Do not list money, accounts, or real estate. You can make a new list at any time; date and sign it, and the most recent list controls.', { small: true }));
  const rows = Array.from({ length: 12 }, () => 'Item: ______________________________   Recipient: __________________');
  B.push(list(rows, { numbered: true }));
  B.push(sig([{ label: 'Signature', date: true }, { label: 'Printed name', value: P.name }]));
  return doc({ type: 'tpp', person: pKey, title: 'Personal Property Memorandum', owner: P.name, footer: `Personal Property Memorandum of ${P.name}` }, B);
}
