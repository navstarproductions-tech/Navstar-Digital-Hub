import { requireRole } from '../../_shared/auth.js';
import { error,isSameOrigin,json,readJson,uuid } from '../../_shared/http.js';
import { getStorageSettings,presignR2,storageConfig,validateUploadInput,safeStorageDescription } from '../../_shared/storage.js';

const roles=['student','tutor','admissions','principal','finance','admin'];
function canUpload(user,module){
  if(user.role==='admin'||user.role==='principal')return true;
  if(user.role==='student')return ['projects','assignments','applications','scholarships'].includes(module);
  if(user.role==='tutor')return ['course-notes','assignments','projects','generated-reports'].includes(module);
  if(user.role==='admissions')return ['students','applications','generated-reports'].includes(module);
  if(user.role==='finance')return ['generated-reports','institutional-documents'].includes(module);
  return false;
}
export async function onRequestPost({request,env}){
  if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
  if(!env.DB)return error('File metadata database is not configured.',503);
  const access=await requireRole(request,env,roles);if(access.response)return access.response;
  let body;try{body=await readJson(request,8192)}catch{return error('Enter valid upload details.',400)}
  const settings=await getStorageSettings(env.DB);
  let file;try{file=validateUploadInput({module:body.module,fileName:body.fileName,mimeType:body.mimeType,size:body.size,settings})}catch(cause){return error(cause.message||'The selected file is not allowed.',400)}
  if(!canUpload(access.user,file.module))return error('Your account is not permitted to upload files to this module.',403);
  const visibility=body.visibility==='public'?'public':'private';
  if(visibility==='public'&&(access.user.role!=='admin'||!['gallery','photography','courses'].includes(file.module)))return error('Only an administrator may publish approved gallery, photography or course assets.',403);
  try{storageConfig(env)}catch(cause){return error(cause.message||'Private storage is not configured.',503)}
  const id=uuid(),intentId=uuid(),objectKey=file.module+'/'+id+'.'+file.extension;
  const expiresAt=new Date(Date.now()+5*60*1000).toISOString();
  const description=safeStorageDescription(body.description);
  await env.DB.prepare(`INSERT INTO storage_upload_intents
    (id,object_key,owner_id,module,record_id,original_name,extension,mime_type,size_bytes,visibility,description,expires_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(intentId,objectKey,access.user.id,file.module,typeof body.recordId==='string'?body.recordId.slice(0,100):null,file.originalName,file.extension,file.mimeType,file.sizeBytes,visibility,description,expiresAt).run();
  try{
    const uploadUrl=await presignR2(env,'PUT',objectKey,300);
    return json({intentId,objectKey,uploadUrl,method:'PUT',headers:{'Content-Type':file.mimeType},expiresAt,maximumBytes:file.sizeBytes},201);
  }catch(cause){
    await env.DB.prepare('DELETE FROM storage_upload_intents WHERE id=?').bind(intentId).run();
    return error(cause.message||'A secure upload URL could not be generated.',503);
  }
}
