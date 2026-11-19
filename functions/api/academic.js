import { getSession, requireRole } from '../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, uuid } from '../_shared/http.js';

const staffRoles=['admin','principal','tutor'];
const adminRoles=['admin','principal'];
const dateTimePattern=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

async function courseAccess(db,user,courseId){
  if(adminRoles.includes(user.role))return true;
  if(user.role==='tutor'){
    const row=await db.prepare('SELECT id FROM course_tutor_assignments WHERE course_id=? AND tutor_user_id=?').bind(courseId,user.id).first();
    return Boolean(row);
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
    const r=await db.prepare('SELECT course_id AS id FROM course_tutor_assignments WHERE tutor_user_id=?').bind(user.id).all();
    return (r.results||[]).map(x=>x.id);
  }
  if(user.role==='student'){
    const r=await db.prepare("SELECT DISTINCT course_id AS id FROM enrollments WHERE email=? COLLATE NOCASE AND status='accepted'").bind(user.email).all();
    return (r.results||[]).map(x=>x.id);
  }
  return [];
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
  if(!['student',...staffRoles].includes(user.role))return error('This account cannot access academic records.',403);
  const ids=await visibleCourseIds(env.DB,user);
  if(!ids.length)return json({courses:[],timetable:[],attendance:[],liveClasses:[],scholarships:[],moduleRegistrations:[],assessments:[],graduation:[],reportCards:[]});
  const marks=ids.map(()=>'?').join(',');
  const courses=(await env.DB.prepare(`SELECT id,title FROM courses WHERE id IN (${marks}) ORDER BY title`).bind(...ids).all()).results||[];
  const learners=user.role==='student'?[]:(await env.DB.prepare(`SELECT DISTINCT u.id,u.name,u.email,e.course_id,c.title AS course_title FROM users u JOIN enrollments e ON lower(e.email)=lower(u.email) JOIN courses c ON c.id=e.course_id WHERE e.status='accepted' AND e.course_id IN (${marks}) ORDER BY u.name`).bind(...ids).all()).results||[];
  const timetable=(await env.DB.prepare(`SELECT t.*,c.title AS course_title,m.title AS module_title FROM course_timetable t JOIN courses c ON c.id=t.course_id LEFT JOIN course_modules m ON m.id=t.module_id WHERE t.course_id IN (${marks}) ORDER BY t.starts_at`).bind(...ids).all()).results||[];
  const liveClasses=(await env.DB.prepare(`SELECT l.*,c.title AS course_title,m.title AS module_title FROM course_live_classes l JOIN courses c ON c.id=l.course_id LEFT JOIN course_modules m ON m.id=l.module_id WHERE l.course_id IN (${marks}) ORDER BY l.starts_at DESC`).bind(...ids).all()).results||[];
  const scholarships=(await env.DB.prepare(`SELECT s.*,c.title AS course_title,a.id AS application_id,a.status AS application_status FROM course_scholarships s LEFT JOIN courses c ON c.id=s.course_id LEFT JOIN scholarship_applications a ON a.scholarship_id=s.id AND a.user_id=? WHERE (s.course_id IS NULL OR s.course_id IN (${marks})) AND s.status!='draft' ORDER BY s.deadline`).bind(user.id,...ids).all()).results||[];
  const moduleRegistrations=user.role==='student'?(await env.DB.prepare(`SELECT r.*,m.title AS module_title,c.title AS course_title FROM student_module_registrations r JOIN course_modules m ON m.id=r.module_id JOIN courses c ON c.id=r.course_id WHERE r.user_id=? ORDER BY c.title,m.sort_order`).bind(user.id).all()).results||[]:[];
  const attendance=user.role==='student'?(await env.DB.prepare(`SELECT a.*,t.title AS session_title,t.starts_at,c.title AS course_title FROM course_attendance a JOIN course_timetable t ON t.id=a.timetable_id JOIN courses c ON c.id=t.course_id WHERE a.student_user_id=? ORDER BY a.marked_at DESC`).bind(user.id).all()).results||[]:(await env.DB.prepare(`SELECT a.*,t.title AS session_title,t.starts_at,c.title AS course_title,u.name AS student_name FROM course_attendance a JOIN course_timetable t ON t.id=a.timetable_id JOIN courses c ON c.id=t.course_id JOIN users u ON u.id=a.student_user_id WHERE t.course_id IN (${marks}) ORDER BY a.marked_at DESC LIMIT 500`).bind(...ids).all()).results||[];
  const assessments=(await env.DB.prepare(`SELECT a.*,c.title AS course_title,m.title AS module_title,r.points_awarded,r.feedback,r.published_at FROM course_assessments a JOIN courses c ON c.id=a.course_id LEFT JOIN course_modules m ON m.id=a.module_id LEFT JOIN course_assessment_results r ON r.assessment_id=a.id AND r.user_id=? WHERE a.course_id IN (${marks}) AND a.status!='draft' ORDER BY a.due_at`).bind(user.id,...ids).all()).results||[];
  const graduation=user.role==='student'?(await env.DB.prepare(`SELECT g.*,c.title AS course_title FROM student_graduation_records g JOIN courses c ON c.id=g.course_id WHERE g.user_id=?`).bind(user.id).all()).results||[]:(await env.DB.prepare(`SELECT g.*,c.title AS course_title,u.name AS student_name FROM student_graduation_records g JOIN courses c ON c.id=g.course_id JOIN users u ON u.id=g.user_id WHERE g.course_id IN (${marks}) ORDER BY c.title,u.name`).bind(...ids).all()).results||[];
  const reportCards=user.role==='student'?(await env.DB.prepare('SELECT r.*,c.title AS course_title FROM student_report_cards r JOIN courses c ON c.id=r.course_id WHERE r.user_id=? ORDER BY r.issued_at DESC').bind(user.id).all()).results||[]:(await env.DB.prepare(`SELECT r.*,c.title AS course_title,u.name AS student_name FROM student_report_cards r JOIN courses c ON c.id=r.course_id JOIN users u ON u.id=r.user_id WHERE r.course_id IN (${marks}) ORDER BY r.issued_at DESC LIMIT 500`).bind(...ids).all()).results||[];
  const assessmentResults=user.role==='student'?[]:(await env.DB.prepare(`SELECT r.*,a.title AS assessment_title,a.course_id,u.name AS student_name,c.title AS course_title FROM course_assessment_results r JOIN course_assessments a ON a.id=r.assessment_id JOIN users u ON u.id=r.user_id JOIN courses c ON c.id=a.course_id WHERE a.course_id IN (${marks}) ORDER BY r.marked_at DESC LIMIT 500`).bind(...ids).all()).results||[];
  const assessmentAttempts=user.role==='student'?(await env.DB.prepare(`SELECT t.*,a.title AS assessment_title,a.course_id,a.max_points,a.instructions,c.title AS course_title FROM course_assessment_attempts t JOIN course_assessments a ON a.id=t.assessment_id JOIN courses c ON c.id=a.course_id WHERE t.user_id=? ORDER BY t.submitted_at DESC`).bind(user.id).all()).results||[]:(await env.DB.prepare(`SELECT t.*,a.title AS assessment_title,a.course_id,a.max_points,u.name AS student_name,c.title AS course_title FROM course_assessment_attempts t JOIN course_assessments a ON a.id=t.assessment_id JOIN users u ON u.id=t.user_id JOIN courses c ON c.id=a.course_id WHERE a.course_id IN (${marks}) ORDER BY t.submitted_at DESC LIMIT 500`).bind(...ids).all()).results||[];
  const scholarshipApplications=user.role==='student'?[]:(await env.DB.prepare(`SELECT a.*,s.title AS scholarship_title,s.course_id,u.name AS student_name,u.email,c.title AS course_title FROM scholarship_applications a JOIN course_scholarships s ON s.id=a.scholarship_id JOIN users u ON u.id=a.user_id LEFT JOIN courses c ON c.id=s.course_id WHERE (s.course_id IS NULL OR s.course_id IN (${marks})) ORDER BY a.created_at DESC LIMIT 500`).bind(...ids).all()).results||[];
  return json({courses,learners,timetable,attendance,liveClasses,scholarships,moduleRegistrations,assessments,assessmentResults,assessmentAttempts,scholarshipApplications,graduation,reportCards,role:user.role});
}
export async function onRequestPost({request,env}){
  if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
  if(!env.DB)return error('Academic portal database is not configured.',503);
  const user=await getSession(request,env);
  if(!user)return error('Sign in required.',401);
  let body;try{body=await readJson(request,16384);}catch{return error('Invalid academic request.');}
  const action=safeString(body.action,40);
  const courseId=safeString(body.courseId,80);
  const moduleId=safeString(body.moduleId,80);
  const title=safeString(body.title,160);
  const audit=async(name,type,id)=>env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),user.id,name,type,id).run();

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
    const assessment=await env.DB.prepare("SELECT id,course_id,status,due_at FROM course_assessments WHERE id=?").bind(assessmentId).first();
    if(!assessment||assessment.status!=='published'||!(await courseAccess(env.DB,user,assessment.course_id)))return error('This assessment is not available to your account.',403);
    if(assessment.due_at&&Date.parse(assessment.due_at)<Date.now())return error('The submission deadline has passed.',409);
    if(!responseText&&!attachmentUrl)return error('Provide your answer or attach a secure HTTPS document.');
    if(attachmentUrl&&!/^https:\/\//i.test(attachmentUrl))return error('Assessment attachments must use HTTPS.');
    const existing=await env.DB.prepare('SELECT status FROM course_assessment_attempts WHERE assessment_id=? AND user_id=?').bind(assessmentId,user.id).first();
    if(existing?.status==='graded')return error('This assessment has already been graded. Contact your tutor if a correction is needed.',409);
    await env.DB.prepare("INSERT INTO course_assessment_attempts(id,assessment_id,user_id,response_text,attachment_url,status) VALUES(?,?,?,?,?,'submitted') ON CONFLICT(assessment_id,user_id) DO UPDATE SET response_text=excluded.response_text,attachment_url=excluded.attachment_url,status='submitted',submitted_at=CURRENT_TIMESTAMP").bind(uuid(),assessmentId,user.id,responseText,attachmentUrl||null).run();
    return json({submitted:true});
  }

  if(action==='grade_assessment_attempt'){
    const access=await requireRole(request,env,staffRoles);if(access.response)return access.response;
    const attemptId=safeString(body.attemptId,80),points=Number(body.pointsAwarded),feedback=safeString(body.feedback,3000);
    const attempt=await env.DB.prepare('SELECT t.id,t.assessment_id,t.user_id,a.course_id,a.max_points FROM course_assessment_attempts t JOIN course_assessments a ON a.id=t.assessment_id WHERE t.id=?').bind(attemptId).first();
    if(!attempt||!(await courseAccess(env.DB,user,attempt.course_id))||!Number.isSafeInteger(points)||points<0||points>Number(attempt.max_points))return error('Choose a valid attempt and a score within the assessment maximum.',409);
    await env.DB.batch([
      env.DB.prepare("UPDATE course_assessment_attempts SET status='graded',points_awarded=?,feedback=?,marked_by=?,marked_at=CURRENT_TIMESTAMP WHERE id=?").bind(points,feedback,user.id,attemptId),
      env.DB.prepare("INSERT INTO course_assessment_results(id,assessment_id,user_id,points_awarded,feedback,published_at,marked_by) VALUES(?,?,?,?,?,?,?) ON CONFLICT(assessment_id,user_id) DO UPDATE SET points_awarded=excluded.points_awarded,feedback=excluded.feedback,published_at=excluded.published_at,marked_by=excluded.marked_by,marked_at=CURRENT_TIMESTAMP").bind(uuid(),attempt.assessment_id,attempt.user_id,points,feedback,body.publish===false?null:new Date().toISOString(),user.id)
    ]);
    return json({graded:true});
  }

  if(action==='review_scholarship'){
    const access=await requireRole(request,env,['admin']);if(access.response)return access.response;
    const applicationId=safeString(body.applicationId,80),status=safeString(body.status,20);
    if(!['approved','rejected','pending'].includes(status))return error('Choose an allowed scholarship decision.');
    const result=await env.DB.prepare('UPDATE scholarship_applications SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?').bind(status,user.id,applicationId).run();
    if(!result.meta?.changes)return error('Scholarship application not found.',404);
    await audit('scholarship_application_reviewed','scholarship_application',applicationId);
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

  if(action==='create_timetable'||action==='create_live_class'||action==='create_assessment'){
    const access=await requireRole(request,env,staffRoles);if(access.response)return access.response;
    if(!(await requireCourse(env.DB,user,courseId)))return error('You are not assigned to this course.',403);
    if(title.length<2)return error('Enter a title.');
    const startsAt=safeString(body.startsAt,40),endsAt=safeString(body.endsAt,40);
    if(!validDate(startsAt)||(endsAt&&!validDate(endsAt))||(endsAt&&Date.parse(endsAt)<=Date.parse(startsAt)&&action!=='create_assessment'))return error('Enter valid start and end dates and times.');
    const module=moduleId?await env.DB.prepare('SELECT id FROM course_modules WHERE id=? AND course_id=?').bind(moduleId,courseId).first():null;
    if(moduleId&&!module)return error('The selected module does not belong to this course.',409);
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
      await env.DB.prepare('INSERT INTO course_assessments(id,course_id,module_id,title,assessment_type,instructions,starts_at,due_at,max_points,status,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,courseId,moduleId||null,title,type,safeString(body.instructions,5000),startsAt,endsAt,maxPoints,'published',user.id).run();
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
    const assessment=await env.DB.prepare('SELECT id,course_id,max_points FROM course_assessments WHERE id=?').bind(assessmentId).first();
    if(!assessment||!(await requireCourse(env.DB,user,assessment.course_id)))return error('Assessment is not available to your account.',403);
    if(!Number.isSafeInteger(points)||points<0||points>Number(assessment.max_points))return error('Score must be between zero and the maximum score.');
    const student=await env.DB.prepare("SELECT u.id FROM users u JOIN enrollments e ON lower(e.email)=lower(u.email) WHERE u.id=? AND e.course_id=? AND e.status='accepted' LIMIT 1").bind(studentId,assessment.course_id).first();
    if(!student)return error('Student is not enrolled in this course.',409);
    await env.DB.prepare('INSERT INTO course_assessment_results(id,assessment_id,user_id,points_awarded,feedback,published_at,marked_by) VALUES(?,?,?,?,?,?,?) ON CONFLICT(assessment_id,user_id) DO UPDATE SET points_awarded=excluded.points_awarded,feedback=excluded.feedback,published_at=excluded.published_at,marked_by=excluded.marked_by,marked_at=CURRENT_TIMESTAMP').bind(uuid(),assessmentId,studentId,points,safeString(body.feedback,3000),body.publish===false?null:new Date().toISOString(),user.id).run();
    return json({saved:true});
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
    const student=await env.DB.prepare("SELECT u.id FROM users u JOIN enrollments e ON lower(e.email)=lower(u.email) WHERE u.id=? AND e.course_id=? AND e.status='accepted' LIMIT 1").bind(studentId,courseId).first();
    if(!student)return error('Student is not enrolled in this course.',409);
    const assignmentStats=await env.DB.prepare("SELECT COUNT(*) AS total,AVG(CASE WHEN points_awarded IS NOT NULL THEN points_awarded*100.0/(SELECT max_points FROM course_assignments WHERE id=assignment_id) END) AS average FROM course_assignment_submissions WHERE user_id=? AND assignment_id IN (SELECT id FROM course_assignments WHERE course_id=?)").bind(studentId,courseId).first();
    const examStats=await env.DB.prepare("SELECT COUNT(*) AS total,AVG(r.points_awarded*100.0/a.max_points) AS average FROM course_assessment_results r JOIN course_assessments a ON a.id=r.assessment_id WHERE r.user_id=? AND a.course_id=? AND r.published_at IS NOT NULL").bind(studentId,courseId).first();
    const summary={assignments:assignmentStats||{},assessments:examStats||{},issuedAt:new Date().toISOString()};
    await env.DB.prepare('INSERT INTO student_report_cards(id,user_id,course_id,period_label,summary_json,issued_by) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,course_id,period_label) DO UPDATE SET summary_json=excluded.summary_json,issued_by=excluded.issued_by,issued_at=CURRENT_TIMESTAMP').bind(uuid(),studentId,courseId,period,JSON.stringify(summary),user.id).run();
    return json({issued:true,summary});
  }
  return error('Unknown academic action.',400);
}
