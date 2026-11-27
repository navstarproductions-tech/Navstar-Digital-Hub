import { sha256 } from '../../../_shared/auth.js';
import { error, json, uuid } from '../../../_shared/http.js';

const allowedOrigins = new Set(['https://navstardigitalhub.co.ke', 'https://www.navstardigitalhub.co.ke', 'https://navstardigitalhub.base44.app', 'https://app.base44.com']);
const corsHeaders = (origin) => ({
  'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'null',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '600',
  'Vary': 'Origin'
});

function bearer(request) {
  const value = request.headers.get('Authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

async function secureRecord(value) {
  if (Array.isArray(value)) return Promise.all(value.map(secureRecord));
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (/password|credential|biometric|fingerprint|approval_token/i.test(key)) {
      continue;
    }
    if (/^(student_password|password|login_password|portal_password)$/i.test(key) && typeof item === 'string' && item.length) {
      const saltBytes = crypto.getRandomValues(new Uint8Array(16));
      let binary = '';
      for (const byte of saltBytes) binary += String.fromCharCode(byte);
      const salt = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(item), 'PBKDF2', false, ['deriveBits']);
      const saltBase64 = salt.replace(/-/g, '+').replace(/_/g, '/');
      const padded = saltBase64 + '='.repeat((4 - saltBase64.length % 4) % 4);
      const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: Uint8Array.from(atob(padded), c => c.charCodeAt(0)), iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256);
      let hashBinary = '';
      for (const byte of new Uint8Array(bits)) hashBinary += String.fromCharCode(byte);
      out[key + '_credential'] = { algorithm: 'PBKDF2-SHA256', iterations: 100000, salt, hash: btoa(hashBinary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') };
      out[key + '_migration_state'] = 'securely_hashed';
    } else {
      out[key] = await secureRecord(item);
    }
  }
  return out;
}

export async function onRequestOptions({ request }) {
  const origin = request.headers.get('Origin') || '';
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin') || '';
  if (!allowedOrigins.has(origin)) return error('Origin not allowed.', 403);
  const headers = corsHeaders(origin);
  const token = bearer(request);
  if (!token || !env.DB) return new Response(JSON.stringify({ error: 'A valid migration token is required.' }), { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } });
  const tokenHash = await sha256(token);
  const tokenRow = await env.DB.prepare('SELECT token_hash, expires_at, used_at FROM base44_migration_tokens WHERE token_hash=?').bind(tokenHash).first();
  if (!tokenRow || tokenRow.used_at || new Date(tokenRow.expires_at).getTime() < Date.now()) {
    return new Response(JSON.stringify({ error: 'Migration token is invalid, expired, or already completed.' }), { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } });
  }
  let body;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON payload.' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } }); }
  const entityName = String(body?.entityName || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 63);
  const allowedEntities = new Set(['Enrollment', 'FeeStructure', 'FeePayment', 'AdditionalFee', 'SystemUser', 'StaffApplication']);
  if (!allowedEntities.has(entityName)) return new Response(JSON.stringify({ error: 'This migration accepts student enrolments, fee records, staff accounts and staff applications. Passwords and biometric data are excluded; accounts require password reset on the official site.' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
  const records = Array.isArray(body?.records) ? body.records : [];
  const batchId = tokenHash;
  if (!entityName || records.length < 1 || records.length > 100) return new Response(JSON.stringify({ error: 'Each batch must contain 1–100 records and a valid entity name.' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
  let imported = 0;
  for (const source of records) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
    const sourceId = String(source.id ?? source._id ?? source.uuid ?? '').slice(0, 200);
    if (!sourceId) continue;
    const safe = await secureRecord(source);
    const jsonValue = JSON.stringify(safe);
    await env.DB.prepare(`
      INSERT INTO base44_legacy_records (id, entity_name, source_id, source_created_at, source_updated_at, record_json, migration_batch)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(entity_name, source_id) DO UPDATE SET
        source_created_at=excluded.source_created_at,
        source_updated_at=excluded.source_updated_at,
        record_json=excluded.record_json,
        imported_at=CURRENT_TIMESTAMP,
        migration_batch=excluded.migration_batch
    `).bind(uuid(), entityName, sourceId, source.created_date || source.created_at || null, source.updated_date || source.updated_at || null, jsonValue, batchId).run();
    imported += 1;
  }
  await env.DB.prepare('UPDATE base44_migration_tokens SET records_received=records_received+? WHERE token_hash=?').bind(imported, tokenHash).run();
  return new Response(JSON.stringify({ entityName, received: imported, batchId }), { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } });
}
