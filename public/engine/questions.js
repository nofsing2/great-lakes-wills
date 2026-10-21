// The questionnaire, as data. The browser renders it; the server validates against it.
//
// Field types: text, email, tel, date, textarea, select, radio, yesno, checkbox,
// checkboxes, person, list (repeatable group of sub-fields), note (display only).
// `showIf(a, c)` receives the answers and the derived context from `context()`.
// Steps with `perPerson: true` are asked once for each client in a couple plan;
// their field ids are relative to the person key ("p1" or "p2").

import { ESTATE_RANGES, FEES } from './constants.js';
import { namedPeople, ROLE_LABEL } from './roles.js';
import { ageOn, fullName, get, listJoin, money, MICHIGAN_COUNTIES, priceText } from './util.js';

export function context(a = {}) {
  const isCouple = a.plan === 'couple';
  const married = isCouple || a.family?.maritalStatus === 'married' || a.family?.maritalStatus === 'separated';
  const children = (a.family?.children || []).filter((c) => fullName(c));
  const living = children.filter((c) => !c.deceased);
  const minors = living.filter((c) => {
    const age = ageOn(c.dob);
    return age !== null && age < 18;
  });
  const underTwentyFive = living.filter((c) => {
    const age = ageOn(c.dob);
    return age !== null && age < 25;
  });
  const people = isCouple ? ['p1', 'p2'] : ['p1'];
  const spouseName = isCouple ? fullName(a.p2) : fullName(a.family?.spouse);
  return {
    isCouple,
    married,
    hasSpouse: married && !!spouseName,
    spouseName,
    children,
    livingChildren: living,
    hasChildren: children.length > 0,
    hasMinorChildren: minors.length > 0,
    hasYoungChildren: underTwentyFive.length > 0,
    // In a couple plan, a child of only one spouse is the other spouse's stepchild.
    hasStepchildren: children.some((c) => ['stepchild', 'p1_only', 'p2_only'].includes(c.relation)),
    complete: a.package === 'complete',
    people,
  };
}

const yesNo = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

const personFields = (prefix) => [
  { id: `${prefix}.firstName`, type: 'text', label: 'First name', required: true, half: true },
  { id: `${prefix}.middleName`, type: 'text', label: 'Middle name', half: true },
  { id: `${prefix}.lastName`, type: 'text', label: 'Last name', required: true, half: true },
  { id: `${prefix}.suffix`, type: 'text', label: 'Suffix (Jr., III)', half: true },
  { id: `${prefix}.aka`, type: 'text', label: 'Other names you have used (maiden name, nicknames on accounts)', help: 'Listing these helps your personal representative collect assets titled under another name.' },
  { id: `${prefix}.dob`, type: 'date', label: 'Date of birth', required: true, half: true },
  { id: `${prefix}.email`, type: 'email', label: 'Email', required: true, half: true },
  { id: `${prefix}.phone`, type: 'tel', label: 'Phone', half: true },
];

export const STEPS = [
  {
    id: 'start',
    title: 'Your plan',
    intro: 'Pick the plan that fits. You can change this before checkout.',
    fields: [
      {
        id: 'plan', type: 'radio', label: 'Who is this plan for?', required: true,
        options: [
          { value: 'single', label: 'Just me', help: 'Single, widowed, divorced, or married but planning separately.' },
          { value: 'couple', label: 'Me and my spouse', help: 'Matching documents for a married couple. Unmarried partners should each choose “Just me.”' },
        ],
      },
      {
        id: 'package', type: 'radio', label: 'Which documents?', required: true,
        options: [
          { value: 'will', label: 'Will only', help: 'Last will and testament, guardian nomination for minor children, and a personal property list.' },
          { value: 'complete', label: 'Complete plan', help: 'Will plus durable financial power of attorney, patient advocate designation (health care), HIPAA authorization, and funeral representative designation.' },
        ],
      },
    ],
  },
  {
    id: 'eligibility',
    title: 'A few screening questions',
    intro: 'These make sure an online plan reviewed by a Michigan attorney is right for you. If it isn’t, we’ll tell you and offer a consultation instead.',
    fields: [
      { id: 'eligibility.miDomicile', type: 'yesno', label: (a) => (a.plan === 'couple' ? 'Is Michigan your permanent home (where you both live and intend to stay)?' : 'Is Michigan your permanent home (where you live and intend to stay)?'), required: true },
      { id: 'eligibility.adult', type: 'yesno', label: (a) => (a.plan === 'couple' ? 'Are you both 18 or older?' : 'Are you 18 or older?'), required: true },
      { id: 'eligibility.self', type: 'yesno', label: (a) => (a.plan === 'couple' ? 'Are you completing this for yourselves (not on behalf of someone else)?' : 'Are you completing this for yourself (not on behalf of someone else)?'), required: true },
      {
        id: 'eligibility.helper', type: 'yesno', required: true,
        label: 'Is anyone who might receive something under your plan helping you fill this out or pressing you to make it?',
        help: 'Answering yes is fine. The attorney will simply talk with you privately before approving your documents.',
      },
      {
        id: 'eligibility.understands', type: 'checkbox', required: true,
        label: 'I understand that these documents are prepared by a Michigan attorney under a limited-scope engagement, that I must sign them in person with witnesses (and a notary for some), and that nothing is final until the attorney approves it.',
      },
    ],
  },
  {
    id: 'about',
    title: (a) => (a.plan === 'couple' ? 'About you both' : 'About you'),
    fields: [
      { id: 'note.p1', type: 'note', text: (a) => (a.plan === 'couple' ? 'First spouse' : '') , showIf: (a) => a.plan === 'couple' },
      ...personFields('p1'),
      { id: 'note.p2', type: 'note', text: 'Second spouse', showIf: (a) => a.plan === 'couple' },
      ...personFields('p2').map((f) => ({ ...f, showIf: (a) => a.plan === 'couple' })),
      { id: 'address.street', type: 'text', label: 'Home street address', required: true },
      { id: 'address.city', type: 'text', label: 'City or township', required: true, half: true },
      { id: 'address.zip', type: 'text', label: 'ZIP', required: true, half: true, pattern: '^\\d{5}(-\\d{4})?$' },
      { id: 'address.county', type: 'select', label: 'County', required: true, options: MICHIGAN_COUNTIES.map((c) => ({ value: c, label: `${c} County` })) },
    ],
  },
  {
    id: 'family',
    title: 'Your family',
    intro: 'We ask about family because Michigan law gives spouses and children certain rights, and because naming them shows you knew who they were when you signed.',
    fields: [
      {
        id: 'family.maritalStatus', type: 'radio', label: 'Marital status', required: true,
        showIf: (a) => a.plan !== 'couple',
        options: [
          { value: 'single', label: 'Never married' },
          { value: 'married', label: 'Married' },
          { value: 'separated', label: 'Married but separated' },
          { value: 'divorced', label: 'Divorced' },
          { value: 'widowed', label: 'Widowed' },
        ],
      },
      { id: 'family.spouse.name', type: 'text', label: 'Spouse’s full legal name', required: true, showIf: (a) => a.plan !== 'couple' && ['married', 'separated'].includes(a.family?.maritalStatus) },
      { id: 'family.divorcePending', type: 'yesno', label: 'Has a divorce, separate maintenance, or annulment case been filed?', required: true, showIf: (a, c) => c.married },
      { id: 'family.maritalAgreement', type: 'yesno', label: 'Do you have a prenuptial or postnuptial agreement?', required: true, showIf: (a, c) => c.married },
      { id: 'family.nonCitizenSpouse', type: 'yesno', label: 'Is either spouse not a U.S. citizen?', required: true, showIf: (a, c) => c.married },
      { id: 'family.engaged', type: 'yesno', label: 'Are you engaged or planning to marry?', showIf: (a, c) => !c.married },
      { id: 'family.priorDivorceObligations', type: 'yesno', label: 'Does a divorce judgment require you to leave anything to a former spouse or children (for example, life insurance or support)?', showIf: (a) => a.plan === 'couple' || a.family?.maritalStatus !== 'single' },
      {
        id: 'family.children', type: 'list', label: 'Children', itemLabel: 'child', addLabel: 'Add a child',
        help: 'List every child, including adult children, adopted children, children who have died, and (if you are married) stepchildren. Do not list grandchildren here unless their parent has died.',
        fields: [
          { id: 'name', type: 'text', label: 'Full name', required: true },
          { id: 'dob', type: 'date', label: 'Date of birth', required: true, half: true },
          {
            id: 'relation', type: 'select', label: 'Relationship', required: true, half: true,
            options: (a) => (a.plan === 'couple'
              ? [
                { value: 'joint', label: 'Child of both of us' },
                { value: 'p1_only', label: `Child of ${a.p1?.firstName || 'first spouse'} only` },
                { value: 'p2_only', label: `Child of ${a.p2?.firstName || 'second spouse'} only` },
              ]
              : [
                { value: 'child_with_spouse', label: 'My child (with my current spouse)' },
                { value: 'child_other', label: 'My child (other parent is not my current spouse)' },
                { value: 'stepchild', label: 'My stepchild (not adopted by me)' },
              ]),
          },
          { id: 'adopted', type: 'checkbox', label: 'Adopted' },
          { id: 'otherParentLiving', type: 'checkbox', label: 'Child’s other parent is living and has parental rights', showIfItem: (item) => ['child_other', 'p1_only', 'p2_only'].includes(item.relation) },
          { id: 'deceased', type: 'checkbox', label: 'This child has died' },
          { id: 'leftDescendants', type: 'checkbox', label: 'This child left children of their own', showIfItem: (item) => item.deceased },
        ],
      },
      { id: 'family.includeStepchildren', type: 'yesno', label: 'Should your stepchildren be treated the same as your own children in your will?', help: 'Stepchildren do not inherit under Michigan law unless adopted or named.', required: true, showIf: (a, c) => c.hasStepchildren },
      {
        id: 'family.specialNeeds', type: 'yesno', required: true,
        label: 'Does anyone who might inherit from you have a disability, or receive SSI, Medicaid, or other needs-based benefits?',
        help: 'An inheritance can cut off needs-based benefits. These plans need a supplemental needs trust, which the attorney prepares in a consultation.',
      },
      { id: 'family.beneficiaryConcern', type: 'yesno', label: 'Are you worried about any beneficiary’s ability to handle money (addiction, creditors, divorce, or spending)?' },
    ],
  },
  {
    id: 'assets',
    title: 'What you own',
    intro: 'Rough numbers are fine. We use these to check whether a simple plan fits, not to list your assets in the will.',
    fields: [
      { id: 'assets.range', type: 'select', label: (a) => (a.plan === 'couple' ? 'Combined value of everything you both own (home equity, accounts, retirement, life insurance death benefit)' : 'Total value of everything you own (home equity, accounts, retirement, life insurance death benefit)'), required: true, options: ESTATE_RANGES.map((r) => ({ value: r.value, label: r.label })) },
      { id: 'assets.michiganHome', type: 'yesno', label: 'Do you own a home or other real estate in Michigan?', required: true },
      { id: 'assets.outOfStateRealEstate', type: 'yesno', label: 'Do you own real estate outside Michigan (including a cottage or timeshare deeded to you)?', required: true },
      { id: 'assets.business', type: 'yesno', label: 'Do you own part of a business, farm, or rental property operation?', required: true },
      { id: 'assets.communityProperty', type: 'yesno', label: 'While married, did you ever live in Arizona, California, Idaho, Louisiana, Nevada, New Mexico, Texas, Washington, or Wisconsin?', required: true, showIf: (a, c) => c.married },
      { id: 'assets.longTermCare', type: 'yesno', label: 'Are you planning for nursing-home costs or Medicaid eligibility in the next five years?', required: true },
      { id: 'assets.existingTrust', type: 'yesno', label: 'Do you already have a living trust, or want one instead of a will-based plan?', required: true },
      { id: 'assets.firearmsNfa', type: 'yesno', label: 'Do you own NFA-regulated firearms (suppressors, short-barreled rifles, machine guns)?' },
      { id: 'note.nonprobate', type: 'note', text: 'Reminder: life insurance, retirement accounts, and accounts with a payable-on-death or joint owner pass by beneficiary designation, not by your will. Your attorney will remind you to review them.' },
    ],
  },
  {
    id: 'will',
    title: 'Who inherits',
    intro: 'This is the heart of your will: who receives what is left after debts and expenses (your “residuary estate”).',
    fields: [
      {
        id: 'will.plan', type: 'radio', label: 'Main plan', required: true,
        options: (a, c) => [
          ...(c.hasSpouse && c.hasChildren ? [{ value: 'spouse_then_children', label: (c.isCouple ? 'Everything to the surviving spouse, then to our children equally' : 'Everything to my spouse, then to my children equally'), help: 'The most common plan. A deceased child’s share goes to that child’s children.' }] : []),
          ...(c.hasSpouse && !c.hasChildren ? [{ value: 'spouse_then_others', label: 'Everything to my spouse, then to the people I name', help: c.isCouple ? 'After both of you, the beneficiaries you list below.' : '' }] : []),
          ...(!c.hasSpouse && c.hasChildren ? [{ value: 'children', label: 'Everything to my children equally', help: 'A deceased child’s share goes to that child’s children.' }] : []),
          { value: 'custom', label: 'I want to name beneficiaries and percentages myself' },
        ],
      },
      {
        id: 'will.beneficiaries', type: 'list', label: (a, c) => (a.will?.plan === 'spouse_then_others' ? 'Beneficiaries after my spouse' : 'Beneficiaries'), itemLabel: 'beneficiary', addLabel: 'Add a beneficiary',
        showIf: (a) => ['custom', 'spouse_then_others'].includes(a.will?.plan),
        help: 'Percentages must total 100. Charities are fine — give the full legal name and city.',
        fields: [
          { id: 'name', type: 'text', label: 'Name (person or charity)', required: true },
          { id: 'relationship', type: 'text', label: 'Relationship (e.g., sister, friend, charity)', required: true, half: true },
          { id: 'share', type: 'number', label: 'Percent', required: true, half: true, min: 1, max: 100 },
          {
            id: 'ifPredeceases', type: 'select', label: 'If this person dies before me, their share goes to', required: true,
            options: [
              { value: 'descendants', label: 'Their children (and grandchildren), by representation' },
              { value: 'others', label: 'The other beneficiaries on this list' },
            ],
          },
        ],
      },
      { id: 'will.disinheritSpouse', type: 'note', text: 'Note: in Michigan a surviving spouse can choose to take part of the estate even if the will leaves them little or nothing (MCL 700.2202). Plans that leave out a spouse need a conversation with the attorney.', showIf: (a, c) => c.hasSpouse && !c.isCouple && a.will?.plan === 'custom' },
      {
        id: 'will.youngBeneficiaries', type: 'radio', label: 'When should a young beneficiary receive their inheritance outright?', required: true,
        help: 'Until then, a trustee you choose manages it and can spend it on their health, education, and support.',
        options: [
          { value: 'utma21', label: 'At 21', help: 'No trust. A custodian manages it until age 21 under the Michigan Uniform Transfers to Minors Act.' },
          { value: 'trust25', label: 'At 25, in a trust until then' },
          { value: 'trust30', label: 'At 30, in a trust until then' },
          { value: 'stagger', label: 'In stages: one-third at 25, half the balance at 30, the rest at 35' },
        ],
      },
      { id: 'will.trustee', type: 'person', label: 'Trustee for young beneficiaries', required: true, showIf: (a) => a.will?.youngBeneficiaries && a.will.youngBeneficiaries !== 'utma21', help: 'Often the same person as your personal representative.' },
      { id: 'will.trusteeAlt', type: 'person', label: 'Alternate trustee', showIf: (a) => a.will?.youngBeneficiaries && a.will.youngBeneficiaries !== 'utma21' },
      {
        id: 'will.specificGifts', type: 'list', label: 'Specific gifts (optional)', itemLabel: 'gift', addLabel: 'Add a gift',
        help: 'Cash amounts or particular items you want to go to a particular person before everything else is divided. Household items and keepsakes can go on your personal property list instead, which you can change later without a new will.',
        fields: [
          { id: 'from', type: 'select', label: 'Given by', showIf: (a) => a.plan === 'couple', options: (a) => [{ value: 'both', label: 'Either of us (whoever dies second)' }, { value: 'p1', label: a.p1?.firstName || 'First spouse' }, { value: 'p2', label: a.p2?.firstName || 'Second spouse' }] },
          { id: 'kind', type: 'select', label: 'Type', required: true, half: true, options: [{ value: 'cash', label: 'Cash amount' }, { value: 'item', label: 'Specific item or property' }] },
          { id: 'amount', type: 'number', label: 'Amount ($)', half: true, showIfItem: (i) => i.kind === 'cash' },
          { id: 'description', type: 'text', label: 'Describe the item or property', showIfItem: (i) => i.kind === 'item' },
          { id: 'recipient', type: 'text', label: 'Recipient (person or charity)', required: true },
          { id: 'relationship', type: 'text', label: 'Relationship', half: true },
          { id: 'ifPredeceases', type: 'select', label: 'If the recipient dies first', required: true, half: true, options: [{ value: 'lapse', label: 'The gift is canceled' }, { value: 'descendants', label: 'It goes to their descendants' }] },
        ],
      },
      { id: 'will.tppList', type: 'yesno', label: 'Do you want a separate list for personal belongings (jewelry, heirlooms, tools) that you can update without changing your will?', help: 'Michigan allows this under MCL 700.2513 if the list is in your handwriting or signed by you.', required: true },
      {
        id: 'will.lastResort', type: 'radio', label: 'If none of the people above survive you, who should inherit?', required: true,
        options: [
          { value: 'heirs', label: 'My closest relatives under Michigan law' },
          { value: 'named', label: 'People or charities I name' },
        ],
      },
      { id: 'will.lastResortNames', type: 'textarea', label: 'Name them and their shares', required: true, showIf: (a) => a.will?.lastResort === 'named' },
      { id: 'will.omit', type: 'yesno', label: 'Is there a child or other close family member you intend to leave out of your will?', required: true },
      { id: 'will.omitNames', type: 'text', label: 'Who?', required: true, showIf: (a) => a.will?.omit === 'yes' },
    ],
  },
  {
    id: 'fiduciaries',
    title: 'Who is in charge',
    intro: 'Your personal representative (executor) gathers your property, pays bills, and distributes what is left.',
    fields: [
      { id: 'will.spouseAsPr', type: 'yesno', label: (a, c) => (c.isCouple ? 'Should each of you name the other as personal representative first?' : 'Should your spouse be your first personal representative?'), required: true, showIf: (a, c) => c.hasSpouse },
      { id: 'will.pr', type: 'person', label: (a, c) => (c.hasSpouse && a.will?.spouseAsPr === 'yes' ? 'Personal representative if your spouse can’t serve' : 'Personal representative'), required: true },
      { id: 'will.prAlt', type: 'person', label: 'Alternate personal representative', help: 'Strongly recommended.' },
      { id: 'will.guardian', type: 'person', label: 'Guardian for your minor children', required: true, showIf: (a, c) => c.hasMinorChildren, help: 'Takes effect only if no parent with parental rights is living and able to care for them (MCL 700.5202).' },
      { id: 'will.guardianAlt', type: 'person', label: 'Alternate guardian', showIf: (a, c) => c.hasMinorChildren },
    ],
  },
  {
    id: 'poa',
    perPerson: true,
    showIf: (a, c) => c.complete,
    title: (a, c, who) => `Financial power of attorney${who ? ` — ${who}` : ''}`,
    intro: 'Your agent can handle your money and property if you can’t. This uses Michigan’s statutory form so banks recognize it.',
    fields: [
      { id: 'poa.agent', type: 'person', label: 'Agent', required: true, help: 'Must be 18 or older. Often a spouse or adult child.' },
      { id: 'poa.successor1', type: 'person', label: 'Successor agent', help: 'Serves if your agent can’t or won’t.' },
      { id: 'poa.successor2', type: 'person', label: 'Second successor agent', showIf: (a, c, p) => !!get(a, `${p}.poa.successor1.name`) },
      {
        id: 'poa.effective', type: 'radio', label: 'When should it take effect?', required: true,
        options: [
          { value: 'immediate', label: 'Immediately (recommended)', help: 'Your agent can act now, but you stay in control and can revoke it. Banks accept these most easily.' },
          { value: 'springing', label: 'Only if I become incapacitated', help: 'Requires a written doctor’s determination first, which can cause delays.' },
        ],
      },
      {
        id: 'poa.gifts', type: 'radio', label: 'May your agent make gifts of your property?', required: true,
        options: [
          { value: 'none', label: 'No gifts' },
          { value: 'family_annual', label: 'Yes, to my spouse and descendants, up to the federal annual gift-tax exclusion per person per year' },
          { value: 'attorney', label: 'I want broader gifting (for example, for Medicaid planning) — discuss with the attorney' },
        ],
      },
      {
        id: 'poa.hotPowers', type: 'checkboxes', label: 'Also allow my agent to…', help: 'Each of these must be granted expressly under MCL 556.301. Leave unchecked if unsure.',
        options: [
          { value: 'beneficiary', label: 'Create or change beneficiary designations' },
          { value: 'survivorship', label: 'Create or change joint ownership / rights of survivorship' },
          { value: 'trust', label: 'Create, amend, or end a living trust for me' },
          { value: 'ecomm', label: 'Access the content of my email and other electronic communications' },
          { value: 'delegate', label: 'Delegate authority to someone else' },
        ],
      },
      { id: 'poa.compensation', type: 'radio', label: 'Should your agent be paid?', required: true, options: [{ value: 'reasonable', label: 'Reasonable compensation (Michigan default)' }, { value: 'none', label: 'No pay, but reimbursed for expenses' }] },
      { id: 'poa.nominateAgentAsConservator', type: 'yesno', label: 'If a court ever needs to appoint a conservator or guardian for you, nominate your agent as conservator (and your patient advocate as guardian)?', required: true, help: 'Michigan courts give priority to the person you nominate, though a court can pass over a nominee who is unsuitable (MCL 556.208; 700.5409; 700.5313).' },
      { id: 'poa.revokePrior', type: 'yesno', label: 'Revoke any earlier general financial powers of attorney you have signed?', required: true, help: 'Limited powers for a single account or transaction are not affected.' },
    ],
  },
  {
    id: 'pad',
    perPerson: true,
    showIf: (a, c) => c.complete,
    title: (a, c, who) => `Health care decisions${who ? ` — ${who}` : ''}`,
    intro: 'A patient advocate makes medical decisions only when two doctors (or a doctor and a psychologist) find you can’t participate in them.',
    fields: [
      { id: 'pad.advocate', type: 'person', label: 'Patient advocate', required: true },
      { id: 'pad.successor1', type: 'person', label: 'Successor patient advocate', help: 'Strongly recommended.' },
      { id: 'pad.successor2', type: 'person', label: 'Second successor', showIf: (a, c, p) => !!get(a, `${p}.pad.successor1.name`) },
      {
        id: 'pad.lifeSustaining', type: 'radio', label: 'Life-sustaining treatment', required: true,
        help: 'Michigan law lets your advocate decide to withhold or withdraw treatment that would allow you to die only if you say so clearly here (MCL 700.5509(1)(e)).',
        options: [
          { value: 'authorize', label: 'My advocate may decide to withhold or withdraw treatment, and I understand that decision could or would allow me to die' },
          { value: 'preserve', label: 'My advocate may NOT withhold or withdraw life-sustaining treatment' },
        ],
      },
      {
        id: 'pad.wishes', type: 'checkboxes', label: 'Statements of my wishes (optional)', showIf: (a, c, p) => get(a, `${p}.pad.lifeSustaining`) === 'authorize',
        options: [
          { value: 'terminal', label: 'If I have an incurable condition and death is expected soon, I do not want treatment that only prolongs dying' },
          { value: 'unconscious', label: 'If I am permanently unconscious with no reasonable hope of recovery, I do not want life support, including tube feeding' },
          { value: 'comfort', label: 'I want pain relief and comfort care even if it may hasten my death' },
          { value: 'hospice', label: 'I would prefer hospice care and, if possible, to die at home' },
        ],
      },
      { id: 'pad.otherWishes', type: 'textarea', label: 'Anything else your advocate should know (religious beliefs, treatments you do or do not want)' },
      { id: 'pad.mentalHealth', type: 'yesno', label: 'Allow your advocate to make mental health treatment decisions for you?', required: true, help: 'Requires a physician and a mental health professional to certify you can’t give informed consent (MCL 700.5515).' },
      { id: 'pad.anatomical', type: 'radio', label: 'Organ and tissue donation', required: true, options: [{ value: 'none', label: 'Do not give my advocate this authority' }, { value: 'any', label: 'My advocate may donate any needed organs or tissue for transplant, therapy, research, or education' }, { value: 'transplant', label: 'My advocate may donate organs or tissue for transplant only' }] },
      { id: 'pad.hipaaExtra', type: 'person', label: 'Anyone else (besides your advocates) who should be able to get your medical information?', help: 'Optional. Goes in a separate HIPAA authorization.' },
    ],
  },
  {
    id: 'funeral',
    perPerson: true,
    showIf: (a, c) => c.complete,
    title: (a, c, who) => `Funeral arrangements${who ? ` — ${who}` : ''}`,
    intro: 'Michigan lets you name a funeral representative who has first say over your funeral and the disposition of your remains (MCL 700.3206).',
    fields: [
      { id: 'funeral.designate', type: 'yesno', label: 'Name a funeral representative?', required: true },
      { id: 'funeral.rep', type: 'person', label: 'Funeral representative', required: true, showIf: (a, c, p) => get(a, `${p}.funeral.designate`) === 'yes', help: 'Cannot be an owner or employee of the funeral home, cemetery, or crematory, or a caregiver from your final illness, unless they are your spouse or a relative.' },
      { id: 'funeral.repAlt', type: 'person', label: 'Alternate funeral representative', showIf: (a, c, p) => get(a, `${p}.funeral.designate`) === 'yes' },
      { id: 'funeral.disposition', type: 'radio', label: 'Preference', showIf: (a, c, p) => get(a, `${p}.funeral.designate`) === 'yes', options: [{ value: 'burial', label: 'Burial' }, { value: 'cremation', label: 'Cremation' }, { value: 'none', label: 'Let my representative decide' }] },
      { id: 'funeral.instructions', type: 'textarea', label: 'Other instructions (service, cemetery, prepaid contract)', showIf: (a, c, p) => get(a, `${p}.funeral.designate`) === 'yes' },
    ],
  },
  {
    id: 'extras',
    title: 'Extra services',
    intro: 'Optional. Both happen after you sign, and you can skip them.',
    fields: [
      {
        id: 'extras.deposit', type: 'yesno', required: true,
        label: (a, c) => `Should we deposit your signed ${c.isCouple ? 'wills' : 'will'} with the ${a.address?.county || 'your county'} County Probate Court for safekeeping?`,
        help: (a, c) => `${FEES.depositService ? `${money(FEES.depositService + FEES.depositCourtFee)} per will (${money(FEES.depositService)} for our handling plus the court’s ${money(FEES.depositCourtFee)} fee).` : `We handle and mail it at no charge; you pay only the court’s ${money(FEES.depositCourtFee)} fee per will.`} You mail us the signed original; we seal it, deliver it to the court, and send you the court’s certificate of deposit. Michigan law lets you deposit a will with the probate court in the county where you live (MCL 700.2515).`,
      },
      { id: 'note.deposit', type: 'note', text: 'Good to know: once deposited, the court releases the will during your lifetime only to you or to someone you authorize in writing. If you later make a new will, retrieve or replace the deposited one.', showIf: (a) => a.extras?.deposit === 'yes' },
      {
        id: 'extras.courtesy', type: 'yesno', required: true,
        label: 'Should we send courtesy packets to people in your plan?',
        help: `We send each person a letter explaining the role you gave them and what to do now and later, with copies of your signed documents that name them and any form they need to sign. ${FEES.courtesyMail || FEES.courtesyEmail ? `${priceText(FEES.courtesyMail)} per person by mail, ${priceText(FEES.courtesyEmail)} by email.` : 'There is no charge for this.'}`,
      },
      {
        id: 'note.named', type: 'note',
        showIf: (a) => a.extras?.courtesy === 'yes',
        text: (a) => {
          const org = /charit|church|foundation|organi[sz]ation|nonprofit|society|fund\b|inc\b|association|universit|college|school/i;
          const ppl = namedPeople(a).filter((x) => !org.test(`${x.name} ${x.relationship}`) && x.roles.some((r) => r.role !== 'beneficiary' || !r.contingent));
          if (!ppl.length) return 'Add the people who should receive a packet.';
          return `People named in your plan: ${ppl.map((x) => `${x.name} (${[...new Set(x.roles.map((r) => ROLE_LABEL[r.role].split(' (')[0]))].join(', ')})`).join('; ')}.`;
        },
      },
      {
        id: 'extras.recipients', type: 'list', label: 'Who should receive a packet?', itemLabel: 'recipient', addLabel: 'Add a recipient',
        showIf: (a) => a.extras?.courtesy === 'yes',
        help: 'Your documents are confidential. Only the people you list here will receive anything, and only at the level of detail you choose.',
        fields: [
          { id: 'name', type: 'text', label: 'Full name', required: true },
          { id: 'relationship', type: 'text', label: 'Relationship to you', required: true, half: true },
          { id: 'delivery', type: 'select', label: 'Send by', required: true, half: true, options: [{ value: 'mail', label: FEES.courtesyMail ? `Mail (${money(FEES.courtesyMail)})` : 'Mail' }, { value: 'email', label: FEES.courtesyEmail ? `Email (${money(FEES.courtesyEmail)})` : 'Email' }] },
          { id: 'address', type: 'textarea', label: 'Mailing address', required: true, showIfItem: (i) => i.delivery === 'mail' },
          { id: 'email', type: 'email', label: 'Email address', required: true, showIfItem: (i) => i.delivery === 'email' },
          {
            id: 'share', type: 'radio', label: 'What should they receive?', required: true,
            options: [
              { value: 'role', label: 'Their role only', help: 'A letter about their role and copies of the documents that name them. Not your will.' },
              { value: 'plan', label: 'Their role and the whole plan', help: 'Also a plain-English overview of your plan and a copy of your will.' },
            ],
          },
        ],
      },
      {
        id: 'extras.shareConsent', type: 'checkbox', required: true,
        showIf: (a) => a.extras?.courtesy === 'yes',
        label: 'I authorize the firm to share the information described above with the people I listed.',
      },
    ],
  },
];

// Expand per-person steps into concrete steps for the current answers.
export function activeSteps(a = {}) {
  const c = context(a);
  const out = [];
  for (const step of STEPS) {
    if (step.showIf && !step.showIf(a, c)) continue;
    if (step.perPerson) {
      for (const p of c.people) {
        const who = c.isCouple ? (a[p]?.firstName || (p === 'p1' ? 'first spouse' : 'second spouse')) : '';
        out.push({ ...step, key: `${step.id}:${p}`, person: p, who });
      }
    } else {
      out.push({ ...step, key: step.id, person: null, who: '' });
    }
  }
  return out;
}

export function resolve(v, ...args) {
  return typeof v === 'function' ? v(...args) : v;
}

// Absolute answer path for a field in a step.
export function fieldPath(step, field) {
  return step.person ? `${step.person}.${field.id}` : field.id;
}

export function visibleFields(step, a) {
  const c = context(a);
  return step.fields.filter((f) => !f.showIf || f.showIf(a, c, step.person));
}

// Returns { path: message } for every problem in a step.
export function validateStep(step, a) {
  const errors = {};
  const c = context(a);
  for (const f of visibleFields(step, a)) {
    const path = fieldPath(step, f);
    const v = get(a, path);
    if (f.type === 'note') continue;
    if (f.type === 'person') {
      if (f.required && !(v && v.name && String(v.name).trim())) errors[path] = 'Please enter a name.';
      else if (v && v.name && !v.relationship) errors[path] = 'Please add their relationship to you.';
      continue;
    }
    if (f.type === 'list') {
      (v || []).forEach((item, i) => {
        for (const sf of f.fields) {
          if (sf.showIf && !sf.showIf(a, c)) continue;
          if (sf.showIfItem && !sf.showIfItem(item)) continue;
          const sv = item?.[sf.id];
          if (sf.required && (sv == null || String(sv).trim() === '')) errors[`${path}.${i}.${sf.id}`] = 'Required.';
        }
      });
      if (f.id === 'will.beneficiaries' && (v || []).length) {
        const total = v.reduce((s, b) => s + Number(b.share || 0), 0);
        if (Math.abs(total - 100) > 0.001) errors[path] = `Percentages add up to ${total}, not 100.`;
      }
      if (f.id === 'will.beneficiaries' && f.showIf(a, c) && !(v || []).length) errors[path] = 'Add at least one beneficiary.';
      if (f.id === 'extras.recipients' && !(v || []).length) errors[path] = 'Add at least one recipient, or answer No above.';
      continue;
    }
    if (f.required) {
      const empty = v == null || v === false || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && !v.length);
      if (empty) { errors[path] = f.type === 'checkbox' ? 'Please confirm to continue.' : 'Required.'; continue; }
    }
    if (f.pattern && v && !new RegExp(f.pattern).test(v)) errors[path] = 'Please check the format.';
    if (f.type === 'email' && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) errors[path] = 'Enter a valid email.';
    if (f.type === 'date' && v) {
      const age = ageOn(v);
      if (age === null || age < 0 || age > 120) errors[path] = 'Enter a valid date.';
    }
  }
  return errors;
}

// Steps that still have validation errors (empty array = questionnaire complete).
export function incompleteSteps(a = {}) {
  return activeSteps(a)
    .map((s) => ({ key: s.key, title: resolve(s.title, a, context(a), s.who), errors: validateStep(s, a) }))
    .filter((s) => Object.keys(s.errors).length > 0);
}
