import { getCustomerSession } from '../../_shared/customer-auth.js';
import { error,isSameOrigin,json,uuid } from '../../_shared/http.js';
const allowedTypes=new Set(['image/jpeg','image/png','image/webp','image/avif']);
const maxBytes=5*1024*1024;
export async function onRequestPost({request,env}){
 if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
 if(!env.DB||!env.MEDIA)return error('Photo storage is temporarily unavailable. Please contact Navstar support.',503);
 const customer=await getCustomerSession(request,env);if(!customer)return error('Sign in to upload a community photo.',401);
 let form;try{form=await request.formData()}catch{return error('Choose a valid image file.')}
 const file=form.get('file');
 if(!(file instanceof File)||!allowedTypes.has(file.type)||file.size<1||file.size>maxBytes)return error('Choose a JPEG, PNG, WebP or AVIF photo up to 5 MB.');
 const id=uuid(),key='forum-media/'+id;
 try{
  await env.MEDIA.put(key,file.stream(),{httpMetadata:{contentType:file.type,cacheControl:'public, max-age=3600'}});
  await env.DB.prepare('INSERT INTO forum_media_assets(id,customer_id,object_key,mime_type,size_bytes) VALUES(?,?,?,?,?)').bind(id,customer.id,key,file.type,file.size).run();
 }catch(e){await env.MEDIA.delete(key).catch(()=>{});console.error('Forum photo upload failed:',String(e));return error('The photo could not be uploaded. Please try again.',500)}
 return json({imageUrl:'/api/forum/image/'+id},201);
}
