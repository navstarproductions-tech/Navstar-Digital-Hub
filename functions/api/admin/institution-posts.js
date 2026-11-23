import { requireRole } from '../../_shared/auth.js';
import { error,isSameOrigin,json,readJson,safeString,uuid } from '../../_shared/http.js';
const slugify=value=>value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,100);
function validate(body){
 const type=safeString(body.type,10),title=safeString(body.title,180),summary=safeString(body.summary,500),bodyText=safeString(body.body,20000),audience=safeString(body.audience,20)||'public',status=safeString(body.status,20)||'draft',venue=safeString(body.venue,180);
 const slug=slugify(safeString(body.slug,120)||title);
 const startsAt=safeString(body.startsAt,40),endsAt=safeString(body.endsAt,40);
 if(!['news','event'].includes(type)||title.length<2||!['public','student','staff'].includes(audience)||!['draft','published','archived'].includes(status)||slug.length<2)return {error:'Check the content type, title, audience, publication status and public link name.'};
 if(type==='event'&&(!startsAt||!Number.isFinite(Date.parse(startsAt))))return {error:'Enter a valid event start date and time.'};
 if(endsAt&&(!Number.isFinite(Date.parse(endsAt))||Date.parse(endsAt)<Date.parse(startsAt)))return {error:'The event end must be on or after its start.'};
 return {type,title,summary,bodyText,audience,status,venue,slug,startsAt:startsAt||null,endsAt:endsAt||null};
}
export async function onRequestGet({request,env}){
 if(!env.DB)return error('Institution content is not configured.',503);
 const access=await requireRole(request,env,['admin','principal']);if(access.response)return access.response;
 const type=safeString(new URL(request.url).searchParams.get('type'),10);
 if(!['news','event'].includes(type))return error('Choose news or event content.');
 const result=await env.DB.prepare('SELECT id,post_type AS type,slug,title,summary,body,audience,venue,starts_at AS startsAt,ends_at AS endsAt,status,published_at AS publishedAt,created_at AS createdAt,updated_at AS updatedAt FROM institution_posts WHERE post_type=? ORDER BY COALESCE(starts_at,published_at,created_at) DESC').bind(type).all();
 return json({posts:result.results||[]});
}
export async function onRequestPost({request,env}){
 if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
 if(!env.DB)return error('Institution content is not configured.',503);
 const access=await requireRole(request,env,['admin']);if(access.response)return access.response;
 let body;try{body=await readJson(request,32*1024)}catch{return error('Invalid content record.');}
 const value=validate(body);if(value.error)return error(value.error);
 const id=uuid(),publishedAt=value.status==='published'?new Date().toISOString():null;
 try{await env.DB.prepare('INSERT INTO institution_posts(id,post_type,slug,title,summary,body,audience,venue,starts_at,ends_at,status,created_by,published_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
 .bind(id,value.type,value.slug,value.title,value.summary,value.bodyText,value.audience,value.venue,value.startsAt,value.endsAt,value.status,access.user.id,publishedAt).run();}
 catch{return error('That public link name is already in use. Choose another.',409);}
 await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),access.user.id,value.type+'_created','institution_post',id).run();
 return json({created:true,id,slug:value.slug},201);
}
export async function onRequestPatch({request,env}){
 if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
 if(!env.DB)return error('Institution content is not configured.',503);
 const access=await requireRole(request,env,['admin']);if(access.response)return access.response;
 let body;try{body=await readJson(request,32*1024)}catch{return error('Invalid content update.');}
 const id=safeString(body.id,80);if(!id)return error('Select a content record.');
 const value=validate(body);if(value.error)return error(value.error);
 try{
  const result=await env.DB.prepare(`UPDATE institution_posts SET slug=?,title=?,summary=?,body=?,audience=?,venue=?,starts_at=?,ends_at=?,status=?,published_at=CASE WHEN ?='published' THEN COALESCE(published_at,CURRENT_TIMESTAMP) ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND post_type=?`)
   .bind(value.slug,value.title,value.summary,value.bodyText,value.audience,value.venue,value.startsAt,value.endsAt,value.status,value.status,id,value.type).run();
  if(!result.meta?.changes)return error('Content record not found.',404);
 }catch{return error('That public link name is already in use. Choose another.',409);}
 await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),access.user.id,value.type+'_updated','institution_post',id).run();
 return json({saved:true,id,slug:value.slug,status:value.status});
}
export async function onRequestDelete({request,env}){
 if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
 if(!env.DB)return error('Institution content is not configured.',503);
 const access=await requireRole(request,env,['admin']);if(access.response)return access.response;
 let body;try{body=await readJson(request,2048)}catch{return error('Invalid archive request.');}
 const id=safeString(body.id,80);if(!id)return error('Select a content record.');
 const result=await env.DB.prepare("UPDATE institution_posts SET status='archived',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status!='archived'").bind(id).run();
 if(!result.meta?.changes)return error('Content record not found or already archived.',404);
 await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),access.user.id,'institution_content_archived','institution_post',id).run();
 return json({archived:true});
}
