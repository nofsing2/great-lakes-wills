// Entry point. On Vercel, the exported Express app handles every request that isn't a
// file in public/. Locally, `npm start` runs it on http://localhost:3000.
import express from 'express';
import site from './server/app.js';
import { mode as paymentMode } from './server/payments.js';
import { mailMode } from './server/mail.js';
import { signinMode } from './server/signin.js';
import { storageMode } from './server/storage.js';
import { dbMode } from './server/db.js';

const app = express();
app.disable('x-powered-by');
app.use(site);
export default app;

if (!process.env.VERCEL) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`Great Lakes Wills & Estate on http://localhost:${port} — database: ${dbMode}, sign-in: ${signinMode}, files: ${storageMode}, email: ${mailMode}, payments: ${paymentMode}`));
}
