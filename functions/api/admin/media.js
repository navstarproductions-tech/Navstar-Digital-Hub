import { requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, safeString, uuid } from '../../_shared/http.js';
import { getStorageSettings,storageConfig,validateUploadInput,verifyR2Object } from '../../_shared/storage.js';

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const maxBytes = 5 * 1024 * 1024;

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('Media database is not configured.', 503);
  const access = await requireRole(request, env, ['admin', 'principal']);
  if (access.response) return access.response;
  const rows = await env.DB.prepare('SELECT id, mime_type AS mimeType, size_bytes AS sizeBytes, alt_text AS altText, created_at AS createdAt FROM media_assets WHERE NOT EXISTS(SELECT 1 FROM stored_files s WHERE s.id=media_assets.id) ORDER BY created_at DESC LIMIT 100').all();
  const central = await env.DB.prepare("SELECT id,mime_type AS mimeType,size_bytes AS sizeBytes,description AS altText,created_at AS createdAt FROM stored_files WHERE module='gallery' AND visibility='public' AND status='active' ORDER BY created_at DESC LIMIT 100").all().catch(()=>({results:[]}));
  const combined=[...(central.results||[]),...(rows.results||[])].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,100);
  return json({ media: combined.map((item) => ({ ...item, url: `/api/media/${item.id}` })) });
}

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Media storage is not configured.', 503);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || !allowedTypes.has(file.type) || file.size < 1 || file.size > maxBytes) return error('Upload a PNG, JPEG, WebP, or AVIF image up to 5 MB.');
  const altText = safeString(form.get('altText'), 160);
  const table = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='stored_files'").first().catch(()=>null);
  let centralReady=Boolean(env.NAVSTAR_STORAGE&&table);
  if(centralReady){try{storageConfig(env)}catch{centralReady=false}}
  if(centralReady){
    let meta;try{meta=validateUploadInput({module:'gallery',fileName:file.name,mimeType:file.type,size:file.size,settings:await getStorageSettings(env.DB)})}catch(cause){return error(cause.message||'The image format is not valid.',400)}
    const id=uuid(),objectKey='gallery/'+id+'.'+meta.extension;
    try{
      await env.NAVSTAR_STORAGE.put(objectKey,file.stream(),{httpMetadata:{contentType:file.type,cacheControl:'public, max-age=3600'}});
      const verified=await verifyR2Object(env,objectKey,{sizeBytes:file.size,mimeType:file.type});
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO stored_files(id,original_name,object_key,extension,mime_type,size_bytes,storage_provider,storage_bucket,module,owner_id,uploaded_by,visibility,status,description,etag)
          VALUES(?,?,?,?,?,?,'cloudflare-r2',?,'gallery',NULL,?,'public','active',?,?)`)
          .bind(id,file.name,objectKey,meta.extension,file.type,verified.sizeBytes,env.R2_BUCKET_NAME||'navstar-digital-hub-storage',access.user.id,altText,verified.etag),
        env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)')
          .bind(uuid(),access.user.id,'media_uploaded','stored_file',id)
      ]);
      return json({id,url:`/api/media/${id}`,altText,mimeType:file.type,storage:'central-r2'},201);
    }catch(cause){
      await env.NAVSTAR_STORAGE.delete(objectKey).catch(()=>{});
      console.error('Central gallery upload failed:',String(cause?.stack||cause));
      return error('The image could not be verified and saved in private R2 storage.',500);
    }
  }
  if(!env.MEDIA)return error('Legacy media storage is unavailable. Configure the central R2 bucket.',503);
  const id = uuid();
  const objectKey = `public-media/${id}`;
  await env.MEDIA.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=3600' } });
  await env.DB.prepare('INSERT INTO media_assets (id, object_key, mime_type, size_bytes, alt_text, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, objectKey, file.type, file.size, altText, access.user.id).run();
  await env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)')
    .bind(uuid(), access.user.id, 'media_uploaded', 'media_asset', id).run();
  return json({ id, url: `/api/media/${id}`, altText, mimeType: file.type, storage:'legacy-media' }, 201);
}
