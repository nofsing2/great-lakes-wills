// Landing page: prices, firm details, and the "without a will" calculator.
import { intestateShares } from '/engine/intestacy.js';
import { FEES, firmLines } from '/engine/constants.js';
import { priceText } from '/engine/util.js';
import { money } from '/engine/util.js';

document.querySelectorAll('[data-price]').forEach((el) => {
  const [pkg, size] = el.dataset.price.split('.');
  el.textContent = money(FEES[pkg][size]);
});
document.getElementById('firm-line').textContent = firmLines().join(', ');
document.querySelectorAll('[data-fee]').forEach((el) => { el.textContent = priceText(FEES[el.dataset.fee]); });
document.getElementById('fee-deposit').textContent = FEES.depositService
  ? `${money(FEES.depositService + FEES.depositCourtFee)} per will, including the court’s ${money(FEES.depositCourtFee)} fee`
  : `Only the court’s ${money(FEES.depositCourtFee)} fee per will`;
document.getElementById('fee-courtesy').textContent = FEES.courtesyMail || FEES.courtesyEmail
  ? `${priceText(FEES.courtesyMail)} by mail, ${priceText(FEES.courtesyEmail)} by email`
  : 'No charge, by mail or email';

const $ = (id) => document.getElementById(id);
function update() {
  const spouse = $('c-spouse').value === 'yes';
  const own = spouse ? Number($('c-own').value) : 0;
  const other = spouse ? Number($('c-other').value) : Number($('c-own').value);
  const estate = Number($('c-estate').value);
  const r = intestateShares({ spouse, ownChildren: own, otherChildren: other, parentLiving: $('c-parent').value === 'yes', estate });
  $('c-parent-wrap').hidden = own + other > 0;
  const parts = [[r.spouse, '.s'], [r.descendants, '.d'], [r.parents + r.others, '.o']];
  for (const [v, sel] of parts) {
    const el = $('c-bar').querySelector(sel);
    el.style.flexGrow = v;
    el.style.flexBasis = 0;
    el.textContent = v / estate > 0.12 ? money(v) : '';
  }
  const bits = [];
  if (r.spouse) bits.push(`your spouse receives ${money(r.spouse)}`);
  if (r.descendants) bits.push(`your children share ${money(r.descendants)}`);
  if (r.parents) bits.push(`your parents receive ${money(r.parents)}`);
  if (r.others) bits.push(`other relatives receive ${money(r.others)}`);
  const sentence = bits.join(', and ');
  $('c-out').textContent = `Michigan law says ${sentence}.`;
  $('c-bar').setAttribute('aria-label', sentence);
  $('c-rule').textContent = `${r.explanation} ${r.rule}, 2026 amounts. Probate estate only; jointly owned and beneficiary-designated assets pass outside this.`;
  $('c-own').closest('label').querySelector('.field-label').textContent = spouse ? 'Children with spouse' : 'Children';
  $('c-other').closest('label').hidden = !spouse;
}
['c-spouse', 'c-estate', 'c-own', 'c-other', 'c-parent'].forEach((id) => $(id).addEventListener('change', update));
update();
