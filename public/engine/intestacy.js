// "What happens if I don't have a will?" — Michigan intestate succession,
// MCL 700.2102 (spouse) and 700.2103 (everyone else), with 2026 amounts.
// Educational estimate for one person's probate estate.

import { EPIC_AMOUNTS } from './constants.js';
import { money } from './util.js';

/**
 * @param {object} f
 * @param {boolean} f.spouse          surviving spouse
 * @param {number}  f.ownChildren     decedent's descendants who are also the spouse's
 * @param {number}  f.otherChildren   decedent's descendants who are not the spouse's
 * @param {boolean} f.spouseHasOtherDescendants
 * @param {boolean} f.parentLiving
 * @param {number}  f.estate          probate estate value
 */
export function intestateShares(f) {
  const estate = Math.max(0, Number(f.estate) || 0);
  const kids = (f.ownChildren || 0) + (f.otherChildren || 0);
  const out = { rule: '', spouse: 0, descendants: 0, parents: 0, others: 0, explanation: '' };

  if (f.spouse) {
    let base;
    let fraction;
    if (kids === 0 && !f.parentLiving) {
      out.spouse = estate;
      out.rule = 'MCL 700.2102(1)(a)';
      out.explanation = 'With no descendants or parents, the spouse takes everything.';
      return out;
    }
    if (kids === 0 && f.parentLiving) {
      base = EPIC_AMOUNTS.intestateSpouseHigh; fraction = 0.75; out.rule = 'MCL 700.2102(1)(c)';
    } else if (f.otherChildren === 0) {
      // all descendants are also the spouse's (with or without the spouse having others)
      base = EPIC_AMOUNTS.intestateSpouseHigh; fraction = 0.5; out.rule = f.spouseHasOtherDescendants ? 'MCL 700.2102(1)(d)' : 'MCL 700.2102(1)(b)';
    } else if (f.ownChildren > 0) {
      base = EPIC_AMOUNTS.intestateSpouseHigh; fraction = 0.5; out.rule = 'MCL 700.2102(1)(e)';
    } else {
      base = EPIC_AMOUNTS.intestateSpouseLow; fraction = 0.5; out.rule = 'MCL 700.2102(1)(f)';
    }
    const first = Math.min(estate, base);
    out.spouse = first + (estate - first) * fraction;
    const rest = estate - out.spouse;
    if (kids > 0) out.descendants = rest; else out.parents = rest;
    out.explanation = `The spouse takes the first ${money(base)} plus ${fraction === 0.75 ? 'three-quarters' : 'one-half'} of the rest; the remainder goes to ${kids > 0 ? 'the descendants, by representation' : 'the parents'}.`;
    return out;
  }

  out.rule = 'MCL 700.2103';
  if (kids > 0) { out.descendants = estate; out.explanation = 'Everything goes to the descendants, by representation.'; } else if (f.parentLiving) { out.parents = estate; out.explanation = 'Everything goes to the parents (or the surviving parent).'; } else { out.others = estate; out.explanation = 'Everything goes to siblings and their descendants, then grandparents’ families; if no relatives, to the State of Michigan.'; }
  return out;
}

// Build the inputs from questionnaire answers for client "p1" (or "p2").
export function intestacyFromAnswers(a, c, estateGuess) {
  const p = 'p1';
  const mine = c.children.filter((k) => {
    if (c.isCouple) return k.relation === 'joint' || k.relation === `${p}_only`;
    return k.relation !== 'stepchild';
  }).filter((k) => !k.deceased || k.leftDescendants);
  const shared = mine.filter((k) => (c.isCouple ? k.relation === 'joint' : k.relation === 'child_with_spouse'));
  const spouseOthers = c.isCouple
    ? c.children.some((k) => k.relation === 'p2_only')
    : c.children.some((k) => k.relation === 'stepchild');
  return intestateShares({
    spouse: c.hasSpouse,
    ownChildren: shared.length,
    otherChildren: mine.length - shared.length,
    spouseHasOtherDescendants: spouseOthers,
    parentLiving: false,
    estate: estateGuess,
  });
}
