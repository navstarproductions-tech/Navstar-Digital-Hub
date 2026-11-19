import { error, json } from '../_shared/http.js';

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ images: [] });
  const result = await env.DB.prepare(`
    SELECT id, alt_text AS altText, created_at AS createdAt
    FROM media_assets WHERE alt_text != 'NAVSTAR DIGITAL HUB logo' AND NOT EXISTS (SELECT 1 FROM user_profiles p WHERE p.profile_photo_url = '/api/media/' || media_assets.id) ORDER BY created_at DESC LIMIT 40
  `).all();
  return json({ images: (result.results ?? []).map((image) => ({ ...image, url: `/api/media/${image.id}` })) });
}