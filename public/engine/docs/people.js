// Works out, for one client, who is "me", "my spouse", "my children", and "my stepchildren".

import { context } from '../questions.js';
import { fullName, get } from '../util.js';

export function partyFor(a, p) {
  const c = context(a);
  const me = a[p] || {};
  const other = p === 'p1' ? 'p2' : 'p1';
  const spouseName = c.isCouple ? fullName(a[other]) : (c.hasSpouse ? fullName(a.family?.spouse) : '');

  const isMine = (k) => {
    if (c.isCouple) return k.relation === 'joint' || k.relation === `${p}_only`;
    return k.relation === 'child_with_spouse' || k.relation === 'child_other';
  };
  const isStep = (k) => {
    if (c.isCouple) return k.relation === `${other}_only`;
    return k.relation === 'stepchild';
  };
  const children = c.children.filter(isMine);
  const stepchildren = c.children.filter(isStep);
  const includeSteps = stepchildren.length > 0 && get(a, 'family.includeStepchildren') === 'yes';

  const maritalStatus = c.isCouple ? 'married' : (a.family?.maritalStatus || 'single');
  return {
    p,
    c,
    me,
    name: fullName(me),
    aka: (me.aka || '').trim(),
    city: a.address?.city || '',
    county: a.address?.county || '',
    address: a.address || {},
    spouseName,
    hasSpouse: !!spouseName,
    maritalStatus,
    children,
    stepchildren,
    includeSteps,
    // Everyone treated as "my children" in the will.
    treatedAsChildren: includeSteps ? [...children, ...stepchildren] : children,
    hasDescendantsInPlan: children.length > 0 || includeSteps,
  };
}

export function personText(person) {
  if (!person || !person.name) return '';
  const name = String(person.name).trim();
  let rel = (person.relationship || '').trim().replace(/^my\s+/i, '');
  if (/charit|church|foundation|organi[sz]ation|nonprofit|non-profit|universit|college|school|temple|mosque|synagogue/i.test(rel)) rel = '';
  const city = (person.city || '').trim();
  return [name, rel ? `my ${rel}` : '', city ? `of ${city}` : ''].filter(Boolean).join(', ');
}

// For use mid-sentence: closes an appositive with a comma ("Maria Lopez, my sister, as trustee").
export function personMid(person) {
  const t = personText(person);
  return t.includes(',') ? `${t},` : t;
}

export function isOrganization(person) {
  return /charit|church|foundation|organi[sz]ation|nonprofit|non-profit|universit|college|school|temple|mosque|synagogue|society|fund\b|inc\b|association/i.test(`${person?.relationship || ''} ${person?.name || ''}`);
}
