// Email-code sign-in. Production: Supabase Auth sends and checks the code (its email
// goes out through Resend, configured in Supabase's SMTP settings). Without Supabase
// (local development and tests), codes are generated here and "emailed" to the log.
import { createClient } from '@supabase/supabase-js';
import { randomInt } from 'node:crypto';
import { query, one } from './db.js';
import { hashToken } from './security.js';
import { sendMail } from './mail.js';
import { FIRM } from '../public/engine/constants.js';

const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
export const signinMode = URL_ && ANON ? 'supabase' : 'local';

const supabase = signinMode === 'supabase'
  ? createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  : null;

// Sends a 6-digit code. Returns nothing; errors are thrown with a user-safe message.
export async function sendCode(email) {
  if (supabase) {
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) {
      if (error.status === 429) throw Object.assign(new Error('Please wait a minute before asking for another code.'), { status: 429 });
      throw Object.assign(new Error('We couldn’t send a code to that address. Check it and try again.'), { status: 400 });
    }
    return;
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await query(`INSERT INTO email_codes (email, code_hash, expires_at, attempts) VALUES (?, ?, now() + interval '10 minutes', 0)
    ON CONFLICT (email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0`, [email, hashToken(code)]);
  await sendMail({ to: email, subject: `Your ${FIRM.name} sign-in code`, text: `Your sign-in code is ${code}\n\nIt expires in 10 minutes. If you didn't ask for it, ignore this email.` });
}

// Checks a code. Returns { id, email } of the verified person, or throws.
export async function verifyCode(email, code) {
  const c = String(code || '').replace(/\s/g, '');
  if (!/^\d{6,10}$/.test(c)) throw Object.assign(new Error("Enter the code from the email."), { status: 400 });
  if (supabase) {
    const { data, error } = await supabase.auth.verifyOtp({ email, token: c, type: 'email' });
    if (error || !data?.user) throw Object.assign(new Error('That code is wrong or has expired. Request a new one.'), { status: 401 });
    return { id: data.user.id, email: (data.user.email || email).toLowerCase() };
  }
  const row = await one('SELECT *, expires_at < now() AS expired FROM email_codes WHERE email = ?', [email]);
  if (!row || row.expired || row.attempts >= 5) throw Object.assign(new Error('That code is wrong or has expired. Request a new one.'), { status: 401 });
  if (row.code_hash !== hashToken(c)) {
    await query('UPDATE email_codes SET attempts = attempts + 1 WHERE email = ?', [email]);
    throw Object.assign(new Error('That code is wrong or has expired. Request a new one.'), { status: 401 });
  }
  await query('DELETE FROM email_codes WHERE email = ?', [email]);
  const existing = await one('SELECT id FROM users WHERE email = ?', [email]);
  return { id: existing?.id || `local-${hashToken(email).slice(0, 24)}`, email };
}
