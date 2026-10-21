// Client signing instructions, tailored to the documents and choices in the plan.

import { doc, h, h2, list, p, title } from './model.js';
import { SPECIFIC, poaSelections } from './poa.js';
import { partyFor } from './people.js';
import { context } from '../questions.js';
import { fullName, get, listJoin } from '../util.js';
import { firmLines } from '../constants.js';

export function buildSigning(a) {
  const c = context(a);
  const names = c.people.map((k) => fullName(a[k]));
  const B = [];
  B.push(title('SIGNING INSTRUCTIONS', `${listJoin(names)}\nRead all of this before your signing appointment`));
  B.push(p('Your documents are valid only if they are signed exactly as described here. Michigan does not allow remote (video) witnessing for these documents, so everyone must be in the same room. Do not sign anything until the attorney has approved your final documents and you are with your witnesses and notary.'));

  B.push(h('1. WHO YOU NEED'));
  const items = ['**Two witnesses**, both 18 or older, who watch you sign and then sign themselves.'];
  if (c.complete) items.push('**A notary public** for the power of attorney (and, if you like, the funeral representative designation). Many banks and credit unions offer free notary service to customers. The notary may also serve as one of the two witnesses for the power of attorney only.');
  items.push('Your photo ID.');
  B.push(list(items));
  B.push(h2('Choosing witnesses — use the strictest rule so the same two people can witness everything'));
  B.push(p('Pick two adults who are **not**:'));
  B.push(list([
    c.isCouple ? 'either of you (spouses may not witness each other\'s documents)' : 'your spouse',
    'related to you (parent, child, grandchild, brother or sister, or anyone who would inherit from you if you had no will)',
    'named in any of your documents (beneficiary, personal representative, trustee, guardian, agent, patient advocate, or funeral representative)',
    'your doctor, or an employee of your health or life insurer, a hospital or facility treating you, a home for the aged where you live, or a mental health program serving you',
    'an owner or employee of a funeral home, cemetery, or crematory serving you',
  ]));
  B.push(p('These limits come from MCL 700.5506(4) (patient advocate designation), MCL 556.205(2) (power of attorney), and MCL 700.3206(2) (funeral representative). Neighbors, coworkers, and bank staff usually qualify.', { small: true }));

  for (const pk of c.people) {
    const P = partyFor(a, pk);
    B.push(h(`2. SIGNING ORDER${c.isCouple ? ` — ${P.name}` : ''}`));
    const steps = [];
    steps.push(`**Will.** Initial the bottom of every page. With both witnesses watching, sign and date the will on the signature page. Then you and both witnesses sign and date the "Statement of Testator and Witnesses" right after it. No notary is needed for the will.`);
    if (c.complete) {
      const sel = new Set(poaSelections(a, pk));
      const initials = ['"All Preceding Subjects" under Grant of General Authority', ...SPECIFIC.filter((s) => sel.has(s.key)).map((s) => `"${s.text.split(' as limited')[0]}" under Grant of Specific Authority`)];
      steps.push(`**Power of attorney.** In ink, put your initials in the blank next to each of these, and nowhere else: ${listJoin(initials)}. Draw a line through the other initial blanks. Then sign in front of the notary and both witnesses (neither witness may be an agent or successor agent). The notary completes the acknowledgment.`);
      steps.push('**Patient advocate designation.** Initial the boxes in sections 4 and 5 where indicated. Sign in front of both witnesses; they sign the Statement of Witnesses.');
      steps.push('**HIPAA authorization.** Sign and date.');
      if (get(a, `${pk}.funeral.designate`) === 'yes') steps.push('**Funeral representative designation.** Sign in front of both witnesses (or the notary). Complete either the witness section or the notary section.');
    }
    if (get(a, 'will.tppList') === 'yes') steps.push('**Personal property memorandum.** You do not need to fill this in at the signing. Complete it whenever you like, then sign and date it and keep it with your will.');
    B.push(list(steps, { numbered: true }));
  }

  B.push(h('3. AFTER SIGNING'));
  const deposit = get(a, 'extras.deposit') === 'yes';
  const courtesy = get(a, 'extras.courtesy') === 'yes';
  const after = [
    deposit
      ? `**Mail the signed original ${c.isCouple ? 'wills' : 'will'} to us** with the cover sheet from the Will Deposit Instructions. We deposit ${c.isCouple ? 'them' : 'it'} with the ${a.address?.county || ''} County Probate Court and send you the certificate. Do not sign extra originals.`
      : '**Keep one signed original of your will** in a fire-resistant place your personal representative can reach. Do not sign extra originals. You may instead deposit the will with the probate court in your county for safekeeping for a $25 fee (MCL 700.2515).',
  ];
  if (courtesy) after.push('**Upload scans or clear photos of every signed page** on your My plan page. We use them to prepare the courtesy packets you ordered, and we send the packets after we receive them.');
  if (c.complete) {
    after.push('**Give each agent a copy of your power of attorney and the Agent\'s Acknowledgment.** Each agent signs the acknowledgment before ever acting for you (MCL 556.213).');
    after.push('**Give each patient advocate a copy of your patient advocate designation and the Acceptance.** Your advocate must sign the acceptance before acting (MCL 700.5507(4)).');
    after.push('**Give a copy of your patient advocate designation to your doctor and hospital** so it becomes part of your medical record, which Michigan requires before it can be used.');
    after.push('Give your funeral representative a copy of the funeral representative designation.');
  }
  after.push('**Check your beneficiary designations.** Life insurance, retirement accounts, annuities, and payable-on-death accounts pass by beneficiary form, not by your will. Make sure they match your plan.');
  after.push('**Review your plan** after a marriage, divorce, birth or adoption, death of someone named, a move out of Michigan, or a large change in assets — and at least every five years.');
  B.push(list(after));
  B.push(p(`Questions? Contact ${firmLines().join(', ')}.`));
  return doc({ type: 'signing', person: null, title: 'Signing Instructions', owner: listJoin(names), footer: 'Signing Instructions' }, B);
}
