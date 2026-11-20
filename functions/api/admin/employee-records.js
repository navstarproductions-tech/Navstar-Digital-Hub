import { requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, uuid } from '../../_shared/http.js';

const staffRoles = ['admin','principal','finance','admissions','tutor'];
const allowedTypes = new Set([
 'application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
 'text/plain','text/csv','image/jpeg','image/png'
]);
const maxBytes = 15 * 1024 * 1024;

export async function onRequestGet({request,env}) {
 if(!env.DB)return error('Employee records database is not configured.',503);
 const access=await requireRole(request,env,['admin','principal']);
 if(access.response)return access.response;
 const type=new URL(request.url).searchParams.get('type')||'attendance';
 if(type==='documents'){
  const rows=await env.DB.prepare(`SELECT d.id,d.employee_user_id AS employeeUserId,d.title,d.category,d.description,d.original_name AS originalName,d.mime_type AS mimeType,d.size_bytes AS sizeBytes,d.created_at AS createdAt,u.name AS employeeName,p.staff_id AS staffId FROM employee_documents d JOIN users u ON u.id=d.employee_user_id LEFT JOIN user_profiles p ON p.user_id=u.id ORDER BY d.created_at DESC LIMIT 500`).all();
  return json({documents:(rows.results||[]).map(x=>({...x,downloadUrl:`/api/admin/employee-documents/${x.id}`}))});
 }
 const rows=await env.DB.prepare(`SELECT a.id,a.employee_user_id AS employeeUserId,a.attendance_date AS attendanceDate,a.status,a.check_in AS checkIn,a.check_out AS checkOut,a.notes,a.created_at AS createdAt,a.updated_at AS updatedAt,u.name AS employeeName,u.email,p.staff_id AS staffId,p.department,p.job_title AS jobTitle FROM staff_attendance a JOIN users u ON u.id=a.employee_user_id LEFT JOIN user_profiles p ON p.user_id=u.id ORDER BY a.attendance_date DESC,u.name LIMIT 1000`).all();
 return json({attendance:rows.results||[]});
}

export async function onRequestPost({request,env}) {
 if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
 if(!env.DB)return error('Employee records database is not configured.',503);
 const access=await requireRole(request,env,['admin']);
 if(access.response)return access.response;
 const contentType=request.headers.get('content-type')||'';
 if(contentType.includes('multipart/form-data')){
  if(!env.DOCS)return error('Employee document storage is not configured. Bind the DOCS R2 bucket.',503);
  let form;try{form=await request.formData();}catch{return error('Invalid document upload.');}
  const file=form.get('file'),employeeId=safeString(form.get('employeeId'),80);
  if(!(file instanceof File)||!allowedTypes.has(file.type)||file.size<1||file.size>maxBytes)return error('Choose a supported document or image up to 15 MB.');
  const employee=await env.DB.prepare(`SELECT u.id FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id WHERE u.id=? AND COALESCE(p.portal_role,u.role) IN ('admin','principal','finance','admissions','tutor')`).bind(employeeId).first();
  if(!employee)return error('Select an existing employee account.',404);
  const id=uuid(),key=`employee-documents/${employeeId}/${id}`;
  await env.DOCS.put(key,file.stream(),{httpMetadata:{contentType:file.type,cacheControl:'private, no-store'}});
  try{
   await env.DB.prepare('INSERT INTO employee_documents(id,employee_user_id,title,category,description,object_key,original_name,mime_type,size_bytes,uploaded_by) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .bind(id,employeeId,safeString(form.get('title'),120)||file.name.slice(0,120),safeString(form.get('category'),60)||'Other',safeString(form.get('description'),500),key,safeString(file.name,180),file.type,file.size,access.user.id).run();
  }catch(e){await env.DOCS.delete(key);throw e;}
  await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),access.user.id,'employee_document_uploaded','employee_document',id).run();
  return json({id,created:true},201);
 }
 let body;try{body=await readJson(request,8192);}catch{return error('Invalid attendance record.');}
 const employeeId=safeString(body.employeeId,80),date=safeString(body.date,10),status=safeString(body.status,20);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!['present','late','absent','leave'].includes(status))return error('Choose a valid attendance date and status.');
 const employee=await env.DB.prepare(`SELECT u.id FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id WHERE u.id=? AND COALESCE(p.portal_role,u.role) IN ('admin','principal','finance','admissions','tutor')`).bind(employeeId).first();
 if(!employee)return error('Select an existing employee account.',404);
 await env.DB.prepare(`INSERT INTO staff_attendance(id,employee_user_id,attendance_date,status,check_in,check_out,notes,recorded_by) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(employee_user_id,attendance_date) DO UPDATE SET status=excluded.status,check_in=excluded.check_in,check_out=excluded.check_out,notes=excluded.notes,recorded_by=excluded.recorded_by,updated_at=CURRENT_TIMESTAMP`)
 .bind(uuid(),employeeId,date,status,safeString(body.checkIn,5)||null,safeString(body.checkOut,5)||null,safeString(body.notes,500),access.user.id).run();
 await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),access.user.id,'staff_attendance_saved','staff_attendance',employeeId+':'+date).run();
 return json({saved:true});
}
