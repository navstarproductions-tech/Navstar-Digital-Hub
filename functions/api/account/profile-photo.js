import { requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, uuid } from '../../_shared/http.js';

const roles = ['student', 'admin', 'tutor', 'admissions', 'principal', 'finance'];
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const maxBytes = 3 * 1024 * 1024;

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB || !env.MEDIA) return error('Profile photo storage is not configured. Please contact Navstar support.', 503);
  const access = await requireRole(request, env, roles);
  if (access.response) return access.response;
  let form;
  try { form = await request.formData(); } catch { return error('Choose an image file and try again.'); }
  const file = form.get('file');
  if (!(file instanceof File) || !allowedTypes.has(file.type) || file.size < 1 || file.size > maxBytes) {
    return error('Choose a JPEG, PNG, WebP or AVIF profile photo up to 3 MB.');
  }

  const id = uuid();
  const objectKey = `profile-photos/${access.user.id}/${id}`;
  try {
    await env.MEDIA.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=3600' } });
    const mediaId = uuid();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO media_assets (id, object_key, mime_type, size_bytes, alt_text, created_by) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(mediaId, objectKey, file.type, file.size, 'User profile photo', access.user.id),
      env.DB.prepare('UPDATE user_profiles SET profile_photo_url = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
        .bind(`/api/media/${mediaId}`, access.user.id),
    ]);
    const profile = await env.DB.prepare('SELECT profile_photo_url AS profilePhotoUrl FROM user_profiles WHERE user_id = ?').bind(access.user.id).first();
    if (!profile?.profilePhotoUrl) return error('Your account profile is not yet initialized. Please contact Navstar support.', 409);
    return json({ profilePhotoUrl: profile.profilePhotoUrl }, 201);
  } catch (cause) {
    console.error('Navstar profile photo upload failed:', String(cause?.stack || cause));
    return error('The profile photo could not be saved. Your existing profile details were not changed. Please retry.', 500);
  }
}
