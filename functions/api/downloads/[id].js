import { error } from '../../_shared/http.js';

export async function onRequestGet({ env, params }) {
  if (!env.DB || !env.DOCS) return error('Download service is not configured.', 503);
  const row = await env.DB.prepare('SELECT object_key, mime_type, original_name FROM downloadable_documents WHERE id = ? AND is_public = 1').bind(params.id).first();
  if (!row) return error('Document not found.', 404);
  const object = await env.DOCS.get(row.object_key);
  if (!object) return error('Document file not found.', 404);
  const safeName = String(row.original_name || 'navstar-document').replace(/[\r\n"\\]/g, '_');
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Content-Type', row.mime_type);
  headers.set('Content-Disposition', `attachment; filename="${safeName}"`);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Cache-Control', 'private, no-store');
  return new Response(object.body, { headers });
}
