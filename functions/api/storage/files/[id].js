import { requireRole } from '../../../_shared/auth.js';
import { error,isSameOrigin,json,uuid } from '../../../_shared/http.js';
import { canReadStoredFile,getStorageSettings,presignR2 } from '../../../_shared/storage.js';

const roles=['student','tutor','admissions','principal','finance','admin'];
export async function onRequestGet({request,env,params}){
  if(!env.DB)return error('File metadata database is not configured.',503);
  const access=await requireRole(request,env,roles);if(access.response)return access.response;
  const row=await env.DB.prepare('SELECT * FROM stored_files WHERE id=?').bind(params.id).first();
  if(!row||!canReadStoredFile(row,access.user))return error('File not found or access is not permitted.',404);
  try{
    const settings=await getStorageSettings(env.DB);
    const downloadUrl=await presignR2(env,'GET',row.object_key,settings.downloadUrlExpirySeconds);
    await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),access.user.id,'storage_download_url_issued','stored_file',row.id).run();
    return json({file:{id:row.id,originalName:row.original_name,mimeType:row.mime_type,sizeBytes:row.size_bytes,module:row.module,visibility:row.visibility},downloadUrl,expiresIn:settings.downloadUrlExpirySeconds});
  }catch(cause){return error(cause.message||'A secure download link could not be generated.',503)}
}
export async function onRequestDelete({request,env,params}){
  if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
  if(!env.DB)return error('File metadata database is not configured.',503);
  const access=await requireRole(request,env,['admin']);if(access.response)return access.response;
  const row=await env.DB.prepare('SELECT id,status FROM stored_files WHERE id=?').bind(params.id).first();
  if(!row)return error('File not found.',404);
  if(row.status==='deleted')return json({deleted:true});
  await env.DB.prepare("UPDATE stored_files SET status='deleted',deleted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(params.id).run();
  await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),access.user.id,'storage_file_soft_deleted','stored_file',params.id).run();
  return json({deleted:true,softDeleted:true});
}
export async function onRequestPost({request,env,params}){
  if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
  if(!env.DB||!env.NAVSTAR_STORAGE)return error('Private storage is not configured.',503);
  const access=await requireRole(request,env,['admin']);if(access.response)return access.response;
  const row=await env.DB.prepare('SELECT id,object_key,status FROM stored_files WHERE id=?').bind(params.id).first();
  if(!row)return error('File not found.',404);
  if(row.status==='active')return json({restored:true});
  const object=await env.NAVSTAR_STORAGE.head(row.object_key);
  if(!object)return error('The original R2 object is missing. The metadata was not restored.',404);
  await env.DB.prepare("UPDATE stored_files SET status='active',deleted_at=NULL,restored_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(params.id).run();
  await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),access.user.id,'storage_file_restored','stored_file',params.id).run();
  return json({restored:true});
}
