import { requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, uuid } from '../../_shared/http.js';

const token = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
};

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('Certificate service is not configured.',503);
  const access = await requireRole(request,env,['admin','principal']);
  if (access.response) return access.response;
  const rows = await env.DB.prepare(`
    SELECT c.id,c.user_id AS userId,c.course_id AS courseId,c.certificate_no AS certificateNo,
      c.public_token AS publicToken,c.snapshot_json AS snapshotJson,c.status,c.issued_at AS issuedAt,
      u.name AS studentName,p.staff_id AS studentId,co.title AS courseTitle
    FROM student_certificates c JOIN users u ON u.id=c.user_id
    LEFT JOIN user_profiles p ON p.user_id=u.id JOIN courses co ON co.id=c.course_id
    ORDER BY c.issued_at DESC LIMIT 500
  `).all();
  return json({ certificates:(rows.results||[]).map(row=>{let snapshot={};try{snapshot=JSON.parse(row.snapshotJson||'{}')}catch{}return {...row,snapshot};}) });
}

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.',403);
  if (!env.DB) return error('Certificate service is not configured.',503);
  const access = await requireRole(request,env,['admin']);
  if (access.response) return access.response;
  let body;
  try { body = await readJson(request,4096); } catch { return error('Invalid certificate request.'); }
  const studentId = safeString(body.studentId,80), courseId = safeString(body.courseId,80);
  if (!studentId || !courseId) return error('Select a student and course.');
  const eligible = await env.DB.prepare(`
    SELECT u.id,u.name,u.email,p.staff_id AS student_id,e.admission_number,co.id AS course_id,
      co.title AS course_title,co.course_code,g.completed_at,rc.report_card_no,rc.snapshot_json AS report_card_snapshot
    FROM users u JOIN user_profiles p ON p.user_id=u.id
    JOIN enrollments e ON lower(e.email)=lower(u.email) AND e.course_id=? AND e.status='accepted'
    JOIN courses co ON co.id=e.course_id
    JOIN student_graduation_records g ON g.user_id=u.id AND g.course_id=e.course_id AND g.status='graduated'
    JOIN academic_report_cards rc ON rc.id=(SELECT ar.id FROM academic_report_cards ar WHERE ar.user_id=u.id AND ar.course_id=e.course_id AND ar.status='published' ORDER BY ar.published_at DESC,ar.issued_at DESC LIMIT 1)
    WHERE u.id=? AND COALESCE(p.portal_role,u.role)='student'
    ORDER BY e.created_at DESC LIMIT 1
  `).bind(courseId,studentId).first();
  if (!eligible) return error('A certificate requires an accepted enrolment, a recorded Graduated decision and a published report card for this course.',409);
  const duplicate = await env.DB.prepare('SELECT certificate_no FROM student_certificates WHERE user_id=? AND course_id=?').bind(studentId,courseId).first();
  if (duplicate) return error('A certificate record already exists for this student and course: '+duplicate.certificate_no,409);
  const year = String(new Date().getFullYear());
  const sequence = await env.DB.prepare(`INSERT INTO certificate_sequences(year,last_number) VALUES(?,1)
    ON CONFLICT(year) DO UPDATE SET last_number=last_number+1 RETURNING last_number`).bind(year).first();
  if (!sequence?.last_number) return error('A certificate serial number could not be allocated. Please retry.',503);
  const certificateNo = 'NDH/'+year+'/'+String(sequence.last_number).padStart(5,'0');
  const publicToken = token();
  const issuedAt = new Date().toISOString();
  let academicSnapshot={};try{academicSnapshot=JSON.parse(eligible.report_card_snapshot||'{}')}catch{}
  const snapshot = {
    certificateNo,studentName:eligible.name,studentId:eligible.student_id||'',
    courseTitle:eligible.course_title,courseCode:eligible.course_code||'',
    admissionNumber:eligible.admission_number||'',graduationDate:eligible.completed_at||'',
    reportCardNo:eligible.report_card_no||'',
    academicResults:Array.isArray(academicSnapshot.results)?academicSnapshot.results:[],
    grading:Array.isArray(academicSnapshot.grading)?academicSnapshot.grading:[],
    academicSummary:academicSnapshot.summary||{},
    issuedAt,issuer:'Navstar Digital Hub',motto:'HOME OF TECHNOCRATS',
    statement:'has successfully completed the stated course at Navstar Digital Hub.'
  };
  const id = uuid();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO student_certificates(id,user_id,course_id,certificate_no,public_token,snapshot_json,issued_by,issued_at) VALUES(?,?,?,?,?,?,?,?)')
      .bind(id,studentId,courseId,certificateNo,publicToken,JSON.stringify(snapshot),access.user.id,issuedAt),
    env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)')
      .bind(uuid(),access.user.id,'student_certificate_issued','student_certificate',id),
    env.DB.prepare('INSERT INTO notifications(id,user_id,title,message) VALUES(?,?,?,?)')
      .bind(uuid(),studentId,'Course completion certificate issued','Your Navstar Digital Hub completion certificate '+certificateNo+' is ready. Open your student portal or use the public verification link shared by Administration.')
  ]);
  return json({ issued:true,id,certificateNo,publicToken,verificationUrl:'/verify-certificate/'+encodeURIComponent(publicToken),snapshot },201);
}

export async function onRequestPatch({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.',403);
  if (!env.DB) return error('Certificate service is not configured.',503);
  const access = await requireRole(request,env,['admin']);
  if (access.response) return access.response;
  let body;
  try { body = await readJson(request,4096); } catch { return error('Invalid certificate action.'); }
  const id = safeString(body.id,80);
  const reason = safeString(body.reason,1000).trim();
  if (!id || body.action !== 'revoke' || reason.length < 5) return error('Select a certificate and enter a clear reason for revocation.');
  const certificate = await env.DB.prepare("SELECT id,user_id,certificate_no,status FROM student_certificates WHERE id=?").bind(id).first();
  if (!certificate) return error('Certificate not found.',404);
  if (certificate.status !== 'issued') return error('This certificate has already been revoked.',409);
  await env.DB.batch([
    env.DB.prepare("UPDATE student_certificates SET status='revoked',revoked_by=?,revoked_at=CURRENT_TIMESTAMP,revoke_reason=? WHERE id=? AND status='issued'").bind(access.user.id,reason,id),
    env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),access.user.id,'student_certificate_revoked','student_certificate',id),
    env.DB.prepare('INSERT INTO notifications(id,user_id,title,message) VALUES(?,?,?,?)').bind(uuid(),certificate.user_id,'Completion certificate revoked','Navstar Digital Hub has revoked certificate '+certificate.certificate_no+'. Reason: '+reason)
  ]);
  return json({ revoked:true,id,status:'revoked' });
}
