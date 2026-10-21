// Everyone named in the plan, and every role each person holds.
// Used for courtesy packets and to suggest recipients.

import { context } from './questions.js';
import { fullName, get } from './util.js';

const key = (name) => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
const looseKey = (name) => {
  const parts = key(name).replace(/[.,]/g, '').split(' ').filter((x) => !/^(jr|sr|ii|iii|iv)$/.test(x));
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]}` : parts[0] || '';
};

// Role ids: pr, trustee, guardian, beneficiary, agent, advocate, funeral
export function namedPeople(a = {}) {
  const c = context(a);
  const map = new Map();
  const add = (person, role, owner, detail = {}) => {
    const name = typeof person === 'string' ? person : fullName(person);
    if (!name) return;
    const k = key(name);
    if (!map.has(k)) map.set(k, { name, relationship: person?.relationship || detail.relationship || '', roles: [] });
    map.get(k).roles.push({ role, owner, ...detail });
  };
  const owners = c.people;
  // Will roles apply to each client's will.
  for (const o of owners) {
    const spouseIsPr = c.hasSpouse && get(a, 'will.spouseAsPr') === 'yes';
    if (spouseIsPr && c.isCouple) add(a[o === 'p1' ? 'p2' : 'p1'], 'pr', o, { order: 1 });
    if (spouseIsPr && !c.isCouple) add({ name: c.spouseName, relationship: 'spouse' }, 'pr', o, { order: 1 });
    add(get(a, 'will.pr'), 'pr', o, { order: spouseIsPr ? 2 : 1 });
    add(get(a, 'will.prAlt'), 'pr', o, { order: spouseIsPr ? 3 : 2 });
    if (get(a, 'will.youngBeneficiaries') && get(a, 'will.youngBeneficiaries') !== 'utma21') {
      add(get(a, 'will.trustee'), 'trustee', o, { order: 1 });
      add(get(a, 'will.trusteeAlt'), 'trustee', o, { order: 2 });
    }
    if (c.hasMinorChildren) {
      add(get(a, 'will.guardian'), 'guardian', o, { order: 1 });
      add(get(a, 'will.guardianAlt'), 'guardian', o, { order: 2 });
    }
    for (const b of get(a, 'will.beneficiaries') || []) add(b, 'beneficiary', o);
    for (const g of get(a, 'will.specificGifts') || []) {
      if (!c.isCouple || !g.from || g.from === 'both' || g.from === o) add({ name: g.recipient, relationship: g.relationship }, 'beneficiary', o, { gift: true });
    }
    if (c.complete) {
      ['agent', 'successor1', 'successor2'].forEach((k, i) => add(get(a, `${o}.poa.${k}`), 'agent', o, { order: i + 1 }));
      ['advocate', 'successor1', 'successor2'].forEach((k, i) => add(get(a, `${o}.pad.${k}`), 'advocate', o, { order: i + 1 }));
      if (get(a, `${o}.funeral.designate`) === 'yes') {
        add(get(a, `${o}.funeral.rep`), 'funeral', o, { order: 1 });
        add(get(a, `${o}.funeral.repAlt`), 'funeral', o, { order: 2 });
      }
    }
  }
  // Children are residuary beneficiaries under the family plans.
  if (['spouse_then_children', 'children'].includes(get(a, 'will.plan'))) {
    for (const k of c.livingChildren) for (const o of owners) add({ name: k.name, relationship: 'child' }, 'beneficiary', o, { contingent: get(a, 'will.plan') === 'spouse_then_children' });
  }
  // Leave out the clients themselves (a couple already has each other's documents),
  // matching on first and last name so "Jordan Rivera" also matches "Jordan A. Rivera".
  const selves = new Set(owners.map((o) => looseKey(fullName(a[o]))));
  return [...map.values()].filter((p) => !selves.has(looseKey(p.name)));
}

export function rolesFor(a, name) {
  const p = namedPeople(a).find((x) => key(x.name) === key(name));
  return p ? p.roles : [];
}

export const ROLE_LABEL = {
  pr: 'personal representative (executor)',
  trustee: 'trustee for young beneficiaries',
  guardian: 'guardian of minor children',
  beneficiary: 'beneficiary',
  agent: 'financial agent under a power of attorney',
  advocate: 'patient advocate (health care decisions)',
  funeral: 'funeral representative',
};
