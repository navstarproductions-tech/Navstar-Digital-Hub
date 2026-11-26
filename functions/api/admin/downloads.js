import { requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, safeString, uuid } from '../../_shared/http.js';
import { storageConfig,validateUploadInput,verifyR2Object } from '../../_shared/storage.js';

const allowedTypes = new Set([
  'application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain','text/csv'
]);
const maxBytes = 15 * 1024 * 1024;

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('Downloads database is not configured.', 503);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;
  const rows = await env.DB.prepare('SELECT id, title, description, original_name AS originalName, mime_type AS mimeType, size_bytes AS sizeBytes, is_public AS isPublic, created_at AS createdAt FROM downloadable_documents ORDER BY created_at DESC LIMIT 200').all();
  return json({ documents: (rows.results ?? []).map((item) => ({ ...item, url: `/api/download/${item.id}` })) });
}

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Document storage is not configured.', 503);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;
  let form;
  try { form = await request.formData(); } catch { return error('Invalid upload.'); }
  const file = form.get('file');
  if (!(file instanceof File) || !allowedTypes.has(file.type) || file.size < 1 || file.size > maxBytes) return error('Upload a supported PDF, Word, Excel, PowerPoint, CSV or text document up to 15 MB.');
  const title = safeString(form.get('title'), 120) || file.name.slice(0, 120);
  const description = safeString(form.get('description'), 500);
  const table = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='stored_files'").first().catch(()=>null);
  let centralReady=Boolean(env.NAVSTAR_STORAGE&&table);if(centralReady){try{storageConfig(env)}catch{centralReady=false}}
  if(centralReady){
    let meta;try{meta=validateUploadInput({module:'institutional-documents',fileName:file.name,mimeType:file.type,size:file.size})}catch(cause){return error(cause.message||'The selected document is invalid.',400)}
    const id=uuid(),objectKey='institutional-documents/'+id+'.'+meta.extension;
    try{
      await env.NAVSTAR_STORAGE.put(objectKey,file.stream(),{httpMetadata:{contentType:file.type,cacheControl:'public, max-age=300'}});
      const verified=await verifyR2Object(env,objectKey,{sizeBytes:file.size,mimeType:file.type});
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO stored_files(id,original_name,object_key,extension,mime_type,size_bytes,storage_provider,storage_bucket,module,owner_id,uploaded_by,visibility,status,description,etag)
          VALUES(?,?,?,?,?,?,'cloudflare-r2',?,'institutional-documents',NULL,?,'public','active',?,?)`)
          .bind(id,file.name,objectKey,meta.extension,file.type,verified.sizeBytes,env.R2_BUCKET_NAME||'navstar-digital-hub-storage',access.user.id,title+' — '+description,verified.etag),
        env.DB.prepare('INSERT INTO downloadable_documents(id,title,description,object_key,mime_type,size_bytes,original_name,is_public,uploaded_by) VALUES(?,?,?,?,?,?,?,1,?)')
          .bind(id,title,description,objectKey,file.type,file.size,safeString(file.name,180),access.user.id),
        env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)')
          .bind(uuid(),access.user.id,'document_uploaded','stored_file',id)
      ]);
      return json({id,title,description,url:`/api/download/${id}`,originalName:file.name,sizeBytes:file.size,storage:'central-r2'},201);
    }catch(cause){await env.NAVSTAR_STORAGE.delete(objectKey).catch(()=>{});console.error('Central institutional document upload failed:',String(cause?.stack||cause));return error('The document could not be verified and saved in private R2 storage.',500)}
  }
  if(!env.DOCS)return error('Legacy document storage is unavailable. Configure the central R2 bucket.',503);
  const id = uuid();
  const objectKey = `public-documents/${id}`;
  await env.DOCS.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=300' } });
  try {
    await env.DB.prepare('INSERT INTO downloadable_documents (id, title, description, object_key, mime_type, size_bytes, original_name, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, title, description, objectKey, file.type, file.size, safeString(file.name, 180), access.user.id).run();
  } catch (e) {
    await env.DOCS.delete(objectKey);
    throw e;
  }
  await env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)')
    .bind(uuid(), access.user.id, 'document_uploaded', 'downloadable_document', id).run();
  return json({ id, title, description, url: `/api/download/${id}`, originalName: file.name, sizeBytes: file.size, storage:'legacy-docs' }, 201);
}
