import { sha256 } from '../../../_shared/auth.js';
import { error, json } from '../../../_shared/http.js';

const allowedOrigins = new Set(['https://navstardigitalhub.base44.app']);
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

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin') || '') });
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin') || '';
  if (!allowedOrigins.has(origin)) return error('Origin not allowed.', 403);
  const headers = corsHeaders(origin);
  const token = bearer(request);
  if (!token || !env.DB) return new Response(JSON.stringify({ error: 'A valid migration token is required.' }), { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } });
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare('SELECT token_hash, expires_at, used_at, records_received FROM base44_migration_tokens WHERE token_hash=?').bind(tokenHash).first();
  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) return new Response(JSON.stringify({ error: 'Migration token is invalid, expired, or already completed.' }), { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } });
  await env.DB.prepare('UPDATE base44_migration_tokens SET used_at=CURRENT_TIMESTAMP WHERE token_hash=?').bind(tokenHash).run();
  const summary = await env.DB.prepare('SELECT entity_name, COUNT(*) AS records FROM base44_legacy_records GROUP BY entity_name ORDER BY entity_name').all();
  const total = await env.DB.prepare('SELECT COUNT(*) AS total FROM base44_legacy_records').first();
  return new Response(JSON.stringify({ completed: true, receivedThisRun: Number(row.records_received || 0), totalArchivedRecords: Number(total?.total || 0), entities: summary.results || [] }), { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } });
}
