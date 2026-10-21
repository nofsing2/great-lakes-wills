// Outgoing email through Resend (RESEND_API_KEY). Without a key, emails are printed
// to the server log instead (local development and tests).
//
// Emails never contain plan details or message text: they say something changed and
// link back to the site, where the reader must sign in. Email is not a secure channel.
import { FIRM } from '../public/engine/constants.js';

const KEY = process.env.RESEND_API_KEY;
export const mailMode = KEY ? 'resend' : 'log';
const FROM = process.env.MAIL_FROM || `${FIRM.name} <${FIRM.email}>`;
export const firmInbox = () => process.env.FIRM_NOTIFY_EMAIL || FIRM.email;
const base = () => (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

const SIGNATURE = `\n\n${FIRM.name}\n${FIRM.legalEntity}\n${FIRM.address}\n${FIRM.phone}\n\nThis email was sent by a law firm. Do not reply with private information; sign in to send a secure message.`;

export const sentLog = []; // last messages, for tests

export async function sendMail({ to, subject, text }) {
  if (!to) return;
  const body = text + SIGNATURE;
  sentLog.push({ to, subject, text: body });
  if (sentLog.length > 50) sentLog.shift();
  if (!KEY) {
    if (process.env.NODE_ENV !== 'test') console.log(`[mail] to=${to} | ${subject}\n${body}\n`);
    return;
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject, text: body, reply_to: FIRM.email }),
    });
    if (!r.ok) console.error(`[mail] Resend refused "${subject}": ${r.status} ${(await r.text()).slice(0, 200)}`);
  } catch (err) {
    console.error(`[mail] failed to send "${subject}": ${err.message}`);
  }
}

// One place for every message the site sends.
export const emails = {
  // To the firm
  newOrder: (id) => ({ subject: `New plan to review (#${id})`, text: `A client paid and submitted plan #${id} for review.\n\n${base()}/attorney.html#/m/${id}` }),
  consult: (id) => ({ subject: `Consultation request (#${id})`, text: `A visitor whose plan needs more than the flat-fee package asked for a consultation (#${id}).\n\n${base()}/attorney.html#/m/${id}` }),
  resubmitted: (id) => ({ subject: `Plan #${id} resubmitted`, text: `The client updated their answers after your change request.\n\n${base()}/attorney.html#/m/${id}` }),
  clientMessage: (id) => ({ subject: `New message on plan #${id}`, text: `The client sent you a message.\n\n${base()}/attorney.html#/m/${id}` }),
  signedUploaded: (id) => ({ subject: `Signed documents uploaded (#${id})`, text: `The client uploaded signed documents for plan #${id}.\n\n${base()}/attorney.html#/m/${id}` }),
  // To the client
  approved: () => ({ subject: 'Your estate plan documents are ready', text: `Your attorney approved your documents. Sign in to download them and read the signing instructions before you sign.\n\n${base()}/app.html#/status` }),
  changes: () => ({ subject: 'Your attorney has a question about your plan', text: `Your attorney asked for a change or more information. Sign in to read the message and update your answers.\n\n${base()}/app.html#/status` }),
  attorneyMessage: () => ({ subject: 'New message from your attorney', text: `You have a new message about your estate plan. Sign in to read it.\n\n${base()}/app.html#/status` }),
  declined: () => ({ subject: 'About your estate plan order', text: `Your attorney sent you a message about your order, and your payment has been refunded. Sign in to read it.\n\n${base()}/app.html#/status` }),
  completed: () => ({ subject: 'Your estate plan is complete', text: `Everything you ordered is done, including the after-signing services. Thank you for choosing us.\n\n${base()}/app.html#/status` }),
};
