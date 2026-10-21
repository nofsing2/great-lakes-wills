// Rate limiting and time-based one-time passwords (RFC 6238).
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// ---------- Rate limiting (stored in the database, so it holds across servers) ----------
import { one, query } from './db.js';

// Counts one attempt. Returns true when the caller is over the limit for this key.
export async function limited(key, limit, windowMs) {
  const row = await one(`INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, now() + make_interval(secs => ?::double precision))
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.reset_at < now() THEN 1 ELSE rate_limits.count + 1 END,
      reset_at = CASE WHEN rate_limits.reset_at < now() THEN excluded.reset_at ELSE rate_limits.reset_at END
    RETURNING count`, [key, windowMs / 1000]);
  if (Math.random() < 0.02) await query('DELETE FROM rate_limits WHERE reset_at < now()');
  return row.count > limit;
}

export async function clearLimit(key) { await query('DELETE FROM rate_limits WHERE key = ?', [key]); }

// True when a key has already used up its limit (does not count as an attempt).
export async function overLimit(key, limit) {
  const row = await one('SELECT count FROM rate_limits WHERE key = ? AND reset_at >= now()', [key]);
  return !!row && row.count >= limit;
}

export function rateLimit(name, limit, windowMs) {
  return async (req, res, next) => {
    try {
      if (await limited(`${name}:${req.ip}`, limit, windowMs)) {
        res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
        return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
      }
      next();
    } catch (err) { next(err); }
  };
}

// ---------- TOTP ----------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf) {
  let bits = 0; let value = 0; let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0; let value = 0; const out = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export function newTotpSecret() { return base32Encode(randomBytes(20)); }

export function totpCode(secret, time = Date.now(), step = 30) {
  const counter = Math.floor(time / 1000 / step);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const off = h[h.length - 1] & 15;
  const num = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(num % 1_000_000).padStart(6, '0');
}

// Accepts the current code and one step either side for clock drift.
export function verifyTotp(secret, code, time = Date.now()) {
  const c = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c) || !secret) return false;
  return [-1, 0, 1].some((d) => {
    const expected = Buffer.from(totpCode(secret, time + d * 30_000));
    return timingSafeEqual(expected, Buffer.from(c));
  });
}

export function otpauthUrl(secret, account, issuer) {
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// ---------- Tokens ----------
export function newToken() { return randomBytes(32).toString('base64url'); }
export function hashToken(t) { return createHash('sha256').update(String(t)).digest('hex'); }
