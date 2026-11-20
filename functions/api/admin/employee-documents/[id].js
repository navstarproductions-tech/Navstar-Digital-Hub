import { requireRole } from '../../../_shared/auth.js';
import { error } from '../../../_shared/http.js';
export async function onRequestGet({request,env,params}){
 if(!env.DB||!env.DOCS)return error('Employee document storage is not configured.',503);
 const access=await requireRole(request,env,['admin','principal']);
 if(access.response)return access.response;
 const row=await env.DB.prepare('SELECT id,object_key,original_name,mime_type FROM employee_documents WHERE id=?').bind(params.id).first();
 if(!row)return error('Employee document not found.',404);
 const object=await env.DOCS.get(row.object_key);if(!object)return error('Stored document is missing.',404);
 const headers=new Headers();object.writeHttpMetadata(headers);headers.set('Content-Type',row.mime_type);headers.set('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(row.original_name)}`);headers.set('Cache-Control','private, no-store');headers.set('X-Content-Type-Options','nosniff');
 return new Response(object.body,{headers});
}
export async function onRequestDelete({request,env,params}){
 if(!env.DB||!env.DOCS)return error('Employee document storage is not configured.',503);
 const access=await requireRole(request,env,['admin']);if(access.response)return access.response;
 const row=await env.DB.prepare('SELECT id,object_key FROM employee_documents WHERE id=?').bind(params.id).first();if(!row)return error('Employee document not found.',404);
 await env.DB.prepare('DELETE FROM employee_documents WHERE id=?').bind(params.id).run();await env.DOCS.delete(row.object_key);
 return new Response(null,{status:204});
}
