import { requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, uuid } from '../../_shared/http.js';
import { sendBrandedEmail, sendTextSms } from '../../_shared/notifications.js';

export async function onRequestPost({request,env,waitUntil}){
  if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
  if(!env.DB)return error('Student transfer service is not configured.',503);
  const access=await requireRole(request,env,['admin','principal']);if(access.response)return access.response;
  let body;try{body=await readJson(request,32768);}catch{return error('Invalid transfer request.');}
  const ids=Array.isArray(body.studentIds)?[...new Set(body.studentIds.map(x=>safeString(x,80)).filter(Boolean))]:[];
  const targetCourseId=safeString(body.targetCourseId,80),sourceCourseId=safeString(body.sourceCourseId,80);
  const reason=safeString(body.reason,1000),channel=safeString(body.notificationChannel,10);
  if(!ids.length||ids.length>100||!targetCourseId||!sourceCourseId||targetCourseId===sourceCourseId||reason.length<5||!['email','sms'].includes(channel))return error('Select students from one source course, a different destination course, a reason and one notification channel.');
  const target=await env.DB.prepare("SELECT id,title FROM courses WHERE id=? AND status='active'").bind(targetCourseId).first();
  const source=await env.DB.prepare('SELECT id,title FROM courses WHERE id=?').bind(sourceCourseId).first();
  if(!target||!source)return error('The source or destination course could not be found.');
  const placeholders=ids.map(()=>'?').join(',');
  const rows=(await env.DB.prepare(`SELECT u.id AS user_id,u.name,u.email,p.phone,e.id AS enrollment_id,e.course_id FROM users u JOIN enrollments e ON lower(e.email)=lower(u.email) LEFT JOIN user_profiles p ON p.user_id=u.id WHERE u.id IN (${placeholders}) AND e.course_id=? AND e.status='accepted' AND u.status='active' AND COALESCE(p.portal_role,u.role)='student' ORDER BY u.name`).bind(...ids,sourceCourseId).all()).results||[];
  if(rows.length!==ids.length)return error('Some selected students are not active in the chosen source course. Refresh the list and try again.',409);
  for(const row of rows){
    const duplicate=await env.DB.prepare("SELECT id FROM enrollments WHERE lower(email)=lower(?) AND course_id=? AND status='accepted' LIMIT 1").bind(row.email,targetCourseId).first();
    if(duplicate)return error(`${row.name} is already actively enrolled in the destination course. No transfer was made.`,409);
    if(channel==='email'&&!row.email)return error(`${row.name} has no email address.`,409);
    if(channel==='sms'&&!row.phone)return error(`${row.name} has no phone number on file.`,409);
  }
  const statements=[];
  for(const row of rows){
    const transferId=uuid();
    statements.push(env.DB.prepare('INSERT INTO student_course_transfer_history(id,user_id,enrollment_id,from_course_id,to_course_id,reason,notification_channel,transferred_by) VALUES(?,?,?,?,?,?,?,?)').bind(transferId,row.user_id,row.enrollment_id,sourceCourseId,targetCourseId,reason,channel,access.user.id));
    statements.push(env.DB.prepare('UPDATE enrollments SET course_id=? WHERE id=?').bind(targetCourseId,row.enrollment_id));
    statements.push(env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),access.user.id,'student_course_transferred','enrollment',row.enrollment_id));
  }
  try{await env.DB.batch(statements);}catch(e){console.error('Student transfer failed:',String(e?.stack||e));return error('The transfer could not be completed. No notification was sent.',500);}
  const send=async()=>{
    for(const row of rows){
      const message=`Dear ${row.name},\n\nThe Admissions Office at Navstar Digital Hub has transferred your enrolment from ${source.title} to ${target.title}.\nReason: ${reason}\n\nView your student portal and course information at https://navstardigitalhub.co.ke/login\n\nThank you,\nAdmissions Office\nNavstar Digital Hub`;
      let delivered=false;
      try{
        if(channel==='email'){const result=await sendBrandedEmail(env,{email:row.email,subject:'Navstar Digital Hub · Course transfer notice',message,heading:'Course transfer notification'});delivered=Boolean(result?.ok);}
        else{await sendTextSms(env,row.phone,message);delivered=true;}
      }catch(e){console.error('Course transfer notification failed:',String(e?.message||e));}
      await env.DB.prepare('UPDATE student_course_transfer_history SET notification_status=? WHERE enrollment_id=? AND transferred_by=? AND transferred_at=(SELECT MAX(transferred_at) FROM student_course_transfer_history WHERE enrollment_id=? AND transferred_by=?)').bind(delivered?'sent':'failed',row.enrollment_id,access.user.id,row.enrollment_id,access.user.id).run();
    }
  };
  if(typeof waitUntil==='function')waitUntil(send());else await send();
  return json({transferred:rows.length,sourceCourse:source.title,destinationCourse:target.title,notificationChannel:channel,reason});
}
