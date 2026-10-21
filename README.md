# Great Lakes Wills & Estate — Michigan estate planning with attorney review

A website where Michigan residents answer a short questionnaire, pay a flat fee, and receive a will and (optionally) a durable power of attorney, patient advocate designation, HIPAA authorization, and funeral representative designation — **each reviewed and approved by a Michigan attorney before the client can download it.**

## Going live

See **GO-LIVE.md**: GitHub → Vercel → Supabase → Resend → Stripe, the same services Guideline Desk uses.

## Run it

Requires Node 22.

```bash
npm install
npm run dev          # http://localhost:3000, data kept in ./data
```

With no settings, everything runs locally: an in-process Postgres (PGlite), files on disk, sign-in codes and emails printed to the terminal, and test-mode checkout.

- Clients start at `/`, enter their email, and type the 6-digit code.
- The attorney signs in the same way with an address listed in `ATTORNEY_EMAILS` (e.g. `ATTORNEY_EMAILS=you@firm.com npm run dev`) and lands on `/attorney.html`. In production the attorney must also turn on an authenticator app before client files appear.
- With no `STRIPE_SECRET_KEY`, checkout shows a "Complete test payment" button (never on Vercel).
- `npm test` runs 28 tests: the rules, every document type, the full client → payment → attorney approval → download flow over HTTP, sign-in limits, two-step sign-in, Stripe notices, and the Supabase Auth/Storage calls against a stand-in server.
- `npm run build-demo` writes `dist/demo.html`, a single-file browser demo with no server.

### Settings (environment variables)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Supabase Postgres (transaction pooler URI). Unset locally = PGlite (`PGLITE_DIR` to keep data) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | email-code sign-in through Supabase Auth |
| `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET` | private file storage (bucket defaults to `client-files`, created automatically) |
| `RESEND_API_KEY`, `MAIL_FROM` | outgoing email through Resend; without a key, emails print to the log |
| `FIRM_NOTIFY_EMAIL` | where new-order alerts go (defaults to the firm email) |
| `ATTORNEY_EMAILS` | comma-separated addresses that get the attorney dashboard |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe Checkout; webhook for `checkout.session.completed` at `/api/stripe/webhook` |
| `BASE_URL` | public address used in email links and Stripe return links |
| `REQUIRE_ATTORNEY_2FA=1` | require the authenticator app outside production too |

On Vercel all of these except `SUPABASE_BUCKET` and `REQUIRE_ATTORNEY_2FA` are required; the site refuses orders and `/healthz` lists what's missing until they're set.

## How it is built

```
server.js            Entry point (Vercel runs the exported Express app; npm start listens locally)
vercel.json          Security headers for the pages Vercel serves directly
public/              Static files served by Vercel's CDN
  engine/            Shared by browser and server (plain ES modules, no dependencies)
    constants.js     2026 EPIC amounts, federal exemption, fees, firm details  ← edit firm info and prices here
    questions.js     The questionnaire as data: steps, fields, show-if logic, validation
    rules.js         The decision algorithm: stop / attorney / note flags with citations, document list, price
    intestacy.js     MCL 700.2102–.2103 calculator (landing page)
    summary.js       Plain-English plan summary
    docs/            Document generators: will, statutory POA + agent acknowledgment, patient advocate
                     designation + acceptance, HIPAA, funeral rep, property list, signing, deposit, courtesy letters
    render-html.js   Document → HTML preview
  index.html, app.js, attorney.js, privacy.html, terms.html, demo.html …
server/
  app.js             Routes: sign-in, client plan, checkout, uploads, attorney review
  db.js, schema.sql  Postgres (Supabase) with row level security on every table; PGlite locally
  auth.js, signin.js Sessions (hashed cookies), Supabase email codes, attorney authenticator codes
  storage.js         Private Supabase Storage bucket with short-lived signed links
  mail.js            Resend email templates (no plan details in email)
  payments.js        Stripe Checkout, refunds, webhook signatures
  render-pdf.js, render-docx.js, engagement.js, security.js, headers.js
test/                Engine and end-to-end tests
docs/michigan-law-notes.md   The law each rule implements, with citations
```

### The questionnaire algorithm

1. **Branching.** Steps and fields declare `showIf(answers, context)`. Couples get matching wills plus one POA/PAD/funeral step per spouse. Children's ages drive guardian and trust questions; stepchildren drive the "treat as my own" question.
2. **Screening (`rules.js`).** Every answer set is evaluated into flags:
   - **stop** — outside a flat-fee plan; checkout is blocked and the client can request a consultation (non-Michigan domicile, under 18, completing for someone else, estate over the federal exemption, SSI/Medicaid beneficiary, Medicaid planning, living trust).
   - **attorney** — allowed, but the attorney must tick each one off before approval (beneficiary helping, divorce pending, marital agreement, spouse left out under MCL 700.2202, blended family, other living parent of a minor, out-of-state real estate, business, community property, intentional omission, broad POA gifting, and more).
   - **note** — guidance shown to client and attorney.
3. **Document assembly.** `generatePackage(answers)` returns the flag set, price, and document models; the same models render to HTML and to Word.
4. **Extra services.** An optional last step offers (a) depositing the signed will with the client's county probate court under MCL 700.2515 ($25 court fee under MCL 600.880c(2)) and (b) courtesy packets to people the client chooses, each with a role letter, an optional plain-English plan overview, copies of the documents that name them, and any acknowledgment or acceptance they must sign. After approval the client uploads signed copies and mails the original will; the attorney works an after-signing checklist and marks the matter complete.
5. **Review gate.** The server will not approve until the checklist is complete: conflict check, identity, documents read, attorney notes addressed, every non-note flag resolved, and a private call whenever a beneficiary helped. Clients see documents only after approval. The attorney can upload a revised .docx for any document; the client then gets that file instead.

## Before going live — decisions for the firm

These are deliberately left as placeholders or defaults for a Michigan attorney to decide:

1. **Firm details and prices** in `public/engine/constants.js`. Set: Truckey Nofsinger, LLP; Luke Nofsinger (P79495); 38 N. Main St., Three Rivers, Michigan 49093; (269) 273-5657; luke@truckeynofsinger.com. Prices: will $295 / $445, complete plan $595 / $895, rush $125. Mailing is a courtesy: will-deposit handling and courtesy packets are free; the client pays only the $25 court fee per deposited will. Change `FEES` to adjust.
2. **Engagement agreement** in `server/engagement.js` (version `2026-10-v1`). Decided: limited-scope engagement under MRPC 1.2(b); flat fee earned upon receipt and deposited to the operating account, refunded in full if the firm declines after its conflict check. Connect Stripe payouts to the operating account. Note SBM Informal Ethics Opinion RI-69, which treats a fixed fee for future services as unearned until earned; confirm your approach against it and any later rule change. The engagement lists the deposit and courtesy-packet services when ordered and states that court fees are held in trust until paid. Stripe settles a whole order to one bank account, so route the court-fee portion to the client trust account (a legal payment processor such as LawPay can split operating and trust deposits).
3. **Structure.** Built to be operated by the law firm itself. SBM Ethics Opinion R-25 treats for-profit platforms that take a percentage of attorney fees or route clients to lawyers as improper referral services and fee sharing (MRPC 6.3(b), 5.4, 7.2(c)). If a separate company will own the site, that structure needs its own ethics review.
4. **Drafting review.** Read every template in `public/engine/docs/` against your own forms. Points worth your judgment: 30-day survival clause; MUTMA custodianship to 21 when no trust is chosen; $25,000 small-gift and $50,000 small-trust thresholds; spendthrift clause; the HIPAA authorization's 2-year post-death expiration; whether the PAD should include a living-will statement or a separate document.
5. **Advertising.** Landing page copy is marked "Attorney advertising"; check it against MRPC 7.1–7.3.
6. **Data.** Answers contain sensitive personal information. Supabase encrypts data at rest; every table has row level security on with no public access, files sit in a private bucket reachable only through 60-second signed links, and the browser never talks to the database directly. Use Supabase Pro for daily backups and export weekly from the dashboard.
7. **Annual update.** Each January, update `EPIC_AMOUNTS` from Treasury's EPIC cost-of-living notice and `FEDERAL_EXEMPTION`.

## Sources

Statutes were read from legislature.mi.gov (Michigan Compiled Laws complete through PA 103 of 2026). Practice points were checked against ICLE's *Michigan Estate Planning Handbook* (current to 10/09/26); no ICLE form language is used. See `docs/michigan-law-notes.md`.

## Launch plan

**Blocking — before the first paying client**
1. Red-line every template (start with the sample package) and finalize the engagement agreement and fee handling (RI-69; court fees to trust).
2. Confirm malpractice coverage for an online, limited-scope, flat-fee practice; add cyber liability coverage.
3. Confirm the Truckey Nofsinger partners approve the practice, the trade name "Great Lakes Wills & Estate" (MRPC 7.5: no implied government or nonprofit connection), and a firm-wide conflict process. File a Certificate of Assumed Name for the LLP with Michigan LARA, run a USPTO trademark search, and register the domain.
4. Hosting: Vercel + Supabase + Resend + Stripe (GO-LIVE.md); a domain; privacy policy, terms of use, and attorney-advertising disclaimer (done).
5. Code: done. Email-code sign-in (no passwords), required authenticator app for the attorney, email notifications without plan details, PDF and Word downloads, direct-to-storage uploads, database-backed rate limits, security headers, data export, and a health check that lists missing settings.
6. Payments: live Stripe or LawPay keys and webhook, with trust/operating routing.
7. Test the whole flow with two or three real friendly clients before public launch.

**Soon after launch**
- Sync paid matters into Clio (contacts, matter, documents) and run the conflict search there.
- Booking links for attorney calls, paid consultations (for "stop" cases), and an optional in-office signing appointment in Three Rivers with witnesses and notary.
- Each January: update EPIC cost-of-living amounts and the federal exemption; watch ICLE probate updates for statute changes.

**Growth**
- Google Business Profile and local search for St. Joseph, Kalamazoo, Branch, and Cass counties; plain-language articles on Michigan wills.
- Relationships with financial advisors, CPAs, and funeral homes (no payment for referrals, MRPC 7.2(c)).
- Annual "review your plan" reminders; upgrade path to trust-based plans and probate work.
