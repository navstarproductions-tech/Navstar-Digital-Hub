import { requireRole } from '../../../_shared/auth.js';
import { error,uuid } from '../../../_shared/http.js';
export async function onRequestGet({request,env,params}){
 const access=await requireRole(request,env,['admin','principal']);
 if(access.response)return access.response;
 if(!env.DB)return error('Employee document storage is not configured.',503);
 const row=await env.DB.prepare('SELECT id,object_key,original_name,mime_type FROM employee_documents WHERE id=?').bind(params.id).first();
 if(!row)return error('Employee document not found.',404);
 if(env.NAVSTAR_STORAGE){
  const central=await env.DB.prepare("SELECT status FROM stored_files WHERE id=? AND module='employees'").bind(params.id).first().catch(()=>null);
  if(central){
   if(central.status!=='active')return error('Employee document not found.',404);
   const object=await env.NAVSTAR_STORAGE.get(row.object_key);if(!object)return error('Stored document is missing.',404);
   const headers=new Headers();object.writeHttpMetadata(headers);headers.set('Content-Type',row.mime_type);headers.set('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(row.original_name)}`);headers.set('Cache-Control','private, no-store');headers.set('X-Content-Type-Options','nosniff');
   return new Response(object.body,{headers});
  }
 }
 if(!env.DOCS)return error('Legacy employee document storage is not configured.',503);
 const object=await env.DOCS.get(row.object_key);if(!object)return error('Stored document is missing.',404);
 const headers=new Headers();object.writeHttpMetadata(headers);headers.set('Content-Type',row.mime_type);headers.set('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(row.original_name)}`);headers.set('Cache-Control','private, no-store');headers.set('X-Content-Type-Options','nosniff');
 return new Response(object.body,{headers});
}
export async function onRequestDelete({request,env,params}){
 if(!env.DB)return error('Employee document storage is not configured.',503);
 const access=await requireRole(request,env,['admin']);if(access.response)return access.response;
 const row=await env.DB.prepare('SELECT id,object_key FROM employee_documents WHERE id=?').bind(params.id).first();if(!row)return error('Employee document not found.',404);
 const central=env.NAVSTAR_STORAGE?await env.DB.prepare("SELECT id FROM stored_files WHERE id=? AND module='employees'").bind(params.id).first().catch(()=>null):null;
 if(central){
  await env.DB.batch([
   env.DB.prepare("UPDATE stored_files SET status='deleted',deleted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(params.id),
   env.DB.prepare('DELETE FROM employee_documents WHERE id=?').bind(params.id),
   env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),access.user.id,'employee_document_soft_deleted','stored_file',params.id)
  ]);
  return new Response(null,{status:204});
 }
 if(!env.DOCS)return error('Legacy employee document storage is not configured.',503);
 await env.DB.prepare('DELETE FROM employee_documents WHERE id=?').bind(params.id).run();await env.DOCS.delete(row.object_key);
 return new Response(null,{status:204});
}
