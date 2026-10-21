// Plain-English summary of a plan, for the client's review page and the attorney.
import { context } from './questions.js';
import { fullName, get, listJoin, money } from './util.js';

const nm = (x) => (x?.name ? `${x.name}${x.relationship ? ` (${x.relationship})` : ''}` : '');

export function summarize(a) {
  const c = context(a);
  const out = [];
  const plan = get(a, 'will.plan');
  const spouse = c.isCouple ? 'the surviving spouse' : (c.spouseName || 'your spouse');
  const kids = c.livingChildren.map((k) => fullName(k));
  const youngMap = { utma21: 'outright at 21 (custodian until then)', trust25: 'in trust until 25', trust30: 'in trust until 30', stagger: 'in trust, paid out at 25, 30, and 35' };

  const inherit = [];
  if (plan === 'spouse_then_children') inherit.push(`Everything goes to ${spouse}. If ${c.isCouple ? 'both of you have died' : 'your spouse has died'}, it goes equally to ${kids.length ? listJoin(kids) : 'your children'}; a deceased child's share goes to that child's children.`);
  if (plan === 'children') inherit.push(`Everything goes equally to ${listJoin(kids)}; a deceased child's share goes to that child's children.`);
  if (plan === 'spouse_then_others' || plan === 'custom') {
    const bens = (get(a, 'will.beneficiaries') || []).map((b) => `${b.name} ${b.share}%`);
    inherit.push(`${plan === 'spouse_then_others' ? `Everything goes to ${spouse}; then ` : ''}${listJoin(bens)}.`);
  }
  const gifts = get(a, 'will.specificGifts') || [];
  if (gifts.length) inherit.push(`First, specific gifts: ${listJoin(gifts.map((g) => `${g.kind === 'cash' ? money(g.amount || 0) : g.description} to ${g.recipient}`))}.`);
  inherit.push(`Anyone under the payout age receives their share ${youngMap[get(a, 'will.youngBeneficiaries')] || 'as the will provides'}.`);
  if (get(a, 'will.tppList') === 'yes') inherit.push('Personal belongings can be assigned on a separate list you can change at any time.');
  out.push({ heading: 'Who inherits', items: inherit });

  const charge = [];
  const prs = [];
  if (c.hasSpouse && get(a, 'will.spouseAsPr') === 'yes') prs.push(c.isCouple ? 'each other' : spouse);
  if (nm(get(a, 'will.pr'))) prs.push(nm(get(a, 'will.pr')));
  if (nm(get(a, 'will.prAlt'))) prs.push(nm(get(a, 'will.prAlt')));
  charge.push(`Personal representative: ${prs.join(', then ') || '—'}.`);
  if (get(a, 'will.youngBeneficiaries') && get(a, 'will.youngBeneficiaries') !== 'utma21') charge.push(`Trustee for young beneficiaries: ${[nm(get(a, 'will.trustee')), nm(get(a, 'will.trusteeAlt'))].filter(Boolean).join(', then ')}.`);
  if (c.hasMinorChildren) charge.push(`Guardian of minor children: ${[nm(get(a, 'will.guardian')), nm(get(a, 'will.guardianAlt'))].filter(Boolean).join(', then ')}.`);
  out.push({ heading: 'Who is in charge', items: charge });

  if (c.complete) {
    for (const p of c.people) {
      const who = c.isCouple ? `${a[p]?.firstName}: ` : '';
      const items = [];
      const agents = ['agent', 'successor1', 'successor2'].map((k) => nm(get(a, `${p}.poa.${k}`))).filter(Boolean);
      items.push(`Financial agent: ${agents.join(', then ')} — ${get(a, `${p}.poa.effective`) === 'springing' ? 'only after incapacity' : 'effective immediately'}; gifts: ${({ none: 'not allowed', family_annual: 'to family up to the annual exclusion', attorney: 'to be tailored by the attorney' })[get(a, `${p}.poa.gifts`)] || '—'}.`);
      const advs = ['advocate', 'successor1', 'successor2'].map((k) => nm(get(a, `${p}.pad.${k}`))).filter(Boolean);
      items.push(`Patient advocate: ${advs.join(', then ')}; ${get(a, `${p}.pad.lifeSustaining`) === 'authorize' ? 'may withhold or withdraw life-sustaining treatment' : 'may not withhold or withdraw life-sustaining treatment'}.`);
      if (get(a, `${p}.funeral.designate`) === 'yes') items.push(`Funeral representative: ${[nm(get(a, `${p}.funeral.rep`)), nm(get(a, `${p}.funeral.repAlt`))].filter(Boolean).join(', then ')}.`);
      out.push({ heading: `${who}If you can't decide for yourself`.replace(/^(\w)/, (m) => m.toUpperCase()), items });
    }
  }
  return out;
}
