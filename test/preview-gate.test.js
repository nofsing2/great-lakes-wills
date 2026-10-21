// The private-preview password gate that runs in front of the site on Vercel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import proxy from '../proxy.js';

const base = 'https://www.greatlakeswills.com';
const isNext = (r) => r.headers.get('x-middleware-next') === '1';
delete process.env.PREVIEW_GATE;
delete process.env.PREVIEW_PASSWORD_SHA256;

async function signIn(password, nextPath = '/') {
  const body = new URLSearchParams({ password, next: nextPath });
  return proxy(new Request(`${base}/__preview`, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }));
}

test('pages, files and the API are locked without the password', async () => {
  const page = await proxy(new Request(`${base}/`));
  assert.equal(page.status, 401);
  assert.match(await page.text(), /private preview/);
  assert.equal(page.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal((await proxy(new Request(`${base}/app.html`))).status, 401);
  assert.equal((await proxy(new Request(`${base}/img/luke-nofsinger.jpeg`))).status, 401);
  const api = await proxy(new Request(`${base}/api/me`));
  assert.equal(api.status, 401);
  assert.match(api.headers.get('content-type'), /json/);
});

test('the right password sets a cookie that opens the site; the wrong one does not', async () => {
  const bad = await signIn('wrong');
  assert.equal(bad.status, 401);
  assert.match(await bad.text(), /didn’t work/);
  const ok = await signIn('estateplan', '/app.html');
  assert.equal(ok.status, 303);
  assert.equal(ok.headers.get('location'), '/app.html');
  const cookie = ok.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly; Secure; SameSite=Lax/);
  const pair = cookie.split(';')[0];
  assert.ok(isNext(await proxy(new Request(`${base}/`, { headers: { cookie: pair } }))));
  assert.ok(isNext(await proxy(new Request(`${base}/api/me`, { headers: { cookie: `other=1; ${pair}` } }))));
  assert.equal((await proxy(new Request(`${base}/`, { headers: { cookie: 'glw_preview=guess' } }))).status, 401);
});

test('it never redirects off the site', async () => {
  for (const evil of ['https://evil.example/', '//evil.example', '/\\evil.example']) {
    assert.equal((await signIn('estateplan', evil)).headers.get('location'), '/');
  }
});

test('Stripe notices and the status check stay open; the gate can be switched off', async () => {
  assert.ok(isNext(await proxy(new Request(`${base}/api/stripe/webhook`, { method: 'POST', body: '{}' }))));
  assert.ok(isNext(await proxy(new Request(`${base}/healthz`))));
  process.env.PREVIEW_GATE = 'off';
  assert.ok(isNext(await proxy(new Request(`${base}/`))));
  delete process.env.PREVIEW_GATE;
});
