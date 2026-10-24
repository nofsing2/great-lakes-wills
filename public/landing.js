// Home page ("The Family File"): prices and firm details from the shared constants,
// scroll-driven chapters, and the "without a will" calculator (MCL 700.2102-.2103).
import { intestateShares } from '/engine/intestacy.js';
import { FEES, FIRM, EPIC_AMOUNTS, LAW_YEAR, firmLines } from '/engine/constants.js';
import { money, priceText } from '/engine/util.js';

const $ = (id) => document.getElementById(id);

// ---------- Shared numbers ----------
document.querySelectorAll('[data-price]').forEach((el) => {
  const [pkg, size] = el.dataset.price.split('.');
  el.textContent = money(FEES[pkg][size]);
});
document.querySelectorAll('[data-fee]').forEach((el) => { el.textContent = priceText(FEES[el.dataset.fee]); });
document.querySelectorAll('[data-epic]').forEach((el) => { el.textContent = money(EPIC_AMOUNTS[el.dataset.epic]); });
document.querySelectorAll('[data-law-year]').forEach((el) => { el.textContent = String(LAW_YEAR); });
$('firm-line').textContent = firmLines().join(', ');
$('review-days').textContent = String(FIRM.reviewDays);

// The worked example in the peak: married, two children with the spouse, $500,000.
const EX_ESTATE = 500000;
const ex = intestateShares({ spouse: true, ownChildren: 2, otherChildren: 0, parentLiving: false, estate: EX_ESTATE });
const exFirst = Math.min(EX_ESTATE, EPIC_AMOUNTS.intestateSpouseHigh);
const exHalf = ex.spouse - exFirst;
$('n-half').textContent = money(exHalf);
$('n-kids').textContent = money(ex.descendants);

// ---------- Scroll machinery ----------
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const acts = [...document.querySelectorAll('[data-act]')];
const progress = (el) => {
  const r = el.getBoundingClientRect();
  const span = r.height - innerHeight;
  return span > 0 ? clamp(-r.top / span) : clamp(1 - r.top / innerHeight);
};
const wide = () => innerWidth > 760;

const bar = $('bar');
function paintBar(parts, total) {
  [...bar.children].forEach((span, i) => {
    const v = parts[i] || 0;
    span.style.flexBasis = `${(v / total) * 100}%`;
    span.textContent = v / total > 0.13 ? money(v) : '';
  });
  const words = [];
  if (parts[0]) words.push(`spouse ${money(parts[0])}`);
  if (parts[1]) words.push(`children ${money(parts[1])}`);
  if (parts[2]) words.push(`parents or other relatives ${money(parts[2])}`);
  bar.setAttribute('aria-label', words.length ? `Estate of ${money(total)}: ${words.join(', ')}` : `Estate of ${money(total)}`);
}

// Scripted split for the worked example, driven by scroll progress through the peak.
function scripted(p) {
  const a = ease(clamp((p - 0.1) / 0.14));
  const b = ease(clamp((p - 0.28) / 0.14));
  const c = ease(clamp((p - 0.44) / 0.12));
  const d = ease(clamp((p - 0.76) / 0.1)); // "with a will": all to the spouse
  let sp = exFirst * a + exHalf * b;
  let ch = ex.descendants * c;
  if (d > 0) { sp += (EX_ESTATE - sp) * d; ch *= 1 - d; }
  $('tot').textContent = money(EX_ESTATE);
  paintBar([sp, ch, 0], EX_ESTATE);
}

// ---------- Calculator ----------
let calcMode = false;
function calc() {
  const spouse = $('c-spouse').value === 'yes';
  const own = Number($('c-own').value);
  const other = spouse ? Number($('c-other').value) : 0;
  const estate = Number($('c-estate').value);
  const r = intestateShares({ spouse, ownChildren: own, otherChildren: other, parentLiving: $('c-parent').value === 'yes', estate });
  $('c-parent-wrap').hidden = own + other > 0;
  $('c-other').closest('label').hidden = !spouse;
  $('c-own').closest('label').querySelector('.field-label').textContent = spouse ? 'Kids together' : 'Children';
  $('tot').textContent = money(estate);
  paintBar([r.spouse, r.descendants, r.parents + r.others], estate);
  const bits = [];
  if (r.spouse) bits.push(`your spouse receives ${money(r.spouse)}`);
  if (r.descendants) bits.push(`your children share ${money(r.descendants)}`);
  if (r.parents) bits.push(`your parents receive ${money(r.parents)}`);
  if (r.others) bits.push(`other relatives receive ${money(r.others)}`);
  $('c-out').textContent = `Michigan law says ${bits.join(', and ')}.`;
  $('c-rule').textContent = `${r.explanation} ${r.rule}, ${LAW_YEAR} amounts. Probate estate only; jointly owned and beneficiary-designated assets pass outside this.`;
}
['c-spouse', 'c-estate', 'c-own', 'c-other', 'c-parent'].forEach((id) => $(id).addEventListener('change', () => {
  calcMode = true;
  $('peak').classList.add('calc');
  calc();
}));

// ---------- Per-frame updates ----------
const peak = $('peak');
const track = $('track');
const sig = $('sig');
const sigLen = sig.getTotalLength();
sig.style.strokeDasharray = sigLen;

function frame() {
  $('top').classList.toggle('solid', scrollY > 40);
  if (RM) return;
  for (const el of acts) {
    const p = progress(el);
    if (el.classList.contains('hero')) {
      el.querySelectorAll('[data-depth]').forEach((pl) => { pl.style.transform = `translate3d(0,${-p * 260 * Number(pl.dataset.depth)}px,0)`; });
      el.querySelectorAll('[data-paper]').forEach((pp) => {
        const i = Number(pp.dataset.paper);
        const spread = ease(clamp(p * 1.4));
        const rot = [-3, 4, 10][i] * (0.35 + spread);
        const x = [0, 34, 70][i] * spread;
        const y = [0, -18, -40][i] * spread - p * [140, 100, 70][i];
        pp.style.transform = `translate3d(${x}px,${y}px,0) rotate(${rot}deg)`;
      });
    } else if (el.classList.contains('sits')) {
      if (wide()) {
        const max = track.scrollWidth - innerWidth;
        track.style.transform = `translate3d(${-ease(clamp((p - 0.08) / 0.84)) * max}px,0,0)`;
      } else {
        track.style.transform = '';
      }
    } else if (el === peak) {
      el.querySelectorAll('.notes li').forEach((li) => li.classList.toggle('on', p >= Number(li.dataset.at)));
      const strike = clamp((p - 0.68) / 0.08);
      el.querySelector('.who').style.setProperty('--strike', strike);
      el.querySelector('.mi').style.color = strike > 0.5 ? '#9AA3AE' : '';
      el.classList.toggle('flip', p > 0.8);
      const tryOn = p > 0.9;
      $('try').classList.toggle('on', tryOn);
      if (!tryOn && calcMode) { calcMode = false; el.classList.remove('calc'); }
      if (!calcMode) scripted(p);
    } else if (el.classList.contains('luke')) {
      sig.style.strokeDashoffset = sigLen * (1 - ease(clamp((p - 0.35) / 0.35)));
    } else if (el.id === 'how') {
      $('rail').style.setProperty('--fill', clamp((p - 0.1) / 0.7));
      el.querySelectorAll('.step').forEach((s, i) => s.classList.toggle('on', p > 0.08 + i * 0.22));
    } else if (el.classList.contains('close')) {
      const s = ease(clamp((p - 0.25) / 0.25));
      $('stamp').style.setProperty('--st', 1.6 - 0.6 * s);
      $('stamp').style.setProperty('--so', s);
    }
  }
}

if (RM) {
  peak.classList.add('flip');
  peak.querySelectorAll('.notes li').forEach((li) => li.classList.add('on'));
  sig.style.strokeDashoffset = 0;
  $('stamp').style.setProperty('--st', 1);
  $('stamp').style.setProperty('--so', 1);
  calc();
} else {
  scripted(0);
}

let ticking = false;
addEventListener('scroll', () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => { frame(); ticking = false; });
}, { passive: true });
addEventListener('resize', frame);
frame();

// ---------- Situations: deep links and keyboard focus ----------
// Ads and flyers link to /#parents, /#surgery, /#retirement, /#land (or /#farm).
const sits = $('situations');
const cards = [...track.querySelectorAll('.sit')];
function showCard(card, smooth) {
  if (!card) return;
  if (wide() && !RM) {
    const max = track.scrollWidth - innerWidth;
    const k = max > 0 ? clamp((card.offsetLeft - cards[0].offsetLeft) / max) : 0;
    // invert the pan: k = ease((p - 0.08) / 0.84); solve for p
    const t = k <= 0.5 ? Math.sqrt(k / 2) : 1 - Math.sqrt((1 - k) / 2);
    const p = 0.08 + 0.84 * t;
    const top = sits.getBoundingClientRect().top + scrollY;
    scrollTo({ top: top + p * (sits.offsetHeight - innerHeight), behavior: smooth ? 'smooth' : 'auto' });
  } else {
    sits.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    track.scrollTo({ left: card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2, behavior: smooth ? 'smooth' : 'auto' });
  }
}
const hashCard = () => $({ '#farm': 'land' }[location.hash] || location.hash.slice(1));
function fromHash(smooth) {
  const card = hashCard();
  if (card && card.classList.contains('sit')) { showCard(card, smooth); frame(); }
}
addEventListener('load', () => fromHash(false));
addEventListener('hashchange', () => fromHash(true));
track.addEventListener('focusin', (e) => {
  const card = e.target.closest('.sit');
  if (card && wide() && !RM) { showCard(card, false); frame(); }
});
