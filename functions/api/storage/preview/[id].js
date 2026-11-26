import { requireRole } from '../../../_shared/auth.js';
import { error } from '../../../_shared/http.js';
import { canReadStoredFile } from '../../../_shared/storage.js';

const roles=['student','tutor','admissions','principal','finance','admin'];
export async function onRequestGet({request,env,params}){
  if(!env.DB||!env.NAVSTAR_STORAGE)return error('Private file storage is not configured.',503);
  const access=await requireRole(request,env,roles);if(access.response)return access.response;
  const file=await env.DB.prepare('SELECT * FROM stored_files WHERE id=?').bind(params.id).first();
  if(!file||!(await canReadStoredFile(env.DB,file,access.user)))return error('File not found or access is not permitted.',404);
  const object=await env.NAVSTAR_STORAGE.get(file.object_key);
  if(!object)return error('The stored file is unavailable.',404);
  const headers=new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Content-Type',file.mime_type);
  headers.set('Content-Disposition','inline; filename*=UTF-8\'\''+encodeURIComponent(file.original_name));
  headers.set('Cache-Control','private, no-store');
  headers.set('X-Content-Type-Options','nosniff');
  headers.set('Referrer-Policy','no-referrer');
  return new Response(object.body,{headers});
}
