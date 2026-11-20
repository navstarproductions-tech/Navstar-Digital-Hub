import { getSession, requireRole } from '../_shared/auth.js';
import { error,isSameOrigin,json,readJson,safeString,uuid } from '../_shared/http.js';

const admins=['admin','principal'];
const staff=['admin','principal','tutor'];
const clean=(v,n=200)=>safeString(v,n);
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(18)),b=>b.toString(16).padStart(2,'0')).join('');
async function canCourse(db,user,courseId){
 if(admins.includes(user.role))return Boolean(await db.prepare('SELECT id FROM courses WHERE id=?').bind(courseId).first());
 if(user.role==='tutor')return Boolean(await db.prepare('SELECT id FROM course_tutor_assignments WHERE course_id=? AND tutor_user_id=? UNION SELECT m.id FROM module_tutor_assignments m JOIN course_modules cm ON cm.id=m.module_id WHERE cm.course_id=? AND m.tutor_user_id=? LIMIT 1').bind(courseId,user.id,courseId,user.id).first());
 return Boolean(await db.prepare("SELECT id FROM enrollments WHERE course_id=? AND lower(email)=lower(?) AND status='accepted'").bind(courseId,user.email).first());
}
export async function onRequestGet({request,env}){
 if(!env.DB)return error('Academic workspace database unavailable.',503);
 const url=new URL(request.url),action=url.searchParams.get('action')||'messages';
 if(action==='verify-report-card'){
  const key=clean(url.searchParams.get('token'),100);if(!key)return error('Verification token required.');
  const row=await env.DB.prepare('SELECT report_card_no,period_label,snapshot_json,issued_at FROM academic_report_cards WHERE public_token=?').bind(key).first();
  if(!row)return error('Report card not found.',404);
  let snapshot={};try{snapshot=JSON.parse(row.snapshot_json)}catch{}
  return json({reportCardNo:row.report_card_no,period:row.period_label,issuedAt:row.issued_at,student:snapshot.student,course:snapshot.course,results:snapshot.results,summary:snapshot.summary,verification:'verified'});
 }
 const user=await getSession(request,env);if(!user)return error('Sign in required.',401);
 if(action==='report-cards'){
  if(user.role==='student'){
   const rows=await env.DB.prepare('SELECT r.id,r.report_card_no,r.period_label,r.public_token,r.issued_at,r.course_id,r.snapshot_json,c.title AS course_title FROM academic_report_cards r JOIN courses c ON c.id=r.course_id WHERE r.user_id=? ORDER BY issued_at DESC').bind(user.id).all();
   return json({reportCards:rows.results||[]});
  }
  if(!staff.includes(user.role))return error('Not authorised.',403);
  const rows=await env.DB.prepare('SELECT r.id,r.report_card_no,r.period_label,r.public_token,r.issued_at,r.course_id,r.snapshot_json,u.name AS student_name,c.title AS course_title FROM academic_report_cards r JOIN users u ON u.id=r.user_id JOIN courses c ON c.id=r.course_id ORDER BY r.issued_at DESC LIMIT 500').all();
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
  const rows=await env.DB.prepare("SELECT DISTINCT u.id,u.name,u.role FROM users u LEFT JOIN course_tutor_assignments a ON a.tutor_user_id=u.id AND a.course_id=? LEFT JOIN module_tutor_assignments ma ON ma.tutor_user_id=u.id JOIN course_modules cm ON cm.id=ma.module_id AND cm.course_id=? WHERE u.status='active' AND u.role IN ('tutor','admin','principal') AND (a.id IS NOT NULL OR ma.id IS NOT NULL OR u.role IN ('admin','principal')) ORDER BY u.name").bind(courseId,courseId).all();
  return json({tutors:rows.results||[]});
 }
 if(action==='students'){
  if(!staff.includes(user.role))return error('Not authorised.',403);
  const courseId=clean(url.searchParams.get('courseId'),80);
  if(!await canCourse(env.DB,user,courseId))return error('Course access denied.',403);
  const rows=await env.DB.prepare("SELECT u.id,u.name,u.email,e.admission_number,e.preferred_intake FROM users u JOIN enrollments e ON lower(e.email)=lower(u.email) WHERE e.course_id=? AND e.status='accepted' ORDER BY u.name").bind(courseId).all();
  return json({students:rows.results||[]});
 }
 return error('Unknown academic workspace view.',400);
}
export async function onRequestPost({request,env}){
 if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
 if(!env.DB)return error('Academic workspace database unavailable.',503);
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
  statements.push(env.DB.prepare('INSERT INTO course_assessment_results(id,assessment_id,user_id,points_awarded,feedback,published_at,marked_by) VALUES(?,?,?,?,?,?,?) ON CONFLICT(assessment_id,user_id) DO UPDATE SET points_awarded=excluded.points_awarded,feedback=excluded.feedback,published_at=excluded.published_at,marked_by=excluded.marked_by,marked_at=CURRENT_TIMESTAMP').bind(uuid(),assessmentId,studentId,total,clean(b.feedback,2000),b.publish===true?new Date().toISOString():null,user.id));
  await env.DB.batch(statements);return json({saved:true,total,max:totalMax});
 }
 if(action==='issue-report-card'){
  const access=await requireRole(request,env,admins);if(access.response)return access.response;
  const studentId=clean(b.studentId,80),courseId=clean(b.courseId,80),period=clean(b.periodLabel,80);
  if(!studentId||!period||!await canCourse(env.DB,user,courseId))return error('Select a valid course, student and reporting period.');
  const student=await env.DB.prepare("SELECT u.id,u.name,u.email,e.admission_number,e.preferred_intake,e.course_fee,e.amount_paid,e.id AS enrollment_id FROM users u JOIN enrollments e ON lower(e.email)=lower(u.email) WHERE u.id=? AND e.course_id=? AND e.status='accepted'").bind(studentId,courseId).first();
  if(!student)return error('Student is not enrolled in this course.',404);
  const course=await env.DB.prepare('SELECT id,title FROM courses WHERE id=?').bind(courseId).first();
  const modules=(await env.DB.prepare('SELECT id,code,title FROM course_modules WHERE course_id=? ORDER BY sort_order,title').bind(courseId).all()).results||[];
  const results=(await env.DB.prepare(`SELECT m.id,m.code,m.title,
   AVG(r.points_awarded*100.0/a.max_points) AS percentage,
   SUM(r.points_awarded) AS total_points,SUM(a.max_points) AS max_points
   FROM course_modules m LEFT JOIN course_assessments a ON a.module_id=m.id
   LEFT JOIN course_assessment_results r ON r.assessment_id=a.id AND r.user_id=? AND r.published_at IS NOT NULL
   WHERE m.course_id=? GROUP BY m.id ORDER BY m.sort_order,m.title`).bind(studentId,courseId).all()).results||[];
  const cfgRow=await env.DB.prepare("SELECT settings_json FROM exam_institute_settings WHERE id='default'").first();
  let grading=[];try{grading=JSON.parse(cfgRow?.settings_json||'{}').gradingScale||[]}catch{}
  const paid=Number(student.amount_paid||0),fee=Number(student.course_fee||0),balance=Math.max(0,fee-paid);
  const intakeText=clean(student.preferred_intake,60),monthMap={january:'01',february:'02',march:'03',april:'04',may:'05',june:'06',july:'07',august:'08',september:'09',october:'10',november:'11',december:'12'};const month=Object.keys(monthMap).find(m=>intakeText.toLowerCase().includes(m));const year=(intakeText.match(/20\d{2}/)||[])[0];const intake=month&&year?monthMap[month]+year.slice(-2):(intakeText.replace(/[^a-z0-9]/gi,'').slice(0,4)||'0000').toUpperCase();
  const gradedResults=results.map(x=>{const pct=Number(x.percentage||0),g=grading.find((item)=>pct>=Number(item.min??item.from??0)&&pct<=Number(item.max??item.to??100));return {...x,grade:g?.grade||'—',remarks:g?.remarks||g?.remark||'Recorded result'};});
  const snapshot={student:{name:student.name,email:student.email,admissionNumber:student.admission_number,intake:student.preferred_intake},course,modules,results:gradedResults,summary:{mean:gradedResults.length?gradedResults.reduce((s,x)=>s+Number(x.percentage||0),0)/gradedResults.length:0,fee,paid,balance,paymentPercentage:fee?paid/fee*100:0},grading,tutorComment:clean(b.tutorComment,1000),principalComment:clean(b.principalComment,1000),recommendation:clean(b.recommendation,100),issuedBy:user.name};
  const existing=await env.DB.prepare('SELECT id,report_card_no,public_token FROM academic_report_cards WHERE user_id=? AND course_id=? AND period_label=?').bind(studentId,courseId,period).first();
  const id=existing?.id||uuid(),number=existing?.report_card_no||'RC-'+intake+'/'+String(crypto.getRandomValues(new Uint16Array(1))[0]%10000).padStart(4,'0')+String.fromCharCode(65+(crypto.getRandomValues(new Uint8Array(1))[0]%26)),publicToken=existing?.public_token||token();
  await env.DB.prepare('INSERT INTO academic_report_cards(id,report_card_no,public_token,user_id,course_id,period_label,intake_code,snapshot_json,issued_by) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,course_id,period_label) DO UPDATE SET snapshot_json=excluded.snapshot_json,issued_by=excluded.issued_by,issued_at=CURRENT_TIMESTAMP').bind(id,number,publicToken,studentId,courseId,period,intake,JSON.stringify(snapshot),user.id).run();
  return json({issued:true,id,reportCardNo:number,publicUrl:new URL('/verify-result/'+publicToken,request.url).toString()});
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
  const periods=Number(rules.periodsPerDay||4),minutes=Number(rules.periodMinutes||60),startHour=Number(rules.startHour||8),startDate=new Date(clean(rules.startDate,30)||new Date().toISOString().slice(0,10));
  if(!modules.length||!venues.length||!days.length||!Number.isInteger(periods)||periods<1||periods>12||!Number.isInteger(minutes)||minutes<20||minutes>240||!Number.isFinite(startDate.getTime()))return error('Set published modules, weekdays, venues, start date and valid teaching periods.');
  const slots=[];let cursor=0;
  for(let week=0;week<Number(rules.weeks||1)&&week<20;week++){
   for(let dayOffset=0;dayOffset<7;dayOffset++){
    const date=new Date(startDate);date.setDate(date.getDate()+week*7+dayOffset);
    if(!days.includes(date.getDay()||7))continue;
    for(let p=0;p<periods&&cursor<modules.length*Number(rules.weeks||1);p++){
     const mod=modules[cursor%modules.length],hour=startHour+p*Math.ceil(minutes/60);
     const start=new Date(date);start.setHours(hour,0,0,0);const end=new Date(start.getTime()+minutes*60000);
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
