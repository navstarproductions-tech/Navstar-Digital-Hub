import { requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, safeString, uuid } from '../../_shared/http.js';

const allowedTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv',
]);
const maxBytes = 15 * 1024 * 1024;

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('Downloads database is not configured.', 503);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;
  const rows = await env.DB.prepare('SELECT id, title, description, original_name AS originalName, mime_type AS mimeType, size_bytes AS sizeBytes, is_public AS isPublic, created_at AS createdAt FROM downloadable_documents ORDER BY created_at DESC LIMIT 200').all();
  return json({ documents: (rows.results ?? []).map((item) => ({ ...item, url: `/api/downloads/${item.id}` })) });
}

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB || !env.DOCS) return error('Document storage is not configured. Bind an R2 bucket as DOCS.', 503);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;
  let form;
  try { form = await request.formData(); } catch { return error('Invalid upload.'); }
  const file = form.get('file');
  if (!(file instanceof File) || !allowedTypes.has(file.type) || file.size < 1 || file.size > maxBytes) return error('Upload a supported PDF, Word, Excel, PowerPoint, CSV or text document up to 15 MB.');
  const title = safeString(form.get('title'), 120) || file.name.slice(0, 120);
  const description = safeString(form.get('description'), 500);
  const id = uuid();
  const objectKey = `public-documents/${id}`;
  await env.DOCS.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=300' } });
  try {
    await env.DB.prepare('INSERT INTO downloadable_documents (id, title, description, object_key, mime_type, size_bytes, original_name, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, title, description, objectKey, file.type, file.size, safeString(file.name, 180), access.user.id).run();
  } catch (e) {
    await env.DOCS.delete(objectKey);
    throw e;
  }
  await env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)')
    .bind(uuid(), access.user.id, 'document_uploaded', 'downloadable_document', id).run();
  return json({ id, title, description, url: `/api/downloads/${id}`, originalName: file.name, sizeBytes: file.size }, 201);
}
