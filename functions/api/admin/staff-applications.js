import { requireRole } from '../../_shared/auth.js';
import { error,isSameOrigin,json,readJson,safeString,uuid } from '../../_shared/http.js';

export async function onRequestGet({request,env}){
 if(!env.DB)return error('Recruitment database is not configured.',503);
 const access=await requireRole(request,env,['admin','principal']);if(access.response)return access.response;
 const url=new URL(request.url),status=safeString(url.searchParams.get('status'),24);
 const rows=await env.DB.prepare(`SELECT id,applicant_name AS applicantName,email,phone,position_applied AS positionApplied,subject_specialisations AS specialisations,qualifications,experience,cover_letter AS coverLetter,document_name AS documentName,status,review_notes AS reviewNotes,created_at AS createdAt,reviewed_at AS reviewedAt FROM staff_applications ${status? 'WHERE status=?':''} ORDER BY created_at DESC LIMIT 300`).bind(...(status?[status]:[])).all();
 return json({applications:rows.results||[]});
}
export async function onRequestPost({request,env}){
 if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
 if(!env.DB)return error('Recruitment database is not configured.',503);
 const access=await requireRole(request,env,['admin','principal']);if(access.response)return access.response;
 let body;try{body=await readJson(request,8192);}catch{return error('Invalid review request.');}
 const id=safeString(body.id,80),status=safeString(body.status,24),notes=safeString(body.notes,3000);
 if(!id||!['under_review','shortlisted','approved','rejected','withdrawn'].includes(status))return error('Choose a valid application and review decision.');
 const row=await env.DB.prepare('SELECT id FROM staff_applications WHERE id=?').bind(id).first();if(!row)return error('Staff application not found.',404);
 await env.DB.batch([
  env.DB.prepare('UPDATE staff_applications SET status=?,review_notes=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(status,notes,access.user.id,id),
  env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),access.user.id,'staff_application_'+status,'staff_application',id)
 ]);
 return json({updated:true,status});
}
