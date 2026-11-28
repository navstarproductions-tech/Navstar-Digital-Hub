import { getSession, requireRole } from '../_shared/auth.js';
import { error,isSameOrigin,json,readJson,safeString,uuid } from '../_shared/http.js';
import { syncModuleResult, syncStudentModuleResults } from '../_shared/module-marks.js';

const admins=['admin','principal'];
const staff=['admin','principal','tutor'];
const clean=(v,n=200)=>safeString(v,n);
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(18)),b=>b.toString(16).padStart(2,'0')).join('');
function categoryMaximum(type,settings={}){
 const grading=settings.grading||settings||{},kind=String(type||'').toLowerCase();
 const key=({cat:'catOutOf',test:'catOutOf',practical:'practicalOutOf',exam:'finalOutOf'}[kind]||'finalOutOf');
 const fallback=({cat:30,test:30,practical:20,exam:50}[kind]||50);
 const snake=key.replace(/[A-Z]/g,m=>'_'+m.toLowerCase()),value=Number(grading[key]??grading[snake]);
 return Number.isFinite(value)&&value>0?value:fallback;
}
function scaleScore(raw,rawMaximum,targetMaximum){
 const denominator=Number(rawMaximum)>0?Number(rawMaximum):100;
 return Math.round((Number(raw||0)/denominator)*Number(targetMaximum)*100)/100;
}
async function ensureModuleTutors(db){
 await db.prepare('CREATE TABLE IF NOT EXISTS module_tutor_assignments (id TEXT PRIMARY KEY,module_id TEXT NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,tutor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,assigned_by TEXT REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(module_id,tutor_user_id))').run();
 await db.prepare('INSERT OR IGNORE INTO module_tutor_assignments(id,module_id,tutor_user_id,assigned_by) SELECT lower(hex(randomblob(16))),m.id,a.tutor_user_id,a.assigned_by FROM course_modules m JOIN course_tutor_assignments a ON a.course_id=m.course_id').run();
}
async function canCourse(db,user,courseId){
 if(admins.includes(user.role))return Boolean(await db.prepare('SELECT id FROM courses WHERE id=?').bind(courseId).first());
 if(user.role==='tutor')return Boolean(await db.prepare('SELECT id FROM course_tutor_assignments WHERE course_id=? AND tutor_user_id=? UNION SELECT m.id FROM module_tutor_assignments m JOIN course_modules cm ON cm.id=m.module_id WHERE cm.course_id=? AND m.tutor_user_id=? LIMIT 1').bind(courseId,user.id,courseId,user.id).first());
 return Boolean(await db.prepare("SELECT id FROM enrollments WHERE course_id=? AND lower(email)=lower(?) AND status='accepted'").bind(courseId,user.email).first());
}
export async function onRequestGet({request,env}){
 if(!env.DB)return error('Academic workspace database unavailable.',503);
 await ensureModuleTutors(env.DB);
 const url=new URL(request.url),action=url.searchParams.get('action')||'messages';
 if(action==='verify-report-card'){
  const key=clean(url.searchParams.get('token'),100);if(!key)return error('Verification token required.');
  const row=await env.DB.prepare("SELECT report_card_no,period_label,snapshot_json,issued_at FROM academic_report_cards WHERE public_token=? AND status='published'").bind(key).first();
  if(!row)return error('Report card not found.',404);
  let snapshot={};try{snapshot=JSON.parse(row.snapshot_json)}catch{}
  return json({reportCardNo:row.report_card_no,period:row.period_label,issuedAt:row.issued_at,student:snapshot.student,course:snapshot.course,results:snapshot.results,summary:snapshot.summary,verification:'verified'});
 }
 const user=await getSession(request,env);if(!user)return error('Sign in required.',401);
 if(action==='report-cards'){
  if(user.role==='student'){
   const rows=await env.DB.prepare("SELECT r.id,r.report_card_no,r.period_label,r.public_token,r.issued_at,r.status,r.course_id,r.snapshot_json,c.title AS course_title FROM academic_report_cards r JOIN courses c ON c.id=r.course_id WHERE r.user_id=? ORDER BY r.issued_at DESC").bind(user.id).all();
   return json({reportCards:rows.results||[]});
  }
  if(!staff.includes(user.role))return error('Not authorised.',403);
  const rows=await env.DB.prepare("SELECT r.id,r.report_card_no,r.period_label,r.public_token,r.issued_at,r.status,r.approved_at,r.published_at,r.course_id,r.snapshot_json,u.name AS student_name,c.title AS course_title FROM academic_report_cards r JOIN users u ON u.id=r.user_id JOIN courses c ON c.id=r.course_id ORDER BY CASE r.status WHEN 'draft' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,r.issued_at DESC LIMIT 500").all();
  return json({reportCards:rows.results||[]});
 }
 if(action==='messages'){
  const rows=await env.DB.prepare(`SELECT c.*,s.name AS student_name,t.name AS tutor_name,
   (SELECT body FROM academic_messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
   (SELECT COUNT(*) FROM academic_messages m WHERE m.conversation_id=c.id AND m.read_at IS NULL AND m.sender_user_id!=?) AS unread_count
   FROM academic_conversations c JOIN users s ON s.id=c.student_user_id LEFT JOIN users t ON t.id=c.tutor_user_id
   WHERE c.student_user_id=? OR c.tutor_user_id=? OR ? IN ('admin','principal')
   ORDER BY c.updated_at DESC LIMIT 200`).bind(user.id,user.id,user.id,user.role).all();
  return json({conversations:rows.results||[]});
 }
 if(action==='thread'){
  const id=clean(url.searchParams.get('id'),80);
  const c=await env.DB.prepare('SELECT * FROM academic_conversations WHERE id=?').bind(id).first();
  if(!c||!(admins.includes(user.role)||c.student_user_id===user.id||c.tutor_user_id===user.id))return error('Conversation not found.',404);
  const rows=await env.DB.prepare('SELECT m.*,u.name AS sender_name FROM academic_messages m JOIN users u ON u.id=m.sender_user_id WHERE m.conversation_id=? ORDER BY m.created_at').bind(id).all();
  await env.DB.prepare('UPDATE academic_messages SET read_at=CURRENT_TIMESTAMP WHERE conversation_id=? AND sender_user_id!=? AND read_at IS NULL').bind(id,user.id).run();
  return json({conversation:c,messages:rows.results||[]});
 }
 if(action==='tutors'){
  if(user.role!=='student')return error('Not authorised.',403);
  const courseId=clean(url.searchParams.get('courseId'),80);if(!await canCourse(env.DB,user,courseId))return error('Course access denied.',403);
  const rows=await env.DB.prepare("SELECT DISTINCT u.id,u.name,COALESCE(up.portal_role,u.role) AS role FROM users u LEFT JOIN user_profiles up ON up.user_id=u.id LEFT JOIN course_tutor_assignments a ON a.tutor_user_id=u.id AND a.course_id=? LEFT JOIN module_tutor_assignments ma ON ma.tutor_user_id=u.id JOIN course_modules cm ON cm.id=ma.module_id AND cm.course_id=? WHERE u.status='active' AND u.role IN ('tutor','admin','principal') AND (a.id IS NOT NULL OR ma.id IS NOT NULL OR u.role IN ('admin','principal')) ORDER BY u.name").bind(courseId,courseId).all();
  return json({tutors:rows.results||[]});
 }
 if(action==='students'){
  if(!staff.includes(user.role))return error('Not authorised.',403);
  const courseId=clean(url.searchParams.get('courseId'),80);
  if(!await canCourse(env.DB,user,courseId))return error('Course access denied.',403);
  const rows=await env.DB.prepare("SELECT u.id,u.name,u.email,e.admission_number,e.preferred_intake FROM users u JOIN enrollments e ON lower(e.email)=lower(u.email) WHERE e.course_id=? AND e.status='accepted' AND u.role='student' AND u.status='active' ORDER BY u.name").bind(courseId).all();
  return json({students:rows.results||[]});
 }
 return error('Unknown academic workspace view.',400);
}
export async function onRequestPost({request,env}){
 if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
 if(!env.DB)return error('Academic workspace database unavailable.',503);
 await ensureModuleTutors(env.DB);
 const user=await getSession(request,env);if(!user)return error('Sign in required.',401);
 let b;try{b=await readJson(request,20000)}catch{return error('Invalid request body.')}
 const action=clean(b.action,50);
 if(action==='save-component-marks'){
  const access=await requireRole(request,env,staff);if(access.response)return access.response;
  const assessmentId=clean(b.assessmentId,80),studentId=clean(b.studentId,80),components=Array.isArray(b.components)?b.components:[];
  const a=await env.DB.prepare('SELECT id,course_id,max_points FROM course_assessments WHERE id=?').bind(assessmentId).first();
  if(!a||!await canCourse(env.DB,user,a.course_id))return error('Assessment/course access denied.',403);
  const enrolled=await env.DB.prepare("SELECT u.id FROM users u JOIN enrollments e ON lower(e.email)=lower(u.email) WHERE u.id=? AND e.course_id=? AND e.status='accepted'").bind(studentId,a.course_id).first();
  if(!enrolled||!components.length||components.length>12)return error('Select an enrolled student and valid mark components.');
  let total=0;const statements=[];
  for(const c of components){
   const key=clean(c.key,30),label=clean(c.label,60),score=Number(c.score),max=Number(c.max);
   if(!key||!label||!Number.isFinite(score)||!Number.isFinite(max)||max<=0||score<0||score>max)return error('Each component score must be within its maximum.');
   total+=score;statements.push(env.DB.prepare(`INSERT INTO assessment_component_marks(id,assessment_id,user_id,component_key,component_label,points_awarded,max_points,feedback,marked_by) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(assessment_id,user_id,component_key) DO UPDATE SET component_label=excluded.component_label,points_awarded=excluded.points_awarded,max_points=excluded.max_points,feedback=excluded.feedback,marked_by=excluded.marked_by,marked_at=CURRENT_TIMESTAMP`).bind(uuid(),assessmentId,studentId,key,label,score,max,clean(c.feedback,1000),user.id));
  }
  const totalMax=components.reduce((n,c)=>n+Number(c.max),0);
  if(total>Number(a.max_points)||totalMax>Number(a.max_points))return error('Component totals cannot exceed the assessment maximum.');
  const cfg=await env.DB.prepare("SELECT value FROM system_state WHERE key='admin-configuration'").first();let allConfig={};try{allConfig=JSON.parse(cfg?.value||'{}')}catch{}const gradeText=String(allConfig.grading?.gradeScale||'');const parsedBands=gradeText.split(/\r?\n/).map(line=>line.split('|').map(part=>part.trim())).filter(p=>p[0]&&p[2]!==''&&p[3]!==''&&p[2]!=='—'&&p[3]!=='—'&&Number.isFinite(Number(p[2]))&&Number.isFinite(Number(p[3]))).map(p=>({grade:p[0],min:Number(p[2]),max:Number(p[3]),remarks:p.slice(4).join(' | ')}));const examConfig={...(allConfig.grading||{}),publishedMaximum:Number(allConfig.grading?.publishedMaximum)||100,gradingScale:parsedBands.length?parsedBands:[{grade:'A',min:80,max:100,remarks:'Exceptional performance'},{grade:'B+',min:70,max:79,remarks:'Strong technical skills'},{grade:'B',min:60,max:69,remarks:'Competent work'},{grade:'C',min:50,max:59,remarks:'Satisfactory work'},{grade:'D',min:40,max:49,remarks:'Developing'},{grade:'F',min:0,max:39,remarks:'Essential requirements not met'}]};
  const paper=await env.DB.prepare('SELECT assessment_type,module_id FROM course_assessments WHERE id=?').bind(assessmentId).first();
  const targetMax=categoryMaximum(paper?.assessment_type,examConfig),published=scaleScore(total,totalMax,targetMax);
  statements.push(env.DB.prepare('INSERT INTO course_assessment_results(id,assessment_id,user_id,points_awarded,feedback,published_at,marked_by,raw_points_awarded,published_max_points) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(assessment_id,user_id) DO UPDATE SET points_awarded=excluded.points_awarded,feedback=excluded.feedback,published_at=excluded.published_at,marked_by=excluded.marked_by,marked_at=CURRENT_TIMESTAMP,raw_points_awarded=excluded.raw_points_awarded,published_max_points=excluded.published_max_points').bind(uuid(),assessmentId,studentId,published,clean(b.feedback,2000),b.publish===true?new Date().toISOString():null,user.id,total,targetMax));
  await env.DB.batch(statements);if(paper?.module_id)await syncModuleResult(env.DB,studentId,paper.module_id,user.id);return json({saved:true,total,published,publishedMaximum:targetMax,rawMaximum:totalMax});
 }
 if(action==='repair-missing-intakes'){
  const access=await requireRole(request,env,admins);if(access.response)return access.response;
  const missing=await env.DB.prepare("SELECT e.id,e.admission_number,e.created_at FROM enrollments e JOIN users u ON lower(u.email)=lower(e.email) WHERE e.status='accepted' AND u.role='student' AND u.status='active' AND (e.preferred_intake IS NULL OR trim(e.preferred_intake)='') ORDER BY e.created_at,e.admission_number").all();
  const rows=missing.results||[];let repaired=0;
  for(let i=0;i<rows.length;i+=100){
   const batch=rows.slice(i,i+100).map(row=>{const d=new Date(row.created_at||'');if(Number.isNaN(d.getTime()))return null;const intake=d.toLocaleString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'})+' Intake';return env.DB.prepare("UPDATE enrollments SET preferred_intake=? WHERE id=? AND (preferred_intake IS NULL OR trim(preferred_intake)='')").bind(intake,row.id);}).filter(Boolean);
   if(batch.length){const results=await env.DB.batch(batch);repaired+=results.reduce((n,x)=>n+(x.meta?.changes||0),0);}
  }
  await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),user.id,'missing_student_intakes_repaired','enrollments',String(repaired)).run();
  return json({success:true,scanned:rows.length,repaired,unresolved:rows.length-repaired,message:'Missing intakes assigned by original enrolment date. Existing intake values and admission numbers were preserved.'});
 }
 if(action==='issue-report-card'||action==='generate-student-report-card'){
  const selfService=action==='generate-student-report-card';
  if(selfService){if(user.role!=='student')return error('Only a student may generate a personal report card.',403);}
  else {const access=await requireRole(request,env,admins);if(access.response)return access.response;}
  const studentId=selfService?user.id:clean(b.studentId,80),courseId=clean(b.courseId,80);
  if(!studentId||!await canCourse(env.DB,user,courseId))return error('Select a valid course and student.');
  const student=await env.DB.prepare("SELECT u.id,u.name,u.email,e.admission_number,e.preferred_intake,e.created_at,e.course_fee,e.amount_paid,e.id AS enrollment_id FROM users u JOIN enrollments e ON lower(e.email)=lower(u.email) WHERE u.id=? AND e.course_id=? AND e.status='accepted' AND u.role='student' AND u.status='active'").bind(studentId,courseId).first();
  if(!student)return error('A report card is available only to an Active student with an accepted enrolment in the selected course.',404);
  const enrolledAt=new Date(student.created_at||Date.now());
  const derivedIntake=Number.isNaN(enrolledAt.getTime())?'Unassigned Intake':enrolledAt.toLocaleString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'})+' Intake';
  const period=clean(student.preferred_intake,60)||derivedIntake;
  if(!student.preferred_intake&&period===derivedIntake)await env.DB.prepare("UPDATE enrollments SET preferred_intake=? WHERE id=? AND (preferred_intake IS NULL OR trim(preferred_intake)='')").bind(derivedIntake,student.enrollment_id).run();
  await syncStudentModuleResults(env.DB,studentId,courseId,user.id);
  const course=await env.DB.prepare('SELECT id,title,course_code FROM courses WHERE id=?').bind(courseId).first();
  let modules=(await env.DB.prepare('SELECT id,code,title,sort_order FROM course_modules WHERE course_id=? ORDER BY sort_order,title').bind(courseId).all()).results||[];
  const modulePrefix=String(course?.course_code||course?.title||'NAV').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6)||'NAV';
  const usedCodes=new Set(modules.map(m=>String(m.code||'').toUpperCase()).filter(Boolean));
  let moduleSequence=1;
  for(const module of modules){if(module.code&&String(module.code).trim())continue;let candidate='';do{candidate=modulePrefix+String(moduleSequence++).padStart(3,'0')}while(usedCodes.has(candidate));usedCodes.add(candidate);await env.DB.prepare('UPDATE course_modules SET code=? WHERE id=? AND (code IS NULL OR trim(code)=\'\')').bind(candidate,module.id).run();module.code=candidate;}
  modules=modules.map(({id,code,title})=>({id,code,title}));
  const results=(await env.DB.prepare(`SELECT m.id,m.code,m.title,r.cat_score,r.practical_score,r.exam_score,r.assignment_score,
    r.score AS total_points,r.max_score AS max_points,
    CASE WHEN r.max_score>0 AND r.status='published' THEN r.score*100.0/r.max_score ELSE NULL END AS percentage,
    COALESCE(r.grade,'MM') AS grade,COALESCE(r.remarks,'Missing Marks') AS remarks,
    COALESCE(r.status,'incomplete') AS result_status
    FROM course_modules m LEFT JOIN student_module_results r ON r.module_id=m.id AND r.user_id=?
    WHERE m.course_id=? ORDER BY m.sort_order,m.title`).bind(studentId,courseId).all()).results||[];
  const cfgRow=await env.DB.prepare("SELECT value FROM system_state WHERE key='admin-configuration'").first();
  let allConfig={};try{allConfig=JSON.parse(cfgRow?.value||'{}')}catch{}
  const gradingText=String(allConfig.grading?.gradeScale||'');
  const parsedGrades=gradingText.split(/\r?\n/).map(line=>line.split('|').map(part=>part.trim())).filter(p=>p[0]&&p[2]!==''&&p[3]!==''&&p[2]!=='—'&&p[3]!=='—'&&Number.isFinite(Number(p[2]))&&Number.isFinite(Number(p[3]))).map(p=>({grade:p[0],min:Number(p[2]),max:Number(p[3]),remarks:p.slice(4).join(' | ')}));
  const grading=parsedGrades.length?parsedGrades:[{grade:'A',min:80,max:100,remarks:'Exceptional performance'},{grade:'B+',min:70,max:79,remarks:'Strong technical skills'},{grade:'B',min:60,max:69,remarks:'Competent work'},{grade:'C',min:50,max:59,remarks:'Satisfactory work'},{grade:'D',min:40,max:49,remarks:'Developing'},{grade:'F',min:0,max:39,remarks:'Essential requirements not met'}];
  const paid=Number(student.amount_paid||0),fee=Number(student.course_fee||0),balance=Math.max(0,fee-paid);
  const intakeText=clean(student.preferred_intake,60),monthMap={january:'01',february:'02',march:'03',april:'04',may:'05',june:'06',july:'07',august:'08',september:'09',october:'10',november:'11',december:'12'};
  const month=Object.keys(monthMap).find(m=>intakeText.toLowerCase().includes(m)),year=(intakeText.match(/20\d{2}/)||[])[0];
  const intake=month&&year?monthMap[month]+year.slice(-2):(intakeText.replace(/[^a-z0-9]/gi,'').slice(0,4)||'0000').toUpperCase();
  const gradedResults=results.map(x=>{
   const hasResult=x.percentage!==null&&x.percentage!==undefined&&Number.isFinite(Number(x.percentage));
   const pct=hasResult?Number(x.percentage):null;
   const g=hasResult?grading.find(item=>pct>=Number(item.min??item.from??0)&&pct<=Number(item.max??item.to??100)):null;
   return {...x,percentage:pct,grade:x.grade||g?.grade||(hasResult?'—':'MM'),remarks:x.remarks||(hasResult?(g?.remarks||g?.remark||'Recorded result'):'Awaiting Final Exam')};
  });
  const validPercentages=gradedResults.filter(x=>x.percentage!==null).map(x=>Number(x.percentage));
  const attendance=await env.DB.prepare("SELECT COUNT(ca.id) AS sessions,SUM(CASE WHEN ca.status='present' THEN 1 ELSE 0 END) AS present,SUM(CASE WHEN ca.status='late' THEN 1 ELSE 0 END) AS late,SUM(CASE WHEN ca.status='absent' THEN 1 ELSE 0 END) AS absent,SUM(CASE WHEN ca.status='excused' THEN 1 ELSE 0 END) AS excused FROM course_timetable t LEFT JOIN course_attendance ca ON ca.timetable_id=t.id AND ca.student_user_id=? WHERE t.course_id=? AND t.status='completed'").bind(studentId,courseId).first();
  const attendanceSessions=Number(attendance?.sessions||0),attendancePresent=Number(attendance?.present||0),attendanceLate=Number(attendance?.late||0);
  const attendanceSummary={sessions:attendanceSessions,present:attendancePresent,late:attendanceLate,absent:Number(attendance?.absent||0),excused:Number(attendance?.excused||0),percentage:attendanceSessions?((attendancePresent+attendanceLate)/attendanceSessions)*100:null};
  const safeAssetUrl=(value)=>{const raw=clean(value,1000);if(!raw)return '';try{const parsed=new URL(raw,request.url);return ['http:','https:'].includes(parsed.protocol)?parsed.toString():''}catch{return ''}};
  const reportCardConfig=allConfig['report-card-layout']||{};
  const reportCardSettings={title:clean(reportCardConfig.reportCardTitle,120)||'OFFICIAL ACADEMIC REPORT CARD',subtitle:clean(reportCardConfig.reportCardSubtitle,180),fields:clean(reportCardConfig.reportCardFields,2000),showAttendance:reportCardConfig.reportCardShowAttendance!==false,showFees:reportCardConfig.reportCardShowFees!==false,showRemarks:reportCardConfig.reportCardShowRemarks!==false,showModuleCode:reportCardConfig.reportCardShowModuleCode!==false,showMarks:reportCardConfig.reportCardShowMarks!==false,showGrade:reportCardConfig.reportCardShowGrade!==false,showQr:reportCardConfig.reportCardShowQr!==false,watermarkEnabled:reportCardConfig.reportCardWatermarkEnabled===true,watermarkText:clean(reportCardConfig.reportCardWatermarkText,80)||'NAVSTAR DIGITAL HUB',watermarkOpacity:Math.max(5,Math.min(50,Number(reportCardConfig.reportCardWatermarkOpacity)||12)),watermarkUrl:safeAssetUrl(reportCardConfig.reportCardWatermarkUrl),stampUrl:safeAssetUrl(reportCardConfig.reportCardStampUrl),logoUrl:safeAssetUrl(reportCardConfig.reportCardLogoUrl),trainerSignatureUrl:safeAssetUrl(reportCardConfig.trainerSignatureUrl),headTrainingSignatureUrl:safeAssetUrl(reportCardConfig.headTrainingSignatureUrl),directorSignatureUrl:safeAssetUrl(reportCardConfig.directorSignatureUrl),showStamp:reportCardConfig.reportCardStampEnabled!==false};
  const snapshot={student:{name:student.name,email:student.email,admissionNumber:student.admission_number,intake:student.preferred_intake},course,modules,results:gradedResults,summary:{mean:validPercentages.length?validPercentages.reduce((sum,value)=>sum+value,0)/validPercentages.length:null,fee,paid,balance,paymentPercentage:fee?paid/fee*100:0},attendance:attendanceSummary,reportCardSettings,grading,tutorComment:clean(b.tutorComment,1000),principalComment:clean(b.principalComment,1000),recommendation:clean(b.recommendation,100),issuedBy:user.name};
  const existing=await env.DB.prepare('SELECT id,report_card_no,status FROM academic_report_cards WHERE user_id=? AND course_id=? AND period_label=?').bind(studentId,courseId,period).first();
  if(existing)return json({created:false,existing:true,id:existing.id,reportCardNo:existing.report_card_no,status:existing.status,message:'A report card already exists for this student and intake. The saved record can be printed in student or admin format without being republished.'});
  const id=uuid(),number='RC-'+intake+'/'+String(crypto.getRandomValues(new Uint16Array(1))[0]%10000).padStart(4,'0')+String.fromCharCode(65+(crypto.getRandomValues(new Uint8Array(1))[0]%26)),publicToken=token();
  const status='draft',issuedAt=new Date().toISOString();
  const inserted=await env.DB.prepare("INSERT INTO academic_report_cards(id,report_card_no,public_token,user_id,course_id,period_label,intake_code,snapshot_json,issued_by,status,published_by,published_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,course_id,period_label) DO NOTHING").bind(id,number,publicToken,studentId,courseId,period, intake,JSON.stringify(snapshot),user.id,status,null,null).run();
  if(!inserted.meta?.changes)return error('A report card was created for this student and period by another request. Refresh the report-card list.',409);
  if(selfService){await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),user.id,'student_report_card_generated','academic_report_card',id).run().catch(()=>undefined);return json({created:true,id,reportCardNo:number,status:'draft',message:'Your report card has been generated as an unpublished draft.'},201);}
  return json({created:true,id,reportCardNo:number,status:'draft',message:'Unpublished academic record generated for the student intake.'},201);
 }
 if(action==='approve-report-card'){
  const access=await requireRole(request,env,admins);if(access.response)return access.response;
  const id=clean(b.id,80);if(!id)return error('Select a report card.');
  const record=await env.DB.prepare('SELECT id,status FROM academic_report_cards WHERE id=?').bind(id).first();
  if(!record)return error('Report card not found.',404);
  if(record.status!=='draft')return error('Only a draft report card can be approved.',409);
  const result=await env.DB.prepare("UPDATE academic_report_cards SET status='approved',approved_by=?,approved_at=CURRENT_TIMESTAMP WHERE id=? AND status='draft'").bind(user.id,id).run();
  if(!result.meta?.changes)return error('The report card changed while you were reviewing it. Refresh and retry.',409);
  await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),user.id,'academic_report_card_approved','academic_report_card',id).run();
  return json({saved:true,status:'approved'});
 }
 if(action==='publish-report-card'){
  const access=await requireRole(request,env,admins);if(access.response)return access.response;
  return error('Report-card publication is disabled. Generated academic records remain unpublished.',409);
  const id=clean(b.id,80);if(!id)return error('Select a report card.');
  const record=await env.DB.prepare('SELECT id,user_id,report_card_no,status,public_token FROM academic_report_cards WHERE id=?').bind(id).first();
  if(!record)return error('Report card not found.',404);
  if(record.status!=='approved')return error('A report card must be approved before it can be published.',409);
  const result=await env.DB.prepare("UPDATE academic_report_cards SET status='published',published_by=?,published_at=CURRENT_TIMESTAMP,issued_at=CURRENT_TIMESTAMP WHERE id=? AND status='approved'").bind(user.id,id).run();
  if(!result.meta?.changes)return error('The report card changed while you were publishing it. Refresh and retry.',409);
  await env.DB.batch([
   env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),user.id,'academic_report_card_published','academic_report_card',id),
   env.DB.prepare('INSERT INTO notifications(id,user_id,title,message) VALUES(?,?,?,?)').bind(uuid(),record.user_id,'Academic report card published','Your report card '+record.report_card_no+' is now available in your Navstar Student Portal.')
  ]);
  return json({saved:true,status:'published',reportCardNo:record.report_card_no,publicUrl:new URL('/verify-result/'+record.public_token,request.url).toString()});
 }
 if(action==='create-conversation'){
  if(user.role!=='student')return error('Only students may open a new tutor conversation.',403);
  const subject=clean(b.subject,140),courseId=clean(b.courseId,80),tutorId=clean(b.tutorId,80),body=clean(b.body,5000);
  if(subject.length<4||body.length<2||!await canCourse(env.DB,user,courseId))return error('Enter a subject, message and your enrolled course.');
  const tutor=await env.DB.prepare('SELECT id FROM users WHERE id=? AND role IN (\'tutor\',\'admin\',\'principal\') AND status=\'active\'').bind(tutorId).first();
  if(!tutor)return error('Choose an active tutor or administrator.',404);
  const id=uuid();await env.DB.batch([
   env.DB.prepare('INSERT INTO academic_conversations(id,subject,course_id,student_user_id,tutor_user_id) VALUES(?,?,?,?,?)').bind(id,subject,courseId,user.id,tutorId),
   env.DB.prepare('INSERT INTO academic_messages(id,conversation_id,sender_user_id,body) VALUES(?,?,?,?)').bind(uuid(),id,user.id,body)
  ]);return json({created:true,id},201);
 }
 if(action==='send-message'){
  const id=clean(b.conversationId,80),body=clean(b.body,5000);
  if(body.length<1)return error('Write a message first.');
  const c=await env.DB.prepare('SELECT * FROM academic_conversations WHERE id=?').bind(id).first();
  if(!c||!(admins.includes(user.role)||c.student_user_id===user.id||c.tutor_user_id===user.id))return error('Conversation not found.',404);
  await env.DB.batch([
   env.DB.prepare('INSERT INTO academic_messages(id,conversation_id,sender_user_id,body,attachment_url) VALUES(?,?,?,?,?)').bind(uuid(),id,user.id,body,clean(b.attachmentUrl,500)||null),
   env.DB.prepare('UPDATE academic_conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(id)
  ]);return json({sent:true});
 }
 if(action==='approve-exam-candidate'){
  const access=await requireRole(request,env,admins);if(access.response)return access.response;
  const assessmentId=clean(b.assessmentId,80),studentId=clean(b.studentId,80),approved=b.approved===true;
  const a=await env.DB.prepare('SELECT id,course_id FROM course_assessments WHERE id=?').bind(assessmentId).first();
  if(!a||!await canCourse(env.DB,user,a.course_id))return error('Assessment access denied.',403);
  await env.DB.prepare('INSERT INTO exam_attempt_approvals(id,assessment_id,user_id,status,reviewed_by,reviewed_at,note) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP,?) ON CONFLICT(assessment_id,user_id) DO UPDATE SET status=excluded.status,reviewed_by=excluded.reviewed_by,reviewed_at=CURRENT_TIMESTAMP,note=excluded.note').bind(uuid(),assessmentId,studentId,approved?'approved':'rejected',user.id,clean(b.note,500)).run();
  return json({saved:true,status:approved?'approved':'rejected'});
 }
 if(action==='save-timetable-rules'){
  const access=await requireRole(request,env,admins);if(access.response)return access.response;
  const courseId=clean(b.courseId,80),rules=b.rules&&typeof b.rules==='object'?b.rules:{};
  if(!await canCourse(env.DB,user,courseId))return error('Course not found.',404);
  const id=uuid();await env.DB.prepare('INSERT INTO timetable_generation_rules(id,course_id,rules_json,created_by) VALUES(?,?,?,?)').bind(id,courseId,JSON.stringify(rules),user.id).run();
  return json({saved:true,id});
 }
 if(action==='generate-timetable'){
  const access=await requireRole(request,env,admins);if(access.response)return access.response;
  const courseId=clean(b.courseId,80),rules=b.rules&&typeof b.rules==='object'?b.rules:{};
  if(!await canCourse(env.DB,user,courseId))return error('Course not found.',404);
  const modules=(await env.DB.prepare('SELECT id,title FROM course_modules WHERE course_id=? AND status=\'published\' ORDER BY sort_order,title').bind(courseId).all()).results||[];
  const days=Array.isArray(rules.days)?rules.days.filter(x=>Number.isInteger(x)&&x>=1&&x<=7):[1,2,3,4,5];
  const venues=Array.isArray(rules.venues)?rules.venues.map(x=>clean(x,100)).filter(Boolean):[];
  const tutors=(await env.DB.prepare('SELECT tutor_user_id FROM course_tutor_assignments WHERE course_id=?').bind(courseId).all()).results||[];
  const periods=Number(rules.periodsPerDay||4),minutes=Number(rules.periodMinutes||60),startHour=Number(rules.startHour||8),startDateText=clean(rules.startDate,30)||new Date().toISOString().slice(0,10),startDate=new Date(startDateText+'T00:00:00+03:00');
  if(!modules.length||!venues.length||!days.length||!Number.isInteger(periods)||periods<1||periods>12||!Number.isInteger(minutes)||minutes<20||minutes>240||!Number.isFinite(startDate.getTime()))return error('Set published modules, weekdays, venues, start date and valid teaching periods.');
  const slots=[];let cursor=0;
  for(let week=0;week<Number(rules.weeks||1)&&week<20;week++){
   for(let dayOffset=0;dayOffset<7;dayOffset++){
    const date=new Date(startDate);date.setUTCDate(date.getUTCDate()+week*7+dayOffset);
    if(!days.includes(date.getUTCDay()||7))continue;
    for(let p=0;p<periods&&cursor<modules.length*Number(rules.weeks||1);p++){
     const mod=modules[cursor%modules.length],hour=startHour+p*Math.ceil(minutes/60);
     const day=date.toISOString().slice(0,10),start=new Date(day+'T'+String(hour).padStart(2,'0')+':00:00+03:00'),end=new Date(start.getTime()+minutes*60000);
     slots.push({module:mod,start,end,venue:venues[(cursor)%venues.length]});cursor++;
    }
   }
  }
  if(!slots.length)return error('No timetable slots were generated.');
  const batch=slots.map(s=>env.DB.prepare('INSERT INTO course_timetable(id,course_id,module_id,title,starts_at,ends_at,venue,created_by) VALUES(?,?,?,?,?,?,?,?)').bind(uuid(),courseId,s.module.id,s.module.title,s.start.toISOString(),s.end.toISOString(),s.venue,user.id));
  await env.DB.batch(batch);return json({generated:slots.length});
 }
 return error('Unknown academic workspace action.',400);
}
