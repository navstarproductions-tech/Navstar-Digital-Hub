import { getSession, requireRole } from '../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, uuid } from '../_shared/http.js';
import { syncModuleResult, syncStudentModuleResults } from '../_shared/module-marks.js';

const staffRoles=['admin','principal','tutor'];
const adminRoles=['admin','principal'];
const dateTimePattern=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

const requiredAcademicTables=['course_timetable','course_attendance','course_live_classes','course_scholarships','scholarship_applications','student_graduation_records','student_report_cards','student_certificates','course_assessments','course_assessment_results','course_assessment_attempts','student_module_registrations','module_tutor_assignments','exam_institute_settings','course_exam_questions','exam_runtime_attempts','exam_runtime_answers','assessment_component_marks','academic_report_cards','academic_conversations','academic_messages','timetable_generation_rules','exam_attempt_approvals'];
async function requireAcademicSchema(db){
  const placeholders=requiredAcademicTables.map(()=>'?').join(',');
  const result=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ("+placeholders+")").bind(...requiredAcademicTables).all();
  const existing=new Set((result.results||[]).map(row=>row.name));
  const missing=requiredAcademicTables.filter(name=>!existing.has(name));
  return missing.length?json({error:'The academic database upgrade has not been fully applied. Existing records are safe; complete the pending production D1 migrations before using the academic workspace.',code:'ACADEMIC_SCHEMA_NOT_READY',missingTables:missing},503):null;
}

async function ensureModuleTutorAssignments(db){
  await db.prepare('CREATE TABLE IF NOT EXISTS module_tutor_assignments (id TEXT PRIMARY KEY,module_id TEXT NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,tutor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(module_id,tutor_user_id))').run();
  await db.prepare('INSERT OR IGNORE INTO module_tutor_assignments(id,module_id,tutor_user_id,assigned_by) SELECT lower(hex(randomblob(16))),m.id,a.tutor_user_id,a.assigned_by FROM course_modules m JOIN course_tutor_assignments a ON a.course_id=m.course_id').run();
}
async function courseAccess(db,user,courseId){
  if(adminRoles.includes(user.role))return true;
  if(user.role==='tutor'){
    const row=await db.prepare('SELECT id FROM course_tutor_assignments WHERE course_id=? AND tutor_user_id=?').bind(courseId,user.id).first();
    if(row)return true;
    const moduleRow=await db.prepare('SELECT a.id FROM module_tutor_assignments a JOIN course_modules m ON m.id=a.module_id WHERE m.course_id=? AND a.tutor_user_id=? LIMIT 1').bind(courseId,user.id).first();
    return Boolean(moduleRow);
  }
  if(user.role==='student'){
    const row=await db.prepare("SELECT id FROM enrollments WHERE course_id=? AND email=? COLLATE NOCASE AND status='accepted' LIMIT 1").bind(courseId,user.email).first();
    return Boolean(row);
  }
  return false;
}
async function visibleCourseIds(db,user){
  if(adminRoles.includes(user.role)){
    const r=await db.prepare("SELECT id FROM courses WHERE status='active'").all();
    return (r.results||[]).map(x=>x.id);
  }
  if(user.role==='tutor'){
    const r=await db.prepare('SELECT DISTINCT m.course_id AS id FROM module_tutor_assignments a JOIN course_modules m ON m.id=a.module_id WHERE a.tutor_user_id=? UNION SELECT course_id AS id FROM course_tutor_assignments WHERE tutor_user_id=?').bind(user.id,user.id).all();
    return (r.results||[]).map(x=>x.id);
  }
  if(user.role==='student'){
    const r=await db.prepare("SELECT DISTINCT course_id AS id FROM enrollments WHERE email=? COLLATE NOCASE AND status='accepted'").bind(user.email).all();
    return (r.results||[]).map(x=>x.id);
  }
  return [];
}
async function getCentralMarksPolicy(db){
 const row=await db.prepare("SELECT value FROM system_state WHERE key='admin-configuration'").first();
 let config={};try{config=JSON.parse(row?.value||'{}')}catch{}
 const grading=config.grading||{},lines=String(grading.gradeScale||'').split(/\r?\n/);
 const gradingScale=lines.map(line=>line.split('|').map(part=>part.trim())).filter(parts=>parts[0]&&parts[2]!==''&&parts[3]!==''&&parts[2]!=='—'&&parts[3]!=='—'&&Number.isFinite(Number(parts[2]))&&Number.isFinite(Number(parts[3]))).map(parts=>({grade:parts[0],classification:parts[1]||'',min:Number(parts[2]),max:Number(parts[3]),remarks:parts.slice(4).join(' | ')}));
 const maximum=Number(grading.publishedMaximum);
 return {publishedMaximum:Number.isFinite(maximum)&&maximum>0?maximum:100,gradingScale:gradingScale.length?gradingScale:[{grade:'A',min:80,max:100,remarks:'Exceptional performance'},{grade:'B+',min:70,max:79,remarks:'Strong technical skills'},{grade:'B',min:60,max:69,remarks:'Competent work'},{grade:'C',min:50,max:59,remarks:'Satisfactory work'},{grade:'D',min:40,max:49,remarks:'Developing'},{grade:'F',min:0,max:39,remarks:'Essential requirements not met'}]};
}
function publishedMaximum(type,settings={}){const value=Number(settings?.publishedMaximum);return Number.isFinite(value)&&value>0?value:100;}

function scaledPoints(raw,rawMaximum,publishedMaximumValue){
 const denominator=Number(rawMaximum)>0?Number(rawMaximum):100;
 return Math.round((Number(raw||0)/denominator)*Number(publishedMaximumValue)*100)/100;
}
function validDate(value){return typeof value==='string'&&dateTimePattern.test(value)&&Number.isFinite(Date.parse(value));}
async function requireCourse(db,user,courseId){
  if(!courseId||!(await courseAccess(db,user,courseId)))return false;
  return true;
}
export async function onRequestGet({request,env}){
  if(!env.DB)return error('Academic portal database is not configured.',503);
  const user=await getSession(request,env);
  if(!user)return error('Sign in required.',401);
  const schemaResponse=await requireAcademicSchema(env.DB);
  if(schemaResponse)return schemaResponse;
  await ensureModuleTutorAssignments(env.DB);
  if(!['student',...staffRoles].includes(user.role))return error('This account cannot access academic records.',403);
  const ids=await visibleCourseIds(env.DB,user);
  if(!ids.length){
    const certificates=user.role==='student'?(await env.DB.prepare('SELECT c.*,co.title AS course_title FROM student_certificates c JOIN courses co ON co.id=c.course_id WHERE c.user_id=? ORDER BY c.issued_at DESC').bind(user.id).all()).results||[]:[];
    return json({courses:[],learners:[],timetable:[],attendance:[],liveClasses:[],scholarships:[],moduleRegistrations:[],assessments:[],assessmentResults:[],assessmentComponents:[],assessmentAttempts:[],examRuntimeAttempts:[],examCandidates:[],moduleResults:[],graduation:[],reportCards:[],certificates});
  }
  const marks=ids.map(()=>'?').join(',');
  const courses=(await env.DB.prepare(`SELECT id,title FROM courses WHERE id IN (${marks}) ORDER BY title`).bind(...ids).all()).results||[];
  const learners=user.role==='student'?[]:(await env.DB.prepare(`SELECT DISTINCT u.id,u.name,u.email,e.course_id,c.title AS course_title FROM users u JOIN enrollments e ON lower(e.email)=lower(u.email) JOIN courses c ON c.id=e.course_id WHERE e.status='accepted' AND u.role='student' AND u.status='active' AND e.course_id IN (${marks}) ORDER BY u.name`).bind(...ids).all()).results||[];
  const timetable=(await env.DB.prepare(`SELECT t.*,c.title AS course_title,m.title AS module_title FROM course_timetable t JOIN courses c ON c.id=t.course_id LEFT JOIN course_modules m ON m.id=t.module_id WHERE t.course_id IN (${marks}) ORDER BY t.starts_at`).bind(...ids).all()).results||[];
  const liveClasses=(await env.DB.prepare(`SELECT l.*,c.title AS course_title,m.title AS module_title FROM course_live_classes l JOIN courses c ON c.id=l.course_id LEFT JOIN course_modules m ON m.id=l.module_id WHERE l.course_id IN (${marks}) ORDER BY l.starts_at DESC`).bind(...ids).all()).results||[];
  const scholarships=(await env.DB.prepare(`SELECT s.*,c.title AS course_title,a.id AS application_id,a.status AS application_status FROM course_scholarships s LEFT JOIN courses c ON c.id=s.course_id LEFT JOIN scholarship_applications a ON a.scholarship_id=s.id AND a.user_id=? WHERE (s.course_id IS NULL OR s.course_id IN (${marks})) AND s.status!='draft' ORDER BY s.deadline`).bind(user.id,...ids).all()).results||[];
  const moduleRegistrations=user.role==='student'?(await env.DB.prepare(`SELECT r.*,m.title AS module_title,c.title AS course_title FROM student_module_registrations r JOIN course_modules m ON m.id=r.module_id JOIN courses c ON c.id=r.course_id WHERE r.user_id=? ORDER BY c.title,m.sort_order`).bind(user.id).all()).results||[]:[];
  const attendance=user.role==='student'?(await env.DB.prepare(`SELECT a.*,t.title AS session_title,t.starts_at,c.title AS course_title FROM course_attendance a JOIN course_timetable t ON t.id=a.timetable_id JOIN courses c ON c.id=t.course_id WHERE a.student_user_id=? ORDER BY a.marked_at DESC`).bind(user.id).all()).results||[]:(await env.DB.prepare(`SELECT a.*,t.title AS session_title,t.starts_at,c.title AS course_title,u.name AS student_name FROM course_attendance a JOIN course_timetable t ON t.id=a.timetable_id JOIN courses c ON c.id=t.course_id JOIN users u ON u.id=a.student_user_id WHERE t.course_id IN (${marks}) ORDER BY a.marked_at DESC LIMIT 500`).bind(...ids).all()).results||[];
  const assessments=(await env.DB.prepare(`SELECT a.*,c.title AS course_title,m.title AS module_title,r.points_awarded,r.raw_points_awarded,r.published_max_points,r.feedback,r.published_at,(SELECT ap.status FROM exam_attempt_approvals ap WHERE ap.assessment_id=a.id AND ap.user_id=? LIMIT 1) AS approval_status FROM course_assessments a JOIN courses c ON c.id=a.course_id LEFT JOIN course_modules m ON m.id=a.module_id LEFT JOIN course_assessment_results r ON r.assessment_id=a.id AND r.user_id=? WHERE a.course_id IN (${marks}) AND (a.status!='draft' OR ?!='student') ORDER BY a.due_at`).bind(user.id,user.id,...ids,user.role).all()).results||[];
  const examSettingsRow=await env.DB.prepare("SELECT settings_json FROM exam_institute_settings WHERE id='default'").first();
  let examSettings={};try{examSettings=JSON.parse(examSettingsRow?.settings_json||'{}');}catch{examSettings={};}
  const marksPolicy=await getCentralMarksPolicy(env.DB);examSettings={...examSettings,...marksPolicy};
  const moduleResults=user.role==='student'?(await env.DB.prepare(`SELECT r.*,m.title AS module_title,c.title AS course_title FROM student_module_results r JOIN course_modules m ON m.id=r.module_id JOIN courses c ON c.id=r.course_id WHERE r.user_id=? ORDER BY c.title,m.sort_order`).bind(user.id).all()).results||[]:(await env.DB.prepare(`SELECT r.*,m.title AS module_title,c.title AS course_title,u.name AS student_name FROM student_module_results r JOIN course_modules m ON m.id=r.module_id JOIN courses c ON c.id=r.course_id JOIN users u ON u.id=r.user_id WHERE r.course_id IN (${marks}) ORDER BY c.title,m.sort_order,u.name LIMIT 2000`).bind(...ids).all()).results||[];
  const graduation=user.role==='student'?(await env.DB.prepare(`SELECT g.*,c.title AS course_title FROM student_graduation_records g JOIN courses c ON c.id=g.course_id WHERE g.user_id=?`).bind(user.id).all()).results||[]:(await env.DB.prepare(`SELECT g.*,c.title AS course_title,u.name AS student_name FROM student_graduation_records g JOIN courses c ON c.id=g.course_id JOIN users u ON u.id=g.user_id WHERE g.course_id IN (${marks}) ORDER BY c.title,u.name`).bind(...ids).all()).results||[];
  const reportCards=user.role==='student'?(await env.DB.prepare('SELECT r.*,c.title AS course_title FROM student_report_cards r JOIN courses c ON c.id=r.course_id WHERE r.user_id=? ORDER BY r.issued_at DESC').bind(user.id).all()).results||[]:(await env.DB.prepare(`SELECT r.*,c.title AS course_title,u.name AS student_name FROM student_report_cards r JOIN courses c ON c.id=r.course_id JOIN users u ON u.id=r.user_id WHERE r.course_id IN (${marks}) ORDER BY r.issued_at DESC LIMIT 500`).bind(...ids).all()).results||[];
  const certificates=user.role==='student'?(await env.DB.prepare('SELECT c.*,co.title AS course_title FROM student_certificates c JOIN courses co ON co.id=c.course_id WHERE c.user_id=? ORDER BY c.issued_at DESC').bind(user.id).all()).results||[]:[];
  const assessmentResults=user.role==='student'?[]:(await env.DB.prepare(`SELECT r.*,a.title AS assessment_title,a.course_id,a.max_points AS paper_max_points,COALESCE(r.published_max_points,a.max_points) AS max_points,u.name AS student_name,(SELECT e.admission_number FROM enrollments e WHERE e.course_id=a.course_id AND lower(e.email)=lower(u.email) AND e.status='accepted' LIMIT 1) AS admission_number,c.title AS course_title FROM course_assessment_results r JOIN course_assessments a ON a.id=r.assessment_id JOIN users u ON u.id=r.user_id JOIN courses c ON c.id=a.course_id WHERE a.course_id IN (${marks}) ORDER BY r.marked_at DESC LIMIT 500`).bind(...ids).all()).results||[];
  const assessmentComponents=user.role==='student'?[]:(await env.DB.prepare(`SELECT m.assessment_id,m.user_id,m.component_key,m.component_label,m.points_awarded,m.max_points,m.feedback,m.marked_at,u.name AS student_name,a.title AS assessment_title,c.title AS course_title FROM assessment_component_marks m JOIN course_assessments a ON a.id=m.assessment_id JOIN users u ON u.id=m.user_id JOIN courses c ON c.id=a.course_id WHERE a.course_id IN (${marks}) ORDER BY m.marked_at DESC LIMIT 2500`).bind(...ids).all()).results||[];
  const assessmentAttempts=user.role==='student'?(await env.DB.prepare(`SELECT t.*,a.title AS assessment_title,a.course_id,a.max_points,a.instructions,c.title AS course_title FROM course_assessment_attempts t JOIN course_assessments a ON a.id=t.assessment_id JOIN courses c ON c.id=a.course_id WHERE t.user_id=? ORDER BY t.submitted_at DESC`).bind(user.id).all()).results||[]:(await env.DB.prepare(`SELECT t.*,a.title AS assessment_title,a.course_id,a.max_points,u.name AS student_name,c.title AS course_title FROM course_assessment_attempts t JOIN course_assessments a ON a.id=t.assessment_id JOIN users u ON u.id=t.user_id JOIN courses c ON c.id=a.course_id WHERE a.course_id IN (${marks}) ORDER BY t.submitted_at DESC LIMIT 500`).bind(...ids).all()).results||[];
  const examRuntimeAttempts=user.role==='student'?(await env.DB.prepare(`SELECT t.id,t.assessment_id,t.user_id,t.attempt_number,t.started_at,t.expires_at,t.submitted_at,t.status,t.flagged_count,t.objective_score,t.total_score,a.title AS assessment_title,a.course_id,a.max_points,a.instructions,c.title AS course_title,ap.status AS approval_status FROM exam_runtime_attempts t JOIN course_assessments a ON a.id=t.assessment_id JOIN courses c ON c.id=a.course_id LEFT JOIN exam_attempt_approvals ap ON ap.assessment_id=t.assessment_id AND ap.user_id=t.user_id WHERE t.user_id=? ORDER BY t.started_at DESC LIMIT 100`).bind(user.id).all()).results||[]:(await env.DB.prepare(`SELECT t.id,t.assessment_id,t.user_id,t.attempt_number,t.started_at,t.expires_at,t.submitted_at,t.status,t.flagged_count,t.objective_score,t.total_score,a.title AS assessment_title,a.course_id,a.max_points,u.name AS student_name,c.title AS course_title,ap.status AS approval_status FROM exam_runtime_attempts t JOIN course_assessments a ON a.id=t.assessment_id JOIN users u ON u.id=t.user_id JOIN courses c ON c.id=a.course_id LEFT JOIN exam_attempt_approvals ap ON ap.assessment_id=t.assessment_id AND ap.user_id=t.user_id WHERE a.course_id IN (${marks}) ORDER BY t.started_at DESC LIMIT 500`).bind(...ids).all()).results||[];
  const examCandidates=user.role==='student'?[]:(await env.DB.prepare(`SELECT a.id AS assessment_id,a.title AS assessment_title,a.course_id,a.require_admin_approval,u.id AS user_id,u.name AS student_name,c.title AS course_title,ap.status AS approval_status FROM course_assessments a JOIN courses c ON c.id=a.course_id JOIN enrollments e ON e.course_id=a.course_id AND e.status='accepted' JOIN users u ON lower(u.email)=lower(e.email) LEFT JOIN exam_attempt_approvals ap ON ap.assessment_id=a.id AND ap.user_id=u.id WHERE a.course_id IN (${marks}) AND a.status='published' ORDER BY a.title,u.name LIMIT 500`).bind(...ids).all()).results||[];
  const scholarshipApplications=user.role==='student'?[]:(await env.DB.prepare(`SELECT a.*,s.title AS scholarship_title,s.course_id,u.name AS student_name,u.email,c.title AS course_title FROM scholarship_applications a JOIN course_scholarships s ON s.id=a.scholarship_id JOIN users u ON u.id=a.user_id LEFT JOIN courses c ON c.id=s.course_id WHERE (s.course_id IS NULL OR s.course_id IN (${marks})) ORDER BY a.created_at DESC LIMIT 500`).bind(...ids).all()).results||[];
  return json({courses,learners,timetable,attendance,liveClasses,scholarships,moduleRegistrations,assessments,assessmentResults,assessmentComponents,assessmentAttempts,examRuntimeAttempts,examCandidates,moduleResults,scholarshipApplications,graduation,reportCards,certificates,examSettings,role:user.role});
}
export async function onRequestPost({request,env}){
  if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
  if(!env.DB)return error('Academic portal database is not configured.',503);
  const user=await getSession(request,env);
  if(!user)return error('Sign in required.',401);
  const schemaResponse=await requireAcademicSchema(env.DB);
  if(schemaResponse)return schemaResponse;
  let body;try{body=await readJson(request,16384);}catch{return error('Invalid academic request.');}
  const action=safeString(body.action,40);
  const courseId=safeString(body.courseId,80);
  const moduleId=safeString(body.moduleId,80);
  const title=safeString(body.title,160);
  const audit=async(name,type,id)=>env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),user.id,name,type,id).run();
  if(action==='delete_assessment_result'){
    const access=await requireRole(request,env,adminRoles);if(access.response)return access.response;
    const assessmentId=safeString(body.assessmentId,80),studentId=safeString(body.studentId,80);
    const assessment=await env.DB.prepare('SELECT id,course_id,module_id FROM course_assessments WHERE id=?').bind(assessmentId).first();
    if(!assessment||!(await requireCourse(env.DB,user,assessment.course_id)))return error('Assessment access denied.',403);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM assessment_component_marks WHERE assessment_id=? AND user_id=?').bind(assessmentId,studentId),
      env.DB.prepare('DELETE FROM course_assessment_results WHERE assessment_id=? AND user_id=?').bind(assessmentId,studentId),
      env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),user.id,'assessment_result_deleted','assessment_result',assessmentId+':'+studentId)
    ]);
    return json({deleted:true});
  }
  if(action==='set_exam_candidate_approval'){
    const access=await requireRole(request,env,staffRoles);if(access.response)return access.response;
    const assessmentId=safeString(body.assessmentId,80),studentId=safeString(body.studentId,80),status=safeString(body.status,20);
    if(!['approved','rejected','pending'].includes(status))return error('Choose approved, rejected or pending.');
    const assessment=await env.DB.prepare('SELECT id,course_id FROM course_assessments WHERE id=?').bind(assessmentId).first();
    if(!assessment||!(await requireCourse(env.DB,user,assessment.course_id)))return error('Assessment access denied.',403);
    const enrolled=await env.DB.prepare("SELECT u.id FROM users u JOIN enrollments e ON lower(e.email)=lower(u.email) WHERE u.id=? AND e.course_id=? AND e.status='accepted'").bind(studentId,assessment.course_id).first();
    if(!enrolled)return error('Student is not enrolled in this course.',404);
    await env.DB.prepare('INSERT INTO exam_attempt_approvals(id,assessment_id,user_id,status,reviewed_by,reviewed_at,note) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP,?) ON CONFLICT(assessment_id,user_id) DO UPDATE SET status=excluded.status,reviewed_by=excluded.reviewed_by,reviewed_at=CURRENT_TIMESTAMP,note=excluded.note').bind(uuid(),assessmentId,studentId,status,user.id,safeString(body.note,500)).run();
    return json({saved:true,status});
  }
  if(action==='save_exam_settings'){
    const access=await requireRole(request,env,adminRoles);if(access.response)return access.response;
    const settings=body.settings&&typeof body.settings==='object'?body.settings:{};
    delete settings.categoryScales;delete settings.gradingScale;delete settings.publishedMaximum;
    await env.DB.prepare("INSERT INTO exam_institute_settings(id,settings_json,updated_by,updated_at) VALUES('default',?,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET settings_json=excluded.settings_json,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify(settings),user.id).run();
    await audit('exam_institute_settings_updated','exam_settings','default');
    return json({saved:true});
  }
  if(action==='set_result_visibility'){
    const access=await requireRole(request,env,adminRoles);if(access.response)return access.response;
    const assessmentId=safeString(body.assessmentId,80),visible=body.visible===true;
    const assessment=await env.DB.prepare('SELECT id FROM course_assessments WHERE id=?').bind(assessmentId).first();
    if(!assessment)return error('Exam not found.',404);
    await env.DB.prepare('UPDATE course_assessment_results SET published_at=? WHERE assessment_id=?').bind(visible?new Date().toISOString():null,assessmentId).run();
    await audit(visible?'exam_results_published':'exam_results_hidden','assessment',assessmentId);
    return json({updated:true,visible});
  }


  if(action==='register_module'){
    if(user.role!=='student')return error('Only students can register for modules.',403);
    const module=await env.DB.prepare('SELECT id,course_id FROM course_modules WHERE id=? AND status=?').bind(moduleId,'published').first();
    if(!module||!(await courseAccess(env.DB,user,module.course_id)))return error('This module is not available in your accepted course.',403);
    const id=uuid();
    await env.DB.prepare("INSERT INTO student_module_registrations(id,user_id,course_id,module_id) VALUES(?,?,?,?) ON CONFLICT(user_id,module_id) DO UPDATE SET status='registered'").bind(id,user.id,module.course_id,moduleId).run();
    return json({registered:true,moduleId});
  }

  if(action==='submit_assessment'){
    if(user.role!=='student')return error('Only students can submit tests and examinations.',403);
    const assessmentId=safeString(body.assessmentId,80),responseText=safeString(body.responseText,12000),attachmentUrl=safeString(body.attachmentUrl,500);
    const assessment=await env.DB.prepare("SELECT id,course_id,status,starts_at,due_at FROM course_assessments WHERE id=?").bind(assessmentId).first();
    if(!assessment||assessment.status!=='published'||!(await courseAccess(env.DB,user,assessment.course_id)))return error('This assessment is not available to your account.',403);
    if(assessment.starts_at&&Date.parse(assessment.starts_at)>Date.now())return error('This assessment has not opened yet. Check the scheduled start time.',409);
    if(assessment.due_at&&Date.parse(assessment.due_at)<Date.now())return error('The submission deadline has passed.',409);
    if(!responseText&&!attachmentUrl)return error('Provide your answer or attach a secure HTTPS document.');
    if(attachmentUrl&&!/^https:\/\//i.test(attachmentUrl))return error('Assessment attachments must use HTTPS.');
    const existing=await env.DB.prepare('SELECT status FROM course_assessment_attempts WHERE assessment_id=? AND user_id=?').bind(assessmentId,user.id).first();
    if(existing?.status==='graded')return error('This assessment has already been graded. Contact your tutor if a correction is needed.',409);
    await env.DB.prepare("INSERT INTO course_assessment_attempts(id,assessment_id,user_id,response_text,attachment_url,status) VALUES(?,?,?,?,?,'submitted') ON CONFLICT(assessment_id,user_id) DO UPDATE SET response_text=excluded.response_text,attachment_url=excluded.attachment_url,status='submitted',submitted_at=CURRENT_TIMESTAMP").bind(uuid(),assessmentId,user.id,responseText,attachmentUrl||null).run();
    return json({submitted:true});
  }

  if(action==='save_manual_assessment_mark'){
    const access=await requireRole(request,env,staffRoles);if(access.response)return access.response;
    const assessmentId=safeString(body.assessmentId,80),studentId=safeString(body.studentId,80),feedbackText=safeString(body.feedback,3000);
    const assessment=await env.DB.prepare('SELECT id,course_id,assessment_type,max_points FROM course_assessments WHERE id=?').bind(assessmentId).first();
    if(!assessment||!(await requireCourse(env.DB,user,assessment.course_id)))return error('Assessment access denied.',403);
    const enrolled=await env.DB.prepare("SELECT u.id FROM users u JOIN enrollments e ON lower(e.email)=lower(u.email) WHERE u.id=? AND e.course_id=? AND e.status='accepted'").bind(studentId,assessment.course_id).first();
    let raw=Number(body.rawPoints);
    let rawMaximum=Number(assessment.max_points)>0?Number(assessment.max_points):100;
    const componentRows=[];
    if(Array.isArray(body.components)&&body.components.length){
      const expected=[
        {key:'accuracy',label:'Accuracy',maxPoints:3},
        {key:'speed',label:'Speed',maxPoints:2},
        {key:'presentation',label:'Presentation',maxPoints:2},
        {key:'understanding',label:'Understanding',maxPoints:2},
        {key:'safety',label:'Safety',maxPoints:1}
      ];
      if(assessment.assessment_type!=='practical')return error('The practical rubric can only be used for a practical assessment.',409);
      if(body.components.length!==expected.length)return error('Submit all five practical assessment criteria.',400);
      for(const rule of expected){
        const item=body.components.find(row=>row&&row.key===rule.key);
        const points=Number(item?.pointsAwarded),maximum=Number(item?.maxPoints);
        if(!item||maximum!==rule.maxPoints||!Number.isFinite(points)||points<0||points>rule.maxPoints)return error('Enter a valid score for '+rule.label+' (maximum '+rule.maxPoints+').',400);
        componentRows.push({...rule,pointsAwarded:points});
      }
      raw=componentRows.reduce((sum,row)=>sum+row.pointsAwarded,0);
      rawMaximum=10;
      if(!Number.isFinite(Number(body.rawPoints))||Math.abs(Number(body.rawPoints)-raw)>0.001)return error('The practical total does not match the five criterion scores.',409);
    }
    if(!enrolled||!Number.isFinite(raw)||raw<0||raw>rawMaximum)return error('Enter a valid mark for an enrolled student, within the assessment maximum.',409);
    const policy=await getCentralMarksPolicy(env.DB);const targetMaximum=policy.publishedMaximum,published=scaledPoints(raw,rawMaximum,targetMaximum);
    const statements=[
      env.DB.prepare("INSERT INTO course_assessment_results(id,assessment_id,user_id,points_awarded,feedback,published_at,marked_by,raw_points_awarded,published_max_points) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(assessment_id,user_id) DO UPDATE SET points_awarded=excluded.points_awarded,feedback=excluded.feedback,published_at=excluded.published_at,marked_by=excluded.marked_by,marked_at=CURRENT_TIMESTAMP,raw_points_awarded=excluded.raw_points_awarded,published_max_points=excluded.published_max_points").bind(uuid(),assessmentId,studentId,published,feedbackText,body.publish===false?null:new Date().toISOString(),user.id,raw,targetMaximum)
    ];
    for(const row of componentRows){
      statements.push(env.DB.prepare("INSERT INTO assessment_component_marks(id,assessment_id,user_id,component_key,component_label,points_awarded,max_points,feedback,marked_by,marked_at) VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(assessment_id,user_id,component_key) DO UPDATE SET component_label=excluded.component_label,points_awarded=excluded.points_awarded,max_points=excluded.max_points,feedback=excluded.feedback,marked_by=excluded.marked_by,marked_at=CURRENT_TIMESTAMP")
        .bind(uuid(),assessmentId,studentId,row.key,row.label,row.pointsAwarded,row.maxPoints,feedbackText,user.id));
    }
    statements.push(env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),user.id,'manual_assessment_mark_saved','assessment_result',assessmentId+':'+studentId));
    await env.DB.batch(statements);
    return json({saved:true,rawPoints:raw,rawMaximum,publishedPoints:published,publishedMaximum:targetMaximum,components:componentRows});
  }
  if(action==='grade_assessment_attempt'){
    const access=await requireRole(request,env,staffRoles);if(access.response)return access.response;
    const attemptId=safeString(body.attemptId,80),points=Number(body.pointsAwarded),feedback=safeString(body.feedback,3000);
    const attempt=await env.DB.prepare('SELECT t.id,t.assessment_id,t.user_id,a.course_id,a.max_points FROM course_assessment_attempts t JOIN course_assessments a ON a.id=t.assessment_id WHERE t.id=?').bind(attemptId).first();
    if(!attempt||!(await courseAccess(env.DB,user,attempt.course_id))||!Number.isSafeInteger(points)||points<0||points>Number(attempt.max_points))return error('Choose a valid attempt and a score within the assessment maximum.',409);
    const paper=await env.DB.prepare('SELECT assessment_type,max_points FROM course_assessments WHERE id=?').bind(attempt.assessment_id).first();
    const cfg=await env.DB.prepare("SELECT settings_json FROM exam_institute_settings WHERE id='default'").first();
    let examConfig={};try{examConfig=JSON.parse(cfg?.settings_json||'{}')}catch{}
    const rawMaximum=Number(paper?.max_points)>0?Number(paper.max_points):100,targetMaximum=publishedMaximum(paper?.assessment_type,examConfig),published=scaledPoints(points,rawMaximum,targetMaximum);
    await env.DB.batch([
      env.DB.prepare("UPDATE course_assessment_attempts SET status='graded',points_awarded=?,feedback=?,marked_by=?,marked_at=CURRENT_TIMESTAMP WHERE id=?").bind(points,feedback,user.id,attemptId),
      env.DB.prepare("INSERT INTO course_assessment_results(id,assessment_id,user_id,points_awarded,feedback,published_at,marked_by,raw_points_awarded,published_max_points) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(assessment_id,user_id) DO UPDATE SET points_awarded=excluded.points_awarded,feedback=excluded.feedback,published_at=excluded.published_at,marked_by=excluded.marked_by,marked_at=CURRENT_TIMESTAMP,raw_points_awarded=excluded.raw_points_awarded,published_max_points=excluded.published_max_points").bind(uuid(),attempt.assessment_id,attempt.user_id,published,feedback,body.publish===false?null:new Date().toISOString(),user.id,points,targetMaximum)
    ]);
    return json({graded:true});
  }

  if(action==='review_scholarship'){
    const access=await requireRole(request,env,['admin']);if(access.response)return access.response;
    const applicationId=safeString(body.applicationId,80),status=safeString(body.status,20);
    if(!['approved','rejected','pending'].includes(status))return error('Choose an allowed scholarship decision.');
    const application=await env.DB.prepare('SELECT user_id FROM scholarship_applications WHERE id=?').bind(applicationId).first();
    if(!application)return error('Scholarship application not found.',404);
    await env.DB.batch([
      env.DB.prepare('UPDATE scholarship_applications SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?').bind(status,user.id,applicationId),
      env.DB.prepare('INSERT INTO notifications(id,user_id,title,message) VALUES(?,?,?,?)')
        .bind(uuid(),application.user_id,'Scholarship application update',
          status==='approved'?'Your Navstar scholarship application has been approved. Contact the Finance/Admissions Office for the next steps and confirmation of your award.':status==='rejected'?'Your Navstar scholarship application was not approved. Contact the Admissions Office if you need clarification.':'Your Navstar scholarship application has been returned to pending review.'),
      env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)')
        .bind(uuid(),user.id,'scholarship_application_reviewed','scholarship_application',applicationId)
    ]);
    return json({saved:true,status});
  }

  if(action==='apply_scholarship'){
    if(user.role!=='student')return error('Only students can apply for scholarships.',403);
    const scholarshipId=safeString(body.scholarshipId,80),statement=safeString(body.statement,3000);
    const scholarship=await env.DB.prepare("SELECT id,course_id FROM course_scholarships WHERE id=? AND status='open' AND (deadline IS NULL OR deadline>=date('now'))").bind(scholarshipId).first();
    if(!scholarship|| (scholarship.course_id && !(await courseAccess(env.DB,user,scholarship.course_id))))return error('Scholarship is not open for your course.',404);
    await env.DB.prepare("INSERT INTO scholarship_applications(id,scholarship_id,user_id,statement) VALUES(?,?,?,?) ON CONFLICT(scholarship_id,user_id) DO UPDATE SET statement=excluded.statement,status='pending',reviewed_by=NULL,reviewed_at=NULL").bind(uuid(),scholarshipId,user.id,statement).run();
    return json({submitted:true});
  }

  if(action==='update_assessment'){
    const access=await requireRole(request,env,staffRoles);if(access.response)return access.response;
    const assessmentId=safeString(body.assessmentId,80);
    const existing=await env.DB.prepare('SELECT id,course_id FROM course_assessments WHERE id=?').bind(assessmentId).first();
    if(!existing||!(await requireCourse(env.DB,user,existing.course_id)))return error('Assessment access denied.',403);
    if(!(await requireCourse(env.DB,user,courseId)))return error('You are not assigned to the selected course.',403);
    if(title.length<2)return error('Select a course, module and exam type to generate the title.');
    const selectedModule=moduleId?await env.DB.prepare('SELECT id,title FROM course_modules WHERE id=? AND course_id=?').bind(moduleId,courseId).first():null;
    if(!selectedModule)return error('Select a valid module belonging to the selected course.');
    const maxPoints=Number(body.maxPoints),duration=Number(body.durationMinutes),passMark=Number(body.passMark),attempts=Number(body.maxAttempts),selectionMode=safeString(body.questionSelectionMode,12)||'marks',questionCount=Number(body.questionCount??10);
    const existingQuestions=await env.DB.prepare("SELECT COUNT(*) AS count,COALESCE(SUM(points),0) AS total FROM course_exam_questions WHERE assessment_id=? AND status='active'").bind(assessmentId).first();
    if(existingQuestions?.count&&Number(existingQuestions.count)>0&&Number(existingQuestions.total)>maxPoints)return error('The new paper total is below the marks already allocated to its questions.');

    const startsAt=safeString(body.startsAt,40),endsAt=safeString(body.endsAt,40);
    if(!validDate(startsAt)||!validDate(endsAt)||Date.parse(endsAt)<=Date.parse(startsAt))return error('Enter a valid scheduled date and expiry time.');
    if(!Number.isSafeInteger(maxPoints)||maxPoints<1||maxPoints>10000||!Number.isSafeInteger(duration)||duration<1||duration>600||!Number.isSafeInteger(passMark)||passMark<0||passMark>maxPoints||!Number.isSafeInteger(attempts)||attempts<1||attempts>10)return error('Check total marks, duration, pass mark and attempts.');
    if(!['marks','count'].includes(selectionMode)||!Number.isSafeInteger(questionCount)||questionCount<1||questionCount>500)return error('Choose marks-based or count-based question selection and a valid question count.');
    const type=safeString(body.assessmentType,20);
    if(!['test','exam','practical','cat'].includes(type))return error('Choose a valid exam type.');
    const generatedTitle=selectedModule.title+' — '+({cat:'CAT',exam:'Final Examination',practical:'Practical Assessment',test:'CAT'}[type]);
    await env.DB.prepare('UPDATE course_assessments SET course_id=?,module_id=?,title=?,assessment_type=?,description=?,instructions=?,starts_at=?,due_at=?,max_points=?,duration_minutes=?,pass_mark=?,max_attempts=?,require_full_fee_payment=?,require_assignment_submission=?,allow_result_review=?,shuffle_questions=?,disable_copy_paste=?,strict_time_limit=?,require_admin_approval=?,question_selection_mode=?,question_count=?,shuffle_options=? WHERE id=?')
      .bind(courseId,moduleId,generatedTitle,type,safeString(body.description,3000),safeString(body.instructions,5000),startsAt,endsAt,maxPoints,duration,passMark,attempts,body.requireFullFeePayment?1:0,body.requireAssignmentSubmission?1:0,body.allowResultReview===false?0:1,body.shuffleQuestions?1:0,body.disableCopyPaste?1:0,body.strictTimeLimit===false?0:1,body.requireAdminApproval?1:0,selectionMode,questionCount,body.shuffleOptions===false?0:1,assessmentId).run();
    await audit('assessment_updated','assessment',assessmentId);
    return json({id:assessmentId,updated:true});
  }
  if(action==='archive_assessment'){
    const access=await requireRole(request,env,staffRoles);if(access.response)return access.response;
    const assessmentId=safeString(body.assessmentId,80);
    const existing=await env.DB.prepare('SELECT id,course_id FROM course_assessments WHERE id=?').bind(assessmentId).first();
    if(!existing||!(await requireCourse(env.DB,user,existing.course_id)))return error('Assessment access denied.',403);
    await env.DB.prepare("UPDATE course_assessments SET archived_at=CURRENT_TIMESTAMP WHERE id=?").bind(assessmentId).run();
    await audit('assessment_archived','assessment',assessmentId);
    return json({archived:true});
  }
  if(action==='generate_exam_timetable'){
    const access=await requireRole(request,env,staffRoles);if(access.response)return access.response;
    const rules=body.rules&&typeof body.rules==='object'?body.rules:{};
    const startText=safeString(rules.startDate,10),endText=safeString(rules.endDate,10);
    const perDay=Number(rules.papersPerDay),morning=safeString(rules.morningTime,5),evening=safeString(rules.eveningTime,5);
    if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(startText)||!/^\\d{4}-\\d{2}-\\d{2}$/.test(endText)||endText<startText||!Number.isInteger(perDay)||perDay<1||perDay>30||!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(morning)||!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(evening))return error('Enter valid timetable dates, papers per day and EAT paper times.');
    const selectedCourse=safeString(body.courseId,80);
    const allCourses=(await env.DB.prepare('SELECT id,title FROM courses ORDER BY title').all()).results||[];
    const targetCourses=selectedCourse?allCourses.filter(c=>c.id===selectedCourse):allCourses;
    if(selectedCourse&&!targetCourses.length)return error('Selected course was not found or is not active.',404);
    const ready=[];
    for(const course of targetCourses){
      if(!(await requireCourse(env.DB,user,course.id)))continue;
      const active=await env.DB.prepare("SELECT COUNT(*) AS n FROM enrollments WHERE course_id=? AND status='accepted'").bind(course.id).first();
      if(Number(active?.n||0)<1)continue;
      const modules=(await env.DB.prepare("SELECT id,title FROM course_modules WHERE course_id=? AND status='published' ORDER BY sort_order,title").bind(course.id).all()).results||[];
      if(!modules.length)continue;
      const papers=(await env.DB.prepare("SELECT id,module_id,duration_minutes,title FROM course_assessments WHERE course_id=? AND archived_at IS NULL AND module_id IS NOT NULL ORDER BY title").bind(course.id).all()).results||[];
      if(modules.some(m=>!papers.some(p=>p.module_id===m.id)))continue;
      ready.push({course,papers});
    }
    if(!ready.length)return error('No course is ready. Each selected course needs active enrolled students and at least one exam paper for every published module.');
    const statements=[],scheduledPapers=[];
    const parseTime=(day,time)=>new Date(day+'T'+time+':00+03:00');
    const nextWeekday=(date)=>{const d=new Date(date+'T12:00:00Z');while([0,6].includes(d.getUTCDay()))d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);};
    let nextCourseStart=nextWeekday(startText);
    for(const item of ready){
      let day=nextCourseStart,index=0;
      const papers=item.papers;
      while(index<papers.length){
        if(day>endText)return error('The selected end date is too early to schedule all module papers. Extend the date range and try again.');
        if([0,6].includes(new Date(day+'T12:00:00Z').getUTCDay())){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);day=d.toISOString().slice(0,10);continue;}
        const count=Math.min(perDay,papers.length-index);
        for(let slot=0;slot<count;slot++){
          const paper=papers[index++],startMinutes=Number(morning.slice(0,2))*60+Number(morning.slice(3)),endMinutes=Number(evening.slice(0,2))*60+Number(evening.slice(3));
          const mins=count===1?startMinutes:Math.round(startMinutes+(endMinutes-startMinutes)*slot/(count-1));
          const time=String(Math.floor(mins/60)%24).padStart(2,'0')+':'+String(mins%60).padStart(2,'0');
          const starts=parseTime(day,time),ends=new Date(starts.getTime()+Math.max(1,Number(paper.duration_minutes||60))*60000);
          statements.push(env.DB.prepare("UPDATE course_assessments SET starts_at=?,due_at=?,status='published' WHERE id=?").bind(starts.toISOString(),ends.toISOString(),paper.id));
          scheduledPapers.push({course:item.course.title,title:paper.title,startsAt:starts.toISOString(),endsAt:ends.toISOString()});
        }
        const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);day=nextWeekday(d.toISOString().slice(0,10));
      }
      nextCourseStart=day;
    }
    if(statements.length)await env.DB.batch(statements);
    await audit('exam_timetable_generated','exam_timetable',selectedCourse||'all');
    return json({generated:scheduledPapers.length,courses:ready.map(x=>x.course.title),papers:scheduledPapers});
  }
  if(action==='create_timetable'||action==='create_live_class'||action==='create_assessment'){
    const access=await requireRole(request,env,staffRoles);if(access.response)return access.response;
    if(!(await requireCourse(env.DB,user,courseId)))return error('You are not assigned to this course.',403);
    if(title.length<2)return error('Enter a title.');
    const startsAt=safeString(body.startsAt,40),endsAt=safeString(body.endsAt,40);
    const endRequired=action==='create_timetable'||action==='create_assessment';
    if(!validDate(startsAt)||(endRequired&&!validDate(endsAt))||(endsAt&&!validDate(endsAt))||(endsAt&&(action==='create_assessment'?Date.parse(endsAt)<Date.parse(startsAt):Date.parse(endsAt)<=Date.parse(startsAt))))return error(action==='create_assessment'?'Enter a valid assessment start and deadline; the deadline may be on the same date/time but not earlier.':'Enter valid start and end dates and times.');
    const module=moduleId?await env.DB.prepare('SELECT id,title FROM course_modules WHERE id=? AND course_id=?').bind(moduleId,courseId).first():null;
    if(!module)return error('Select a valid module belonging to this course.',409);
    const id=uuid();
    if(action==='create_timetable'){
      await env.DB.prepare('INSERT INTO course_timetable(id,course_id,module_id,title,starts_at,ends_at,venue,meeting_url,created_by) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,courseId,moduleId||null,title,startsAt,endsAt,safeString(body.venue,160),safeString(body.meetingUrl,500)||null,user.id).run();
    }else if(action==='create_live_class'){
      const meetingUrl=safeString(body.meetingUrl,500);
      if(!/^https:\/\//i.test(meetingUrl))return error('Use a secure HTTPS meeting link.');
      await env.DB.prepare('INSERT INTO course_live_classes(id,course_id,module_id,title,meeting_url,starts_at,ends_at,created_by) VALUES(?,?,?,?,?,?,?,?)').bind(id,courseId,moduleId||null,title,meetingUrl,startsAt,endsAt||null,user.id).run();
    }else{
      const maxPoints=Number(body.maxPoints),type=safeString(body.assessmentType,20)||'test';
      if(!Number.isSafeInteger(maxPoints)||maxPoints<1||maxPoints>10000||!['test','exam','practical','cat'].includes(type))return error('Choose a valid assessment type and maximum score.');
      const duration=Number(body.durationMinutes??60),passMark=Number(body.passMark??Math.floor(maxPoints/2)),attempts=Number(body.maxAttempts??1),selectionMode=safeString(body.questionSelectionMode,12)||'marks',questionCount=Number(body.questionCount??10);
      if(!Number.isSafeInteger(duration)||duration<1||duration>600||!Number.isSafeInteger(passMark)||passMark<0||passMark>maxPoints||!Number.isSafeInteger(attempts)||attempts<1||attempts>10)return error('Check the exam duration, pass mark and attempt limit.');
      if(!['marks','count'].includes(selectionMode)||!Number.isSafeInteger(questionCount)||questionCount<1||questionCount>500)return error('Choose marks-based or count-based question selection and a valid question count.');
      const generatedTitle=module.title+' — '+({cat:'CAT',exam:'Final Examination',practical:'Practical Assessment',test:'Test'}[type]);
      await env.DB.prepare('INSERT INTO course_assessments(id,course_id,module_id,title,assessment_type,description,instructions,starts_at,due_at,max_points,status,created_by,duration_minutes,pass_mark,max_attempts,require_full_fee_payment,require_assignment_submission,allow_result_review,shuffle_questions,disable_copy_paste,strict_time_limit,require_admin_approval,question_selection_mode,question_count,shuffle_options) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,courseId,moduleId||null,generatedTitle,type,safeString(body.description,3000),safeString(body.instructions,5000),startsAt,endsAt,maxPoints,'published',user.id,duration,passMark,attempts,body.requireFullFeePayment?1:0,body.requireAssignmentSubmission?1:0,body.allowResultReview===false?0:1,body.shuffleQuestions?1:0,body.disableCopyPaste?1:0,body.strictTimeLimit===false?0:1,body.requireAdminApproval?1:0,selectionMode,questionCount,body.shuffleOptions===false?0:1).run();
    }
    await audit(action,'course',courseId);
    return json({id,created:true},201);
  }

  if(action==='mark_attendance'){
    const access=await requireRole(request,env,staffRoles);if(access.response)return access.response;
    const timetableId=safeString(body.timetableId,80),studentId=safeString(body.studentId,80),status=safeString(body.status,20);
    if(!['present','late','absent','excused'].includes(status))return error('Choose a valid attendance status.');
    const session=await env.DB.prepare('SELECT id,course_id FROM course_timetable WHERE id=?').bind(timetableId).first();
    if(!session||!(await requireCourse(env.DB,user,session.course_id)))return error('Timetable session is not available to your account.',403);
    const student=await env.DB.prepare("SELECT u.id FROM users u JOIN enrollments e ON lower(e.email)=lower(u.email) WHERE u.id=? AND e.course_id=? AND e.status='accepted' LIMIT 1").bind(studentId,session.course_id).first();
    if(!student)return error('The selected student is not enrolled in this course.',409);
    await env.DB.prepare('INSERT INTO course_attendance(id,timetable_id,student_user_id,status,marked_by) VALUES(?,?,?,?,?) ON CONFLICT(timetable_id,student_user_id) DO UPDATE SET status=excluded.status,marked_by=excluded.marked_by,marked_at=CURRENT_TIMESTAMP').bind(uuid(),timetableId,studentId,status,user.id).run();
    return json({saved:true});
  }

  if(action==='publish_scholarship'){
    const access=await requireRole(request,env,['admin']);if(access.response)return access.response;
    const scholarshipTitle=title,awardAmount=Number(body.awardAmount),deadline=safeString(body.deadline,10);
    if(scholarshipTitle.length<2||!Number.isSafeInteger(awardAmount)||awardAmount<0||awardAmount>1000000)return error('Enter a scholarship title and valid award amount.');
    if(courseId&&!(await env.DB.prepare('SELECT id FROM courses WHERE id=?').bind(courseId).first()))return error('Course not found.');
    const id=uuid();
    await env.DB.prepare("INSERT INTO course_scholarships(id,course_id,title,description,award_amount,deadline,status,created_by) VALUES(?,?,?,?,?,?,?,?)").bind(id,courseId||null,scholarshipTitle,safeString(body.description,3000),awardAmount,deadline||null,'open',user.id).run();
    await audit('scholarship_published','scholarship',id);
    return json({id,created:true},201);
  }

  if(action==='record_assessment_result'){
    const access=await requireRole(request,env,staffRoles);if(access.response)return access.response;
    const assessmentId=safeString(body.assessmentId,80),studentId=safeString(body.studentId,80),points=Number(body.pointsAwarded);
    const assessment=await env.DB.prepare('SELECT id,course_id,module_id,max_points FROM course_assessments WHERE id=?').bind(assessmentId).first();
    if(!assessment||!(await requireCourse(env.DB,user,assessment.course_id)))return error('Assessment is not available to your account.',403);
    if(!Number.isSafeInteger(points)||points<0||points>Number(assessment.max_points))return error('Score must be between zero and the maximum score.');
    const student=await env.DB.prepare("SELECT u.id FROM users u JOIN enrollments e ON lower(e.email)=lower(u.email) WHERE u.id=? AND e.course_id=? AND e.status='accepted' LIMIT 1").bind(studentId,assessment.course_id).first();
    if(!student)return error('Student is not enrolled in this course.',409);
    const policy=await getCentralMarksPolicy(env.DB);
    const paper=await env.DB.prepare('SELECT assessment_type FROM course_assessments WHERE id=?').bind(assessmentId).first();
    const targetMaximum=publishedMaximum(paper?.assessment_type,policy);
    const publishedPoints=scaledPoints(points,Number(assessment.max_points),targetMaximum);
    await env.DB.prepare('INSERT INTO course_assessment_results(id,assessment_id,user_id,points_awarded,feedback,published_at,marked_by,raw_points_awarded,published_max_points) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(assessment_id,user_id) DO UPDATE SET points_awarded=excluded.points_awarded,feedback=excluded.feedback,published_at=excluded.published_at,marked_by=excluded.marked_by,marked_at=CURRENT_TIMESTAMP,raw_points_awarded=excluded.raw_points_awarded,published_max_points=excluded.published_max_points').bind(uuid(),assessmentId,studentId,publishedPoints,safeString(body.feedback,3000),body.publish===false?null:new Date().toISOString(),user.id,points,targetMaximum).run();
    if(assessment.module_id)await syncModuleResult(env.DB,studentId,assessment.module_id,user.id);
    return json({saved:true,rawPoints:points,publishedPoints,publishedMaximum:targetMaximum});
  }

  if(action==='set_graduation_status'){
    const access=await requireRole(request,env,['admin']);if(access.response)return access.response;
    const studentId=safeString(body.studentId,80),status=safeString(body.status,20);
    if(!['candidate','eligible','graduated','deferred'].includes(status))return error('Choose a valid graduation status.');
    if(!(await env.DB.prepare('SELECT id FROM courses WHERE id=?').bind(courseId).first()))return error('Course not found.',404);
    const student=await env.DB.prepare("SELECT u.id FROM users u JOIN enrollments e ON lower(e.email)=lower(u.email) WHERE u.id=? AND e.course_id=? AND e.status='accepted' LIMIT 1").bind(studentId,courseId).first();
    if(!student)return error('The selected student is not enrolled in this course.',409);
    await env.DB.prepare('INSERT INTO student_graduation_records(id,user_id,course_id,status,completed_at,updated_by) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,course_id) DO UPDATE SET status=excluded.status,completed_at=excluded.completed_at,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP').bind(uuid(),studentId,courseId,status,status==='graduated'?new Date().toISOString():null,user.id).run();
    await audit('graduation_status_updated','student',studentId);
    return json({saved:true});
  }

  if(action==='issue_report_card'){
    const access=await requireRole(request,env,staffRoles);if(access.response)return access.response;
    const studentId=safeString(body.studentId,80),period=safeString(body.periodLabel,80);
    if(!period||!(await requireCourse(env.DB,user,courseId)))return error('Select a course and report-card period.');
    const student=await env.DB.prepare("SELECT u.id FROM users u JOIN enrollments e ON lower(e.email)=lower(u.email) WHERE u.id=? AND e.course_id=? AND e.status='accepted' AND u.role='student' AND u.status='active' LIMIT 1").bind(studentId,courseId).first();
    if(!student)return error('Only an active student with an accepted enrolment can receive a report card.',409);
    const assignmentStats=await env.DB.prepare("SELECT COUNT(*) AS total,AVG(points_awarded*100.0/(SELECT max_points FROM course_assignments WHERE id=assignment_id)) AS average FROM course_assignment_submissions WHERE user_id=? AND status='graded' AND approval_status='approved' AND points_awarded IS NOT NULL AND assignment_id IN (SELECT id FROM course_assignments WHERE course_id=?)").bind(studentId,courseId).first();
    const examStats=await env.DB.prepare("SELECT COUNT(*) AS total,AVG(r.points_awarded*100.0/COALESCE(r.published_max_points,a.max_points)) AS average FROM course_assessment_results r JOIN course_assessments a ON a.id=r.assessment_id WHERE r.user_id=? AND a.course_id=? AND r.published_at IS NOT NULL").bind(studentId,courseId).first();
    const moduleResults=await syncStudentModuleResults(env.DB,studentId,courseId,user.id);
    const summary={assignments:assignmentStats||{},assessments:examStats||{},moduleResults,issuedAt:new Date().toISOString()};
    await env.DB.prepare('INSERT INTO student_report_cards(id,user_id,course_id,period_label,summary_json,issued_by) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,course_id,period_label) DO UPDATE SET summary_json=excluded.summary_json,issued_by=excluded.issued_by,issued_at=CURRENT_TIMESTAMP').bind(uuid(),studentId,courseId,period,JSON.stringify(summary),user.id).run();
    return json({issued:true,summary});
  }
  return error('Unknown academic action.',400);
}
