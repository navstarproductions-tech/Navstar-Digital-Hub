import { requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, uuid } from '../../_shared/http.js';
import { getStorageSettings,storageConfig,validateUploadInput,verifyR2Object } from '../../_shared/storage.js';

const roles = ['student', 'admin', 'tutor', 'admissions', 'principal', 'finance'];
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const maxBytes = 3 * 1024 * 1024;

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Profile photo storage is not configured. Please contact Navstar support.', 503);
  const form = await request.formData().catch(() => null);
  if (!form) return error('Choose an image file and try again.');
  const requestedUserId = String(form.get('userId') || '').trim();
  const access = await requireRole(request, env, requestedUserId ? ['admin'] : roles);
  if (access.response) return access.response;
  const targetUserId = requestedUserId || access.user.id;
  if (requestedUserId) {
    const target = await env.DB.prepare("SELECT id, role FROM users WHERE id = ?").bind(targetUserId).first();
    if (!target || target.role !== 'student') return error('The selected student account was not found.', 404);
  }
  const file = form.get('file');
  if (!(file instanceof File) || !allowedTypes.has(file.type) || file.size < 1 || file.size > maxBytes) {
    return error('Choose a JPEG, PNG, WebP or AVIF profile photo up to 3 MB.');
  }
  const existing = await env.DB.prepare('SELECT user_id FROM user_profiles WHERE user_id = ?').bind(targetUserId).first();
  if (!existing) return error('Your account profile is not yet initialized. Please contact Navstar support.', 409);

  const table = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='stored_files'").first().catch(() => null);
  let centralReady = Boolean(env.NAVSTAR_STORAGE && table);
  if (centralReady) {
    try { storageConfig(env); } catch { centralReady = false; }
  }

  if (centralReady) {
    let meta;
    try { meta = validateUploadInput({module:'students',fileName:file.name,mimeType:file.type,size:file.size,settings:await getStorageSettings(env.DB)}); }
    catch (cause) { return error(cause.message || 'The selected profile photo is invalid.', 400); }
    const fileId = uuid();
    const objectKey = 'students/' + targetUserId + '/' + fileId + '.' + meta.extension;
    try {
      await env.NAVSTAR_STORAGE.put(objectKey, file.stream(), { httpMetadata: { contentType:file.type, cacheControl:'private, no-store' } });
      const verified = await verifyR2Object(env,objectKey,{sizeBytes:file.size,mimeType:file.type});
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO stored_files
          (id,original_name,object_key,extension,mime_type,size_bytes,storage_provider,storage_bucket,module,record_id,owner_id,uploaded_by,visibility,status,description,etag)
          VALUES(?,?,?,?,?,?,'cloudflare-r2',?,'students',?,?,?,'private','active','Student profile photo',?)`)
          .bind(fileId,file.name,objectKey,meta.extension,file.type,verified.sizeBytes,env.R2_BUCKET_NAME||'navstar-digital-hub-storage',targetUserId,targetUserId,access.user.id,verified.etag),
        env.DB.prepare('UPDATE user_profiles SET profile_photo_url = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
          .bind('/api/storage/preview/'+fileId,targetUserId),
        env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)')
          .bind(uuid(),access.user.id,requestedUserId?'admin_student_photo_updated':'student_profile_photo_updated','user',targetUserId)
      ]);
      const profile = await env.DB.prepare('SELECT profile_photo_url AS profilePhotoUrl FROM user_profiles WHERE user_id = ?').bind(targetUserId).first();
      if (!profile?.profilePhotoUrl) throw new Error('Profile photo update was not confirmed by the database.');
      return json({profilePhotoUrl:profile.profilePhotoUrl,storage:'central-r2'},201);
    } catch (cause) {
      await env.NAVSTAR_STORAGE.delete(objectKey).catch(()=>{});
      console.error('Navstar centralized profile photo upload failed:',String(cause?.stack||cause));
      return error('The profile photo could not be saved in private storage. Your existing profile details were not changed. Please retry.',500);
    }
  }

  // Backward-compatible path until the central bucket and metadata migration are configured.
  if (!env.MEDIA) return error('Profile photo storage is not configured. Please contact Navstar support.', 503);
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
    return json({ profilePhotoUrl: profile.profilePhotoUrl, storage:'legacy-media' }, 201);
  } catch (cause) {
    console.error('Navstar profile photo upload failed:', String(cause?.stack || cause));
    return error('The profile photo could not be saved. Your existing profile details were not changed. Please retry.', 500);
  }
}
