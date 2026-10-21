// Sample answer sets used by tests and the demo.
export const youngFamilyCouple = {
  plan: 'couple', package: 'complete',
  eligibility: { miDomicile: 'yes', adult: 'yes', self: 'yes', helper: 'no', understands: true },
  p1: { firstName: 'Jordan', middleName: 'A.', lastName: 'Rivera', dob: '1988-04-12', email: 'jordan@example.com', phone: '616-555-0101',
    poa: { agent: { name: 'Casey Rivera', relationship: 'spouse', city: 'Grand Rapids, MI' }, successor1: { name: 'Maria Lopez', relationship: 'sister', city: 'Holland, MI' }, effective: 'immediate', gifts: 'family_annual', hotPowers: ['beneficiary', 'trust'], compensation: 'none', nominateAgentAsConservator: 'yes', revokePrior: 'yes' },
    pad: { advocate: { name: 'Casey Rivera', relationship: 'spouse' }, successor1: { name: 'Maria Lopez', relationship: 'sister' }, lifeSustaining: 'authorize', wishes: ['terminal', 'unconscious', 'comfort'], mentalHealth: 'no', anatomical: 'any' },
    funeral: { designate: 'yes', rep: { name: 'Casey Rivera', relationship: 'spouse' }, disposition: 'cremation' } },
  p2: { firstName: 'Casey', lastName: 'Rivera', dob: '1989-09-30', email: 'casey@example.com',
    poa: { agent: { name: 'Jordan Rivera', relationship: 'spouse' }, effective: 'springing', gifts: 'none', compensation: 'reasonable', nominateAgentAsConservator: 'yes', revokePrior: 'no' },
    pad: { advocate: { name: 'Jordan Rivera', relationship: 'spouse' }, lifeSustaining: 'preserve', mentalHealth: 'yes', anatomical: 'none' },
    funeral: { designate: 'no' } },
  address: { street: '123 Maple St', city: 'Grand Rapids', zip: '49503', county: 'Kent' },
  family: { divorcePending: 'no', maritalAgreement: 'no', nonCitizenSpouse: 'no', specialNeeds: 'no',
    children: [
      { name: 'Ava Rivera', dob: '2016-02-01', relation: 'joint' },
      { name: 'Leo Rivera', dob: '2019-07-15', relation: 'joint' },
    ] },
  assets: { range: '500k_2m', michiganHome: 'yes', outOfStateRealEstate: 'no', business: 'no', communityProperty: 'no', longTermCare: 'no', existingTrust: 'no' },
  will: { plan: 'spouse_then_children', youngBeneficiaries: 'stagger', trustee: { name: 'Maria Lopez', relationship: 'sister', city: 'Holland, MI' }, trusteeAlt: { name: 'Sam Rivera', relationship: 'brother' },
    specificGifts: [{ from: 'both', kind: 'cash', amount: 5000, recipient: 'Kent County Humane Society', relationship: 'charity', ifPredeceases: 'lapse' }],
    tppList: 'yes', lastResort: 'heirs', omit: 'no', spouseAsPr: 'yes', pr: { name: 'Maria Lopez', relationship: 'sister' }, prAlt: { name: 'Sam Rivera', relationship: 'brother' },
    guardian: { name: 'Maria Lopez', relationship: 'sister', city: 'Holland, MI' }, guardianAlt: { name: 'Sam Rivera', relationship: 'brother' } },
  extras: {
    deposit: 'yes', courtesy: 'yes', shareConsent: true,
    recipients: [
      { name: 'Maria Lopez', relationship: 'sister', delivery: 'mail', address: '45 Lake St\nHolland, MI 49423', share: 'plan' },
      { name: 'Sam Rivera', relationship: 'brother', delivery: 'email', email: 'sam@example.com', share: 'role' },
    ],
  },
};

export const singleCustom = {
  plan: 'single', package: 'will',
  eligibility: { miDomicile: 'yes', adult: 'yes', self: 'yes', helper: 'yes', understands: true },
  p1: { firstName: 'Pat', lastName: 'Kowalski', dob: '1955-01-20', email: 'pat@example.com' },
  address: { street: '9 Lake Rd', city: 'Traverse City', zip: '49684', county: 'Grand Traverse' },
  family: { maritalStatus: 'widowed', priorDivorceObligations: 'no', specialNeeds: 'no', children: [] },
  assets: { range: '53k_500k', michiganHome: 'yes', outOfStateRealEstate: 'yes', business: 'no', longTermCare: 'no', existingTrust: 'no' },
  will: { plan: 'custom', beneficiaries: [
    { name: 'Dana Kowalski', relationship: 'niece', share: 60, ifPredeceases: 'descendants' },
    { name: 'Northern Michigan Food Bank', relationship: 'charity', share: 40, ifPredeceases: 'others' },
  ], youngBeneficiaries: 'utma21', tppList: 'no', lastResort: 'heirs', omit: 'no', pr: { name: 'Dana Kowalski', relationship: 'niece' } },
  extras: { deposit: 'no', courtesy: 'no' },
};

export const blocked = {
  plan: 'single', package: 'complete',
  eligibility: { miDomicile: 'no', adult: 'yes', self: 'yes', helper: 'no', understands: true },
  family: { maritalStatus: 'married', spouse: { name: 'Lee Park' }, specialNeeds: 'yes', children: [] },
  assets: { range: 'over_30m', longTermCare: 'yes', existingTrust: 'no' },
};
