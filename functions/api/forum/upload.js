import { getCustomerSession } from '../../_shared/customer-auth.js';
import { error,isSameOrigin,json,uuid } from '../../_shared/http.js';
import { getStorageSettings,storageConfig,validateUploadInput,verifyR2Object } from '../../_shared/storage.js';
const allowedTypes=new Set(['image/jpeg','image/png','image/webp','image/avif']);
const maxBytes=5*1024*1024;
export async function onRequestPost({request,env}){
 if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
 if(!env.DB)return error('Photo storage is temporarily unavailable. Please contact Navstar support.',503);
 const customer=await getCustomerSession(request,env);if(!customer)return error('Sign in to upload a community photo.',401);
 let form;try{form=await request.formData()}catch{return error('Choose a valid image file.')}
 const file=form.get('file');
 if(!(file instanceof File)||!allowedTypes.has(file.type)||file.size<1||file.size>maxBytes)return error('Choose a JPEG, PNG, WebP or AVIF photo up to 5 MB.');
 const table=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='stored_files'").first().catch(()=>null);
 let centralReady=Boolean(env.NAVSTAR_STORAGE&&table);if(centralReady){try{storageConfig(env)}catch{centralReady=false}}
 if(centralReady){
  let meta;try{meta=validateUploadInput({module:'customer-uploads',fileName:file.name,mimeType:file.type,size:file.size,settings:await getStorageSettings(env.DB)})}catch(cause){return error(cause.message||'The selected photo is not valid.',400)}
  const id=uuid(),key='customer-uploads/'+id+'.'+meta.extension;
  try{
   await env.NAVSTAR_STORAGE.put(key,file.stream(),{httpMetadata:{contentType:file.type,cacheControl:'public, max-age=3600'}});
   const verified=await verifyR2Object(env,key,{sizeBytes:file.size,mimeType:file.type});
   await env.DB.batch([
    env.DB.prepare(`INSERT INTO stored_files(id,original_name,object_key,extension,mime_type,size_bytes,storage_provider,storage_bucket,module,record_id,owner_id,uploaded_by,uploader_kind,uploader_ref,visibility,status,description,etag)
     VALUES(?,?,?,?,?,?,'cloudflare-r2',?,'customer-uploads',?,NULL,NULL,'customer',?,'public','active','Community forum image',?)`)
     .bind(id,file.name,key,meta.extension,file.type,verified.sizeBytes,env.R2_BUCKET_NAME||'navstar-digital-hub-storage',customer.id,customer.id,verified.etag),
    env.DB.prepare('INSERT INTO forum_media_assets(id,customer_id,object_key,mime_type,size_bytes) VALUES(?,?,?,?,?)').bind(id,customer.id,key,file.type,file.size),
    env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,NULL,?,?,?)').bind(uuid(),'forum_photo_uploaded','stored_file',id)
   ]);
   return json({imageUrl:'/api/forum/image/'+id,storage:'central-r2'},201);
  }catch(cause){await env.NAVSTAR_STORAGE.delete(key).catch(()=>{});console.error('Central forum image upload failed:',String(cause?.stack||cause));return error('The photo could not be verified and saved. Please try again.',500)}
 }
 if(!env.MEDIA)return error('Photo storage is temporarily unavailable. Please contact Navstar support.',503);
 const id=uuid(),key='forum-media/'+id;
 try{
  await env.MEDIA.put(key,file.stream(),{httpMetadata:{contentType:file.type,cacheControl:'public, max-age=3600'}});
  await env.DB.prepare('INSERT INTO forum_media_assets(id,customer_id,object_key,mime_type,size_bytes) VALUES(?,?,?,?,?)').bind(id,customer.id,key,file.type,file.size).run();
 }catch(e){await env.MEDIA.delete(key).catch(()=>{});console.error('Forum photo upload failed:',String(e));return error('The photo could not be uploaded. Please try again.',500)}
 return json({imageUrl:'/api/forum/image/'+id,storage:'legacy-media'},201);
}
