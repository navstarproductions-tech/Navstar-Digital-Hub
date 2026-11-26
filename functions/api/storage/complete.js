import { requireRole } from '../../_shared/auth.js';
import { error,isSameOrigin,json,readJson,uuid } from '../../_shared/http.js';
import { storageConfig,verifyR2Object } from '../../_shared/storage.js';

export async function onRequestPost({request,env}){
  if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
  if(!env.DB)return error('File metadata database is not configured.',503);
  const access=await requireRole(request,env,['student','tutor','admissions','principal','finance','admin']);
  if(access.response)return access.response;
  let body;try{body=await readJson(request,4096)}catch{return error('Invalid upload completion request.',400)}
  const intentId=typeof body.intentId==='string'?body.intentId.slice(0,80):'';
  if(!intentId)return error('The upload reference is missing.',400);
  let config;try{config=storageConfig(env)}catch(cause){return error(cause.message||'Private storage is not configured.',503)}
  const intent=await env.DB.prepare('SELECT * FROM storage_upload_intents WHERE id=? AND owner_id=?').bind(intentId,access.user.id).first();
  if(!intent)return error('The upload request was not found or has already expired.',404);
  if(new Date(intent.expires_at).getTime()<Date.now()){
    await env.NAVSTAR_STORAGE.delete(intent.object_key).catch(()=>{});
    await env.DB.prepare('DELETE FROM storage_upload_intents WHERE id=?').bind(intentId).run();
    return error('The upload request expired. Please select the file again.',410);
  }
  const fileId=uuid(),finalKey=intent.module+'/'+fileId+'.'+intent.extension;
  try{
    await verifyR2Object(env,intent.object_key,{sizeBytes:intent.size_bytes,mimeType:intent.mime_type});
    const stagingObject=await env.NAVSTAR_STORAGE.get(intent.object_key);
    if(!stagingObject)throw new Error('The uploaded staging object could not be read.');
    await env.NAVSTAR_STORAGE.put(finalKey,stagingObject.body,{httpMetadata:{contentType:intent.mime_type,cacheControl:intent.visibility==='public'?'public, max-age=3600':'private, no-store'}});
    const verified=await verifyR2Object(env,finalKey,{sizeBytes:intent.size_bytes,mimeType:intent.mime_type});
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO stored_files
        (id,original_name,object_key,extension,mime_type,size_bytes,storage_provider,storage_bucket,module,record_id,owner_id,uploaded_by,visibility,status,description,etag,checksum_sha256)
        VALUES(?,?,?,?,?,?,'cloudflare-r2',?,?,?,?,?,?,'active',?,?,NULL)`)
        .bind(fileId,intent.original_name,finalKey,intent.extension,intent.mime_type,verified.sizeBytes,config.bucketName,intent.module,intent.record_id,intent.owner_id,access.user.id,intent.visibility,intent.description,verified.etag),
      env.DB.prepare('DELETE FROM storage_upload_intents WHERE id=?').bind(intentId),
      env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)')
        .bind(uuid(),access.user.id,'storage_file_uploaded','stored_file',fileId)
    ]);
    await env.NAVSTAR_STORAGE.delete(intent.object_key).catch(()=>{});
    return json({file:{id:fileId,originalName:intent.original_name,module:intent.module,mimeType:intent.mime_type,sizeBytes:verified.sizeBytes,visibility:intent.visibility,status:'active',createdAt:verified.uploadedAt}},201);
  }catch(cause){
    await env.NAVSTAR_STORAGE.delete(finalKey).catch(()=>{});
    await env.NAVSTAR_STORAGE.delete(intent.object_key).catch(()=>{});
    await env.DB.prepare('DELETE FROM storage_upload_intents WHERE id=?').bind(intentId).run().catch(()=>{});
    console.error('Navstar R2 upload finalization failed:',String(cause?.stack||cause));
    return error(cause.message||'The uploaded file could not be verified and registered. Please retry.',422);
  }
}
