import { requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, uuid } from '../../_shared/http.js';

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const maxBytes = 5 * 1024 * 1024;

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB || !env.MEDIA) return error('Image storage is not configured. Please contact Navstar support.', 503);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;
  let form;
  try { form = await request.formData(); } catch { return error('Choose an image file and try again.'); }
  const file = form.get('file');
  const label = String(form.get('label') || 'Institution branding').slice(0, 120);
  if (!(file instanceof File) || !allowedTypes.has(file.type) || file.size < 1 || file.size > maxBytes) {
    return error('Choose a JPG, PNG, WebP or AVIF image up to 5 MB.');
  }
  const mediaId = uuid();
  const objectKey = `institution-branding/${access.user.id}/${mediaId}`;
  try {
    await env.MEDIA.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=3600' } });
    await env.DB.prepare('INSERT INTO media_assets (id, object_key, mime_type, size_bytes, alt_text, created_by) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(mediaId, objectKey, file.type, file.size, label, access.user.id).run();
    return json({ url: `/api/media/${mediaId}`, mediaId, sizeBytes: file.size }, 201);
  } catch (cause) {
    console.error('Navstar institution image upload failed:', String(cause?.stack || cause));
    return error('The image could not be saved. Please retry. No existing branding image was changed.', 500);
  }
}
