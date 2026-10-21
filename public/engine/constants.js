// Michigan figures and firm settings used by the questionnaire engine.
// Update EPIC amounts each January from the Michigan Treasury "Estates and
// Protected Individuals Code Cost-of-Living Adjustments" notice (MCL 700.1210).

export const LAW_YEAR = 2026;

export const EPIC_AMOUNTS = {
  // MCL 700.2102 — Treasury notice dated Jan. 30, 2026
  intestateSpouseHigh: 301000, // statutory base $150,000
  intestateSpouseLow: 201000, // statutory base $100,000
  homesteadAllowance: 30000, // 700.2402
  exemptProperty: 20000, // 700.2404
  familyAllowance: 36000, // 700.2405
  smallEstateAffidavit: 53000, // 700.3983 (no real property)
};

// Federal estate & gift tax basic exclusion for 2026 (One Big Beautiful Bill Act).
export const FEDERAL_EXEMPTION = 15000000;

// Asset ranges offered in the questionnaire, with an upper-bound value used by the rules.
export const ESTATE_RANGES = [
  { value: 'under_53k', label: 'Under $53,000', max: 53000 },
  { value: '53k_500k', label: '$53,000 – $500,000', max: 500000 },
  { value: '500k_2m', label: '$500,000 – $2 million', max: 2000000 },
  { value: '2m_7_5m', label: '$2 million – $7.5 million', max: 7500000 },
  { value: '7_5m_15m', label: '$7.5 million – $15 million', max: 15000000 },
  { value: '15m_30m', label: '$15 million – $30 million', max: 30000000 },
  { value: 'over_30m', label: 'Over $30 million', max: Infinity },
];

// Flat fees in US dollars (recommended starting prices; the firm can change any of them).
// Comparables, Oct. 2026: online will services $99–$299, with attorney access as a ~$299 add-on;
// a nearby Sturgis/Coldwater firm lists a will package at $1,300 single / $1,700 couple.
export const FEES = {
  will: { single: 295, couple: 445 },
  complete: { single: 595, couple: 895 },
  rushReview: 125,
  // Safekeeping deposit of a signed will with the probate court (MCL 700.2515), per will.
  // Mailing and handling are a courtesy at no charge; the client pays only the court's fee.
  depositService: 0,
  depositCourtFee: 25, // court fee under MCL 600.880c(2), paid to the court
  // Courtesy packets (role letter, optional plan overview, copies) are sent at no charge.
  courtesyMail: 0,
  courtesyEmail: 0,
};

export const FIRM = {
  name: 'Great Lakes Wills & Estate',
  // Firm name as it should appear on documents and the engagement agreement.
  legalEntity: 'Truckey Nofsinger, LLP',
  reviewingAttorney: 'Luke Nofsinger (P79495)',
  address: '38 N. Main St., Three Rivers, Michigan 49093',
  phone: '(269) 273-5657',
  email: 'luke@truckeynofsinger.com',
  reviewDays: 3, // business days promised for attorney review
};

// Firm contact lines with blank values removed.
export const firmLines = () => [FIRM.reviewingAttorney, FIRM.legalEntity, FIRM.address, FIRM.phone, FIRM.email].filter(Boolean);
