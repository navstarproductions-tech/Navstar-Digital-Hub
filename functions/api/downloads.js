import { error, json } from '../_shared/http.js';

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ documents: [] });
  const rows = await env.DB.prepare('SELECT id, title, description, original_name AS originalName, size_bytes AS sizeBytes, created_at AS createdAt FROM downloadable_documents WHERE is_public = 1 ORDER BY created_at DESC LIMIT 100').all();
  return json({ documents: (rows.results ?? []).map((item) => ({ ...item, url: `/api/downloads/${item.id}` })) });
}
