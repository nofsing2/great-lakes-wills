// Payments. Uses Stripe Checkout when STRIPE_SECRET_KEY is set; otherwise a
// local test mode that marks orders paid without charging (never in production).
import { createHmac, timingSafeEqual } from 'node:crypto';

const KEY = process.env.STRIPE_SECRET_KEY;
export const mode = KEY ? 'stripe' : 'test';

async function stripe(path, params) {
  const body = new URLSearchParams();
  const add = (prefix, v) => {
    if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => add(`${prefix}[${k}]`, x));
    else body.append(prefix, String(v));
  };
  Object.entries(params).forEach(([k, v]) => add(k, v));
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await r.json();
  if (!r.ok) throw new Error(json.error?.message || 'Payment provider error');
  return json;
}

export async function createCheckout({ matterId, amountCents, description, email, baseUrl }) {
  if (mode !== 'stripe') return { mode, url: null };
  const s = await stripe('checkout/sessions', {
    mode: 'payment',
    customer_email: email,
    success_url: `${baseUrl}/app.html#/status?paid=1`,
    cancel_url: `${baseUrl}/app.html#/checkout`,
    'line_items[0][quantity]': 1,
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': amountCents,
    'line_items[0][price_data][product_data][name]': description,
    'metadata[matter_id]': matterId,
    'payment_intent_data[metadata][matter_id]': matterId,
  });
  return { mode, url: s.url, id: s.id };
}

export async function refund(paymentIntent) {
  if (mode !== 'stripe' || !paymentIntent) return { mode, refunded: true };
  return stripe('refunds', { payment_intent: paymentIntent });
}

// Verifies the Stripe-Signature header (t=...,v1=...) against the raw body.
export function verifyWebhook(rawBody, header, secret = process.env.STRIPE_WEBHOOK_SECRET) {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=')));
  if (!parts.t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}
