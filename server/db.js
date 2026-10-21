// Database access. Production uses Supabase Postgres through DATABASE_URL.
// Local development and tests use PGlite, a Postgres that runs inside Node.
//
// Queries are written with "?" placeholders; they're converted to $1, $2, … here.
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

const SCHEMA = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

const PROD = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
let client = null;
if (process.env.DATABASE_URL) {
  const { default: pg } = await import('pg');
  const url = process.env.DATABASE_URL;
  client = new pg.Pool({
    connectionString: url,
    max: Number(process.env.DB_POOL_MAX || 3),
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
  });
} else if (!PROD) {
  // Named through a variable so Vercel doesn't bundle this development-only package.
  const pkg = process.env.PGLITE_MODULE || ['@electric-sql', 'pglite'].join('/');
  const { PGlite } = await import(pkg);
  const dir = process.env.PGLITE_DIR; // unset = in memory
  if (dir) mkdirSync(dirname(dir), { recursive: true });
  client = new PGlite(dir);
}

export const dbMode = process.env.DATABASE_URL ? 'postgres' : client ? 'pglite' : 'none';

function toPg(sql) {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

// Creates or updates the tables when schema.sql changes. A fingerprint of the file is
// kept in the database, so a server starting up skips this when nothing changed.
const FINGERPRINT = createHash('sha256').update(SCHEMA).digest('hex').slice(0, 16);
async function applySchema() {
  try {
    const r = await client.query("SELECT value FROM app_meta WHERE key = 'schema'");
    if (r.rows[0]?.value === FINGERPRINT) return;
  } catch { /* first run: app_meta doesn't exist yet */ }
  await (client.exec ? client.exec(SCHEMA) : client.query(SCHEMA));
  await client.query("INSERT INTO app_meta (key, value) VALUES ('schema', $1) ON CONFLICT (key) DO UPDATE SET value = excluded.value", [FINGERPRINT]);
}

let ready;
export function ensureSchema() {
  if (!client) return Promise.reject(new Error('DATABASE_URL is not set.'));
  if (!ready) ready = applySchema().catch((e) => { ready = null; throw e; });
  return ready;
}

export async function query(sql, params = []) {
  await ensureSchema();
  const r = await client.query(toPg(sql), params);
  return r.rows;
}
export async function one(sql, params) { return (await query(sql, params))[0]; }
export async function many(sql, params) { return query(sql, params); }

export async function logEvent(matterId, actorId, action, detail = null) {
  await query('INSERT INTO events (matter_id, actor_id, action, detail) VALUES (?, ?, ?, ?)',
    [matterId ?? null, actorId ?? null, action, detail == null ? null : (typeof detail === 'string' ? detail : JSON.stringify(detail))]);
}

// Every table, for the attorney's data export.
export const TABLES = ['users', 'matters', 'payments', 'reviews', 'messages', 'revised_docs', 'uploads', 'events'];
