import { requireRole } from '../../../../_shared/auth.js';
import { error } from '../../../../_shared/http.js';
export async function onRequestGet({request,env,params}){
 if(!env.DB||!env.DOCS)return error('Application document storage is not configured.',503);
 const access=await requireRole(request,env,['admin','principal']);if(access.response)return access.response;
 const row=await env.DB.prepare('SELECT document_key,document_name,document_mime_type FROM staff_applications WHERE id=?').bind(params.id).first();
 if(!row?.document_key)return error('No supporting document was uploaded.',404);
 const object=await env.DOCS.get(row.document_key);if(!object)return error('The application document is unavailable.',404);
 return new Response(object.body,{headers:{'Content-Type':row.document_mime_type||'application/octet-stream','Content-Disposition':'inline; filename="'+String(row.document_name||'application-document').replace(/["\\r\\n]/g,'')+'"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
