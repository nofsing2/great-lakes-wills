// Private file storage. Production: a private Supabase Storage bucket, reached with the
// service-role key on the server; browsers upload and download only through short-lived
// signed links. Without Supabase: files on local disk, with the same signed-link flow.
import { createClient } from '@supabase/supabase-js';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const URL_ = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const BUCKET = process.env.SUPABASE_BUCKET || 'client-files';
export const storageMode = URL_ && SERVICE ? 'supabase' : 'local';

const admin = storageMode === 'supabase'
  ? createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

let bucketReady;
async function ensureBucket() {
  if (!admin) return;
  if (!bucketReady) {
    bucketReady = (async () => {
      const { data } = await admin.storage.getBucket(BUCKET);
      if (!data) {
        const { error } = await admin.storage.createBucket(BUCKET, { public: false, fileSizeLimit: '25MB' });
        if (error && !/exist/i.test(error.message)) throw error;
      }
    })();
  }
  return bucketReady;
}

// ---------- Local mode ----------
const LOCAL_DIR = process.env.LOCAL_STORAGE_DIR || new URL('../data/storage/', import.meta.url).pathname;
const SECRET = process.env.LOCAL_STORAGE_SECRET || randomBytes(32).toString('hex');
const sign = (s) => createHmac('sha256', SECRET).update(s).digest('base64url');
function localToken(op, path, seconds) {
  const payload = Buffer.from(JSON.stringify({ op, path, exp: Date.now() + seconds * 1000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
export function checkLocalToken(token, op) {
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig) return null;
  const a = Buffer.from(sign(payload)); const b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (data.op !== op || data.exp < Date.now()) return null;
  return data.path;
}
const localPath = (p) => join(LOCAL_DIR, p.replace(/\.\./g, ''));
export function localWrite(path, buf) { mkdirSync(dirname(localPath(path)), { recursive: true }); writeFileSync(localPath(path), buf); }
export function localRead(path) { return existsSync(localPath(path)) ? readFileSync(localPath(path)) : null; }

// ---------- Public API ----------
export async function putObject(path, buf, contentType) {
  if (!admin) { localWrite(path, buf); return; }
  await ensureBucket();
  const { error } = await admin.storage.from(BUCKET).upload(path, buf, { contentType, upsert: true });
  if (error) throw error;
}

// Where the browser should PUT the file. Valid for a short time and only for this path.
export async function signedUpload(path, contentType) {
  if (!admin) return { url: `/api/local-storage/upload?token=${encodeURIComponent(localToken('put', path, 900))}`, headers: { 'Content-Type': contentType } };
  await ensureBucket();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) throw error;
  return { url: data.signedUrl, headers: { 'Content-Type': contentType, 'x-upsert': 'false', apikey: process.env.SUPABASE_ANON_KEY || '' } };
}

// A link that downloads the file for the next 60 seconds.
export async function signedDownload(path, filename) {
  if (!admin) return `/api/local-storage/download?token=${encodeURIComponent(localToken('get', path, 60))}&name=${encodeURIComponent(filename)}`;
  await ensureBucket();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 60, { download: filename });
  if (error) throw error;
  return data.signedUrl;
}

export async function exists(path) {
  if (!admin) return !!localRead(path);
  const dir = path.split('/').slice(0, -1).join('/');
  const name = path.split('/').pop();
  const { data } = await admin.storage.from(BUCKET).list(dir, { search: name });
  return !!data?.some((f) => f.name === name);
}

export async function removeObject(path) {
  if (!admin) { rmSync(localPath(path), { force: true }); return; }
  await admin.storage.from(BUCKET).remove([path]);
}
