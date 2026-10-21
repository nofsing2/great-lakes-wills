// Preview password gate. Vercel runs this before every request (see "proxy" in
// vercel.json), so pages, files and the API all stay private until launch.
// Stripe's payment notices and the /healthz status check are left open.
//
// To change the password: set PREVIEW_PASSWORD_SHA256 in Vercel to the SHA-256 (hex)
// of "glw-preview:" + the new password. To open the site to the public at launch:
// set PREVIEW_GATE=off (or remove "proxy" from vercel.json) and redeploy.
import { next } from '@vercel/functions';

// SHA-256 of "glw-preview:estateplan".
const DEFAULT_HASH = 'c4b4a1e0adf280bd6129b808edeedbc60cf94123d062f0ed050c94d3d6f452e6';
const COOKIE = 'glw_preview';
const OPEN_PATHS = ['/api/stripe/webhook', '/healthz'];

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function cookieValue(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function gatePage(nextPath, error) {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Preview — Great Lakes Wills &amp; Estate</title>
<style>
:root{--bg:#f4f7fa;--card:#fff;--text:#14212e;--muted:#5a6b7c;--line:#c9d4df;--blue:#0b4f8a;--on-blue:#fff;--err:#a3283a}
@media (prefers-color-scheme:dark){:root{--bg:#0f1822;--card:#16212d;--text:#e8eef4;--muted:#9fb0c0;--line:#2b3a48;--blue:#9cc4ea;--on-blue:#0f1822;--err:#f08a99}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--bg);color:var(--text);font:18px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{width:100%;max-width:420px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:32px}
h1{margin:0 0 8px;font-size:26px;line-height:1.2}p{margin:0 0 20px;color:var(--muted)}
label{display:block;font-weight:600;margin-bottom:6px}
input{width:100%;font:inherit;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--text)}
input:focus,button:focus{outline:3px solid #2b7bd6;outline-offset:2px}
button{margin-top:16px;width:100%;min-height:48px;font:inherit;font-weight:700;background:var(--blue);color:var(--on-blue);border:0;border-radius:10px;cursor:pointer}
.err{color:var(--err);font-weight:600;margin:12px 0 0}
</style></head><body><main>
<h1>Great Lakes Wills &amp; Estate</h1>
<p>This site is in private preview. Enter the password to continue.</p>
<form method="post" action="/__preview">
<input type="hidden" name="next" value="${esc(nextPath)}">
<label for="pw">Password</label>
<input id="pw" name="password" type="password" autocomplete="current-password" required autofocus>
${error ? '<p class="err" role="alert">That password didn’t work. Try again.</p>' : ''}
<button type="submit">Continue</button>
</form></main></body></html>`;
  return new Response(html, {
    status: 401,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}

// Only same-site paths may follow the gate, so it can't send people elsewhere.
const safeNext = (p) => (typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') && !p.startsWith('/\\') ? p : '/');

export default async function proxy(request) {
  const env = globalThis.process?.env || {};
  if (String(env.PREVIEW_GATE || '').toLowerCase() === 'off') return next();
  const url = new URL(request.url);
  if (OPEN_PATHS.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))) return next();

  const expected = (env.PREVIEW_PASSWORD_SHA256 || DEFAULT_HASH).toLowerCase();

  if (url.pathname === '/__preview' && request.method === 'POST') {
    const form = await request.formData().catch(() => null);
    const password = String(form?.get('password') || '');
    const target = safeNext(String(form?.get('next') || '/'));
    if (password && (await sha256(`glw-preview:${password}`)) === expected) {
      return new Response(null, {
        status: 303,
        headers: {
          Location: target,
          'Set-Cookie': `${COOKIE}=${expected}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 86400}`,
          'Cache-Control': 'no-store',
        },
      });
    }
    return gatePage(target, true);
  }

  if (cookieValue(request, COOKIE) === expected) return next();

  if (url.pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'This site is in private preview.' }), {
      status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
  return gatePage(url.pathname + url.search, false);
}
