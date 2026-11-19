import { requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, uuid } from '../../_shared/http.js';

const roles = ['student', 'admin', 'tutor', 'admissions', 'principal', 'finance'];
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const maxBytes = 3 * 1024 * 1024;

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB || !env.MEDIA) return error('Profile photo storage is not configured. Please contact Navstar support.', 503);
  const form = await request.formData().catch(() => null);
  if (!form) return error('Choose an image file and try again.');
  const requestedUserId = String(form.get('userId') || '').trim();
  const access = await requireRole(request, env, requestedUserId ? ['admin'] : roles);
  if (access.response) return access.response;
  const targetUserId = requestedUserId || access.user.id;
  if (requestedUserId) {
    const target = await env.DB.prepare(\"SELECT id, role FROM users WHERE id = ?\").bind(targetUserId).first();
    if (!target || target.role !== 'student') return error('The selected student account was not found.', 404);
  }
    const file = form.get('file');
  if (!(file instanceof File) || !allowedTypes.has(file.type) || file.size < 1 || file.size > maxBytes) {
    return error('Choose a JPEG, PNG, WebP or AVIF profile photo up to 3 MB.');
  }

  const existing = await env.DB.prepare('SELECT user_id FROM user_profiles WHERE user_id = ?').bind(targetUserId).first();
  if (!existing) return error('Your account profile is not yet initialized. Please contact Navstar support.', 409);

  const id = uuid();
  const objectKey = `profile-photos/${targetUserId}/${id}`;
  try {
    await env.MEDIA.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=3600' } });
    const mediaId = uuid();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO media_assets (id, object_key, mime_type, size_bytes, alt_text, created_by) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(mediaId, objectKey, file.type, file.size, 'Student profile photo', access.user.id),
      env.DB.prepare('UPDATE user_profiles SET profile_photo_url = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
        .bind(`/api/media/${mediaId}`, targetUserId),
    ]);
    const profile = await env.DB.prepare('SELECT profile_photo_url AS profilePhotoUrl FROM user_profiles WHERE user_id = ?').bind(targetUserId).first();
    if (!profile?.profilePhotoUrl) throw new Error('Profile photo update was not confirmed by the database.');
    await env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)').bind(uuid(), access.user.id, requestedUserId ? 'admin_student_photo_updated' : 'student_profile_photo_updated', 'user', targetUserId).run().catch(() => {});
    return json({ profilePhotoUrl: profile.profilePhotoUrl }, 201);
  } catch (cause) {
    console.error('Navstar profile photo upload failed:', String(cause?.stack || cause));
    return error('The profile photo could not be saved. Your existing profile details were not changed. Please retry.', 500);
  }
}
