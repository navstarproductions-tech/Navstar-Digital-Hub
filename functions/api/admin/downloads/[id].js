import { requireRole } from '../../../_shared/auth.js';
import { error, isSameOrigin, json, uuid } from '../../../_shared/http.js';

export async function onRequestDelete({ request, env, params }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB || !env.DOCS) return error('Document storage is not configured.', 503);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;
  const row = await env.DB.prepare('SELECT object_key FROM downloadable_documents WHERE id = ?').bind(params.id).first();
  if (!row) return error('Document not found.', 404);
  await env.DB.prepare('DELETE FROM downloadable_documents WHERE id = ?').bind(params.id).run();
  await env.DOCS.delete(row.object_key);
  await env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)')
    .bind(uuid(), access.user.id, 'document_deleted', 'downloadable_document', params.id).run();
  return json({ deleted: true });
}
