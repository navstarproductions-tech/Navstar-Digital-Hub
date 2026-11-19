import { error } from '../../_shared/http.js';

export async function onRequestGet({ env, params }) {
  if (!env.DB || !env.DOCS) return error('The document download service is temporarily unavailable. Please contact Navstar support.', 503);
  try {
    const id = String(params?.id || '').slice(0, 80);
    if (!id) return error('A document reference is required.', 400);
    const row = await env.DB.prepare('SELECT object_key, mime_type, original_name FROM downloadable_documents WHERE id = ? AND is_public = 1').bind(id).first();
    if (!row) return error('This document is no longer available. Please contact Navstar support.', 404);
    const object = await env.DOCS.get(row.object_key);
    if (!object) return error('The document file is temporarily unavailable. Please contact Navstar support.', 404);
    const safeName = String(row.original_name || 'navstar-document').replace(/[\\r\\n"\\\\]/g, '_');
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('Content-Type', row.mime_type || 'application/octet-stream');
    headers.set('Content-Length', String(object.size));
    const viewInline = new URL(request.url).searchParams.get('view') === '1';
    headers.set('Content-Disposition', `${viewInline ? 'inline' : 'attachment'}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Cache-Control', 'private, no-store');
    return new Response(object.body, { status: 200, headers });
  } catch (cause) {
    console.error('Public document download failed:', String(cause));
    return error('The document could not be downloaded right now. Please try again.', 500);
  }
}
