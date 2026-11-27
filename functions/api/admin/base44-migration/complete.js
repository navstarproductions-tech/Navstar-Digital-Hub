import { requireRole, sha256 } from '../../../_shared/auth.js';
import { error, isSameOrigin, json, readJson } from '../../../_shared/http.js';

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;
  let body;
  try { body = await readJson(request, 2048); } catch { return error('Invalid request body.'); }
  const token = String(body.token || '');
  if (!token) return error('Migration token is required.');
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare('SELECT token_hash, expires_at, used_at, records_received FROM base44_migration_tokens WHERE token_hash=?').bind(tokenHash).first();
  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) return error('Migration token is invalid or expired.', 401);
  await env.DB.prepare('UPDATE base44_migration_tokens SET used_at=CURRENT_TIMESTAMP WHERE token_hash=?').bind(tokenHash).run();
  const summary = await env.DB.prepare('SELECT entity_name, COUNT(*) AS records FROM base44_legacy_records GROUP BY entity_name ORDER BY entity_name').all();
  const total = await env.DB.prepare('SELECT COUNT(*) AS total FROM base44_legacy_records').first();
  return json({ completed: true, receivedThisRun: row.records_received, totalArchivedRecords: Number(total?.total || 0), entities: summary.results || [] });
}
