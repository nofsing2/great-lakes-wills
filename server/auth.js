// Sessions and access checks. People sign in with a one-time email code (signin.js);
// the server then issues its own session cookie. Only a hash of the cookie is stored.
import { randomBytes } from 'node:crypto';
import { query, one } from './db.js';
import { hashToken } from './security.js';

const SESSION_DAYS = 14;
export const COOKIE = 'glw_sid';

// Emails listed in ATTORNEY_EMAILS (comma-separated) get the attorney role on sign-in.
export function attorneyEmails() {
  return (process.env.ATTORNEY_EMAILS || process.env.ATTORNEY_EMAIL || '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
}
export const isAttorneyEmail = (email) => attorneyEmails().includes(String(email).toLowerCase());

// stage 'totp' is a 10-minute half-session: the email code was right, and the
// attorney still has to enter the authenticator code. It opens nothing else.
export async function createSession(userId, stage = 'full') {
  const token = randomBytes(32).toString('hex');
  const life = stage === 'full' ? `${SESSION_DAYS} days` : '10 minutes';
  await query(`INSERT INTO sessions (token, user_id, stage, expires_at) VALUES (?, ?, ?, now() + interval '${life}')`, [hashToken(token), userId, stage]);
  // Housekeeping: drop expired sessions now and then.
  if (Math.random() < 0.05) await query('DELETE FROM sessions WHERE expires_at < now()');
  return token;
}

export async function destroySession(token) {
  await query('DELETE FROM sessions WHERE token = ?', [hashToken(token)]);
}

export async function destroyUserSessions(userId) {
  await query('DELETE FROM sessions WHERE user_id = ?', [userId]);
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore bad cookie */ }
  }
  return out;
}

export function cookieHeader(token, { clear = false, stage = 'full' } = {}) {
  const secure = process.env.NODE_ENV === 'production' || process.env.VERCEL ? '; Secure' : '';
  if (clear) return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
  const age = stage === 'full' ? SESSION_DAYS * 86400 : 600;
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure}`;
}

// Attaches req.user when a valid session cookie is present.
export async function sessionMiddleware(req, _res, next) {
  try {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token && /^[0-9a-f]{64}$/.test(token)) {
      const row = await one(`SELECT u.id, u.email, u.name, u.role, u.totp_enabled, s.stage FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token = ? AND s.expires_at > now()`, [hashToken(token)]);
      req.sessionToken = token;
      if (row?.stage === 'full') req.user = { id: row.id, email: row.email, name: row.name, role: row.role, totpEnabled: row.totp_enabled };
      else if (row?.stage === 'totp') req.pendingUser = { id: row.id, email: row.email, role: row.role };
    }
    next();
  } catch (err) { next(err); }
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
  next();
}

// Both the stored role and the current ATTORNEY_EMAILS setting must agree, so
// removing an address from the setting takes away access at once.
export function requireAttorney(req, res, next) {
  if (!req.user || req.user.role !== 'attorney' || !isAttorneyEmail(req.user.email)) return res.status(403).json({ error: 'Attorney access only.' });
  next();
}

// Cross-site request protection for state-changing JSON calls: browsers cannot
// send this custom header cross-origin without a CORS preflight we never allow.
export function requireAjaxHeader(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  // Mounted under /api, so check the full URL. Signed-link uploads come without the header.
  const url = req.originalUrl || '';
  if (url.startsWith('/api/stripe/webhook') || url.startsWith('/api/local-storage/')) return next();
  if (req.get('X-Requested-With') !== 'greatlakeswills') return res.status(403).json({ error: 'Bad request origin.' });
  next();
}
