import { requireRole } from '../../_shared/auth.js';
import { error,isSameOrigin,json,readJson,safeString,uuid } from '../../_shared/http.js';
import { getStorageSettings,storageConfig,validateUploadInput,verifyR2Object } from '../../_shared/storage.js';

export async function onRequestPost({request,env}){
 if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
 if(!env.DB||!env.NAVSTAR_STORAGE)return error('Central private storage is not configured.',503);
 const access=await requireRole(request,env,['admin']);if(access.response)return access.response;
 let body;try{body=await readJson(request,4096)}catch{return error('Invalid migration request.',400)}
 const source=String(body.source||''),id=String(body.id||'').slice(0,100);
 if(!id||!['media_assets','employee_documents','downloadable_documents','forum_media_assets','staff_applications'].includes(source))return error('Choose a valid legacy file record.',400);
 try{storageConfig(env)}catch(cause){return error(cause.message||'Central R2 credentials are not configured.',503)}
 const settings=await getStorageSettings(env.DB);
 let row,bucket,module,visibility='private',ownerId=null,recordId=null,originalName,mimeType,oldKey,storedId=id;
 if(source==='media_assets'){
  row=await env.DB.prepare('SELECT id,object_key,mime_type,size_bytes,alt_text,created_by FROM media_assets WHERE id=?').bind(id).first();bucket=env.MEDIA;module='gallery';visibility='public';originalName=(row?.alt_text||'Gallery image')+'.'+({ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/avif':'avif' }[row?.mime_type]||'jpg');
 }else if(source==='employee_documents'){
  row=await env.DB.prepare('SELECT id,object_key,mime_type,size_bytes,original_name,employee_user_id,description FROM employee_documents WHERE id=?').bind(id).first();bucket=env.DOCS;module='employees';ownerId=row?.employee_user_id||null;recordId=row?.employee_user_id||null;originalName=row?.original_name;
 }else if(source==='downloadable_documents'){
  row=await env.DB.prepare('SELECT id,object_key,mime_type,size_bytes,original_name,is_public,description FROM downloadable_documents WHERE id=?').bind(id).first();bucket=env.DOCS;module='institutional-documents';visibility=Number(row?.is_public)===1?'public':'private';originalName=row?.original_name;
 }else if(source==='forum_media_assets'){
  row=await env.DB.prepare('SELECT id,object_key,mime_type,size_bytes,customer_id FROM forum_media_assets WHERE id=?').bind(id).first();bucket=env.MEDIA;module='customer-uploads';visibility='public';recordId=row?.customer_id||null;originalName='community-photo.'+({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/avif':'avif'}[row?.mime_type]||'jpg');
 }else{
  row=await env.DB.prepare('SELECT id,document_key,document_name,document_mime_type FROM staff_applications WHERE id=?').bind(id).first();bucket=env.DOCS;module='applications';recordId=id;storedId='staffdoc-'+id;originalName=row?.document_name;
 }
 if(!row||!(row.object_key||row.document_key))return error('Legacy file record not found or has no stored object.',404);
 if(!bucket)return error('The source legacy R2 binding is unavailable.',503);
 const existing=await env.DB.prepare('SELECT id FROM stored_files WHERE id=?').bind(storedId).first();
 if(existing)return json({migrated:true,alreadyMigrated:true,fileId:storedId});
 oldKey=row.object_key||row.document_key;
 const oldObject=await bucket.get(oldKey);
 if(!oldObject)return error('The legacy object is missing. No records were changed.',404);
 mimeType=String(row.mime_type||row.document_mime_type||oldObject.httpMetadata?.contentType||'').toLowerCase();
 const actualSize=Number(oldObject.size||row.size_bytes||0);
 if(!originalName||!String(originalName).includes('.')){
  const ext={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/avif':'avif','text/plain':'txt','text/csv':'csv'}[mimeType];
  originalName='legacy-file.'+(ext||'bin');
 }
 let meta;try{meta=validateUploadInput({module,fileName:originalName,mimeType,size:actualSize,settings})}catch(cause){return error(cause.message||'This legacy file type is not currently supported by central storage.',422)}
 const newKey=module+'/'+uuid()+'.'+meta.extension;
 try{
  await env.NAVSTAR_STORAGE.put(newKey,oldObject.body,{httpMetadata:{contentType:mimeType,cacheControl:visibility==='public'?'public, max-age=3600':'private, no-store'}});
  const verified=await verifyR2Object(env,newKey,{sizeBytes:actualSize,mimeType});
  await env.DB.batch([
   env.DB.prepare(`INSERT INTO stored_files(id,original_name,object_key,extension,mime_type,size_bytes,storage_provider,storage_bucket,module,record_id,owner_id,uploaded_by,visibility,status,description,etag)
    VALUES(?,?,?,?,?,?,'cloudflare-r2',?,?,?,?,?,?,?,'active',?,?)`)
    .bind(storedId,originalName,newKey,meta.extension,mimeType,verified.sizeBytes,env.R2_BUCKET_NAME||'navstar-digital-hub-storage',module,recordId,ownerId,access.user.id,visibility,source==='staff_applications'?'Migrated staff application document':safeString(row.description||row.alt_text||'',1000),verified.etag),
   source==='media_assets'?env.DB.prepare('UPDATE media_assets SET object_key=? WHERE id=?').bind(newKey,id):
   source==='employee_documents'?env.DB.prepare('UPDATE employee_documents SET object_key=? WHERE id=?').bind(newKey,id):
   source==='downloadable_documents'?env.DB.prepare('UPDATE downloadable_documents SET object_key=? WHERE id=?').bind(newKey,id):
   source==='forum_media_assets'?env.DB.prepare('UPDATE forum_media_assets SET object_key=? WHERE id=?').bind(newKey,id):
   env.DB.prepare('UPDATE staff_applications SET document_key=? WHERE id=?').bind(newKey,id),
   env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),access.user.id,'legacy_file_migrated','stored_file',storedId)
  ]);
  return json({migrated:true,fileId:storedId,module,originalName,sizeBytes:verified.sizeBytes,source,legacyObjectRetained:true});
 }catch(cause){
  await env.NAVSTAR_STORAGE.delete(newKey).catch(()=>{});
  console.error('Navstar legacy file migration failed:',String(cause?.stack||cause));
  return error(cause.message||'The file could not be verified in central R2 storage. The original record and object remain unchanged.',500);
 }
}
