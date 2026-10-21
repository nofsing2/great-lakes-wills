// Test server: in-memory Postgres (PGlite), local file storage, and email written to
// a log that tests can read sign-in codes from.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function startServer(env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'glw-'));
  for (const k of ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'STRIPE_SECRET_KEY', 'VERCEL', 'PGLITE_DIR']) delete process.env[k];
  process.env.NODE_ENV = 'test';
  process.env.LOCAL_STORAGE_DIR = join(dir, 'storage');
  process.env.ATTORNEY_EMAILS = 'attorney@example.com';
  Object.assign(process.env, env);
  const { default: app } = await import('../server/app.js');
  const { sentLog } = await import('../server/mail.js');
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  function client() {
    let cookie = '';
    const call = async (path, { method = 'GET', body, headers = {}, raw = false, redirect = 'follow' } = {}) => {
      const url = path.startsWith('http') ? path : base + path;
      const r = await fetch(url, {
        method,
        redirect,
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'greatlakeswills', ...(cookie ? { Cookie: cookie } : {}), ...headers },
        body: body === undefined ? undefined : (Buffer.isBuffer(body) ? body : JSON.stringify(body)),
      });
      const sc = r.headers.get('set-cookie');
      if (sc) cookie = sc.split(';')[0];
      if (raw) return r;
      const data = r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text();
      return { status: r.status, data, headers: r.headers };
    };
    return call;
  }

  const lastMailTo = (to) => [...sentLog].reverse().find((m) => m.to === to);
  const codeFor = (email) => lastMailTo(email).text.match(/sign-in code is (\d{6})/)[1];

  // Signs in with an emailed code and returns the signed-in client (and the verify reply).
  async function signIn(email, { name } = {}) {
    const c = client();
    const s = await c('/api/auth/start', { method: 'POST', body: { email } });
    if (s.status !== 200) throw new Error(`start failed: ${JSON.stringify(s.data)}`);
    const v = await c('/api/auth/verify', { method: 'POST', body: { email, code: codeFor(email) } });
    c.verify = v;
    if (name && v.data.needsName) await c('/api/me', { method: 'PUT', body: { name } });
    return c;
  }

  const stop = () => { server.close(); rmSync(dir, { recursive: true, force: true }); };
  return { base, client, signIn, sentLog, lastMailTo, codeFor, stop };
}
