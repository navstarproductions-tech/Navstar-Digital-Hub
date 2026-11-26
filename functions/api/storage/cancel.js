import { requireRole } from '../../_shared/auth.js';
import { error,isSameOrigin,json,readJson } from '../../_shared/http.js';

export async function onRequestPost({request,env}){
  if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
  if(!env.DB||!env.NAVSTAR_STORAGE)return error('Private storage is not configured.',503);
  const access=await requireRole(request,env,['student','tutor','admissions','principal','finance','admin']);
  if(access.response)return access.response;
  let body;try{body=await readJson(request,2048)}catch{return error('Invalid cancellation request.',400)}
  const intentId=typeof body.intentId==='string'?body.intentId.slice(0,80):'';
  if(!intentId)return error('Upload reference is missing.',400);
  const intent=await env.DB.prepare('SELECT id,object_key FROM storage_upload_intents WHERE id=? AND owner_id=?').bind(intentId,access.user.id).first();
  if(!intent)return json({cancelled:true});
  await env.NAVSTAR_STORAGE.delete(intent.object_key).catch(()=>{});
  await env.DB.prepare('DELETE FROM storage_upload_intents WHERE id=?').bind(intentId).run();
  return json({cancelled:true});
}
