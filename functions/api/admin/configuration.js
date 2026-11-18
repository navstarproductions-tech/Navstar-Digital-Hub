import { requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, readJson } from '../../_shared/http.js';

const KEY = 'admin-configuration';
const MAX_BYTES = 48 * 1024;
const MAX_DEPTH = 5;

function clean(value, depth = 0) {
  if (depth > MAX_DEPTH) throw new Error('Settings data is nested too deeply.');
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Invalid number in settings.');
    return value;
  }
  if (typeof value === 'string') return value.slice(0, 8000);
  if (Array.isArray(value)) {
    if (value.length > 500) throw new Error('Too many entries in settings.');
    return value.map(item => clean(item, depth + 1));
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length > 120) throw new Error('Too many settings fields.');
    const result = {};
    for (const [key, item] of entries) {
      if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(key)) throw new Error('Invalid settings field name.');
      if (/password|secret|token|consumerkey|consumersecret|passkey|nationalid$|national_id/i.test(key)) throw new Error('Sensitive credentials and identity numbers cannot be stored in general settings.');
      result[key] = clean(item, depth + 1);
    }
    return result;
  }
  throw new Error('Unsupported settings value.');
}

async function readSettings(DB) {
  const row = await DB.prepare('SELECT value FROM system_state WHERE key = ?').bind(KEY).first();
  if (!row?.value) return {};
  try { const parsed = JSON.parse(row.value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; }
  catch { return {}; }
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('Settings database is not configured.', 503);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;
  return json({ settings: await readSettings(env.DB) });
}

export async function onRequestPut({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Settings database is not configured.', 503);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;
  let body;
  try { body = await readJson(request, MAX_BYTES); } catch { return error('Invalid settings request.'); }
  if (!body || typeof body.section !== 'string' || !/^[a-z][a-z0-9-]{1,79}$/.test(body.section) || !body.values || typeof body.values !== 'object' || Array.isArray(body.values)) return error('Choose a valid settings section and values.');
  let values;
  try { values = clean(body.values); } catch (e) { return error(e instanceof Error ? e.message : 'Invalid settings values.'); }
  const all = await readSettings(env.DB);
  all[body.section] = values;
  const serialized = JSON.stringify(all);
  if (new TextEncoder().encode(serialized).length > MAX_BYTES) return error('Settings are too large. Reduce the amount of text and try again.', 413);
  await env.DB.prepare('INSERT INTO system_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(KEY, serialized).run();
  return json({ settings: all, savedSection: body.section });
}
