// Last Will and Testament under Michigan's Estates and Protected Individuals Code.
// Drafted for this project from the statutes; every choice comes from the questionnaire.

import { attorneyNote, doc, h, initial, list, p, pageBreak, sec, sig, title } from './model.js';
import { isOrganization, partyFor, personMid, personText } from './people.js';
import { fullName, get, listJoin, money } from '../util.js';

const TRUST_AGES = {
  trust25: { label: 'twenty-five (25)', stages: [{ age: 25, fraction: 'all' }] },
  trust30: { label: 'thirty (30)', stages: [{ age: 30, fraction: 'all' }] },
  stagger: { label: 'thirty-five (35)', stages: [{ age: 25, fraction: 'one-third (1/3)' }, { age: 30, fraction: 'one-half (1/2)' }, { age: 35, fraction: 'all' }] },
};

function dateText(dob) {
  if (!dob) return '';
  const d = new Date(`${dob}T00:00:00`);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function buildWill(a, pKey) {
  const P = partyFor(a, pKey);
  const { c } = P;
  const blocks = [];
  const art = [];
  let n = 0;
  const article = (name) => { n += 1; art.push(n); blocks.push(h(`ARTICLE ${n}\n${name}`)); return n; };

  blocks.push(title(`LAST WILL AND TESTAMENT\nOF\n${P.name.toUpperCase()}`));
  blocks.push(p(`I, **${P.name}**${P.aka ? ` (also known as ${P.aka})` : ''}, of ${P.city}, ${P.county} County, Michigan, declare this to be my will. I revoke all wills and codicils I made before this will.`));

  // ---------- ARTICLE 1 — FAMILY ----------
  let A = article('MY FAMILY');
  let s = 0;
  const S = () => `${A}.${++s}`;

  let marital;
  switch (P.maritalStatus) {
    case 'married':
    case 'separated':
      marital = `I am married to ${P.spouseName}. All references in this will to "my spouse" are to ${P.spouseName}.`;
      break;
    case 'divorced': marital = 'I am not married. I am divorced.'; break;
    case 'widowed': marital = 'I am not married. My spouse has died.'; break;
    default: marital = 'I am not married.';
  }
  blocks.push(sec(S(), 'Marital status', marital));

  const kidLine = (k) => `${fullName(k)}${k.dob ? `, born ${dateText(k.dob)}` : ''}${k.deceased ? ' (deceased)' : ''}`;
  if (P.children.length) {
    blocks.push(sec(S(), 'Children', `I have ${P.children.length === 1 ? 'one child' : `${P.children.length} children`}:`));
    blocks.push(list(P.children.map(kidLine)));
  } else {
    blocks.push(sec(S(), 'Children', 'I have no children.'));
  }
  if (P.stepchildren.length) {
    blocks.push(sec(S(), 'Stepchildren', `${P.stepchildren.length === 1 ? 'My spouse has a child' : 'My spouse has children'} whom I have not adopted: ${listJoin(P.stepchildren.map(kidLine))}. ${P.includeSteps ? 'I intend to treat each of my stepchildren as my own child under this will, as provided in Article ' : 'Except as I expressly provide, my stepchildren are not included in references to my children or descendants.'}${P.includeSteps ? 'FINAL_DEFS.' : ''}`));
  }
  blocks.push(sec(S(), 'Later children', 'References in this will to my children include any child born to or adopted by me after I sign this will, and that child\'s descendants are included in references to my descendants. I intend this will to provide for any such child.'));
  if (get(a, 'will.omit') === 'yes' && get(a, 'will.omitNames')) {
    blocks.push(sec(S(), 'Intentional omission', `I intentionally make no provision in this will for ${get(a, 'will.omitNames')}${'.'} This omission is intentional and not the result of accident or mistake.`));
    blocks.push(attorneyNote('Client asked to omit the person(s) above (MCL 700.2302). Confirm with client; do not state reasons. If an omitted person is a child, confirm descendants of that child are also meant to be excluded and revise definitions accordingly.'));
  }

  // ---------- ARTICLE 2 — DEBTS ----------
  A = article('DEBTS, EXPENSES, AND TAXES'); s = 0;
  blocks.push(sec(S(), 'Payment', 'My personal representative shall pay from my residuary estate my legally enforceable debts that are due, the expenses of my last illness and funeral, and the expenses of administering my estate. My personal representative need not pay before maturity any debt secured by a mortgage, lien, or security interest.'));
  blocks.push(sec(S(), 'Encumbered property', 'Any property given by this will passes subject to any mortgage, lien, or security interest on it at my death, without any right to have the debt paid from other property of my estate (MCL 700.2607), unless this will expressly provides otherwise.'));
  blocks.push(sec(S(), 'Death taxes', 'Any estate, inheritance, or similar tax payable because of my death on property passing under this will shall be paid from my residuary estate as an expense of administration, without apportionment. Any such tax on property passing outside this will shall be apportioned as provided in MCL 700.3920.'));

  // ---------- ARTICLE 3 — PERSONAL PROPERTY ----------
  A = article('TANGIBLE PERSONAL PROPERTY'); s = 0;
  if (get(a, 'will.tppList') === 'yes') {
    blocks.push(sec(S(), 'Written list', 'I may leave a written statement or list, either in my handwriting or signed by me at the end, that disposes of items of my tangible personal property, as permitted by MCL 700.2513. I give the items described in that writing to the persons named in it who survive me. If there is more than one such writing, the most recent controls to the extent of any conflict. If my personal representative does not find such a writing within 60 days after being appointed, my personal representative may conclude that none exists.'));
  }
  const spouseTakes = P.hasSpouse && ['spouse_then_children', 'spouse_then_others'].includes(get(a, 'will.plan'));
  let tppRest;
  if (spouseTakes) tppRest = `I give the rest of my tangible personal property to my spouse, if my spouse survives me. If my spouse does not survive me, I give that property to the persons who receive my residuary estate under Article RESIDUE_ARTICLE, to be divided among them as they agree, in shares as nearly proportional to their residuary shares as practical.`;
  else tppRest = 'I give the rest of my tangible personal property to the persons who receive my residuary estate under Article RESIDUE_ARTICLE, to be divided among them as they agree, in shares as nearly proportional to their residuary shares as practical.';
  blocks.push(sec(S(), 'Remaining items', `${tppRest} If they do not agree within 90 days after my personal representative asks them to, my personal representative shall make the division, and that decision is final. My personal representative may sell any item no one wants and add the proceeds to my residuary estate. The reasonable cost of storing, insuring, packing, and delivering these items shall be paid as an expense of administration.`));
  blocks.push(sec(S(), 'Meaning', '"Tangible personal property" means household furniture and furnishings, jewelry, clothing, books, artwork, vehicles, and other personal effects. It does not include money, documents of title, property used in a trade or business, or property held for investment.'));

  // ---------- ARTICLE 4 — SPECIFIC GIFTS ----------
  const gifts = (get(a, 'will.specificGifts') || []).filter((g) => {
    if (!c.isCouple) return true;
    return !g.from || g.from === 'both' || g.from === pKey;
  });
  if (gifts.length) {
    A = article('SPECIFIC GIFTS'); s = 0;
    gifts.forEach((g) => {
      const who = personText({ name: g.recipient, relationship: g.relationship });
      const what = g.kind === 'cash' ? `the sum of ${money(g.amount || 0)}` : (g.description || '[describe property]');
      const condition = c.isCouple && (g.from === 'both' || !g.from) ? 'If my spouse does not survive me, ' : '';
      const org = isOrganization({ name: g.recipient, relationship: g.relationship });
      const lapse = org
        ? `If ${g.recipient} does not exist at my death, this gift lapses and becomes part of my residuary estate.`
        : g.ifPredeceases === 'descendants'
          ? `If ${g.recipient} does not survive me, I give this gift to ${g.recipient}'s descendants who survive me, by representation, and if none, this gift lapses and becomes part of my residuary estate.`
          : `If ${g.recipient} does not survive me, this gift lapses and becomes part of my residuary estate.`;
      blocks.push(sec(S(), g.kind === 'cash' ? 'Cash gift' : 'Gift of property', `${condition}I give ${what} to ${who}. ${lapse}`));
      if (g.kind === 'item') blocks.push(attorneyNote('Specific gift of property — confirm the description identifies the asset, how it is titled (individually, joint, LLC), and whether any mortgage should be paid from the residue.'));
    });
    blocks.push(sec(S(), 'Insufficient assets', 'If my estate is not sufficient to pay all cash gifts in full after payment of debts and expenses, the cash gifts shall abate proportionally.'));
  }

  // ---------- ARTICLE — RESIDUE ----------
  A = article('RESIDUARY ESTATE'); s = 0;
  const residueArticle = A;
  blocks.push(sec(S(), 'Definition', 'My "residuary estate" is all of my property, wherever located, that is not effectively disposed of by the earlier provisions of this will, including lapsed gifts and property over which I have a power of appointment only to the extent this will expressly exercises it. I do not exercise any power of appointment by this will.'));
  const plan = get(a, 'will.plan');
  const bens = get(a, 'will.beneficiaries') || [];
  const descendantsLabel = P.includeSteps ? 'my descendants (including my stepchildren and their descendants, as provided in Article FINAL_DEFS)' : 'my descendants';
  const beneficiaryClauses = () => {
    const out = [];
    out.push(list(bens.map((b) => `${b.share}% to ${personText(b)}`)));
    const people = bens.filter((b) => !isOrganization(b));
    const toDesc = people.filter((b) => b.ifPredeceases === 'descendants').map((b) => b.name);
    const toOthers = people.filter((b) => b.ifPredeceases !== 'descendants').map((b) => b.name);
    let lapse = '';
    if (toDesc.length) lapse += `If ${listJoin(toDesc, 'or')} does not survive me, that person's share passes to that person's descendants who survive me, by representation, or if none, is added proportionally to the other shares under this section. `;
    if (toOthers.length) lapse += `If ${listJoin(toOthers, 'or')} does not survive me, that person's share is added proportionally to the other shares under this section. `;
    if (bens.some((b) => isOrganization(b))) lapse += 'If an organization named above does not exist at my death or cannot be identified, its share passes to a charitable organization with similar purposes selected by my personal representative if the organization was a charity, and otherwise is added proportionally to the other shares under this section.';
    out.push(p(lapse));
    return out;
  };

  if (plan === 'spouse_then_children') {
    blocks.push(sec(S(), 'To my spouse', 'I give my residuary estate to my spouse, if my spouse survives me.'));
    blocks.push(sec(S(), 'To my descendants', `If my spouse does not survive me, I give my residuary estate to ${descendantsLabel} who survive me, by representation, subject to Article YOUNG_ARTICLE.`));
  } else if (plan === 'children') {
    blocks.push(sec(S(), 'To my descendants', `I give my residuary estate to ${descendantsLabel} who survive me, by representation, subject to Article YOUNG_ARTICLE.`));
  } else if (plan === 'spouse_then_others') {
    blocks.push(sec(S(), 'To my spouse', 'I give my residuary estate to my spouse, if my spouse survives me.'));
    blocks.push(sec(S(), 'Other beneficiaries', 'If my spouse does not survive me, I give my residuary estate in the following shares, subject to Article YOUNG_ARTICLE:'));
    blocks.push(...beneficiaryClauses());
  } else {
    blocks.push(sec(S(), 'Beneficiaries', 'I give my residuary estate in the following shares, subject to Article YOUNG_ARTICLE:'));
    blocks.push(...beneficiaryClauses());
  }
  if (get(a, 'will.lastResort') === 'named') {
    blocks.push(sec(S(), 'If no beneficiary survives', `If no person or organization entitled to my residuary estate under the preceding sections survives me or exists at my death, I give my residuary estate as follows: ${get(a, 'will.lastResortNames') || '[to be completed]'}.`));
    blocks.push(attorneyNote('Last-resort beneficiaries were entered as free text. Redraft into shares with lapse provisions before approval.'));
  } else {
    blocks.push(sec(S(), 'If no beneficiary survives', 'If no person or organization entitled to my residuary estate under the preceding sections survives me or exists at my death, I give my residuary estate to the persons who would have been entitled to it, and in the shares they would have received, under the Michigan law of intestate succession then in effect, as if I had died at that time unmarried and without a will.'));
  }

  // ---------- ARTICLE — YOUNG BENEFICIARIES ----------
  A = article('GIFTS TO YOUNG BENEFICIARIES'); s = 0;
  const youngArticle = A;
  const yb = get(a, 'will.youngBeneficiaries') || 'utma21';
  const trustee = get(a, 'will.trustee');
  const trusteeAlt = get(a, 'will.trusteeAlt');
  if (yb === 'utma21') {
    blocks.push(sec(S(), 'Custodianship', 'If any property under this will becomes distributable to a beneficiary who has not reached age 21, my personal representative may distribute it to a custodian selected by my personal representative (who may be my personal representative) for that beneficiary under the Michigan uniform transfers to minors act, MCL 554.521 to 554.552. As permitted by MCL 554.547(2), the custodianship shall continue until the beneficiary reaches age 21, and the transfer shall so specify.'));
    blocks.push(sec(S(), 'Small amounts', 'Instead, for a beneficiary who is a minor, my personal representative may pay an amount of $5,000 or less to the beneficiary\'s parent or guardian, to be used for the beneficiary.'));
  } else {
    const cfg = TRUST_AGES[yb];
    const finalAge = cfg.stages[cfg.stages.length - 1].age;
    blocks.push(sec(S(), 'Separate trusts', `If any property under this will (other than tangible personal property) becomes distributable to a beneficiary who has not reached age ${finalAge}, I give that property to my trustee, to be held as a separate trust for that beneficiary under this article. However, if the property is worth $25,000 or less, my personal representative may instead distribute it to a custodian for the beneficiary under the Michigan uniform transfers to minors act, to hold until the beneficiary reaches age 21, as permitted by MCL 554.547(2).`));
    blocks.push(sec(S(), 'Distributions during the trust', 'My trustee may distribute to or for the beneficiary as much of the income and principal of the beneficiary\'s trust as my trustee considers advisable for the beneficiary\'s health, education (including college, graduate, vocational, and technical education), maintenance, and support, taking into account other resources known to my trustee. Income not distributed shall be added to principal.'));
    if (cfg.stages.length === 1) {
      blocks.push(sec(S(), 'Final distribution', `When the beneficiary reaches age ${finalAge}, my trustee shall distribute the remaining trust property to the beneficiary, and the trust ends.`));
    } else {
      blocks.push(sec(S(), 'Distributions in stages', 'My trustee shall distribute the trust property to the beneficiary in stages: one-third (1/3) of the trust property when the beneficiary reaches age 25; one-half (1/2) of the remaining trust property when the beneficiary reaches age 30; and all remaining trust property when the beneficiary reaches age 35. If the beneficiary has already reached one or more of these ages when the trust is funded, my trustee shall promptly distribute the amount that would already have been distributed.'));
    }
    blocks.push(sec(S(), 'Death of the beneficiary', 'If the beneficiary dies before receiving all of the trust property, my trustee shall distribute the remaining trust property to the beneficiary\'s descendants who survive the beneficiary, by representation, or if none, to my descendants who survive the beneficiary, by representation, or if none, as provided in the last section of Article RESIDUE_ARTICLE, as if I had died on the date of the beneficiary\'s death. Property passing to a person who has not reached the age stated above shall be held under this article.'));
    blocks.push(sec(S(), 'Small trust', 'If the value of a trust under this article is $50,000 or less, or my trustee determines that continuing it is uneconomical, my trustee may end the trust and distribute the trust property to the beneficiary, or to a custodian for the beneficiary under the Michigan uniform transfers to minors act if the beneficiary is under 21.'));
    blocks.push(sec(S(), 'Spendthrift protection', 'No beneficiary may transfer, assign, or pledge any interest in a trust under this article, and no interest is subject to the claims of the beneficiary\'s creditors before it is actually distributed. This is a spendthrift provision under MCL 700.7502.'));
    blocks.push(sec(S(), 'Trustee', `I appoint ${personMid(trustee) || '[trustee]'} as trustee of each trust under this article.${trusteeAlt?.name ? ` If that trustee does not serve or stops serving, I appoint ${personMid(trusteeAlt)} as successor trustee.` : ''} If no named trustee is able and willing to serve, a successor trustee may be appointed as provided in the Michigan trust code. No trustee is required to give bond. A trustee is entitled to reasonable compensation and to reimbursement of reasonable expenses, and may resign by written notice to the adult beneficiaries and to the parent or guardian of any minor beneficiary.`));
    blocks.push(sec(S(), 'Trustee powers', 'My trustee has all of the powers given to trustees by the Michigan trust code, including MCL 700.7816 and 700.7817, exercisable without court order. My trustee may make a distribution for a beneficiary by paying it directly to the provider of goods or services, to the beneficiary\'s parent or guardian, or to a custodian under any uniform transfers to minors act. Each trust shall be administered without court supervision.'));
  }

  // ---------- ARTICLE — FIDUCIARIES ----------
  A = article('PERSONAL REPRESENTATIVE AND GUARDIAN'); s = 0;
  // Nominees in order; each is { full: "Name, my sister, of City", short: "Name" }.
  const prs = [];
  if (P.hasSpouse && get(a, 'will.spouseAsPr') === 'yes') prs.push({ full: `my spouse, ${P.spouseName}`, short: 'my spouse' });
  const pr = get(a, 'will.pr');
  const prAlt = get(a, 'will.prAlt');
  // In a couple plan, the named PR could be the other spouse or the testator; skip those.
  [pr, prAlt].forEach((x) => {
    if (x?.name && fullName(x) !== P.name && fullName(x) !== P.spouseName) prs.push({ full: personText(x), short: fullName(x) });
  });
  const mid = (t) => (t.includes(',') ? `${t},` : t);
  let prText = '[personal representative]';
  if (prs.length) {
    prText = `I nominate ${mid(prs[0].full)} as personal representative of my estate.`;
    for (let i = 1; i < prs.length; i += 1) {
      prText += ` If ${prs[i - 1].short} does not serve or stops serving, I nominate ${mid(prs[i].full)} as personal representative.`;
    }
  }
  blocks.push(sec(S(), 'Nomination', prText));
  blocks.push(sec(S(), 'Unsupervised administration; no bond', 'I request that my estate be administered without court supervision. No personal representative named in this will shall be required to give bond in any jurisdiction.'));
  const prPowers = ['My personal representative has all powers given to personal representatives by Michigan law, including MCL 700.3715, and may exercise them without court order. Without limiting those powers, my personal representative may sell, lease, or mortgage real or personal property at public or private sale; distribute property in cash or in kind, including in shares that are not pro rata; employ and pay attorneys, accountants, and other agents; and access, manage, and close my digital assets and accounts, including the content of my electronic communications, as permitted by the Michigan fiduciary access to digital assets act, MCL 700.1001 to 700.1018.'];
  if (get(a, 'assets.business') === 'yes') prPowers.push('My personal representative may continue any business in which I own an interest at my death for as long as my personal representative considers advisable, without court order and without liability for losses incurred in good faith.');
  blocks.push(sec(S(), 'Powers', prPowers.join(' ')));
  blocks.push(sec(S(), 'Compensation', 'My personal representative is entitled to reasonable compensation and to reimbursement of reasonable expenses.'));

  if (c.hasMinorChildren && P.treatedAsChildren.length) {
    const g = get(a, 'will.guardian');
    const gAlt = get(a, 'will.guardianAlt');
    blocks.push(sec(S(), 'Guardian of my minor children', `If at my death any child of mine is a minor and no parent of the child who has parental rights is living and able to care for the child, I appoint ${personMid(g) || '[guardian]'} as guardian of that child.${gAlt?.name ? ` If that person does not accept or stops serving, I appoint ${personText(gAlt)}.` : ''} I make this appointment under MCL 700.5202.`));
    const conservator = yb === 'utma21' ? (prs.find((x) => x.short !== 'my spouse')?.full || '') : (personText(trustee) || '');
    if (conservator) blocks.push(sec(S(), 'Conservator', `If a conservator is needed for property of a minor child of mine that is not held in trust or custodianship, I nominate ${conservator}.`));
  }

  // ---------- ARTICLE — GENERAL ----------
  A = article('GENERAL PROVISIONS'); s = 0;
  const defsArticle = A;
  blocks.push(sec(S(), 'Survival', 'A beneficiary who does not survive me by 30 days is treated as having died before me for all purposes of this will, as permitted by MCL 700.2702(4)(b).'));
  const defs = ['"Descendants" means children, grandchildren, and more remote lineal descendants of every degree. A person adopted before reaching age 18 is treated as a child of the adopting parent. "By representation" has the meaning given in MCL 700.2718(1).'];
  if (P.includeSteps) defs.push(`For all purposes of this will, each of my stepchildren named in Article 1 is treated as my child, and that stepchild's descendants are treated as my descendants.`);
  blocks.push(sec(S(), 'Definitions', defs.join(' ')));
  blocks.push(sec(S(), 'Property outside this will', 'This will does not govern property that passes at my death by beneficiary designation, joint ownership with right of survivorship, payable-on-death or transfer-on-death registration, or trust.'));
  if (c.isCouple) {
    blocks.push(sec(S(), 'No contract', `My spouse and I are signing wills at about the same time with similar terms. These wills are not made under any contract, and either of us may change or revoke our will at any time, before or after the other's death (MCL 700.2514).`));
  }
  blocks.push(sec(S(), 'Governing law and interpretation', 'This will is governed by Michigan law. Headings are for convenience only. Words in the singular include the plural and vice versa as the context requires. "Personal representative" and "trustee" include any successor serving in that role.'));

  // Resolve forward references to article numbers.
  for (const b of blocks) {
    if (typeof b.text === 'string') {
      b.text = b.text.replace(/RESIDUE_ARTICLE/g, String(residueArticle)).replace(/YOUNG_ARTICLE/g, String(youngArticle)).replace(/FINAL_DEFS/g, String(defsArticle));
    }
    if (b.items) b.items = b.items.map((t) => t.replace(/RESIDUE_ARTICLE/g, String(residueArticle)));
  }

  // ---------- SIGNATURE ----------
  blocks.push(p('I sign this will, consisting of this page and the preceding pages, on the date stated below.', { keep: true }));
  blocks.push(sig([
    { label: 'Date' },
    { label: `${P.name}, Testator` },
  ]));
  blocks.push(h('STATEMENT OF TESTATOR AND WITNESSES'));
  blocks.push(p('I certify (or declare) under penalty for perjury under the law of the state of Michigan that the following statements are true. Each person signing below makes this statement as to the facts within that person\'s knowledge, and signs it on the date written below:'));
  blocks.push(list([
    `The testator, ${P.name}, signed this document as the testator's will, signed it willingly, and executed it as the testator's voluntary act for the purposes expressed in it.`,
    'Each of us witnesses, in the presence of the testator and of each other, signed this will as a witness to the testator\'s signing.',
    'To the best of our knowledge, the testator is 18 years of age or older, is under no constraint or undue influence, and has sufficient mental capacity to make this will.',
  ], { numbered: true }));
  blocks.push(p('This statement is made under MCL 700.2504(5) to make this will self-proved.'));
  blocks.push(sig([
    { label: 'Date signed' },
    { label: `${P.name}, Testator` },
    { label: 'Witness signature' },
    { label: 'Witness printed name and address' },
    { label: 'Witness signature' },
    { label: 'Witness printed name and address' },
  ]));

  return doc({ type: 'will', person: pKey, title: 'Last Will and Testament', owner: P.name, footer: `Will of ${P.name}`, initials: true }, blocks);
}
