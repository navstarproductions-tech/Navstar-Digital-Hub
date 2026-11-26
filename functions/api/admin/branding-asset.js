import { requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, uuid } from '../../_shared/http.js';
import { storageConfig,validateUploadInput,verifyR2Object } from '../../_shared/storage.js';

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const maxBytes = 5 * 1024 * 1024;

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Image storage is not configured. Please contact Navstar support.', 503);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;
  let form;
  try { form = await request.formData(); } catch { return error('Choose an image file and try again.'); }
  const file = form.get('file');
  const label = String(form.get('label') || 'Institution branding').slice(0, 120);
  if (!(file instanceof File) || !allowedTypes.has(file.type) || file.size < 1 || file.size > maxBytes) {
    return error('Choose a JPG, PNG, WebP or AVIF image up to 5 MB.');
  }
  const table = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='stored_files'").first().catch(()=>null);
  let centralReady=Boolean(env.NAVSTAR_STORAGE&&table);
  if(centralReady){try{storageConfig(env)}catch{centralReady=false}}
  if(centralReady){
    let meta;try{meta=validateUploadInput({module:'gallery',fileName:file.name,mimeType:file.type,size:file.size})}catch(cause){return error(cause.message||'The image format is not valid.',400)}
    const mediaId=uuid(),objectKey='gallery/'+mediaId+'.'+meta.extension;
    try{
      await env.NAVSTAR_STORAGE.put(objectKey,file.stream(),{httpMetadata:{contentType:file.type,cacheControl:'public, max-age=3600'}});
      const verified=await verifyR2Object(env,objectKey,{sizeBytes:file.size,mimeType:file.type});
      await env.DB.prepare(`INSERT INTO stored_files(id,original_name,object_key,extension,mime_type,size_bytes,storage_provider,storage_bucket,module,owner_id,uploaded_by,visibility,status,description,etag)
        VALUES(?,?,?,?,?,?,'cloudflare-r2',?,'gallery',NULL,?,'public','active',?,?)`)
        .bind(mediaId,file.name,objectKey,meta.extension,file.type,verified.sizeBytes,env.R2_BUCKET_NAME||'navstar-digital-hub-storage',access.user.id,label,verified.etag).run();
      return json({url:`/api/media/${mediaId}`,mediaId,sizeBytes:file.size,storage:'central-r2'},201);
    }catch(cause){
      await env.NAVSTAR_STORAGE.delete(objectKey).catch(()=>{});
      console.error('Central branding asset upload failed:',String(cause?.stack||cause));
      return error('The image could not be saved in private R2 storage. Please retry.',500);
    }
  }
  if(!env.MEDIA)return error('Legacy image storage is unavailable. Configure the central R2 bucket.',503);
  const mediaId = uuid();
  const objectKey = `institution-branding/${access.user.id}/${mediaId}`;
  try {
    await env.MEDIA.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=3600' } });
    await env.DB.prepare('INSERT INTO media_assets (id, object_key, mime_type, size_bytes, alt_text, created_by) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(mediaId, objectKey, file.type, file.size, label, access.user.id).run();
    return json({ url: `/api/media/${mediaId}`, mediaId, sizeBytes: file.size, storage:'legacy-media' }, 201);
  } catch (cause) {
    console.error('Navstar institution image upload failed:', String(cause?.stack || cause));
    return error('The image could not be saved. Please retry. No existing branding image was changed.', 500);
  }
}
