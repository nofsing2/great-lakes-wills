# Go-live runbook — Great Lakes Wills & Estate

The site runs on the same services as Guideline Desk: **GitHub** (code) → **Vercel** (website and server) → **Supabase** (database, email-code sign-in, private file storage) → **Resend** (email) → **Stripe** (payments), plus Google Fonts. Use a **new** Supabase project and a **new** GitHub repository so client files never share a database with Guideline Desk.

Follow in order. About two hours, most of it waiting on DNS.

**Status (Oct. 21, 2026):** steps 1–5 done. Domains greatlakeswills.com and greatlakeswillsandestate.com (Vercel, auto-renew); site at **https://www.greatlakeswills.com** (the other names redirect there). Supabase project `great-lakes-wills` (ref `mnwgsetzquwwddgsmnyd`, org Truckey Nofsinger, LLP, Pro, us-east-1). Resend domain greatlakeswills.com verified. Remaining: Stripe (step 6) and the checks after it.

## 0. Before anything is public (you)
- [x] Engagement agreement, privacy policy, terms, and sample package reviewed (Oct. 2026).
- [ ] Partner approval; malpractice carrier confirms coverage for an online limited-scope practice; cyber liability quote.
- [ ] LARA: Certificate of Assumed Name for Truckey Nofsinger, LLP ("Great Lakes Wills & Estate"); USPTO trademark search.

## 1. Domain
Buy **greatlakeswills.com** (Cloudflare Registrar or Porkbun). Below, `DOMAIN` means that name. You'll add DNS records for Resend (step 4) and Vercel (step 5) there.

## 2. GitHub
Create an **empty private** repository named `great-lakes-wills` under `nofsing2` (don't add a README or license). Tell me when it exists and I'll push the code; or upload the contents of the zip yourself.

## 3. Supabase (new project)
1. **New project** in your organization: name `great-lakes-wills`, region **East US (North Virginia)** (next to Vercel's servers), a strong database password (save it in your password manager).
   Use the **Pro plan** for this project: daily backups, and free projects pause after a week without visits.
2. **Project Settings → API Keys**: copy the **Project URL**, the **publishable** key (older projects call it `anon`), and the **secret** key (older: `service_role`). The secret key goes only into Vercel, never into any web page.
3. **Connect** (top of the dashboard) → **Connection string** → **Transaction pooler**. Copy the URI and put your database password into it. This is `DATABASE_URL`.
4. **Authentication → Sign In / Providers → Email**: Email enabled, **Confirm email** on, **Email OTP Expiration** `600` seconds, **Email OTP Length** `6` (Supabase's default is 8).
   When creating the project, turn **Data API off**: the site's server talks to Postgres directly, so the public table API isn't needed.
5. **Authentication → Emails → Templates**: edit both **Magic Link** and **Confirm signup** so they send a code instead of a link:
   - Subject: `Your Great Lakes Wills & Estate sign-in code`
   - Body:
     ```html
     <p>Your sign-in code is</p>
     <p style="font-size:24px;font-weight:bold;letter-spacing:3px">{{ .Token }}</p>
     <p>It expires in 10 minutes. If you didn't ask for it, ignore this email.</p>
     <p style="color:#666">Great Lakes Wills &amp; Estate · Truckey Nofsinger, LLP · 38 N. Main St., Three Rivers, Michigan 49093 · (269) 273-5657</p>
     ```
6. **Authentication → Emails → SMTP Settings** (after step 4 below): enable custom SMTP — host `smtp.resend.com`, port `465`, username `resend`, password = a Resend API key, sender email `notices@DOMAIN`, sender name `Great Lakes Wills & Estate`. Then raise **Rate Limits → emails per hour** to about 100.

The tables, their security settings, and the private `client-files` bucket are created automatically the first time the site runs. (You can also paste `server/schema.sql` into the SQL Editor; it is safe to run more than once.)

## 4. Resend
1. **Domains → Add domain** → `DOMAIN`. Add the DNS records it lists at your registrar, then **Verify**.
2. **API Keys → Create** a key with sending access, named `great-lakes-wills`. This is `RESEND_API_KEY` (use it, or a second key, as the Supabase SMTP password in step 3.6).

Emails go out from `notices@DOMAIN`; replies go to luke@truckeynofsinger.com. They never contain plan details.

## 5. Vercel
1. **Add New → Project** in the `guideline-desk` team → import `nofsing2/great-lakes-wills`. Vercel detects Express; leave build settings as they are.
   This site takes payments, so it needs a **Pro** team (Vercel's free Hobby plan is for non-commercial use).
2. **Environment Variables** (Production only, so preview links of unfinished changes can't touch client data):

| Name | Value |
|---|---|
| `DATABASE_URL` | `postgresql://postgres.<project-ref>:<password>@aws-0-us-east-1.pooler.supabase.com:6543/postgres` (Supabase's shared pooler; the "dedicated pooler" address the Connect panel shows first is IPv6-only and won't work from Vercel) |
| `SUPABASE_URL` | Supabase Project URL, e.g. `https://abcd1234.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase publishable (anon) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase secret (service_role) key |
| `RESEND_API_KEY` | from step 4.2 |
| `MAIL_FROM` | `Great Lakes Wills & Estate <notices@DOMAIN>` |
| `FIRM_NOTIFY_EMAIL` | `luke@truckeynofsinger.com` (new orders, messages, uploads) |
| `ATTORNEY_EMAILS` | `luke@truckeynofsinger.com` (comma-separate to add a reviewing attorney) |
| `STRIPE_SECRET_KEY` | `sk_test_…` for now (step 6) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` (step 6) |
| `BASE_URL` | `https://www.DOMAIN` (no trailing slash; Vercel serves the www name and redirects the bare domain to it) |
| `NODEJS_HELPERS` | `0` (passes Stripe's payment notices through untouched so their signature checks) |

3. **Deploy**. Then **Settings → Domains**: add `DOMAIN` and `www.DOMAIN` and add the DNS records Vercel shows. HTTPS is automatic.

## 6. Stripe (start in test mode)
1. **Developers → API keys**: copy the **test** secret key into `STRIPE_SECRET_KEY`.
2. **Developers → Webhooks → Add destination**: endpoint `https://www.DOMAIN/api/stripe/webhook`, event `checkout.session.completed`. Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
3. Vercel → **Deployments → Redeploy** so the new settings take effect.

## 7. Check the setup
Open `https://www.DOMAIN/healthz`. It should say `{"ok":true}`. If it lists `missing` settings, add them in Vercel and redeploy; until then the site shows "being set up" instead of taking orders.

## 8. First attorney sign-in (you)
1. Go to `https://www.DOMAIN/app.html#/login`, enter luke@truckeynofsinger.com, and type the emailed code.
2. You'll be asked to **turn on two-step sign-in**: scan the QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password). Client files stay hidden until this is on. From then on you sign in with the emailed code plus the app's code.
3. In the review queue, click **Export all data** to confirm exports work.

## 9. Test order (test mode, no real money)
1. In a private window, sign in with a different email and complete a plan with will deposit and courtesy packets.
2. Pay with card `4242 4242 4242 4242`, any future date, any CVC. Confirm the "New plan to review" email and that the plan appears in your queue.
3. Approve it. Confirm the client email arrives, the PDF and Word downloads open, and a signed-copy upload (try a phone photo) shows up on your matter page.
4. Place a second test order and **Decline** it; confirm the refund in Stripe's test dashboard.

## 10. Switch to live payments
1. Stripe: activate the account and connect the firm's **operating** account for payouts. (Court fees of $25 per deposited will arrive in the same payout; move them to IOLTA, or ask me to add LawPay, which deposits them to trust directly.)
2. Copy the **live** secret key, add a **live** webhook with the same URL and event, update both settings in Vercel, and redeploy.
3. Place one real order with your own card, then decline it to refund.

## 11. Open the site to the public
The whole site is behind a preview password (proxy.js) until launch; Stripe's payment notices and /healthz stay open. To launch: Vercel → Settings → Environment Variables → add `PREVIEW_GATE` = `off` (Production) → redeploy. To change the preview password instead, set `PREVIEW_PASSWORD_SHA256` to the SHA-256 hex of `glw-preview:` + the new password.

## 12. Soft launch, then announce
- Two or three friendly clients first; fix anything confusing.
- Google Business Profile listing the website; tell referral sources.

## Ongoing
- **Each January:** update `EPIC_AMOUNTS` and `FEDERAL_EXEMPTION` in `public/engine/constants.js`; commit, and Vercel redeploys.
- **Weekly:** **Export all data** from the review queue to firm storage. Supabase Pro also keeps daily database backups; signed copies stay in the private `client-files` bucket.
- **Code changes:** every push to the `main` branch on GitHub deploys automatically. Other branches get a preview link first.
- Watch ICLE probate updates for statute changes that affect the templates.
