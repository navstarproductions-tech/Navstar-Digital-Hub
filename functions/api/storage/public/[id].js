import { error,json } from '../../../_shared/http.js';
import { getStorageSettings,presignR2 } from '../../../_shared/storage.js';

export async function onRequestGet({env,params}){
  if(!env.DB)return error('File metadata database is not configured.',503);
  const file=await env.DB.prepare("SELECT id,object_key,original_name,mime_type,size_bytes FROM stored_files WHERE id=? AND status='active' AND visibility='public'").bind(params.id).first();
  if(!file)return error('Public file not found.',404);
  try{
    const settings=await getStorageSettings(env.DB);
    const downloadUrl=await presignR2(env,'GET',file.object_key,settings.downloadUrlExpirySeconds);
    return json({file:{id:file.id,originalName:file.original_name,mimeType:file.mime_type,sizeBytes:file.size_bytes},downloadUrl,expiresIn:settings.downloadUrlExpirySeconds});
  }catch(cause){return error(cause.message||'The public file is temporarily unavailable.',503)}
}
