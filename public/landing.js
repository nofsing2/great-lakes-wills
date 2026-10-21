// Home page: prices and firm details from the shared constants, the situation tabs,
// and the "without a will" calculator.
import { intestateShares } from '/engine/intestacy.js';
import { FEES, FIRM, firmLines } from '/engine/constants.js';
import { money, priceText } from '/engine/util.js';

document.querySelectorAll('[data-price]').forEach((el) => {
  const [pkg, size] = el.dataset.price.split('.');
  el.textContent = money(FEES[pkg][size]);
});
document.querySelectorAll('[data-fee]').forEach((el) => { el.textContent = priceText(FEES[el.dataset.fee]); });
document.getElementById('firm-line').textContent = firmLines().join(', ');
document.getElementById('review-days').textContent = String(FIRM.reviewDays);

// ---------- Situation tabs (WAI-ARIA tabs pattern) ----------
const tabs = [...document.querySelectorAll('[role="tab"]')];
function select(tab, focus) {
  tabs.forEach((t) => {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
  });
  if (focus) tab.focus();
  try { sessionStorage.setItem('glw-situation', tab.id); } catch { /* storage unavailable */ }
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => select(t, false));
  t.addEventListener('keydown', (e) => {
    const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (k) { e.preventDefault(); select(tabs[(i + k + tabs.length) % tabs.length], true); }
    if (e.key === 'Home') { e.preventDefault(); select(tabs[0], true); }
    if (e.key === 'End') { e.preventDefault(); select(tabs[tabs.length - 1], true); }
  });
});
// Deep links from ads or flyers: /#surgery, /#parents, /#retirement, /#land
const fromHash = { '#parents': 't-parents', '#surgery': 't-health', '#retirement': 't-retire', '#land': 't-land', '#farm': 't-land' }[location.hash];
let saved = null;
try { saved = sessionStorage.getItem('glw-situation'); } catch { /* storage unavailable */ }
const start = document.getElementById(fromHash || saved || 't-parents');
if (start) select(start, false);

// ---------- Calculator ----------
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
