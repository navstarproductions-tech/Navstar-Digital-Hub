import { hashPassword, sha256 } from '../../../_shared/auth.js';
import { error, json, uuid } from '../../../_shared/http.js';

const allowedOrigins = new Set(['https://navstardigitalhub.co.ke', 'https://www.navstardigitalhub.co.ke', 'https://navstardigitalhub.base44.app', 'https://app.base44.com']);
const corsHeaders = origin => ({ 'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'null', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600', 'Vary': 'Origin' });
const clean = (v, n=500) => String(v ?? '').trim().slice(0,n);
const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const norm = v => clean(v,160).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const sourceRecordId = r => clean(r?.id ?? r?._id ?? r?.uuid ?? r?.ID ?? r?.Id ?? r?._migration_source_id,120);
const dateOnly = v => { const m=clean(v,40).match(/^\d{4}-\d{2}-\d{2}/); return m ? m[0] : ''; };
function kenyaDateTime(date,time) { const d=dateOnly(date),m=clean(time,30).match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i); if(!d||!m)return ''; let h=Number(m[1]); const minute=Number(m[2]); if(m[3])h=(h%12)+(m[3].toUpperCase()==='PM'?12:0); if(h>23||minute>59)return ''; const iso=new Date(d+'T'+String(h).padStart(2,'0')+':'+String(minute).padStart(2,'0')+':00+03:00'); return Number.isNaN(iso.getTime())?'':iso.toISOString(); }
const aliases = {
  'computer programming':'computer-programming',
  'advanced level computer programming':'advanced-programming',
  'advanced computer programming':'advanced-programming',
  'robotics and automation':'robotics-automation',
  'automation and robotics':'robotics-automation',
  'web design':'web-design',
  'graphic design':'graphic-design',
  'introduction to video editing':'video-editing',
  'html and css coding course':'html-css',
  'html and css coding':'html-css',
  'basic maintenance and troubleshooting':'computer-maintenance',
  'integrated digital service delivery':'integrated-digital-services',
  'python programming':'python-programming'
};
function lifecycle(r) {
  const s=clean(r.status || r.current_status,40).toLowerCase();
  if(s==='suspended'||s==='deferred') return {account:'disabled',profile:'suspended',graduation:null};
  if(s==='dismissed') return {account:'disabled',profile:'archived',graduation:null};
  if(s==='graduated') return {account:'active',profile:'archived',graduation:'graduated'};
  if(s==='completed') return {account:'active',profile:'archived',graduation:'eligible'};
  return {account:'active',profile:'active',graduation:null};
}
function safeDetails(r) {
  const out={};
  for(const [k,v] of Object.entries(r||{})) if(!/password|credential|biometric|fingerprint/i.test(k)) out[k]=v;
  return JSON.stringify(out);
}
function normalizeFeeItems(r) {
  const supplied=Array.isArray(r.fee_items)?r.fee_items.filter(x=>x&&typeof x==='object'):[];
  const raw=supplied.length?supplied:[
    {label:'Registration Fee',amount:r.registration_fee},
    {label:'Tuition Fee',amount:r.tuition_fee},
    {label:'Examination Fee',amount:r.exam_fee},
    {label:'Certificate Fee',amount:r.certificate_fee}
  ].filter(x=>x.amount!==null&&x.amount!==undefined&&x.amount!=='');
  const total=Math.max(0,Math.round(num(r.total_fee)));
  const sum=raw.reduce((a,x)=>a+num(x.amount),0);
  const rounded=raw.reduce((a,x)=>a+Math.round(num(x.amount)),0);
  if(!raw.length||total<=0) return [];
  if(Math.abs(sum-num(r.total_fee))>1||rounded!==total) {
    const reg=raw.find(x=>norm(x.label||x.item_name)==='registration fee');
    const admission=Math.min(total,Math.max(100,Math.round(num(reg?.amount)||100)));
    return [{itemName:'Admission fee',amount:admission,dueStage:'enrollment',sortOrder:1},{itemName:'Course fee balance',amount:Math.max(0,total-admission),dueStage:'before_term',sortOrder:2}];
  }
  return raw.map((x,i)=>{
    const label=clean(x.label||x.item_name||x.name||('Fee item '+(i+1)),100);
    return {itemName:norm(label)==='registration fee'?'Admission fee':label,amount:Math.max(0,Math.round(num(x.amount))),dueStage:/admission|registration/i.test(label)?'enrollment':'before_term',sortOrder:i+1};
  });
}
async function courseFor(DB,title,price=0) {
  const t=clean(title,160), n=norm(t);
  if(!n) throw new Error('A student or fee record has no course title.');
  const alias=aliases[n];
  if(alias) { const c=await DB.prepare('SELECT id,title,status FROM courses WHERE id=?').bind(alias).first(); if(c)return {...c,created:false}; }
  const exact=await DB.prepare('SELECT id,title,status FROM courses WHERE lower(trim(title))=lower(trim(?)) LIMIT 1').bind(t).first();
  if(exact)return {...exact,created:false};
  const id='base44-'+n.replace(/\s+/g,'-').slice(0,48);
  await DB.prepare("INSERT OR IGNORE INTO courses(id,title,description,duration,image_url,category,price,status) VALUES(?,?,?,'','','Legacy course',?,'archived')")
    .bind(id,t,'Historical course retained for migrated student and fee records.',Math.max(0,Math.round(price))).run();
  const c=await DB.prepare('SELECT id,title,status FROM courses WHERE id=?').bind(id).first();
  return {...c,created:true};
}
function passwordCredential(r) {
  const c=r.student_password_credential||r.password_credential||r.login_password_credential||r.portal_password_credential;
  return c&&c.algorithm==='PBKDF2-SHA256'&&c.salt&&c.hash?{salt:c.salt,hash:c.hash,mustChange:0}:null;
}
async function importFeeStructure(DB,r,c) {
  const sourceId=sourceRecordId(r);
  if(!sourceId)return;
  if(r.approved!==true){c.feeStructuresSkipped++;c.warnings.push('Unapproved or legacy fee structure for '+clean(r.course_title,120)+' was retained in the archive but not activated in the official fee register.');return;}
  const course=await courseFor(DB,r.course_title,r.total_fee);
  if(course.created)c.archivedCoursesCreated++;
  const items=normalizeFeeItems(r);
  if(!items.length){c.feeStructuresSkipped++;c.warnings.push('Fee structure for '+clean(r.course_title,120)+' had no usable amounts and remains in the secure migration archive.');return;}
  await DB.prepare('UPDATE course_fee_items SET active=0,updated_at=CURRENT_TIMESTAMP WHERE course_id=?').bind(course.id).run();
  for(const item of items) {
    const id='b44fee-'+sourceId.slice(-16)+'-'+item.sortOrder;
    await DB.prepare("INSERT INTO course_fee_items(id,course_id,item_name,amount,due_stage,required,sort_order,active) VALUES(?,?,?,?,?,1,?,1) ON CONFLICT(course_id,item_name) DO UPDATE SET amount=excluded.amount,due_stage=excluded.due_stage,required=1,sort_order=excluded.sort_order,active=1,updated_at=CURRENT_TIMESTAMP")
      .bind(id,course.id,item.itemName,item.amount,item.dueStage,item.sortOrder).run();
  }
  const total=items.reduce((a,x)=>a+x.amount,0);
  await DB.prepare('UPDATE courses SET price=? WHERE id=?').bind(total,course.id).run();
  await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id) VALUES('FeeStructure',?,?) ON CONFLICT(entity_name,source_id) DO UPDATE SET destination_id=excluded.destination_id,imported_at=CURRENT_TIMESTAMP")
    .bind(sourceId,course.id).run();
  c.feeStructuresImported++;
}

function sourceCourseTitle(sourceId, sourceCourses) {
  const row=sourceCourses.get(clean(sourceId,120));
  return clean(row?.title||row?.course_title||row?.name,160);
}
async function activeCourseFor(DB,title) {
  const t=clean(title,160),n=norm(t);
  if(!n)return null;
  const alias=aliases[n];
  if(alias) {
    const c=await DB.prepare("SELECT id,title,status FROM courses WHERE id=? AND status='active'").bind(alias).first();
    if(c)return c;
  }
  return DB.prepare("SELECT id,title,status FROM courses WHERE lower(trim(title))=lower(trim(?)) AND status='active' LIMIT 1").bind(t).first();
}
async function resolveCourse(DB,title,sourceCourseId='') {
  const active=await activeCourseFor(DB,title);
  if(active)return active;
  const source=clean(sourceCourseId,120);
  if(source) {
    const mapped=await DB.prepare("SELECT destination_id FROM base44_student_import_map WHERE entity_name='Course' AND source_id=?").bind(source).first();
    if(mapped?.destination_id) {
      const course=await DB.prepare("SELECT id,title,status FROM courses WHERE id=?").bind(mapped.destination_id).first();
      if(course)return course;
    }
  }
  if(title) {
    const exact=await DB.prepare("SELECT id,title,status FROM courses WHERE lower(trim(title))=lower(trim(?)) LIMIT 1").bind(clean(title,160)).first();
    if(exact)return exact;
  }
  return null;
}
async function importCourseModule(DB,r,adminId,c,sourceCourses) {
  const sourceId=sourceRecordId(r);if(!sourceId)return;
  const mapped=await DB.prepare("SELECT destination_id FROM base44_student_import_map WHERE entity_name='CourseUnit' AND source_id=?").bind(sourceId).first();
  if(mapped?.destination_id){c.modulesAlreadyPresent++;return;}
  const courseTitle=sourceCourseTitle(r.course_id,sourceCourses)||clean(r.course_title||r.course_name,160),course=await resolveCourse(DB,courseTitle,r.course_id);
  if(!course){c.modulesSkipped++;return;}
  const code=clean(r.module_code||r.code,30).toUpperCase(),title=clean(r.title||r.name,160);
  if(!title){c.modulesSkipped++;return;}
  let existing=code?await DB.prepare("SELECT id,course_id FROM course_modules WHERE upper(COALESCE(module_code,''))=? LIMIT 1").bind(code).first():null;
  if(existing&&existing.course_id!==course.id)existing=null;
  if(!existing)existing=await DB.prepare("SELECT id,course_id FROM course_modules WHERE course_id=? AND lower(trim(title))=lower(trim(?)) LIMIT 1").bind(course.id,title).first();
  let id=existing?.id;
  if(!id){
    id='b44mod-'+sourceId.slice(-24);
    const usedCode=code?await DB.prepare("SELECT id,course_id FROM course_modules WHERE module_code=? LIMIT 1").bind(code).first():null;
    const finalCode=usedCode&&usedCode.course_id!==course.id?null:(code||null);
    await DB.prepare("INSERT OR IGNORE INTO course_modules(id,course_id,title,description,sort_order,status,created_by,module_code) VALUES(?,?,?,?,?,'published',?,?)")
      .bind(id,course.id,title,clean(r.description||r.content||r.notes,12000),Math.max(0,Math.round(num(r.order)||0)),adminId,finalCode).run();
    const saved=await DB.prepare("SELECT id FROM course_modules WHERE id=?").bind(id).first();
    if(!saved){c.modulesSkipped++;c.warnings.push("Module '"+title+"' could not be created for "+course.title+".");return;}
    c.modulesImported++;
    if(usedCode&&usedCode.course_id!==course.id)c.warnings.push("Module '"+title+"' was created without code "+code+" because that code already belongs to another official course.");
  }else c.modulesAlreadyPresent++;
  await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('CourseUnit',?,?,?) ON CONFLICT(entity_name,source_id) DO NOTHING")
    .bind(sourceId,id,adminId).run();
}
async function mappedModule(DB,courseId,sourceModuleId,moduleCode,moduleTitle,sourceModules) {
  const source=sourceModules.get(clean(sourceModuleId,120));
  const savedMap=sourceModuleId?await DB.prepare("SELECT destination_id FROM base44_student_import_map WHERE entity_name='CourseUnit' AND source_id=?").bind(clean(sourceModuleId,120)).first():null;
  let row=savedMap?.destination_id?await DB.prepare("SELECT id,title,module_code FROM course_modules WHERE id=? AND course_id=?").bind(savedMap.destination_id,courseId).first():null;
  const code=clean(moduleCode||source?.module_code,30).toUpperCase();
  const title=clean(moduleTitle||source?.title,160);
  if(code)row=await DB.prepare("SELECT id,title,module_code FROM course_modules WHERE course_id=? AND upper(COALESCE(module_code,''))=? LIMIT 1").bind(courseId,code).first();
  if(!row&&title)row=await DB.prepare("SELECT id,title,module_code FROM course_modules WHERE course_id=? AND lower(trim(title))=lower(trim(?)) LIMIT 1").bind(courseId,title).first();
  return {row,code,title};
}
async function importModuleAssignment(DB,r,adminId,c,sourceUsers) {
  const sourceId=sourceRecordId(r);if(!sourceId)return;
  const prior=await DB.prepare("SELECT destination_id FROM base44_student_import_map WHERE entity_name='ModuleAssignment' AND source_id=?").bind(sourceId).first();
  if(prior?.destination_id){c.moduleAssignmentsAlreadyPresent++;return;}
  const module=await DB.prepare("SELECT destination_id FROM base44_student_import_map WHERE entity_name='CourseUnit' AND source_id=?").bind(clean(r.module_id,120)).first();
  if(!module?.destination_id){c.moduleAssignmentsSkipped++;return;}
  const sourceTutor=sourceUsers.find(x=>clean(x.staff_id,80)===clean(r.tutor_id,80));
  if(sourceTutor?.is_active===false){c.moduleAssignmentsSkipped++;return;}
  const email=clean(sourceTutor?.email,254).toLowerCase();
  let tutor=email?await DB.prepare("SELECT u.id,COALESCE(p.portal_role,u.role) AS role,u.status FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id WHERE lower(u.email)=lower(?)").bind(email).first():null;
  if(!tutor&&clean(r.tutor_id,80))tutor=await DB.prepare("SELECT u.id,COALESCE(p.portal_role,u.role) AS role,u.status FROM users u JOIN user_profiles p ON p.user_id=u.id WHERE p.staff_id=? LIMIT 1").bind(clean(r.tutor_id,80)).first();
  if(!tutor||tutor.status!=='active'||!['tutor','admin','principal'].includes(tutor.role)){c.moduleAssignmentsSkipped++;return;}
  const id='b44mta-'+sourceId.slice(-24);
  const result=await DB.prepare("INSERT OR IGNORE INTO module_tutor_assignments(id,module_id,tutor_user_id,assigned_by,created_at) VALUES(?,?,?,?,?)")
    .bind(id,module.destination_id,tutor.id,adminId,clean(r.created_date,40)||new Date().toISOString()).run();
  const saved=await DB.prepare("SELECT id FROM module_tutor_assignments WHERE module_id=? AND tutor_user_id=?").bind(module.destination_id,tutor.id).first();
  if(Number(result.meta?.changes||0)>0)c.moduleAssignmentsImported++;else c.moduleAssignmentsAlreadyPresent++;
  if(saved?.id)await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('ModuleAssignment',?,?,?) ON CONFLICT(entity_name,source_id) DO UPDATE SET destination_id=excluded.destination_id,user_id=excluded.user_id,imported_at=CURRENT_TIMESTAMP")
    .bind(sourceId,saved.id,tutor.id).run();
}
async function importExam(DB,r,adminId,c,sourceCourses,sourceModules) {
  const sourceId=sourceRecordId(r);
  if(!sourceId)return;
  const existingMap=await DB.prepare("SELECT destination_id FROM base44_student_import_map WHERE entity_name='Exam' AND source_id=?").bind(sourceId).first();
  if(existingMap?.destination_id){c.examsAlreadyPresent++;return;}
  const courseTitle=clean(r.course_title,160)||sourceCourseTitle(r.course_id,sourceCourses);
  const course=await resolveCourse(DB,courseTitle,r.course_id);
  if(!course){c.examsSkipped++;c.warnings.push("Exam '"+clean(r.title,120)+"' was archived but not activated because no matching active official course was found: "+(courseTitle||"missing course title")+".");return;}
  const module=await mappedModule(DB,course.id,r.module_id,r.module_code,r.module_title,sourceModules);
  if(!module.row)c.warnings.push("Exam '"+clean(r.title,120)+"' was linked to course '"+course.title+"' but its module could not be matched; it remains course-wide.");
  const sourceType=clean(r.exam_type,30).toLowerCase();
  const type=sourceType==='practical'?'practical':(['cat','midterm','quiz'].includes(sourceType)?'cat':'exam');
  const category=['CAT','Practical','Final'].includes(clean(r.score_category,20))?clean(r.score_category,20):(type==='cat'?'CAT':type==='practical'?'Practical':'Final');
  const rawStatus=clean(r.status,40).toLowerCase();
  const status=rawStatus==='active'?'published':rawStatus==='closed'?'closed':'draft';
  const start=clean(r.availability_start,60)||kenyaDateTime(r.scheduled_date,r.scheduled_time);
  const end=clean(r.availability_end,60)||(()=>{if(!start)return '';const d=new Date(start);d.setMinutes(d.getMinutes()+Math.max(1,num(r.duration_minutes)||60));return d.toISOString();})();
  const creatorEmail=clean(r.created_by,254).toLowerCase();
  const creator=creatorEmail?await DB.prepare("SELECT id FROM users WHERE lower(email)=lower(?)").bind(creatorEmail).first():null;
  const createdBy=creator?.id||adminId;
  const id='b44exam-'+sourceId.slice(-24);
  const maximum=Math.max(1,Math.min(10000,Math.round(num(r.total_marks)||num(r.exam_out_of)||100)));
  const duration=Math.max(1,Math.min(600,Math.round(num(r.duration_minutes)||60)));
  const questionMode=r.randomize_questions&&r.random_by_marks===false?'count':'marks';
  const questionCount=Math.max(1,Math.min(500,Math.round(num(r.random_question_count)||10)));
  const perExamSecurity={
    securityLevel:clean(r.security_preset,20).toLowerCase()||'moderate',
    publishResultsAutomatically:false,showCorrectAnswers:r.allow_review===true,
    freezeTextSelection:r.security_block_selection===true,
    killShortcuts:r.security_block_keyboard_shortcuts===true,
    blockDragging:r.security_block_drag_drop===true,
    blockLinks:r.security_block_new_tabs===true,
    stripSpellcheck:r.security_disable_autofill===true,
    aiInsertionGuard:r.security_ai_insert_guard===true,
    blockReload:r.security_block_reload===true,
    identityWatermark:r.security_watermark_identity===true,
    forceFullscreen:r.security_fullscreen===true,
    blockScreenshots:r.security_block_screenshot===true,
    blockPrintingSaving:r.security_block_print===true,
    blockAppSwitching:r.security_block_calls===true,
    disableRightClick:r.security_no_right_click===true,
    liveCameraPresence:r.security_require_camera===true,
    blockCopying:r.security_no_copy===true,
    blockPasting:r.security_block_paste===true,
    blockDeveloperTools:r.security_block_devtools===true,
    lockTabSwitching:r.security_block_tab_switch===true,
    pauseOnViolation:r.security_pause_on_violation===true,
    autoSubmitAtViolationLimit:r.security_auto_submit===true,
    violationsAllowed:Math.max(0,Math.round(num(r.security_max_violations)||3)),
    flagForReview:true,alertAdmin:true
  };
  const result=await DB.prepare(`INSERT OR IGNORE INTO course_assessments
    (id,course_id,module_id,title,assessment_type,instructions,starts_at,due_at,max_points,status,created_by,created_at,
     description,duration_minutes,pass_mark,max_attempts,require_full_fee_payment,require_assignment_submission,
     allow_result_review,shuffle_questions,disable_copy_paste,strict_time_limit,require_admin_approval,
     marks_category,category_out_of,question_selection_mode,question_count,shuffle_options,security_settings_json)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,course.id,module.row?.id||null,clean(r.title,160)||'Imported Base44 examination',type,
      clean(r.instructions,12000)||clean(r.description,4000),start||null,end||null,maximum,status,createdBy,
      clean(r.created_date,40)||new Date().toISOString(),clean(r.description,4000),
      duration,Math.max(0,Math.min(maximum,Math.round(num(r.pass_mark)||0))),Math.max(1,Math.min(10,Math.round(num(r.max_attempts)||1))),
      r.require_full_payment?1:0,r.require_assignment_submission?1:0,r.allow_review?1:0,
      r.security_shuffle||r.randomize_questions?1:0,r.security_no_copy||r.security_block_paste?1:0,
      r.security_time_limit===false?0:1,rawStatus==='pending approval'?1:0,category,
      Math.max(0,num(r.category_out_of)||num(r.exam_out_of)||maximum),questionMode,questionCount,
      r.randomize_options?1:0,JSON.stringify(perExamSecurity)).run();
  const saved=await DB.prepare("SELECT id FROM course_assessments WHERE id=?").bind(id).first();
  if(!saved){c.examsSkipped++;c.warnings.push("Exam '"+clean(r.title,120)+"' could not be saved.");return;}
  await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('Exam',?,?,?) ON CONFLICT(entity_name,source_id) DO NOTHING").bind(sourceId,id,createdBy).run();
  c.examsImported+=Number(result.meta?.changes||0)>0?1:0;
  if(Number(result.meta?.changes||0)===0)c.examsAlreadyPresent++;
}
async function importExamQuestion(DB,r,adminId,c) {
  const sourceId=sourceRecordId(r),sourceExamId=clean(r.exam_id,120);
  if(!sourceId||!sourceExamId)return;
  const existingMap=await DB.prepare("SELECT destination_id FROM base44_student_import_map WHERE entity_name='ExamQuestion' AND source_id=?").bind(sourceId).first();
  if(existingMap?.destination_id){c.questionsAlreadyPresent++;return;}
  const examMap=await DB.prepare("SELECT destination_id,user_id FROM base44_student_import_map WHERE entity_name='Exam' AND source_id=?").bind(sourceExamId).first();
  if(!examMap?.destination_id){c.questionsSkipped++;return;}
  const typeName=clean(r.question_type,40).toLowerCase();
  const type=typeName.includes('true')?'true_false':typeName.includes('short')?'short_answer':typeName.includes('essay')?'essay':typeName.includes('multiple')?'multiple_choice':'single_choice';
  const options=Array.isArray(r.options)?r.options.map(x=>clean(x,500)).filter(Boolean):[];
  const answer=r.correct_answer===null||r.correct_answer===undefined||r.correct_answer===''?null:r.correct_answer;
  const points=Math.max(1,Math.min(1000,Math.round(num(r.marks)||1)));
  const id='b44q-'+sourceId.slice(-24);
  const createdBy=examMap.user_id||adminId;
  const result=await DB.prepare("INSERT OR IGNORE INTO course_exam_questions(id,assessment_id,question_text,question_type,options_json,correct_answer_json,explanation,points,sort_order,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,'active',?,?)")
    .bind(id,examMap.destination_id,clean(r.question_text,4000)||'Imported question',type,JSON.stringify(options),
      answer===null?null:JSON.stringify(answer),clean(r.explanation,2000),points,
      Math.max(0,Math.round(num(r.order)||0)),createdBy,clean(r.created_date,40)||new Date().toISOString()).run();
  if(Number(result.meta?.changes||0)>0)c.questionsImported++;
  else c.questionsAlreadyPresent++;
  await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('ExamQuestion',?,?,?) ON CONFLICT(entity_name,source_id) DO NOTHING")
    .bind(sourceId,id,createdBy).run();
}


async function findDestinationStudent(DB,email,courseId,sourceEnrollmentId='') {
  const source=clean(sourceEnrollmentId,120);
  if(source){
    const mapped=await DB.prepare("SELECT destination_id,user_id FROM base44_student_import_map WHERE entity_name='Enrollment' AND source_id=?").bind(source).first();
    if(mapped?.user_id&&mapped?.destination_id){
      const row=await DB.prepare("SELECT u.id,e.id AS enrollment_id,e.admission_number FROM users u JOIN enrollments e ON e.id=? WHERE u.id=? AND e.course_id=? AND u.role='student'").bind(mapped.destination_id,mapped.user_id,courseId).first();
      if(row)return row;
    }
  }
  return DB.prepare("SELECT u.id,e.id AS enrollment_id,e.admission_number FROM users u JOIN enrollments e ON lower(e.email)=lower(u.email) WHERE lower(u.email)=lower(?) AND e.course_id=? AND e.status='accepted' AND u.role='student' ORDER BY e.created_at LIMIT 1").bind(clean(email,254).toLowerCase(),courseId).first();
}
async function importAssignment(DB,r,adminId,c,sourceCourses,sourceModules) {
  const sourceId=sourceRecordId(r);if(!sourceId)return;
  const mapped=await DB.prepare("SELECT destination_id FROM base44_student_import_map WHERE entity_name='Assignment' AND source_id=?").bind(sourceId).first();
  if(mapped?.destination_id){c.assignmentsAlreadyPresent++;return;}
  const courseTitle=clean(r.course_title||r.course_name||r.programme,160)||sourceCourseTitle(r.course_id,sourceCourses);
  const course=await resolveCourse(DB,courseTitle,r.course_id);
  if(!course){c.assignmentsSkipped++;c.warnings.push("Assignment '"+clean(r.title,120)+"' was archived because its official course could not be matched.");return;}
  let module=await mappedModule(DB,course.id,r.module_id,'',r.module_title,sourceModules);
  if(!module.row&&clean(r.module_title,160))module=await ensureHistoricalModule(DB,course,r.module_id,'',r.module_title,sourceModules,adminId,c);
  const questionItems=Array.isArray(r.question_items)?r.question_items:[];
  const questionText=questionItems.map((q,i)=>[
    "Question "+(i+1)+(q.marks?" ("+num(q.marks)+" marks)":""),
    clean(q.question_type,60),clean(q.question_text,3000),
    Array.isArray(q.options)&&q.options.length?"Options: "+q.options.map(x=>clean(x,300)).join(" | "):"",
    q.correct_answer?"Model answer: "+clean(q.correct_answer,1000):""
  ].filter(Boolean).join("\n")).join("\n\n");
  const instructions=[clean(r.instructions,12000),clean(r.description,12000),clean(r.questions,12000),questionText].filter(Boolean).join("\n\n");
  const status=clean(r.status,30).toLowerCase()==='active'?'published':clean(r.status,30).toLowerCase()==='closed'?'closed':'draft';
  const type=['CAT','Practical','Final'].includes(clean(r.score_category,20))?clean(r.score_category,20):'CAT';
  const creatorEmail=clean(r.assigned_by||r.created_by,254).toLowerCase();
  const creator=creatorEmail?await DB.prepare("SELECT id FROM users WHERE lower(email)=lower(?)").bind(creatorEmail).first():null;
  const createdBy=creator?.id||adminId,id='b44asg-'+sourceId.slice(-24);
  const due=clean(r.due_date,40)?clean(r.due_date,10)+'T23:59:59+03:00':null;
  const result=await DB.prepare("INSERT OR IGNORE INTO course_assignments(id,course_id,module_id,title,instructions,due_at,max_points,status,created_by,created_at,assignment_type,marks_category,category_out_of) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id,course.id,module.row?.id||null,clean(r.title,160)||'Imported assignment',instructions,due,
      Math.max(1,Math.min(10000,Math.round(num(r.max_score)||30))),status,createdBy,
      clean(r.created_date,40)||new Date().toISOString(),'assignment',type,
      Math.max(1,num(r.category_out_of)||20)).run();
  const saved=await DB.prepare("SELECT id FROM course_assignments WHERE id=?").bind(id).first();
  if(!saved){c.assignmentsSkipped++;return;}
  await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('Assignment',?,?,?) ON CONFLICT(entity_name,source_id) DO NOTHING").bind(sourceId,id,createdBy).run();
  if(Number(result.meta?.changes||0)>0)c.assignmentsImported++;else c.assignmentsAlreadyPresent++;
}
async function importAssignmentSubmission(DB,r,adminId,c) {
  const sourceId=sourceRecordId(r);if(!sourceId)return;
  const mapped=await DB.prepare("SELECT destination_id FROM base44_student_import_map WHERE entity_name='AssignmentSubmission' AND source_id=?").bind(sourceId).first();
  const assignment=await DB.prepare("SELECT destination_id FROM base44_student_import_map WHERE entity_name='Assignment' AND source_id=?").bind(clean(r.assignment_id,120)).first();
  if(!assignment?.destination_id){c.assignmentSubmissionsSkipped++;return;}
  const details=await DB.prepare("SELECT course_id,max_points FROM course_assignments WHERE id=?").bind(assignment.destination_id).first();
  if(!details){c.assignmentSubmissionsSkipped++;return;}
  const student=await findDestinationStudent(DB,r.student_email,details.course_id);
  if(!student){c.assignmentSubmissionsSkipped++;return;}
  const sourceStatus=clean(r.status,40).toLowerCase();
  const status=sourceStatus==='graded'?'graded':sourceStatus.includes('revision')||sourceStatus==='rejected'?'returned':'submitted';
  const approval=status==='graded'?'approved':sourceStatus==='pending approval'?'pending':'approved';
  const scoreValue=r.score!==null&&r.score!==undefined?r.score:r.auto_score;
  const score=scoreValue===null||scoreValue===undefined||scoreValue===''?null:Math.max(0,Math.min(Number(details.max_points)||100,Math.round(num(scoreValue))));
  const answers=Array.isArray(r.question_answers)?r.question_answers:[];
  const answerText=answers.map((item,i)=>{
    if(item&&typeof item==='object')return (i+1)+". "+clean(item.question_text||item.question||item.prompt,2000)+"\nAnswer: "+clean(item.answer||item.response||item.value,4000);
    return (i+1)+". "+clean(item,4000);
  }).join("\n");
  const files=Array.isArray(r.file_urls)?r.file_urls.filter(x=>typeof x==='string'&&/^https:\/\//i.test(x)):[];
  const response=[clean(r.submission_text,30000),answerText?"\n\nQuestion answers:\n"+answerText:"",files.length?"\n\nOriginal attachment links (retained from Base44):\n"+files.join("\n"):""].filter(Boolean).join("");
  const submitted=clean(r.submitted_date,40)||clean(r.created_date,40)||new Date().toISOString();
  const id=mapped?.destination_id||'b44sub-'+sourceId.slice(-24);
  const existing=await DB.prepare("SELECT id FROM course_assignment_submissions WHERE assignment_id=? AND user_id=?").bind(assignment.destination_id,student.id).first();
  const targetId=existing?.id||id;
  if(existing){
    await DB.prepare("UPDATE course_assignment_submissions SET response_text=?,attachment_url=?,status=?,points_awarded=?,feedback=?,submitted_at=?,graded_by=?,graded_at=?,approval_status=?,approved_by=?,approved_at=? WHERE id=?")
      .bind(response,files[0]||null,status,score,clean(r.feedback,5000),submitted,
        status==='graded'?adminId:null,status==='graded'?clean(r.updated_date,40)||submitted:null,approval,
        status==='graded'&&approval==='approved'?adminId:null,status==='graded'&&approval==='approved'?clean(r.updated_date,40)||submitted:null,targetId).run();
  }else{
    await DB.prepare("INSERT OR IGNORE INTO course_assignment_submissions(id,assignment_id,user_id,response_text,attachment_url,status,points_awarded,feedback,submitted_at,graded_by,graded_at,approval_status,approved_by,approved_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(targetId,assignment.destination_id,student.id,response,files[0]||null,status,score,
        clean(r.feedback,5000),submitted,status==='graded'?adminId:null,status==='graded'?clean(r.updated_date,40)||submitted:null,
        approval,status==='graded'&&approval==='approved'?adminId:null,status==='graded'&&approval==='approved'?clean(r.updated_date,40)||submitted:null).run();
  }
  const saved=await DB.prepare("SELECT id FROM course_assignment_submissions WHERE assignment_id=? AND user_id=?").bind(assignment.destination_id,student.id).first();
  if(!saved?.id){c.assignmentSubmissionsSkipped++;return;}
  await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('AssignmentSubmission',?,?,?) ON CONFLICT(entity_name,source_id) DO UPDATE SET destination_id=excluded.destination_id,user_id=excluded.user_id,imported_at=CURRENT_TIMESTAMP")
    .bind(sourceId,saved.id,student.id).run();
  if(mapped?.destination_id||existing)c.assignmentSubmissionsAlreadyPresent++;else c.assignmentSubmissionsImported++;
}
async function ensureExamForAttempt(DB,r,adminId,c,sourceCourses,sourceModules,sourceQuestions) {
  const sourceExamId=clean(r.exam_id,120);
  if(!sourceExamId)return null;
  const prior=await DB.prepare("SELECT destination_id FROM base44_student_import_map WHERE entity_name='Exam' AND source_id=?").bind(sourceExamId).first();
  if(prior?.destination_id)return prior.destination_id;
  const title=clean(r.exam_title,160)||'Historical Base44 examination';
  const courseTitle=clean(r.course_title,160)||sourceCourseTitle(r.course_id,sourceCourses);
  const course=await resolveCourse(DB,courseTitle,r.course_id);
  if(!course){
    c.warnings.push("Historical exam '"+title+"' was not reconstructed because its course could not be matched to an active official course.");
    return null;
  }
  const existing=await DB.prepare("SELECT id FROM course_assessments WHERE course_id=? AND lower(trim(title))=lower(trim(?)) LIMIT 1").bind(course.id,title).first();
  const id=existing?.id||'b44exam-'+sourceExamId.slice(-24);
  if(!existing){
    const moduleTitle=title.split(/\s+[—–-]\s+/)[0].trim();
    const module=moduleTitle?await DB.prepare("SELECT id FROM course_modules WHERE course_id=? AND lower(trim(title))=lower(trim(?)) LIMIT 1").bind(course.id,moduleTitle).first():null;
    const selectedIds=Array.isArray(r.question_ids)?new Set(r.question_ids.map(x=>clean(x,120))):new Set();
    const selectedMarks=(sourceQuestions||[]).filter(q=>selectedIds.has(sourceRecordId(q))).reduce((sum,q)=>sum+Math.max(0,num(q.marks)),0);
    const bankMarks=(sourceQuestions||[]).filter(q=>clean(q.exam_id,120)===sourceExamId).reduce((sum,q)=>sum+Math.max(0,num(q.marks)),0);
    const maximum=Math.max(1,Math.min(10000,Math.round(selectedMarks||bankMarks||100)));
    const lowerTitle=title.toLowerCase();
    const type=lowerTitle.includes('practical')?'practical':/(\bcat\b|quiz|midterm)/i.test(title)?'cat':'exam';
    const now=clean(r.created_date,40)||clean(r.start_time,40)||new Date().toISOString();
    await DB.prepare(`INSERT OR IGNORE INTO course_assessments
      (id,course_id,module_id,title,assessment_type,instructions,starts_at,due_at,max_points,status,created_by,created_at,
       description,duration_minutes,pass_mark,max_attempts,require_full_fee_payment,require_assignment_submission,
       allow_result_review,shuffle_questions,disable_copy_paste,strict_time_limit,require_admin_approval,
       marks_category,category_out_of,question_selection_mode,question_count,shuffle_options,security_settings_json)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id,course.id,module?.id||null,title,type,'Historical paper recovered from Base44 attempt history.',
        clean(r.start_time,60)||null,clean(r.submitted_at,60)||null,maximum,'draft',adminId,now,
        'Recovered automatically from a historical Base44 examination attempt. Kept as a draft so it cannot be started as a new live exam.',
        60,0,1,0,0,0,0,0,1,0,'Final',maximum,'marks',10,0,'{}').run();
    c.examsRecoveredFromAttempts++;
  }
  const saved=await DB.prepare("SELECT id FROM course_assessments WHERE id=?").bind(id).first();
  if(!saved)return null;
  await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('Exam',?,?,?) ON CONFLICT(entity_name,source_id) DO NOTHING")
    .bind(sourceExamId,id,adminId).run();
  return id;
}

async function ensureLegacyAttemptQuestion(DB,sourceQuestionId,assessmentId,adminId,c,markHint=0,sortOrder=0,createdAt='') {
  const sourceId=clean(sourceQuestionId,120);
  if(!sourceId)return null;
  const mapped=await DB.prepare("SELECT destination_id FROM base44_student_import_map WHERE entity_name='ExamQuestion' AND source_id=?").bind(sourceId).first();
  if(mapped?.destination_id)return mapped.destination_id;
  const id='b44q-legacy-'+sourceId.slice(-24);
  await DB.prepare("INSERT OR IGNORE INTO course_exam_questions(id,assessment_id,question_text,question_type,options_json,correct_answer_json,explanation,points,sort_order,status,created_by,created_at) VALUES(?,?,?,'legacy_unavailable','[]',NULL,?,?,?,'active',?,?)")
    .bind(id,assessmentId,
      'Original question text was not included in the Base44 export. The student response and awarded mark are retained below.',
      'Original maximum marks and marking guidance were not present in the export; do not infer or recreate the question.',
      Math.max(1,Math.ceil(num(markHint)||1)),Math.max(0,Math.round(num(sortOrder)||0)),adminId,
      clean(createdAt,40)||new Date().toISOString()).run();
  await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('ExamQuestion',?,?,?) ON CONFLICT(entity_name,source_id) DO NOTHING")
    .bind(sourceId,id,adminId).run();
  c.legacyQuestionsRecovered++;
  return id;
}

async function importExamAttempt(DB,r,adminId,c) {
  const sourceId=sourceRecordId(r);if(!sourceId)return;
  const mapped=await DB.prepare("SELECT destination_id FROM base44_student_import_map WHERE entity_name='ExamAttempt' AND source_id=?").bind(sourceId).first();
  const existingAttemptId=mapped?.destination_id&&!String(mapped.destination_id).startsWith('b44approval-')?mapped.destination_id:null;
  if(mapped?.destination_id&&!existingAttemptId){c.examAttemptsAlreadyPresent++;return;}
  const exam=await DB.prepare("SELECT destination_id FROM base44_student_import_map WHERE entity_name='Exam' AND source_id=?").bind(clean(r.exam_id,120)).first();
  if(!exam?.destination_id){c.examAttemptsSkipped++;return;}
  const assessment=await DB.prepare("SELECT id,course_id,max_points,category_out_of FROM course_assessments WHERE id=?").bind(exam.destination_id).first();
  if(!assessment){c.examAttemptsSkipped++;return;}
  const student=await findDestinationStudent(DB,r.student_email,assessment.course_id);
  if(!student){c.examAttemptsSkipped++;c.warnings.push("Exam attempt for "+clean(r.student_email,120)+" was retained in the archive because no accepted official enrolment matched.");return;}
  const sourceAdmission=clean(r.admission_number,80);
  if(sourceAdmission&&student.admission_number&&sourceAdmission!==student.admission_number)c.warnings.push("Kept existing admission number "+student.admission_number+" for "+clean(r.student_email,120)+"; exam attempt carried legacy number "+sourceAdmission+".");
  const sourceStatus=clean(r.status,30).toLowerCase();
  const approvalStatus=sourceStatus==='approved'?'approved':sourceStatus==='rejected'?'rejected':'pending';
  if(['waiting','approved','rejected'].includes(sourceStatus)){
    await DB.prepare("INSERT INTO exam_attempt_approvals(id,assessment_id,user_id,status,reviewed_by,reviewed_at,note) VALUES(?,?,?,?,?,?,?) ON CONFLICT(assessment_id,user_id) DO UPDATE SET status=excluded.status,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at,note=excluded.note")
      .bind('b44approval-'+sourceId.slice(-20),assessment.id,student.id,approvalStatus,
        sourceStatus==='waiting'?null:adminId,sourceStatus==='waiting'?null:clean(r.updated_date,40)||null,clean(r.admin_notes,1000)).run();
    c.examApprovalsImported++;
    await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('ExamAttempt',?,?,?) ON CONFLICT(entity_name,source_id) DO NOTHING")
      .bind(sourceId,'b44approval-'+sourceId.slice(-20),student.id).run();
    return;
  }
  const started=clean(r.start_time,60)||clean(r.created_date,60)||new Date().toISOString();
  const submitted=clean(r.submitted_at,60)||null;
  const duration=await DB.prepare("SELECT duration_minutes FROM course_assessments WHERE id=?").bind(assessment.id).first();
  const expiry=clean(r.end_time,60)||(()=>{const d=new Date(started);d.setMinutes(d.getMinutes()+Math.max(1,num(duration?.duration_minutes)||60));return d.toISOString();})();
  const status=sourceStatus==='moderated'?'graded':sourceStatus==='submitted'?'submitted':sourceStatus==='in_progress'?'in_progress':'expired';
  const questionIds=Array.isArray(r.question_ids)?r.question_ids.map(x=>clean(x,120)).filter(Boolean):[];
  const answers=Array.isArray(r.answers)?r.answers:[];
  const answerQuestionIds=answers.map(x=>clean(x?.question_id,120)).filter(Boolean);
  const sourceQuestionIds=[...new Set([...questionIds,...answerQuestionIds])];
  const questionMap=new Map();
  if(sourceQuestionIds.length){
    const placeholders=sourceQuestionIds.map(()=>'?').join(',');
    const mappedRows=await DB.prepare("SELECT source_id,destination_id FROM base44_student_import_map WHERE entity_name='ExamQuestion' AND source_id IN ("+placeholders+")").bind(...sourceQuestionIds).all();
    for(const row of mappedRows.results||[])questionMap.set(row.source_id,row.destination_id);
  }
  for(let index=0;index<sourceQuestionIds.length;index++){
    const qid=sourceQuestionIds[index];
    if(questionMap.has(qid))continue;
    const answer=answers.find(x=>clean(x?.question_id,120)===qid);
    const destination=await ensureLegacyAttemptQuestion(DB,qid,assessment.id,adminId,c,answer?.marks_awarded,index,started);
    if(destination)questionMap.set(qid,destination);
  }
  const mappedQuestionIds=sourceQuestionIds.map(qid=>questionMap.get(qid)).filter(Boolean);
  const id=existingAttemptId||'b44attempt-'+sourceId.slice(-24);
  const score=num(r.is_moderated&&r.moderated_score!==null&&r.moderated_score!==undefined?r.moderated_score:r.score);
  const flagged=Math.max(0,Math.round(num(r.tab_switches)+(Array.isArray(r.cheating_flags)?r.cheating_flags.length:0)));
  await DB.prepare("INSERT INTO exam_runtime_attempts(id,assessment_id,user_id,attempt_number,started_at,expires_at,submitted_at,status,objective_score,total_score,flagged_count,last_activity_at,served_question_ids_json,option_order_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET assessment_id=excluded.assessment_id,user_id=excluded.user_id,attempt_number=excluded.attempt_number,started_at=excluded.started_at,expires_at=excluded.expires_at,submitted_at=excluded.submitted_at,status=excluded.status,objective_score=excluded.objective_score,total_score=excluded.total_score,flagged_count=excluded.flagged_count,last_activity_at=excluded.last_activity_at,served_question_ids_json=excluded.served_question_ids_json,option_order_json=excluded.option_order_json")
    .bind(id,assessment.id,student.id,Math.max(1,Math.round(num(r.attempt_number)||1)),started,expiry,submitted,status,
      Math.round(num(r.score)),Math.round(score),flagged,submitted||clean(r.updated_date,60)||started,
      JSON.stringify(mappedQuestionIds),'{}').run();
  const answerStatements=answers.flatMap(answer=>{
    const questionId=questionMap.get(clean(answer?.question_id,120));
    if(!questionId)return [];
    return [DB.prepare("INSERT INTO exam_runtime_answers(id,attempt_id,question_id,answer_json,points_awarded,is_correct,updated_at) VALUES(?,?,?,?,?,NULL,?) ON CONFLICT(id) DO UPDATE SET attempt_id=excluded.attempt_id,question_id=excluded.question_id,answer_json=excluded.answer_json,points_awarded=excluded.points_awarded,updated_at=excluded.updated_at")
      .bind('b44ans-'+sourceId.slice(-12)+'-'+clean(answer.question_id,24),id,questionId,JSON.stringify(answer.answer??null),
        answer.marks_awarded===null||answer.marks_awarded===undefined?null:Math.max(0,Math.round(num(answer.marks_awarded))),
        submitted||clean(r.updated_date,60)||started)];
  });
  if(answerStatements.length)await DB.batch(answerStatements);
  if(r.is_published===true&&(r.score!==null&&r.score!==undefined||r.moderated_score!==null&&r.moderated_score!==undefined)){
    const raw=score,paperMax=Math.max(1,Number(assessment.max_points)||100),publishedMax=Math.max(1,Number(assessment.category_out_of)||paperMax);
    const published=Math.max(0,Math.round(raw/paperMax*publishedMax));
    await DB.prepare("INSERT INTO course_assessment_results(id,assessment_id,user_id,points_awarded,feedback,published_at,marked_by,raw_points_awarded,published_max_points) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(assessment_id,user_id) DO UPDATE SET points_awarded=excluded.points_awarded,feedback=excluded.feedback,published_at=excluded.published_at,marked_by=excluded.marked_by,marked_at=CURRENT_TIMESTAMP,raw_points_awarded=excluded.raw_points_awarded,published_max_points=excluded.published_max_points WHERE COALESCE(excluded.published_at,'')>=COALESCE(course_assessment_results.published_at,'')")
      .bind('b44result-'+sourceId.slice(-24),assessment.id,student.id,published,clean(r.admin_notes,2000),
        submitted||clean(r.updated_date,60)||new Date().toISOString(),adminId,raw,publishedMax).run();
  }
  await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('ExamAttempt',?,?,?) ON CONFLICT(entity_name,source_id) DO NOTHING")
    .bind(sourceId,id,student.id).run();
  if(existingAttemptId)c.examAttemptsAlreadyPresent++;else c.examAttemptsImported++;
}
async function importMarksConflict(DB,r,adminId,c,sourceCourses,sourceModules) {
  const sourceId=sourceRecordId(r);if(!sourceId)return;
  const prior=await DB.prepare("SELECT id FROM base44_marks_conflicts WHERE source_id=?").bind(sourceId).first();
  if(prior){c.marksConflictsAlreadyPresent++;return;}
  const course=await resolveCourse(DB,sourceCourseTitle(r.course_id,sourceCourses)||clean(r.course_title,160),r.course_id);
  if(!course){c.marksConflictsSkipped++;return;}
  const module=await mappedModule(DB,course.id,r.unit_id,'',r.unit_title,sourceModules);
  const student=await findDestinationStudent(DB,r.student_email,course.id,r.enrollment_id);
  const profile=student?await DB.prepare("SELECT name FROM users WHERE id=?").bind(student.id).first():null;
  const id='b44conf-'+sourceId.slice(-24),status=['resolved','approved'].includes(clean(r.status,30).toLowerCase())?'resolved':'pending';
  await DB.prepare("INSERT OR IGNORE INTO base44_marks_conflicts(id,source_id,user_id,course_id,module_id,admission_number,student_email,student_name,unit_title,source_a,score_a,source_b,score_b,cat_score_a,cat_score_b,exam_score_a,exam_score_b,assignment_score_a,assignment_score_b,status,resolved_by,published_source,original_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id,sourceId,student?.id||null,course.id,module.row?.id||null,student?.admission_number||null,
      clean(r.student_email,254).toLowerCase(),clean(profile?.name,160),clean(r.unit_title,160),
      clean(r.source_a,80),r.score_a===null||r.score_a===undefined?null:num(r.score_a),
      clean(r.source_b,80),r.score_b===null||r.score_b===undefined?null:num(r.score_b),
      r.cat_score_a===null||r.cat_score_a===undefined?null:num(r.cat_score_a),r.cat_score_b===null||r.cat_score_b===undefined?null:num(r.cat_score_b),
      r.exam_score_a===null||r.exam_score_a===undefined?null:num(r.exam_score_a),r.exam_score_b===null||r.exam_score_b===undefined?null:num(r.exam_score_b),
      r.assignment_score_a===null||r.assignment_score_a===undefined?null:num(r.assignment_score_a),r.assignment_score_b===null||r.assignment_score_b===undefined?null:num(r.assignment_score_b),
      status,clean(r.resolved_by,120),clean(r.published_source,80),JSON.stringify(r),
      clean(r.created_date,40)||new Date().toISOString(),clean(r.updated_date,40)||new Date().toISOString()).run();
  await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('MarksConflict',?,?,?) ON CONFLICT(entity_name,source_id) DO NOTHING")
    .bind(sourceId,id,student?.id||adminId).run();
  c.marksConflictsImported++;
}
async function ensureHistoricalModule(DB,course,sourceModuleId,moduleCode,moduleTitle,sourceModules,adminId,c) {
  const matched=await mappedModule(DB,course.id,sourceModuleId,moduleCode,moduleTitle,sourceModules);
  if(matched.row)return matched;
  const title=clean(moduleTitle||sourceModules.get(clean(sourceModuleId,120))?.title,160);
  if(!title)return matched;
  const code=clean(moduleCode,30).toUpperCase();
  const existing=await DB.prepare("SELECT id,title,module_code FROM course_modules WHERE course_id=? AND lower(trim(title))=lower(trim(?)) LIMIT 1").bind(course.id,title).first();
  const id=existing?.id||'b44histmod-'+(await sha256(course.id+'|'+norm(title))).slice(0,20);
  if(!existing) {
    await DB.prepare("INSERT OR IGNORE INTO course_modules(id,course_id,title,description,sort_order,status,created_by,module_code) VALUES(?,?,?,?,?,'published',?,?)")
      .bind(id,course.id,title,'Historical module reconstructed from Base44 attendance, completion or result records.',Math.max(0,Math.round(num(sourceModules.get(clean(sourceModuleId,120))?.order)||0)),adminId,code||null).run();
  }
  const row=await DB.prepare("SELECT id,title,module_code FROM course_modules WHERE course_id=? AND lower(trim(title))=lower(trim(?)) LIMIT 1").bind(course.id,title).first();
  if(row&&sourceModuleId)await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('CourseUnit',?,?,?) ON CONFLICT(entity_name,source_id) DO UPDATE SET destination_id=excluded.destination_id,user_id=excluded.user_id,imported_at=CURRENT_TIMESTAMP")
    .bind(clean(sourceModuleId,120),row.id,adminId).run();
  if(row&&!existing)c.modulesImported++;
  return {row,code,title};
}

async function importDerivedStudent(DB,r,entity,adminId,c) {
  const email=clean(r.student_email||r.email||r.learner_email||r.email_address,254).toLowerCase();
  const name=clean(r.student_name||r.full_name||r.name||r.learner_name,120);
  let courseTitle=clean(r.course_title||r.course_name||r.programme||r.program||r.course,160);
  const sourceCourseId=clean(r.course_id,120);
  if(!courseTitle&&sourceCourseId) {
    const mappedCourse=await DB.prepare("SELECT c.title FROM base44_student_import_map m JOIN courses c ON c.id=m.destination_id WHERE m.entity_name='Course' AND m.source_id=? LIMIT 1").bind(sourceCourseId).first();
    courseTitle=clean(mappedCourse?.title,160);
  }
  if(!email||!name||!courseTitle)return null;
  const sourceId=sourceRecordId(r);
  if(!sourceId)return null;
  const course=await courseFor(DB,courseTitle,0);
  if(sourceCourseId)await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('Course',?,?,?) ON CONFLICT(entity_name,source_id) DO UPDATE SET destination_id=excluded.destination_id,imported_at=CURRENT_TIMESTAMP").bind(sourceCourseId,course.id,adminId).run();
  const existing=await DB.prepare("SELECT u.id AS user_id,e.id AS enrollment_id,e.admission_number FROM users u JOIN enrollments e ON e.admitted_user_id=u.id WHERE lower(u.email)=lower(?) AND e.course_id=? AND e.status='accepted' ORDER BY e.created_at LIMIT 1").bind(email,course.id).first();
  const requestedAdmission=clean(r.admission_number||r.student_admission_number,80);
  if(existing) {
    if(requestedAdmission&&!existing.admission_number) {
      const collision=await DB.prepare("SELECT id FROM enrollments WHERE admission_number=? AND id<>? LIMIT 1").bind(requestedAdmission,existing.enrollment_id).first();
      if(!collision)await DB.prepare("UPDATE enrollments SET admission_number=? WHERE id=? AND (admission_number IS NULL OR trim(admission_number)='')").bind(requestedAdmission,existing.enrollment_id).run();
    }
    await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES(?,?,?,?) ON CONFLICT(entity_name,source_id) DO UPDATE SET destination_id=excluded.destination_id,user_id=excluded.user_id,imported_at=CURRENT_TIMESTAMP")
      .bind('Derived'+entity,sourceId,existing.enrollment_id,existing.user_id).run();
    return {userId:existing.user_id,enrollmentId:existing.enrollment_id,sourceId};
  }
  const status=entity==='Graduate'?'graduated':'active';
  const synthetic={...r,id:'derived-'+entity+'-'+sourceId,student_email:email,student_name:name,
    student_phone:clean(r.student_phone||r.phone,40),course_title:courseTitle,
    admission_number:requestedAdmission,status,
    total_fee:num(r.total_fee)||0,amount_paid:num(r.amount_paid)||0,
    _migration_source_id:'derived-'+entity+'-'+sourceId,derived_from_entity:entity,derived_from_source_id:sourceId};
  return importStudent(DB,synthetic,adminId,c);
}

async function importAttendanceRecord(DB,r,entity,adminId,c,sourceCourses,sourceModules) {
  const sourceId=sourceRecordId(r);
  const email=clean(r.student_email||r.email,254).toLowerCase();
  const name=clean(r.student_name||r.full_name||r.name,120);
  const courseTitle=clean(r.course_title||r.course_name,160)||sourceCourseTitle(r.course_id,sourceCourses);
  const date=dateOnly(r.date||r.attendance_date||r.created_date);
  const rawStatus=clean(r.status||r.attendance_status,30).toLowerCase();
  const status=rawStatus==='present'?'present':rawStatus==='late'?'late':rawStatus==='absent'?'absent':rawStatus==='excused'||rawStatus==='leave'?'excused':null;
  if(!sourceId||!email||!name||!courseTitle||!date||!status){c.attendanceSkipped++;return;}
  const course=await courseFor(DB,courseTitle,0);
  if(clean(r.course_id,120))await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('Course',?,?,?) ON CONFLICT(entity_name,source_id) DO UPDATE SET destination_id=excluded.destination_id,imported_at=CURRENT_TIMESTAMP").bind(clean(r.course_id,120),course.id,adminId).run();
  await importDerivedStudent(DB,r,entity,adminId,c);
  const student=await DB.prepare("SELECT u.id FROM users u JOIN enrollments e ON e.admitted_user_id=u.id WHERE lower(u.email)=lower(?) AND e.course_id=? AND e.status='accepted' LIMIT 1").bind(email,course.id).first();
  if(!student){c.attendanceSkipped++;return;}
  const module=await ensureHistoricalModule(DB,course,r.module_id||r.unit_id,r.module_code||r.unit_code,r.module_title||r.unit_title,sourceModules,adminId,c);
  const timetableId='b44attday-'+(await sha256(course.id+'|'+(module.row?.id||'')+'|'+date)).slice(0,20);
  await DB.prepare("INSERT OR IGNORE INTO course_timetable(id,course_id,module_id,title,starts_at,ends_at,venue,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,'completed',?,?)")
    .bind(timetableId,course.id,module.row?.id||null,'Imported historical attendance — '+(module.title||course.title),date+'T00:00:00+03:00',date+'T23:59:59+03:00','Historical Base44 attendance record',adminId,clean(r.created_date,40)||new Date().toISOString()).run();
  const attendanceId='b44att-'+sourceId.slice(-24);
  const inserted=await DB.prepare("INSERT OR IGNORE INTO course_attendance(id,timetable_id,student_user_id,status,marked_by,marked_at) VALUES(?,?,?,?,?,?)")
    .bind(attendanceId,timetableId,student.id,status,adminId,clean(r.updated_date||r.created_date,40)||new Date().toISOString()).run();
  const saved=await DB.prepare("SELECT id FROM course_attendance WHERE timetable_id=? AND student_user_id=?").bind(timetableId,student.id).first();
  if(saved?.id) {
    await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES(?,?,?,?) ON CONFLICT(entity_name,source_id) DO UPDATE SET destination_id=excluded.destination_id,user_id=excluded.user_id,imported_at=CURRENT_TIMESTAMP")
      .bind(entity,saved.id,student.id).run();
    if(Number(inserted.meta?.changes||0)>0)c.attendanceImported++;else c.attendanceAlreadyPresent++;
  } else c.attendanceSkipped++;
}

async function importModuleCompletion(DB,r,adminId,c,sourceCourses,sourceModules) {
  const sourceId=sourceRecordId(r);
  const email=clean(r.student_email||r.email,254).toLowerCase();
  let courseTitle=clean(r.course_title||r.course_name,160)||sourceCourseTitle(r.course_id,sourceCourses);
  if(!courseTitle&&clean(r.course_id,120)){const mapped=await DB.prepare("SELECT c.title FROM base44_student_import_map m JOIN courses c ON c.id=m.destination_id WHERE m.entity_name='Course' AND m.source_id=? LIMIT 1").bind(clean(r.course_id,120)).first();courseTitle=clean(mapped?.title,160);}
  const moduleTitle=clean(r.module_title||r.module_name||r.unit_title,160);
  if(!sourceId||!email||!courseTitle||!moduleTitle){c.moduleCompletionsSkipped++;return;}
  await importDerivedStudent(DB,r,'ModuleCompletion',adminId,c);
  const course=await courseFor(DB,courseTitle,0);
  if(clean(r.course_id,120))await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('Course',?,?,?) ON CONFLICT(entity_name,source_id) DO UPDATE SET destination_id=excluded.destination_id,imported_at=CURRENT_TIMESTAMP").bind(clean(r.course_id,120),course.id,adminId).run();
  const student=await DB.prepare("SELECT u.id FROM users u JOIN enrollments e ON e.admitted_user_id=u.id WHERE lower(u.email)=lower(?) AND e.course_id=? AND e.status='accepted' LIMIT 1").bind(email,course.id).first();
  if(!student){c.moduleCompletionsSkipped++;return;}
  const module=await ensureHistoricalModule(DB,course,r.module_id||r.unit_id,r.module_code||r.module_code,moduleTitle,sourceModules,adminId,c);
  if(!module.row){c.moduleCompletionsSkipped++;return;}
  const raw=clean(r.status||r.completion_status,30).toLowerCase();
  const status=r.is_completed===false||['pending','in_progress','not_started'].includes(raw)?'registered':'completed';
  const id='b44modcomp-'+sourceId.slice(-24);
  const inserted=await DB.prepare("INSERT INTO student_module_registrations(id,user_id,course_id,module_id,status,registered_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,module_id) DO UPDATE SET status=CASE WHEN excluded.status='completed' THEN 'completed' ELSE student_module_registrations.status END")
    .bind(id,student.id,course.id,module.row.id,status,clean(r.completed_at||r.completion_date||r.created_date,40)||new Date().toISOString()).run();
  const saved=await DB.prepare("SELECT id FROM student_module_registrations WHERE user_id=? AND module_id=?").bind(student.id,module.row.id).first();
  if(saved?.id) {
    await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('ModuleCompletion',?,?,?) ON CONFLICT(entity_name,source_id) DO UPDATE SET destination_id=excluded.destination_id,user_id=excluded.user_id,imported_at=CURRENT_TIMESTAMP")
      .bind(sourceId,saved.id,student.id).run();
    if(Number(inserted.meta?.changes||0)>0)c.moduleCompletionsImported++;else c.moduleCompletionsAlreadyPresent++;
  } else c.moduleCompletionsSkipped++;
}

async function importGraduate(DB,r,adminId,c) {
  const sourceId=sourceRecordId(r);
  const email=clean(r.student_email||r.email,254).toLowerCase();
  let courseTitle=clean(r.course_title||r.course_name||r.programme,160);
  if(!courseTitle&&clean(r.course_id,120)){const mapped=await DB.prepare("SELECT c.title FROM base44_student_import_map m JOIN courses c ON c.id=m.destination_id WHERE m.entity_name='Course' AND m.source_id=? LIMIT 1").bind(clean(r.course_id,120)).first();courseTitle=clean(mapped?.title,160);}
  if(!sourceId||!email||!courseTitle){c.graduatesSkipped++;return;}
  await importDerivedStudent(DB,r,'Graduate',adminId,c);
  const course=await courseFor(DB,courseTitle,0);
  if(clean(r.course_id,120))await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('Course',?,?,?) ON CONFLICT(entity_name,source_id) DO UPDATE SET destination_id=excluded.destination_id,imported_at=CURRENT_TIMESTAMP").bind(clean(r.course_id,120),course.id,adminId).run();
  const student=await DB.prepare("SELECT u.id FROM users u JOIN enrollments e ON e.admitted_user_id=u.id WHERE lower(u.email)=lower(?) AND e.course_id=? AND e.status='accepted' LIMIT 1").bind(email,course.id).first();
  if(!student){c.graduatesSkipped++;return;}
  const raw=clean(r.status||r.graduation_status,30).toLowerCase();
  const status=raw.includes('defer')?'deferred':raw.includes('eligible')?'eligible':'graduated';
  await DB.prepare("UPDATE user_profiles SET student_status='archived',updated_at=CURRENT_TIMESTAMP WHERE user_id=?").bind(student.id).run();
  const id='b44grad-'+sourceId.slice(-24);
  const inserted=await DB.prepare("INSERT INTO student_graduation_records(id,user_id,course_id,status,completed_at,updated_by) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,course_id) DO UPDATE SET status=CASE WHEN excluded.status='graduated' THEN 'graduated' ELSE student_graduation_records.status END,completed_at=COALESCE(excluded.completed_at,student_graduation_records.completed_at),updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP")
    .bind(id,student.id,course.id,status,dateOnly(r.graduation_date||r.completion_date||r.updated_date)||null,adminId).run();
  const saved=await DB.prepare("SELECT id FROM student_graduation_records WHERE user_id=? AND course_id=?").bind(student.id,course.id).first();
  if(saved?.id) {
    await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('Graduate',?,?,?) ON CONFLICT(entity_name,source_id) DO UPDATE SET destination_id=excluded.destination_id,user_id=excluded.user_id,imported_at=CURRENT_TIMESTAMP")
      .bind(sourceId,saved.id,student.id).run();
    if(Number(inserted.meta?.changes||0)>0)c.graduatesImported++;else c.graduatesAlreadyPresent++;
  } else c.graduatesSkipped++;
}

async function importCertificate(DB,r,adminId,c) {
  const sourceId=sourceRecordId(r);
  const email=clean(r.student_email||r.email,254).toLowerCase();
  const name=clean(r.student_name||r.full_name||r.name,120);
  const courseTitle=clean(r.course_title||r.course_name,160);
  const certificateNo=clean(r.serial_number||r.certificate_id||r.certificate_no,100);
  if(!sourceId||!email||!name||!courseTitle||!certificateNo){c.certificatesSkipped++;return;}
  await importDerivedStudent(DB,r,'Certificate',adminId,c);
  const course=await courseFor(DB,courseTitle,0);
  if(clean(r.course_id,120))await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('Course',?,?,?) ON CONFLICT(entity_name,source_id) DO UPDATE SET destination_id=excluded.destination_id,imported_at=CURRENT_TIMESTAMP").bind(clean(r.course_id,120),course.id,adminId).run();
  const student=await DB.prepare("SELECT u.id FROM users u JOIN enrollments e ON e.admitted_user_id=u.id WHERE lower(u.email)=lower(?) AND e.course_id=? AND e.status='accepted' LIMIT 1").bind(email,course.id).first();
  if(!student){c.certificatesSkipped++;return;}
  const id='b44cert-'+sourceId.slice(-24);
  const publicToken=await sha256('navstar-base44-certificate:'+sourceId);
  const issuedByEmail=clean(r.approved_by||r.created_by,254).toLowerCase();
  const issuer=issuedByEmail?await DB.prepare("SELECT id FROM users WHERE lower(email)=lower(?)").bind(issuedByEmail).first():null;
  const status=clean(r.status,30).toLowerCase()==='revoked'?'revoked':'issued';
  const inserted=await DB.prepare("INSERT OR IGNORE INTO student_certificates(id,user_id,course_id,certificate_no,public_token,snapshot_json,status,issued_by,issued_at) VALUES(?,?,?,?,?,?,?,?,?)")
    .bind(id,student.id,course.id,certificateNo,publicToken,safeDetails(r),status,issuer?.id||adminId,clean(r.issue_date||r.created_date,40)||new Date().toISOString()).run();
  const saved=await DB.prepare("SELECT id FROM student_certificates WHERE user_id=? AND course_id=?").bind(student.id,course.id).first();
  if(saved?.id) {
    await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('Certificate',?,?,?) ON CONFLICT(entity_name,source_id) DO UPDATE SET destination_id=excluded.destination_id,user_id=excluded.user_id,imported_at=CURRENT_TIMESTAMP")
      .bind(sourceId,saved.id,student.id).run();
    if(Number(inserted.meta?.changes||0)>0)c.certificatesImported++;else c.certificatesAlreadyPresent++;
  } else c.certificatesSkipped++;
}

async function importStudentStatusHistory(DB,r,adminId,c) {
  const sourceId=sourceRecordId(r);
  if(!sourceId)return;
  const prior=await DB.prepare("SELECT destination_id FROM base44_student_import_map WHERE entity_name='StudentStatusHistory' AND source_id=?").bind(sourceId).first();
  if(prior?.destination_id){c.studentStatusHistoryImported++;return;}
  const email=clean(r.student_email||r.email,254).toLowerCase();
  const admission=clean(r.admission_number||r.student_admission_number,80);
  let user=email?await DB.prepare("SELECT id FROM users WHERE lower(email)=lower(?) AND role='student' LIMIT 1").bind(email).first():null;
  if(!user&&admission)user=await DB.prepare("SELECT u.id FROM users u JOIN enrollments e ON e.admitted_user_id=u.id WHERE e.admission_number=? AND u.role='student' LIMIT 1").bind(admission).first();
  if(!user){c.studentStatusHistorySkipped++;return;}
  const from=clean(r.previous_status||r.old_status||r.from_status,40);
  const to=clean(r.new_status||r.status||r.to_status,40);
  const effective=dateOnly(r.effective_date||r.changed_at||r.updated_date||r.created_date);
  const action='student_status_migrated'+(from?'|from:'+from:'')+(to?'|to:'+to:'')+(effective?'|effective:'+effective:'')+'|source:'+sourceId;
  const createdAt=clean(r.changed_at||r.effective_date||r.created_date,40)||new Date().toISOString();
  const id='b44status-'+sourceId.slice(-24);
  await DB.prepare("INSERT OR IGNORE INTO audit_logs(id,actor_id,action,entity_type,entity_id,created_at) VALUES(?,?,?,?,?,?)")
    .bind(id,adminId,action,'user',user.id,createdAt).run();
  await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('StudentStatusHistory',?,?,?) ON CONFLICT(entity_name,source_id) DO UPDATE SET destination_id=excluded.destination_id,user_id=excluded.user_id,imported_at=CURRENT_TIMESTAMP")
    .bind(sourceId,id,user.id).run();
  c.studentStatusHistoryImported++;
}

async function importStudentEditRequest(DB,r,adminId,c) {
  const sourceId=sourceRecordId(r);
  if(!sourceId)return;
  const prior=await DB.prepare("SELECT destination_id FROM base44_student_import_map WHERE entity_name='StudentEditRequest' AND source_id=?").bind(sourceId).first();
  if(prior?.destination_id){c.studentEditRequestsAlreadyPresent++;return;}
  const email=clean(r.student_email||r.email,254).toLowerCase();
  const admission=clean(r.admission_number||r.student_admission_number,80);
  let user=email?await DB.prepare("SELECT id FROM users WHERE lower(email)=lower(?) AND role='student' LIMIT 1").bind(email).first():null;
  if(!user&&admission)user=await DB.prepare("SELECT u.id FROM users u JOIN enrollments e ON e.admitted_user_id=u.id WHERE e.admission_number=? AND u.role='student' LIMIT 1").bind(admission).first();
  if(!user){c.studentEditRequestsSkipped++;return;}
  let changes=r.changes||r.requested_changes||r.changes_json||r.requested_changes_json||r.request_data||{};
  if(typeof changes==='string'){try{changes=JSON.parse(changes)}catch{changes={};}}
  if(!changes||typeof changes!=='object'||Array.isArray(changes))changes={};
  const allowed=new Set(['name','national_id','phone','date_of_birth','gender','citizenship','country','province','county','sub_county','constituency','ward','location','sub_location','department','job_title','employment_type','joined_on','address']);
  const safeChanges={};
  for(const [key,value] of Object.entries(changes))if(allowed.has(key))safeChanges[key]=value;
  if(!Object.keys(safeChanges).length){
    for(const key of allowed){const value=r['requested_'+key]??r['new_'+key];if(value!==undefined&&value!==null)safeChanges[key]=value;}
  }
  if(!Object.keys(safeChanges).length){c.studentEditRequestsSkipped++;return;}
  const rawStatus=clean(r.status,30).toLowerCase();
  const status=rawStatus==='approved'||rawStatus==='accepted'?'approved':rawStatus==='rejected'?'rejected':'pending';
  const id='b44editreq-'+sourceId.slice(-24);
  const result=await DB.prepare("INSERT OR IGNORE INTO student_profile_change_requests(id,user_id,changes_json,status,review_note,reviewed_by,created_at,reviewed_at) VALUES(?,?,?,?,?,?,?,?)")
    .bind(id,user.id,JSON.stringify(safeChanges),status,clean(r.review_note||r.admin_notes,1000),status==='pending'?null:adminId,
      clean(r.created_date||r.created_at,40)||new Date().toISOString(),status==='pending'?null:clean(r.reviewed_at||r.updated_date,40)||new Date().toISOString()).run();
  const saved=await DB.prepare("SELECT id FROM student_profile_change_requests WHERE id=?").bind(id).first();
  if(!saved?.id){c.studentEditRequestsSkipped++;return;}
  await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('StudentEditRequest',?,?,?) ON CONFLICT(entity_name,source_id) DO UPDATE SET destination_id=excluded.destination_id,user_id=excluded.user_id,imported_at=CURRENT_TIMESTAMP")
    .bind(sourceId,id,user.id).run();
  if(Number(result.meta?.changes||0)>0)c.studentEditRequestsImported++;else c.studentEditRequestsAlreadyPresent++;
}

function legacySlug(value,sourceId) {
  const base=norm(value).replace(/\s+/g,'-').slice(0,70);
  return (base||'base44-record')+'-'+clean(sourceId,12).replace(/[^a-z0-9]/gi,'').slice(-8).toLowerCase();
}

async function importNewsPost(DB,r,adminId,c) {
  const sourceId=sourceRecordId(r);
  const title=clean(r.title||r.headline||r.name,180);
  const body=clean(r.body||r.content||r.article||r.description,20000);
  if(!sourceId||!title||!body){c.newsPostsSkipped++;return;}
  const prior=await DB.prepare("SELECT destination_id FROM base44_student_import_map WHERE entity_name='NewsPost' AND source_id=?").bind(sourceId).first();
  if(prior?.destination_id){c.newsPostsAlreadyPresent++;return;}
  const rawType=clean(r.post_type||r.type||r.category,20).toLowerCase();
  const type=rawType.includes('event')?'event':'news';
  const rawStatus=clean(r.status,30).toLowerCase();
  const status=['published','active','live'].includes(rawStatus)?'published':rawStatus==='archived'?'archived':'draft';
  const audience=['student','staff','public'].includes(clean(r.audience,20).toLowerCase())?clean(r.audience,20).toLowerCase():'public';
  const id='b44news-'+sourceId.slice(-24);
  const slug=legacySlug(r.slug||title,sourceId);
  const result=await DB.prepare("INSERT OR IGNORE INTO institution_posts(id,post_type,slug,title,summary,body,audience,venue,starts_at,ends_at,status,created_by,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id,type,slug,title,clean(r.summary||r.excerpt,500),body,audience,clean(r.venue,180),
      clean(r.starts_at||r.start_date,40)||null,clean(r.ends_at||r.end_date,40)||null,status,adminId,
      status==='published'?clean(r.published_at||r.created_date,40)||new Date().toISOString():null,
      clean(r.created_date,40)||new Date().toISOString(),clean(r.updated_date||r.created_date,40)||new Date().toISOString()).run();
  const saved=await DB.prepare("SELECT id FROM institution_posts WHERE id=?").bind(id).first();
  if(!saved?.id){c.newsPostsSkipped++;return;}
  await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('NewsPost',?,?,?) ON CONFLICT(entity_name,source_id) DO UPDATE SET destination_id=excluded.destination_id,user_id=excluded.user_id,imported_at=CURRENT_TIMESTAMP")
    .bind(sourceId,id,adminId).run();
  if(Number(result.meta?.changes||0)>0)c.newsPostsImported++;else c.newsPostsAlreadyPresent++;
}

async function importOnlineForm(DB,r,adminId,c) {
  const sourceId=sourceRecordId(r);
  const title=clean(r.title||r.form_title||r.name,160);
  if(!sourceId||!title){c.onlineFormsSkipped++;return;}
  const prior=await DB.prepare("SELECT destination_id FROM base44_student_import_map WHERE entity_name='OnlineForm' AND source_id=?").bind(sourceId).first();
  if(prior?.destination_id){c.onlineFormsAlreadyPresent++;return;}
  let rawFields=r.fields||r.form_fields||r.questions||[];
  if(typeof rawFields==='string'){try{rawFields=JSON.parse(rawFields)}catch{rawFields=[];}}
  const fields=Array.isArray(rawFields)?rawFields:[];
  const audience=['student','customer','public'].includes(clean(r.audience,20).toLowerCase())?clean(r.audience,20).toLowerCase():'public';
  const rawStatus=clean(r.status,30).toLowerCase();
  const status=['published','active','live'].includes(rawStatus)?'published':rawStatus==='archived'?'archived':'draft';
  const id='b44form-'+sourceId.slice(-24);
  const slug=legacySlug(r.slug||title,sourceId);
  const result=await DB.prepare("INSERT OR IGNORE INTO online_forms(id,slug,title,description,audience,fields_json,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .bind(id,slug,title,clean(r.description||r.instructions,4000),audience,JSON.stringify(fields),status,adminId,
      clean(r.created_date,40)||new Date().toISOString(),clean(r.updated_date||r.created_date,40)||new Date().toISOString()).run();
  const saved=await DB.prepare("SELECT id FROM online_forms WHERE id=?").bind(id).first();
  if(!saved?.id){c.onlineFormsSkipped++;return;}
  await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('OnlineForm',?,?,?) ON CONFLICT(entity_name,source_id) DO UPDATE SET destination_id=excluded.destination_id,user_id=excluded.user_id,imported_at=CURRENT_TIMESTAMP")
    .bind(sourceId,id,adminId).run();
  if(Number(result.meta?.changes||0)>0)c.onlineFormsImported++;else c.onlineFormsAlreadyPresent++;
}

async function importSupportTicket(DB,r,adminId,c) {
  const sourceId=sourceRecordId(r);
  const email=clean(r.requester_email||r.student_email||r.customer_email||r.email,254).toLowerCase();
  const name=clean(r.requester_name||r.student_name||r.customer_name||r.name,140);
  const subject=clean(r.subject||r.title,180);
  const description=clean(r.description||r.message||r.body,12000);
  if(!sourceId||!email||!name||!subject||!description){c.supportTicketsSkipped++;return;}
  const prior=await DB.prepare("SELECT destination_id FROM base44_student_import_map WHERE entity_name='SupportTicket' AND source_id=?").bind(sourceId).first();
  if(prior?.destination_id){c.supportTicketsAlreadyPresent++;return;}
  const user=await DB.prepare("SELECT id,role FROM users WHERE lower(email)=lower(?) LIMIT 1").bind(email).first();
  const requesterType=user?.role==='student'?'student':'customer';
  const rawStatus=clean(r.status,30).toLowerCase().replace(/[ -]+/g,'_');
  const status=['in_progress','resolved','closed'].includes(rawStatus)?rawStatus:'open';
  const rawPriority=clean(r.priority,20).toLowerCase();
  const priority=['low','high'].includes(rawPriority)?rawPriority:'normal';
  const id='b44ticket-'+sourceId.slice(-24);
  const ticketNumber='B44-'+sourceId.replace(/[^a-z0-9]/gi,'').slice(-16).toUpperCase();
  const result=await DB.prepare("INSERT OR IGNORE INTO support_tickets(id,ticket_number,requester_type,requester_user_id,customer_id,requester_name,requester_email,subject,category,priority,description,status,admin_response,created_at,updated_at,resolved_at) VALUES(?,?,?, ?,NULL,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id,ticketNumber,requesterType,requesterType==='student'?user.id:null,name,email,subject,clean(r.category,80)||'general',priority,description,status,
      clean(r.admin_response||r.response,5000),clean(r.created_date,40)||new Date().toISOString(),
      clean(r.updated_date||r.created_date,40)||new Date().toISOString(),
      ['resolved','closed'].includes(status)?clean(r.resolved_at||r.updated_date,40)||new Date().toISOString():null).run();
  const saved=await DB.prepare("SELECT id FROM support_tickets WHERE id=?").bind(id).first();
  if(!saved?.id){c.supportTicketsSkipped++;return;}
  await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('SupportTicket',?,?,?) ON CONFLICT(entity_name,source_id) DO UPDATE SET destination_id=excluded.destination_id,user_id=excluded.user_id,imported_at=CURRENT_TIMESTAMP")
    .bind(sourceId,id,user?.id||adminId).run();
  if(Number(result.meta?.changes||0)>0)c.supportTicketsImported++;else c.supportTicketsAlreadyPresent++;
}

function stripLegacySecrets(value) {
  if(Array.isArray(value))return value.map(stripLegacySecrets);
  if(!value||typeof value!=='object')return value;
  const out={};
  for(const [key,item] of Object.entries(value)) {
    if(/password|credential|biometric|fingerprint|token|secret|session|api[_-]?key|private[_-]?key|salt|hash|authorization/i.test(key))continue;
    out[key]=stripLegacySecrets(item);
  }
  return out;
}

async function importLegacyWorkspaceRecord(DB,r,entity,adminId,c) {
  const sourceId=sourceRecordId(r);
  if(!sourceId){c.legacyRecordsSkipped++;return;}
  const prior=await DB.prepare("SELECT destination_id FROM base44_student_import_map WHERE entity_name=? AND source_id=?").bind(entity,sourceId).first();
  if(prior?.destination_id){c.legacyRecordsAlreadyPresent++;return;}
  const data=stripLegacySecrets(r);
  const display=clean(data.title||data.name||data.full_name||data.student_name||data.applicant_name||data.customer_name||data.service_name||data.document_title||data.file_name||data.venue_name||data.email||data.label,140)||sourceId;
  const title=(entity+' · '+display).slice(0,180);
  const detailPairs=Object.entries(data).filter(([key,value])=>value!==null&&value!==undefined&&typeof value!=='object'&&String(value).trim()!=='').slice(0,16);
  const details=detailPairs.map(([key,value])=>key.replace(/_/g,' ')+': '+String(value).slice(0,300)).join(' · ').slice(0,12000);
  const id='b44legacy-'+(await sha256(entity+'|'+sourceId)).slice(0,28);
  const stored={sourceEntity:entity,sourceId,sourceRecord:data};
  const result=await DB.prepare("INSERT OR IGNORE INTO admin_workspace_records(id,workspace,subtab,title,status,details,data_json,created_by,updated_by,created_at,updated_at) VALUES(?,'base44-imports','All Imported Records',?,'preserved',?,?,?,?,?,?)")
    .bind(id,title,details,JSON.stringify(stored),adminId,adminId,
      clean(r.created_date||r.created_at,40)||new Date().toISOString(),
      clean(r.updated_date||r.updated_at||r.created_date,40)||new Date().toISOString()).run();
  const saved=await DB.prepare("SELECT id FROM admin_workspace_records WHERE id=?").bind(id).first();
  if(!saved?.id){c.legacyRecordsSkipped++;return;}
  await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES(?,?,?,?) ON CONFLICT(entity_name,source_id) DO UPDATE SET destination_id=excluded.destination_id,user_id=excluded.user_id,imported_at=CURRENT_TIMESTAMP")
    .bind(entity,sourceId,id,adminId).run();
  if(Number(result.meta?.changes||0)>0)c.legacyRecordsImported++;else c.legacyRecordsAlreadyPresent++;
}

async function importCertificateDelivery(DB,r,certificates,c) {
  const sourceId=sourceRecordId(r);
  const certId=clean(r.certificate_id,100),serial=clean(r.serial_number,100);
  if(!sourceId||(!certId&&!serial))return;
  const sourceCertificate=(certificates||[]).find(x=>(certId&&clean(x.certificate_id,100)===certId)||(serial&&clean(x.serial_number,100)===serial));
  if(!sourceCertificate)return;
  const mapping=await DB.prepare("SELECT destination_id FROM base44_student_import_map WHERE entity_name='Certificate' AND source_id=?").bind(sourceRecordId(sourceCertificate)).first();
  if(!mapping?.destination_id)return;
  const existing=await DB.prepare("SELECT snapshot_json FROM student_certificates WHERE id=?").bind(mapping.destination_id).first();
  if(!existing)return;
  let snapshot={};try{snapshot=JSON.parse(existing.snapshot_json||'{}')}catch{}
  snapshot.delivery_confirmation={serial_number:serial,certificate_id:certId,student_name:clean(r.student_name,140),identity_type:clean(r.identity_type,80),identity_value:clean(r.identity_value,120),confirmed_at:clean(r.confirmed_at,60)};
  await DB.prepare("UPDATE student_certificates SET snapshot_json=? WHERE id=?").bind(JSON.stringify(snapshot),mapping.destination_id).run();
  await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id) VALUES('CertDeliveryConfirmation',?,?) ON CONFLICT(entity_name,source_id) DO UPDATE SET destination_id=excluded.destination_id,imported_at=CURRENT_TIMESTAMP")
    .bind(sourceId,mapping.destination_id).run();
  c.certificateDeliveriesLinked++;
}

async function importStudentResult(DB,r,adminId,c,sourceCourses,sourceModules) {
  const sourceId=sourceRecordId(r);if(!sourceId)return;
  const mapped=await DB.prepare("SELECT destination_id,is_overridden FROM base44_student_import_map WHERE entity_name='StudentResult' AND source_id=?").bind(sourceId).first();
  if(Number(mapped?.is_overridden||0)===1){c.studentResultsAlreadyPresent++;return;}
  const courseTitle=clean(r.course_title||r.course_name||r.programme,160)||sourceCourseTitle(r.course_id,sourceCourses);
  const course=await resolveCourse(DB,courseTitle,r.course_id);
  if(!course){c.studentResultsSkipped++;c.warnings.push('Student result '+sourceId+' could not be linked because its course '+(courseTitle||'(not supplied)')+' is not an active official course.');return;}
  let module=await mappedModule(DB,course.id,r.unit_id||r.module_id,r.module_code||r.unit_code,r.unit_title||r.module_title||r.module_name,sourceModules);
  if(!module.row)module=await ensureHistoricalModule(DB,course,r.unit_id||r.module_id,r.module_code||r.unit_code,r.unit_title||r.module_title||r.module_name,sourceModules,adminId,c);
  if(!module.row){c.studentResultsSkipped++;c.warnings.push("Module result for "+clean(r.student_email,120)+" could not be linked to an official module.");return;}
  const student=await findDestinationStudent(DB,r.student_email,course.id,r.enrollment_id);
  if(!student){c.studentResultsSkipped++;return;}
  const sourceAdmission=clean(r.admission_number,80);
  if(sourceAdmission&&student.admission_number&&sourceAdmission!==student.admission_number)c.warnings.push("Preserved official admission number "+student.admission_number+" for "+clean(r.student_email,120)+"; result carried legacy number "+sourceAdmission+".");
  const grade=clean(r.grade,8)||'MM',status=['I','MM'].includes(grade.toUpperCase())?'incomplete':'published';
  const cat=r.cat_score===null||r.cat_score===undefined?0:num(r.cat_score);
  const practical=r.assignment_score===null||r.assignment_score===undefined?0:num(r.assignment_score);
  const exam=r.exam_score===null||r.exam_score===undefined?0:num(r.exam_score);
  const targetId='b44modres-'+sourceId.slice(-20);
  const result=await DB.prepare("INSERT INTO student_module_results(id,user_id,course_id,module_id,cat_score,practical_score,exam_score,assignment_score,score,max_score,grade,remarks,status,published_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,module_id) DO UPDATE SET course_id=excluded.course_id,cat_score=excluded.cat_score,practical_score=excluded.practical_score,exam_score=excluded.exam_score,assignment_score=excluded.assignment_score,score=excluded.score,max_score=excluded.max_score,grade=excluded.grade,remarks=excluded.remarks,status=excluded.status,published_at=excluded.published_at,updated_by=excluded.updated_by,updated_at=excluded.updated_at")
    .bind(targetId,student.id,course.id,module.row.id,cat,practical,exam,0,
      num(r.score),Math.max(1,num(r.max_score)||100),grade,clean(r.remarks,1000),status,
      status==='published'?clean(r.updated_date,60)||clean(r.created_date,60)||new Date().toISOString():null,
      adminId,clean(r.updated_date,60)||clean(r.created_date,60)||new Date().toISOString()).run();
  const savedResult=await DB.prepare("SELECT id FROM student_module_results WHERE user_id=? AND module_id=?").bind(student.id,module.row.id).first();
  if(mapped?.destination_id){c.studentResultsAlreadyPresent++;c.studentResultsRestored++;}else if(Number(result.meta?.changes||0)>0)c.studentResultsImported++;else c.studentResultsAlreadyPresent++;
  if(savedResult?.id)await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('StudentResult',?,?,?) ON CONFLICT(entity_name,source_id) DO UPDATE SET destination_id=excluded.destination_id,user_id=excluded.user_id,imported_at=CURRENT_TIMESTAMP,is_overridden=0")
    .bind(sourceId,savedResult.id,student.id).run();
}
async function importExamSettings(DB,rows) {
  if(!rows.length)return;
  const source=rows[0]||{};
  const normalized={...source,securityLevel:clean(source.default_security_preset,20).toLowerCase()||'moderate',
    publishResultsAutomatically:source.auto_publish_results===true,showCorrectAnswers:source.show_correct_answers===true,
    negativeMarking:source.negative_marking_enabled===true,neverBelowZero:source.negative_floor_zero!==false,
    negativeDeductionMode:String(source.negative_deduction_mode||'').toLowerCase().includes('percentage')?'percentage':'fixed',
    negativeDeductionPercent:num(source.negative_deduction_percent)||25,negativeMarkValue:num(source.negative_deduction_marks)||0,
    negativeApplyTo:source.negative_apply_to||'Multiple Choice only',penaliseUnanswered:source.penalise_unanswered===true,durationMinutes:num(source.default_duration_minutes)||60,
    attempts:num(source.default_max_attempts)||1,publishedMaximum:num(source.default_total_marks)||100,
    violationsAllowed:num(source.security_max_violations)||3,
    freezeTextSelection:source.security_block_selection===true,killShortcuts:source.security_block_keyboard_shortcuts===true,
    blockDragging:source.security_block_drag_drop===true,blockLinks:source.security_block_new_tabs===true,
    stripSpellcheck:source.security_disable_autofill===true,aiInsertionGuard:source.security_ai_insert_guard===true,
    blockReload:source.security_block_reload===true,identityWatermark:source.security_watermark_identity===true,
    forceFullscreen:source.security_fullscreen===true,blockScreenshots:source.security_block_screenshot===true,
    blockPrintingSaving:source.security_block_print===true,blockAppSwitching:source.security_block_calls===true,
    disableRightClick:source.security_no_right_click===true,liveCameraPresence:source.security_require_camera===true,
    blockCopying:source.security_no_copy===true,blockPasting:source.security_block_paste===true,
    blockDeveloperTools:source.security_block_devtools===true,lockTabSwitching:source.security_block_tab_switch===true,
    pauseOnViolation:source.security_pause_on_violation===true,autoSubmitAtViolationLimit:source.security_auto_submit===true,
    flagForReview:source.security_flag_attempt!==false,alertAdmin:source.security_notify_admin!==false,
    questionFontSize:num(source.question_font_size)||17,questionTextAlign:source.question_text_align||'Left',
    questionNumberStyle:source.question_number_style||'1.',questionShowMarks:source.question_show_marks!==false,
    questionShowType:source.question_show_type!==false,questionSpacing:source.question_spacing||'Comfortable',
    showQuestionProgress:source.show_question_progress!==false,answerOptionStyle:source.answer_option_style||'Cards',
    answerLabelStyle:source.answer_label_style||'A) B) C)',answerFontSize:num(source.answer_font_size)||15,
    answerSpacing:source.answer_spacing||'Comfortable',answerSelectedStyle:source.answer_selected_style||'Tinted',
    showAnsweredSummary:source.show_answered_summary!==false,answerChangeMode:source.answer_change_mode||'Can change until submit',
    autoAdvanceAfterAnswer:source.auto_advance_after_answer===true,allowPreviousQuestion:source.allow_previous_question!==false,
    confirmBeforeSubmit:source.confirm_before_submit!==false,requireAllAnswers:source.require_all_answers===true};
  await DB.prepare("UPDATE exam_institute_settings SET settings_json=? WHERE id='default' AND (settings_json='{}' OR settings_json='')").bind(JSON.stringify(normalized)).run();
}
async function importGradingSystem(DB,rows) {
  const bands=rows.filter(x=>x.is_conditional!==true&&clean(x.grade,12)&&Number.isFinite(Number(x.min_percentage))&&Number.isFinite(Number(x.max_percentage)))
    .sort((a,b)=>Number(a.min_percentage)-Number(b.min_percentage));
  if(!bands.length)return;
  const row=await DB.prepare("SELECT value FROM system_state WHERE key='admin-configuration'").first();
  let config={};try{config=JSON.parse(row?.value||'{}')}catch{}
  config.grading={...(config.grading||{}),gradeScale:bands.map(x=>[
    clean(x.grade,12),clean(x.classification,100),Number(x.min_percentage),Number(x.max_percentage),clean(x.remarks,300)
  ].join('|')).join('\n')};
  await DB.prepare("INSERT INTO system_state(key,value) VALUES('admin-configuration',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(config)).run();
}
async function migrationGuard(label,operation,c) {
  try { return await operation(); }
  catch (cause) {
    const detail=String(cause?.message||cause);
    console.error('Base44 migration record failed:',label,detail);
    c.warnings.push('A record was retained in the secure archive because '+label+' failed: '+detail);
    return null;
  }
}

async function importAcademicIntakes(DB,rows,c) {
  for(const r of rows||[]) {
    const sourceId=sourceRecordId(r),name=clean(r.intake_name,40),year=clean(r.year,8);
    if(!sourceId||!name||!year){c.academicIntakesSkipped++;continue;}
    const id='b44intake-'+sourceId.slice(-24);
    const result=await DB.prepare(`INSERT INTO academic_intakes
      (id,source_id,intake_name,year,start_date,end_date,enrollment_open_date,enrollment_close_date,
       training_start_date,training_end_date,is_current,course_limits_json,source_json,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(source_id) DO UPDATE SET intake_name=excluded.intake_name,year=excluded.year,
       start_date=excluded.start_date,end_date=excluded.end_date,enrollment_open_date=excluded.enrollment_open_date,
       enrollment_close_date=excluded.enrollment_close_date,training_start_date=excluded.training_start_date,
       training_end_date=excluded.training_end_date,is_current=excluded.is_current,
       course_limits_json=excluded.course_limits_json,source_json=excluded.source_json,updated_at=excluded.updated_at`)
      .bind(id,sourceId,name,year,clean(r.start_date,40)||null,clean(r.end_date,40)||null,
        clean(r.enrollment_open_date,40)||null,clean(r.enrollment_close_date,40)||null,
        clean(r.training_start_date,40)||null,clean(r.training_end_date,40)||null,
        r.is_current===true?1:0,JSON.stringify(Array.isArray(r.course_limits)?r.course_limits:[]),
        JSON.stringify(r),clean(r.created_date,40)||new Date().toISOString(),
        clean(r.updated_date,40)||clean(r.created_date,40)||new Date().toISOString()).run();
    await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id) VALUES('AcademicIntake',?,?) ON CONFLICT(entity_name,source_id) DO UPDATE SET destination_id=excluded.destination_id,imported_at=CURRENT_TIMESTAMP")
      .bind(sourceId,id).run();
    if(Number(result.meta?.changes||0)>0)c.academicIntakesImported++;else c.academicIntakesAlreadyPresent++;
  }
}
async function importReportCardSettings(DB,rows) {
  const settings=Array.isArray(rows)?rows:[];
  const sourceConfig={};
  for(const row of settings.filter(x=>clean(x.setting_key,80)==='report_card_config')) {
    try {
      const parsed=JSON.parse(row.setting_value||'{}');
      if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))Object.assign(sourceConfig,parsed);
    } catch {}
  }
  const valueFor=key=>settings.find(x=>clean(x.setting_key,80)===key)?.setting_value;
  const selfGeneration=String(valueFor('report_card_self_generation')||'').toLowerCase()==='true';
  const resultsVisible=settings.some(x=>clean(x.setting_key,80)==='results_visibility'&&String(x.setting_value).toLowerCase()==='true');
  const logo=valueFor('institution_logo')||'';
  const watermark=sourceConfig.watermark_url||valueFor('institution_watermark')||'';
  const stamp=sourceConfig.stamp_url||valueFor('official_stamp')||'';
  const rawOpacity=Number(sourceConfig.watermark_opacity);
  const opacity=Number.isFinite(rawOpacity)?Math.max(5,Math.min(50,Math.round(rawOpacity<=1?rawOpacity*100:rawOpacity))):12;
  const row=await DB.prepare("SELECT value FROM system_state WHERE key='admin-configuration'").first();
  let config={};try{config=JSON.parse(row?.value||'{}')}catch{}
  const prior=config['report-card-layout']||{};
  config['report-card-layout']={
    ...prior,
    reportCardTitle:prior.reportCardTitle||'OFFICIAL ACADEMIC REPORT CARD',
    reportCardSubtitle:prior.reportCardSubtitle||'NAVSTAR DIGITAL HUB · HOME OF TECHNOCRATS',
    reportCardShowAttendance:prior.reportCardShowAttendance!==false,
    reportCardShowFees:prior.reportCardShowFees!==false,
    reportCardShowRemarks:prior.reportCardShowRemarks!==false,
    reportCardShowModuleCode:prior.reportCardShowModuleCode!==false,
    reportCardShowMarks:prior.reportCardShowMarks!==false,
    reportCardShowGrade:prior.reportCardShowGrade!==false,
    reportCardShowQr:prior.reportCardShowQr!==false,
    reportCardWatermarkEnabled:Boolean(watermark)||prior.reportCardWatermarkEnabled===true,
    reportCardWatermarkText:'NAVSTAR DIGITAL HUB',
    reportCardWatermarkOpacity:opacity,
    reportCardWatermarkUrl:watermark||prior.reportCardWatermarkUrl||'',
    reportCardStampEnabled:Boolean(stamp)||prior.reportCardStampEnabled===true,
    reportCardStampUrl:stamp||prior.reportCardStampUrl||'',
    reportCardStampPosition:sourceConfig.stamp_position||prior.reportCardStampPosition||'bottom-right',
    reportCardStampOpacity:Number.isFinite(Number(sourceConfig.stamp_opacity))?Math.max(0.1,Math.min(1,Number(sourceConfig.stamp_opacity))):Number(prior.reportCardStampOpacity)||1,
    trainerSignatureUrl:sourceConfig.signature_trainer_url||prior.trainerSignatureUrl||'',
    headTrainingSignatureUrl:sourceConfig.signature_hod_url||prior.headTrainingSignatureUrl||'',
    directorSignatureUrl:sourceConfig.signature_director_url||prior.directorSignatureUrl||'',
    reportCardLogoUrl:logo||prior.reportCardLogoUrl||'',
    moduleSort:sourceConfig.module_sort||prior.moduleSort||'code',
    reportCardSelfGeneration:selfGeneration,
    resultsVisibility:resultsVisible
  };
  await DB.prepare("INSERT INTO system_state(key,value) VALUES('admin-configuration',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(config)).run();
}
async function importSystemUsers(DB,rows,adminId,c) {
  const roleMap={tutor:'tutor',admin:'admin',principal:'principal',finance:'finance',admissions:'admissions'};
  const priority={admin:5,principal:4,finance:3,admissions:2,tutor:1};
  const grouped=new Map();
  for(const row of rows){
    const email=clean(row.email,254).toLowerCase();
    if(!email)continue;
    const list=grouped.get(email)||[];list.push(row);grouped.set(email,list);
  }
  for(const [email,records] of grouped){
    const candidates=records.map(row=>({row,role:roleMap[clean(row.role,40).toLowerCase()]})).filter(x=>x.role)
      .sort((a,b)=>(priority[b.role]||0)-(priority[a.role]||0));
    if(!candidates.length){c.systemUsersSkipped+=records.length;c.warnings.push('Staff account '+email+' uses an unsupported Base44 role and remains safely archived.');continue;}
    const selected=candidates[0],source=selected.row,portalRole=selected.role;
    let user=await DB.prepare("SELECT id,role,status FROM users WHERE lower(email)=lower(?)").bind(email).first();
    if(user&&user.role==='student'){
      c.systemUsersSkipped+=records.length;
      c.warnings.push('Staff account '+email+' was not created because the same email already belongs to a student account.');
      continue;
    }
    if(!user){
      const credential=await hashPassword(crypto.randomUUID()+crypto.randomUUID());
      const id='b44staffusr-'+sourceRecordId(source).slice(-20);
      const baseRole=portalRole==='finance'?'admissions':portalRole;
      const active=source.is_active===false? 'disabled':'active';
      await DB.prepare("INSERT OR IGNORE INTO users(id,name,email,role,password_hash,password_salt,must_change_password,status,created_at) VALUES(?,?,?,?,?, ?,1,?,?)")
        .bind(id,clean(source.full_name||source.name,140)||email, email,baseRole,credential.hash,credential.salt,active,
          clean(source.created_date,40)||new Date().toISOString()).run();
      user=await DB.prepare("SELECT id,role,status FROM users WHERE lower(email)=lower(?)").bind(email).first();
      if(!user){c.systemUsersSkipped+=records.length;continue;}
      if(user.id===id){c.systemUsersImported++;c.staffPasswordSetupRequired++;}
      else c.systemUsersAlreadyPresent++;
    }else c.systemUsersAlreadyPresent++;
    const priorProfile=await DB.prepare("SELECT user_id,staff_id FROM user_profiles WHERE user_id=?").bind(user.id).first();
    if(!priorProfile){
      let staffId=clean(source.staff_id,40);
      if(staffId){
        const collision=await DB.prepare("SELECT user_id FROM user_profiles WHERE staff_id=? AND user_id<>? LIMIT 1").bind(staffId,user.id).first();
        if(collision)staffId='';
      }
      if(!staffId)staffId='B44'+sourceRecordId(source).replace(/[^a-z0-9]/gi,'').slice(-12).toUpperCase();
      await DB.prepare(`INSERT INTO user_profiles(user_id,staff_id,portal_role,phone,date_of_birth,gender,citizenship,country,province,county,sub_county,ward,location,profile_photo_url,national_id,department,job_title,employment_type,joined_on)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(user.id,staffId,portalRole,clean(source.phone,32)||null,dateOnly(source.date_of_birth)||null,
          clean(source.gender,30)||null,clean(source.nationality,80)||null,clean(source.country,80)||'Kenya',
          clean(source.province,80)||null,clean(source.county,80)||null,clean(source.subcounty,80)||null,
          clean(source.ward,80)||null,clean(source.location,100)||null,clean(source.photo_url,1000)||null,
          clean(source.national_id,80)||null,portalRole==='tutor'?'Academic':portalRole==='finance'?'Finance':'Administration',
          clean(source.role,80),source.is_teaching_staff===true?'Teaching':'Non-teaching',
          dateOnly(source.hire_date)||dateOnly(source.created_date)||null).run();
    }
    for(const record of records){
      const sourceId=sourceRecordId(record);if(!sourceId)continue;
      await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('SystemUser',?,?,?) ON CONFLICT(entity_name,source_id) DO UPDATE SET destination_id=excluded.destination_id,user_id=excluded.user_id,imported_at=CURRENT_TIMESTAMP")
        .bind(sourceId,user.id,user.id).run();
    }
    if(candidates.length<records.length)c.systemUsersSkipped+=records.length-candidates.length;
  }
}

async function importStaffApplication(DB,r,adminId,c) {
  const sourceId=sourceRecordId(r);
  const email=clean(r.email,254).toLowerCase();
  const name=clean(r.full_name||r.applicant_name||r.name,140);
  if(!sourceId||!email||!name){c.staffApplicationsSkipped++;return;}
  const prior=await DB.prepare("SELECT destination_id FROM base44_student_import_map WHERE entity_name='StaffApplication' AND source_id=?").bind(sourceId).first();
  if(prior?.destination_id){c.staffApplicationsAlreadyPresent++;return;}
  const sameEmail=await DB.prepare('SELECT id FROM staff_applications WHERE lower(email)=lower(?) ORDER BY created_at ASC LIMIT 1').bind(email).first();
  if(sameEmail?.id){
    await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('StaffApplication',?,?,?) ON CONFLICT(entity_name,source_id) DO UPDATE SET destination_id=excluded.destination_id,user_id=excluded.user_id,imported_at=CURRENT_TIMESTAMP").bind(sourceId,sameEmail.id,adminId).run();
    c.staffApplicationsAlreadyPresent++;return;
  }
  const sourceStatus=clean(r.status,40).toLowerCase().replace(/[ -]+/g,'_');
  const status=sourceStatus==='approved'||sourceStatus==='accepted'?'approved':
    sourceStatus==='rejected'?'rejected':'pending';
  const list=value=>Array.isArray(value)?value.map(x=>clean(x,160)).filter(Boolean):clean(value,500);
  const specialisations=[
    ...([list(r.courses_to_teach)].flat().filter(Boolean).flatMap(x=>Array.isArray(x)?x:[x])),
    ...([list(r.modules_to_teach)].flat().filter(Boolean).flatMap(x=>Array.isArray(x)?x:[x]))
  ];
  const qualification=[clean(r.qualification,500),clean(r.qualifications,2000)].filter(Boolean).join(' · ');
  const notes=[
    clean(r.recommendation,300)?'Recommendation: '+clean(r.recommendation,300):'',
    clean(r.recommendation_notes,2000),
    clean(r.admin_notes,2000),
    clean(r.application_reference,100)?'Base44 application reference: '+clean(r.application_reference,100):'',
    r.id_document_url||r.passport_photo_url?'Original identity documents remain in the private migration archive and were not copied into public document storage.':''
  ].filter(Boolean).join('\n');
  const id='b44staff-'+sourceId.slice(-24);
  const result=await DB.prepare(`INSERT OR IGNORE INTO staff_applications
    (id,applicant_name,email,phone,position_applied,subject_specialisations,qualifications,experience,cover_letter,
     document_key,document_name,document_mime_type,status,review_notes,reviewed_at,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,NULL,NULL,NULL,?,?,?, ?,?)`)
    .bind(id,name,email,clean(r.phone,32),clean(r.position,120),specialisations.join(', '),
      qualification,clean(r.experience,3000),clean(r.cover_letter||r.recommendation_notes,5000),
      status,notes||null,['approved','rejected'].includes(status)?clean(r.updated_date,40)||null:null,
      clean(r.created_date,40)||new Date().toISOString(),clean(r.updated_date,40)||clean(r.created_date,40)||new Date().toISOString()).run();
  const saved=await DB.prepare("SELECT id FROM staff_applications WHERE id=?").bind(id).first();
  if(!saved){c.staffApplicationsSkipped++;c.warnings.push('Staff application '+email+' could not be connected to Recruitment.');return;}
  await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('StaffApplication',?,?,?) ON CONFLICT(entity_name,source_id) DO NOTHING")
    .bind(sourceId,id,adminId).run();
  if(Number(result.meta?.changes||0)>0)c.staffApplicationsImported++;else c.staffApplicationsAlreadyPresent++;
}

async function importMarksWeights(DB,rows) {
  const setting=rows.find(x=>clean(x.setting_key,80)==='marks_category_weights');
  if(!setting)return;
  let weights={};try{weights=JSON.parse(setting.setting_value||'{}')}catch{return;}
  const cat=num(weights.CAT),practical=num(weights.Practical),final=num(weights.Final);
  if(cat<=0||practical<=0||final<=0||cat+practical+final!==100)return;
  const current=await DB.prepare("SELECT value FROM system_state WHERE key='admin-configuration'").first();
  let config={};try{config=JSON.parse(current?.value||'{}')}catch{}
  config.grading={...(config.grading||{}),marksWeights:{CAT:cat,Practical:practical,Final:final},catOutOf:cat,practicalOutOf:practical,finalOutOf:final};
  await DB.prepare("INSERT INTO system_state(key,value) VALUES('admin-configuration',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(config)).run();
}

async function importStudent(DB,r,adminId,c) {
  const sourceId=sourceRecordId(r);
  const email=clean(r.student_email||r.email,254).toLowerCase();
  const name=clean(r.student_name||r.full_name||r.name,120);
  const phone=clean(r.student_phone||r.phone,40);
  if(!sourceId||!email||!name){c.skippedStudents++;return null;}
  const course=await courseFor(DB,r.course_title||r.course_name||r.programme||r.program,r.total_fee);
  if(clean(r.course_id,120))await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('Course',?,?,?) ON CONFLICT(entity_name,source_id) DO UPDATE SET destination_id=excluded.destination_id,imported_at=CURRENT_TIMESTAMP").bind(clean(r.course_id,120),course.id,adminId).run();
  if(course.created)c.archivedCoursesCreated++;
  const mapping=await DB.prepare("SELECT destination_id,user_id FROM base44_student_import_map WHERE entity_name='Enrollment' AND source_id=?").bind(sourceId).first();
  const requestedAdmission=clean(r.admission_number,80);
  let requestedIntake=clean(r.intake_label,80);
  if(!requestedIntake&&clean(r.intake_id,120)){const sourceIntake=await DB.prepare('SELECT intake_name,year FROM academic_intakes WHERE source_id=? OR id=? LIMIT 1').bind(clean(r.intake_id,120),clean(r.intake_id,120)).first();requestedIntake=sourceIntake?clean(sourceIntake.intake_name,40)+' '+clean(sourceIntake.year,8):clean(r.intake_id,80);}
  let matchedEnrollment=mapping?.destination_id
    ? await DB.prepare('SELECT id,admission_number,email,identity_number,course_id,preferred_intake FROM enrollments WHERE id=?').bind(mapping.destination_id).first()
    : null;

  // Match exact admission numbers first. Reuse only when the student identity agrees.
  if(requestedAdmission) {
    const byAdmission=await DB.prepare('SELECT id,admission_number,email,identity_number,course_id,preferred_intake FROM enrollments WHERE admission_number=? LIMIT 1').bind(requestedAdmission).first();
    if(byAdmission && byAdmission.id!==matchedEnrollment?.id) {
      const sameIdentity=clean(byAdmission.email,254).toLowerCase()===email ||
        (clean(r.national_id,80) && clean(byAdmission.identity_number,80)===clean(r.national_id,80));
      if(!sameIdentity) {
        c.skippedStudents++;
        c.warnings.push('Skipped '+email+': admission number '+requestedAdmission+' already belongs to a different student. The original admission number and student record were protected.');
        return null;
      }
      // A learner may hold different admission numbers for different courses. Never reuse
      // an enrollment from another course merely because the email/identity is the same.
      if(byAdmission.course_id===course.id)matchedEnrollment=byAdmission;
    }
  }

  // Catch a repeated export row even when Base44 supplied a different source record ID.
  if(!matchedEnrollment) {
    matchedEnrollment=await DB.prepare(`
      SELECT id,admission_number,email,identity_number,course_id,preferred_intake
      FROM enrollments
      WHERE lower(email)=lower(?) AND course_id=?
        AND COALESCE(preferred_intake,'')=COALESCE(?, '')
      ORDER BY created_at ASC LIMIT 1
    `).bind(email,course.id,requestedIntake).first();
    if(!matchedEnrollment){
      const sameCourseRows=await DB.prepare(`
        SELECT id,admission_number,email,identity_number,course_id,preferred_intake
        FROM enrollments WHERE lower(email)=lower(?) AND course_id=?
        ORDER BY created_at ASC LIMIT 2
      `).bind(email,course.id).all();
      if((sameCourseRows.results||[]).length===1)matchedEnrollment=sameCourseRows.results[0];
    }
  }
  const enrollmentId=matchedEnrollment?.id||'b44-enr-'+sourceId.slice(-24);
  const admission=requestedAdmission || matchedEnrollment?.admission_number || null;
  if(matchedEnrollment?.admission_number && requestedAdmission && matchedEnrollment.admission_number!==requestedAdmission) {
    c.warnings.push('Kept existing admission number '+matchedEnrollment.admission_number+' for '+email+'; conflicting incoming value '+requestedAdmission+' was not allowed to overwrite it.');
  }
  let user=await DB.prepare('SELECT id,role,status FROM users WHERE lower(email)=lower(?)').bind(email).first();
  if(user&&user.role!=='student'){c.skippedStudents++;c.warnings.push('Skipped '+email+': the email is already used by a non-student account.');return null;}
  if(!user) {
    const credential=passwordCredential(r);
    const generated=credential||await hashPassword(clean(crypto.randomUUID()+crypto.randomUUID(),100));
    const state=lifecycle(r);
    const createdAt=clean(r.enrollment_date||r.created_date||r.created_at,40)||new Date().toISOString();
    const userId='b44usr-'+sourceId.slice(-24);
    await DB.prepare("INSERT OR IGNORE INTO users(id,name,email,role,password_hash,password_salt,must_change_password,status,created_at) VALUES(?,?,?,'student',?,?,?,?,?)")
      .bind(userId,name,email,generated.hash,generated.salt,generated.mustChange??1,state.account,createdAt).run();
    user=await DB.prepare('SELECT id,role,status FROM users WHERE lower(email)=lower(?)').bind(email).first();
    if(!credential)c.passwordSetupRequired++;
    if(user)c.accountsCreated++;
  } else {
    c.existingAccountsLinked++;
    await DB.prepare("UPDATE users SET name=? WHERE id=? AND role='student' AND (name='' OR name IS NULL)").bind(name,user.id).run();
  }
  if(!user){c.skippedStudents++;return null;}
  const state=lifecycle(r);
  const profile=await DB.prepare('SELECT staff_id FROM user_profiles WHERE user_id=?').bind(user.id).first();
  const staffId=profile?.staff_id||'STB44'+sourceId.replace(/[^a-z0-9]/gi,'').slice(-10).toUpperCase();
  const address=[r.street,r.location,r.sublocation||r.sub_location,r.ward,r.subcounty||r.sub_county,r.county].map(x=>clean(x,100)).filter(Boolean).join(', ');
  await DB.prepare(`
    INSERT INTO user_profiles(user_id,staff_id,portal_role,phone,date_of_birth,gender,citizenship,country,province,county,sub_county,ward,location,sub_location,profile_photo_url,national_id,address,student_status)
    VALUES(?,?,'student',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET
      portal_role='student',
      phone=COALESCE(NULLIF(excluded.phone,''),user_profiles.phone),
      date_of_birth=COALESCE(NULLIF(excluded.date_of_birth,''),user_profiles.date_of_birth),
      gender=COALESCE(NULLIF(excluded.gender,''),user_profiles.gender),
      citizenship=COALESCE(NULLIF(excluded.citizenship,''),user_profiles.citizenship),
      country=COALESCE(NULLIF(excluded.country,''),user_profiles.country),
      province=COALESCE(NULLIF(excluded.province,''),user_profiles.province),
      county=COALESCE(NULLIF(excluded.county,''),user_profiles.county),
      sub_county=COALESCE(NULLIF(excluded.sub_county,''),user_profiles.sub_county),
      ward=COALESCE(NULLIF(excluded.ward,''),user_profiles.ward),
      location=COALESCE(NULLIF(excluded.location,''),user_profiles.location),
      sub_location=COALESCE(NULLIF(excluded.sub_location,''),user_profiles.sub_location),
      profile_photo_url=COALESCE(NULLIF(excluded.profile_photo_url,''),user_profiles.profile_photo_url),
      national_id=COALESCE(NULLIF(excluded.national_id,''),user_profiles.national_id),
      address=COALESCE(NULLIF(excluded.address,''),user_profiles.address),
      student_status=excluded.student_status,updated_at=CURRENT_TIMESTAMP
  `).bind(
    user.id,staffId,phone||'',dateOnly(r.date_of_birth)||null,clean(r.gender,40)||null,clean(r.nationality,80)||null,
    clean(r.country,80)||'Kenya',clean(r.province,80)||null,clean(r.county,80)||null,clean(r.subcounty||r.sub_county,80)||null,
    clean(r.ward,80)||null,clean(r.location,100)||null,clean(r.sublocation||r.sub_location,100)||null,
    clean(r.student_photo_url,1000)||null,clean(r.national_id,80)||null,address||null,state.profile
  ).run();
  const existing=await DB.prepare('SELECT id,admission_number FROM enrollments WHERE id=?').bind(enrollmentId).first();
  if(!existing) {
    const ref='B44-'+sourceId.replace(/[^a-z0-9]/gi,'').slice(-16).toUpperCase();
    const createdAt=clean(r.created_date||r.created_at,40)||new Date().toISOString();
    const contactName=clean(r.next_of_kin_name||r.guardian_name||r.mother_name||r.father_name,120)||'Not recorded';
    const contactPhone=clean(r.next_of_kin_phone||r.guardian_phone||r.mother_phone||r.father_phone,40)||'Not recorded';
    await DB.prepare(`
      INSERT INTO enrollments(
        id,display_ref,admission_number,course_id,full_name,email,phone,date_of_birth,identity_type,identity_number,gender,nationality,
        study_mode,education_level,preferred_intake,experience,county,town,address,sub_county,ward,location,sub_location,
        emergency_contact_name,emergency_contact_phone,emergency_contact_relationship,support_needs,consent,status,payment_status,
        application_details_json,admitted_user_id,created_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,'accepted','unpaid',?,?,?)
    `).bind(
      enrollmentId,ref,admission,course.id,name,email,phone||'Not recorded',dateOnly(r.date_of_birth)||'',clean(r.id_type,40)||null,
      clean(r.national_id,80)||null,clean(r.gender,40)||null,clean(r.nationality,80)||null,
      clean(r.study_mode,40)||'Not recorded',clean(r.education_level,80)||'Not recorded',
      clean(r.intake_label||r.intake_id,80)||null,clean(r.previous_school||r.education_year_completed,160)||null,
      clean(r.county,80)||'Not recorded',clean(r.location||r.subcounty||r.county,120)||'Not recorded',address||null,
      clean(r.subcounty||r.sub_county,80)||null,clean(r.ward,80)||null,clean(r.location,100)||null,
      clean(r.sublocation||r.sub_location,100)||null,contactName,contactPhone,clean(r.next_of_kin_relationship,80)||null,
      clean(r.support_needs,1000)||null,safeDetails(r),user.id,createdAt
    ).run();
    c.enrollmentsCreated++;
  } else {
    c.enrollmentsAlreadyPresent++;
    if(requestedAdmission && existing.admission_number!==requestedAdmission) {
      const collision=await DB.prepare('SELECT id,email,identity_number FROM enrollments WHERE admission_number=? AND id<>? LIMIT 1').bind(requestedAdmission,enrollmentId).first();
      if(!collision) {
        await DB.prepare('UPDATE enrollments SET admission_number=? WHERE id=?').bind(requestedAdmission,enrollmentId).run();
        c.admissionNumbersUpdated++;
        c.warnings.push('Restored the previous-system admission number '+requestedAdmission+' for '+email+' instead of retaining the newer official-site number.');
      } else {
        c.admissionNumberConflicts++;
        c.warnings.push('Could not restore '+requestedAdmission+' for '+email+' because that admission number is already assigned to another student; no student record was overwritten.');
      }
    }
  }
  if(requestedIntake)await DB.prepare("UPDATE enrollments SET preferred_intake=? WHERE id=? AND (preferred_intake IS NULL OR trim(preferred_intake)='' OR preferred_intake='Unassigned Intake')").bind(requestedIntake,enrollmentId).run();
  const sourceEnrollmentDate=clean(r.enrollment_date,40)||clean(r.created_date,40)||'';
  if(sourceEnrollmentDate)await DB.prepare("UPDATE enrollments SET source_enrollment_date=COALESCE(NULLIF(source_enrollment_date,''),?) WHERE id=?").bind(sourceEnrollmentDate,enrollmentId).run();
  await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('Enrollment',?,?,?) ON CONFLICT(entity_name,source_id) DO UPDATE SET destination_id=excluded.destination_id,user_id=excluded.user_id,imported_at=CURRENT_TIMESTAMP")
    .bind(sourceId,enrollmentId,user.id).run();
  if(state.graduation) {
    await DB.prepare("INSERT INTO student_graduation_records(id,user_id,course_id,status,completed_at,updated_by) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,course_id) DO UPDATE SET status=excluded.status,completed_at=COALESCE(excluded.completed_at,student_graduation_records.completed_at),updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP")
      .bind('b44grad-'+sourceId.slice(-20),user.id,course.id,state.graduation,dateOnly(r.completion_date)||dateOnly(r.updated_date)||null,adminId).run();
  }
  const amountPaid=Math.max(0,Math.round(num(r.amount_paid)));
  const additionalFee=Math.max(0,Math.round(num(r.additional_fee)));
  const hasBalance=r.fee_balance!==null&&r.fee_balance!==undefined&&r.fee_balance!=='';
  const totalDue=Math.max(0,Math.round(hasBalance?amountPaid+num(r.fee_balance):num(r.total_fee)+additionalFee));
  const baseFee=Math.max(0,totalDue-additionalFee);
  // Replace the trigger's current-course snapshot with this learner's historical total,
  // so old discounts and prior fee agreements do not get overwritten by today's course fee.
  if(!existing) await DB.prepare('DELETE FROM enrollment_fee_items WHERE enrollment_id=?').bind(enrollmentId).run();
  const feeDate=clean(r.created_date,40)||new Date().toISOString();
  if(baseFee>0) {
    const duplicate=existing?await DB.prepare("SELECT id FROM enrollment_fee_items WHERE enrollment_id=? AND item_name='Legacy course fee total' AND amount=? LIMIT 1").bind(enrollmentId,baseFee).first():null;
    if(!duplicate) await DB.prepare("INSERT OR IGNORE INTO enrollment_fee_items(id,enrollment_id,fee_item_id,item_name,amount,due_stage,created_at) VALUES(?,?,NULL,'Legacy course fee total',?,'before_term',?)")
      .bind('b44enrfee-'+sourceId.slice(-24),enrollmentId,baseFee,feeDate).run();
  }
  if(additionalFee>0) {
    const additionalName='Additional fee - '+(clean(r.additional_fee_reason,80)||'Other');
    const duplicate=existing?await DB.prepare('SELECT id FROM enrollment_fee_items WHERE enrollment_id=? AND item_name=? AND amount=? LIMIT 1').bind(enrollmentId,additionalName,additionalFee).first():null;
    if(!duplicate) await DB.prepare("INSERT OR IGNORE INTO enrollment_fee_items(id,enrollment_id,fee_item_id,item_name,amount,due_stage,created_at) VALUES(?,?,NULL,?,?,'anytime',?)")
      .bind('b44enradd-'+sourceId.slice(-24),enrollmentId,additionalName,additionalFee,feeDate).run();
  }
  if(totalDue>0&&baseFee===0&&additionalFee===0) {
    const duplicate=existing?await DB.prepare("SELECT id FROM enrollment_fee_items WHERE enrollment_id=? AND item_name='Legacy student fee total' AND amount=? LIMIT 1").bind(enrollmentId,totalDue).first():null;
    if(!duplicate) await DB.prepare("INSERT OR IGNORE INTO enrollment_fee_items(id,enrollment_id,fee_item_id,item_name,amount,due_stage,created_at) VALUES(?,?,NULL,'Legacy student fee total',?,'before_term',?)")
      .bind('b44enrtotal-'+sourceId.slice(-24),enrollmentId,totalDue,feeDate).run();
  }
  return {sourceId,enrollmentId,userId:user.id,amountPaid,totalFee:totalDue,source:r};
}
export async function onRequestOptions({request}) { return new Response(null,{status:204,headers:corsHeaders(request.headers.get('Origin')||'')}); }
export async function onRequestPost({request,env}) {
  const origin=request.headers.get('Origin')||'';
  const sameOrigin=origin===new URL(request.url).origin;
  if(!allowedOrigins.has(origin)&&!sameOrigin)return error('Origin not allowed.',403);
  const headers=corsHeaders(origin);
  const auth=request.headers.get('Authorization')||'';
  const token=auth.startsWith('Bearer ')?auth.slice(7).trim():'';
  if(!token||!env.DB)return new Response(JSON.stringify({error:'A valid migration token is required.'}),{status:401,headers:{...headers,'Content-Type':'application/json'}});
  const tokenHash=await sha256(token);
  const tokenRow=await env.DB.prepare('SELECT token_hash,expires_at,used_at,records_received,created_by FROM base44_migration_tokens WHERE token_hash=?').bind(tokenHash).first();
  if(!tokenRow||tokenRow.used_at||new Date(tokenRow.expires_at).getTime()<Date.now())return new Response(JSON.stringify({error:'Migration token is invalid, expired, or already completed.'}),{status:401,headers:{...headers,'Content-Type':'application/json'}});
  let body={};try{body=await request.json();}catch{}
  const archiveReplay=body.archiveReplay===true||body.academicOnly===true||body.questionsOnly===true;
  const academicOnly=body.academicOnly===true&&body.archiveReplay!==true;
  const questionsOnly=body.questionsOnly===true;
  const batchEntity=clean(body.batchEntity,80);
  const batchMode=archiveReplay&&!!batchEntity;
  const deferTokenUse=body.deferTokenUse===true;
  const sourceBatch=archiveReplay?clean(body.batchId,80):tokenHash;
  if(archiveReplay&&!sourceBatch)return new Response(JSON.stringify({error:'Select a saved migration package first.'}),{status:400,headers:{...headers,'Content-Type':'application/json'}});
  const entityFilter=questionsOnly?"'ExamQuestion'":academicOnly?"'Enrollment','AcademicIntake','Course','CourseUnit','Exam','ExamAttempt','StudentResult','Assignment','AssignmentSubmission','ExamSettings','SystemSettings','GradingSystem','SystemUser','ModuleAssignment','MarksApproval','MarksConflict','StaffApplication','AttendanceRecord','EClassAttendance','ModuleCompletion','Graduate','Certificate','CertDeliveryConfirmation','StudentStatusHistory','StudentEditRequest'":"'Enrollment','AcademicIntake','FeeStructure','FeePayment','AdditionalFee','Course','CourseUnit','Exam','ExamAttempt','ExamQuestion','StudentResult','Assignment','AssignmentSubmission','ExamSettings','SystemSettings','GradingSystem','SystemUser','ModuleAssignment','MarksApproval','MarksConflict','StaffApplication','AttendanceRecord','EClassAttendance','ModuleCompletion','Graduate','Certificate','CertDeliveryConfirmation','StudentStatusHistory','StudentEditRequest','NewsPost','OnlineForm','SupportTicket','Campus','CertificateTemplate','ClassRatingForm','CustomerAccount','CvDesign','DeviceSession','DocumentAccessPolicy','ICTServiceItem','InstitutionDocument','InstitutionRules','InstitutionSettings','PaymentMethod','PosCustomerLink','QRSession','ServiceCategory','ServiceOrder','StampDesign','StudentProject','TrustedPlatform','Venue'";
  const stagedRows=[];
  const newArchiveCount=await env.DB.prepare('SELECT COUNT(*) AS count FROM base44_legacy_archive_records WHERE migration_batch=?').bind(sourceBatch).first();
  const archiveTable=Number(newArchiveCount?.count||0)>0?'base44_legacy_archive_records':'base44_legacy_records';
  const batchAllowed=['AcademicIntake','FeeStructure','Enrollment','CourseUnit','SystemUser','ModuleAssignment','Exam','ExamAttempt','ExamQuestion','Assignment','AssignmentSubmission','StudentResult','MarksConflict','StaffApplication','ExamSettings','SystemSettings','GradingSystem','AttendanceRecord','EClassAttendance','ModuleCompletion','Graduate','Certificate','CertDeliveryConfirmation','StudentStatusHistory','StudentEditRequest','NewsPost','OnlineForm','SupportTicket','Campus','CertificateTemplate','ClassRatingForm','CustomerAccount','CvDesign','DeviceSession','DocumentAccessPolicy','ICTServiceItem','InstitutionDocument','InstitutionRules','InstitutionSettings','PaymentMethod','PosCustomerLink','QRSession','ServiceCategory','ServiceOrder','StampDesign','StudentProject','TrustedPlatform','Venue'];
  if(body.finalizeOnly===true){
    await env.DB.prepare('UPDATE base44_migration_tokens SET used_at=CURRENT_TIMESTAMP WHERE token_hash=? AND used_at IS NULL').bind(tokenHash).run();
    try{await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),tokenRow.created_by,'base44_student_and_fee_migration_completed','migration',sourceBatch.slice(0,24)).run();}catch{}
    return new Response(JSON.stringify({completed:true,tokenFinalized:true,sourceBatch}),{status:200,headers:{...headers,'Content-Type':'application/json'}});
  }
  if(batchMode){
    if(!batchAllowed.includes(batchEntity))return new Response(JSON.stringify({error:'Unsupported migration batch entity: '+batchEntity}),{status:400,headers:{...headers,'Content-Type':'application/json'}});
    const offset=Math.max(0,Math.floor(Number(body.offset)||0));
    const limit=Math.min(20,Math.max(1,Math.floor(Number(body.limit)||15)));
    const page=await env.DB.prepare('SELECT entity_name,source_id,record_json FROM '+archiveTable+' WHERE migration_batch=? AND entity_name=? ORDER BY source_id LIMIT ? OFFSET ?').bind(sourceBatch,batchEntity,limit,offset).all();
    stagedRows.push(...(page.results||[]));
    const support=async name=>{const q=await env.DB.prepare('SELECT entity_name,source_id,record_json FROM '+archiveTable+' WHERE migration_batch=? AND entity_name=? ORDER BY source_id').bind(sourceBatch,name).all();stagedRows.push(...(q.results||[]));};
    if(batchEntity==='Enrollment'&&page.results?.length){
      const ids=page.results.map(x=>x.source_id).filter(Boolean);
      if(ids.length){
        const marks=ids.map(()=>'?').join(',');
        for(const name of ['FeePayment','AdditionalFee']){
          const q=await env.DB.prepare("SELECT entity_name,source_id,record_json FROM "+archiveTable+" WHERE migration_batch=? AND entity_name=? AND json_extract(record_json,'$.enrollment_id') IN ("+marks+")").bind(sourceBatch,name,...ids).all();
          stagedRows.push(...(q.results||[]));
        }
      }
    }
    if(['CourseUnit','ModuleAssignment','Exam','Assignment','StudentResult','MarksConflict'].includes(batchEntity))await support('Course');
    if(['Exam','Assignment','StudentResult','MarksConflict','ModuleAssignment'].includes(batchEntity))await support('CourseUnit');
    if(batchEntity==='ModuleAssignment')await support('SystemUser');
    if(batchEntity==='CertDeliveryConfirmation')await support('Certificate');
    // ExamAttempt processing uses the already-created Exam import map and live
    // student lookup. Do not reload every Exam/CourseUnit row for each 15-row
    // attempt page: that repeated full-table scan caused Cloudflare 524s.
    // Only fetch Course rows referenced by attempts that lack course_title,
    // because historical parent-exam recovery may need the course name.
    if(batchEntity==='ExamAttempt'&&page.results?.length){
      const courseIds=[...new Set(page.results.flatMap(row=>{
        try{
          const attempt=JSON.parse(row.record_json);
          return !clean(attempt.course_title,160)&&clean(attempt.course_id,120)?[clean(attempt.course_id,120)]:[];
        }catch{return [];}
      }))];
      if(courseIds.length){
        const marks=courseIds.map(()=>'?').join(',');
        const q=await env.DB.prepare("SELECT entity_name,source_id,record_json FROM "+archiveTable+" WHERE migration_batch=? AND entity_name='Course' AND source_id IN ("+marks+")").bind(sourceBatch,...courseIds).all();
        stagedRows.push(...(q.results||[]));
      }
    }
    const totalRow=await env.DB.prepare('SELECT COUNT(*) AS count FROM '+archiveTable+' WHERE migration_batch=? AND entity_name=?').bind(sourceBatch,batchEntity).first();
    const total=Number(totalRow?.count||0);
    body._batchMeta={entity:batchEntity,offset,limit,total,processed:(page.results||[]).length,nextOffset:offset+(page.results||[]).length,done:offset+(page.results||[]).length>=total};
  } else if(questionsOnly){
    const offset=Math.max(0,Math.floor(Number(body.offset)||0));
    const limit=Math.min(20,Math.max(1,Math.floor(Number(body.limit)||15)));
    const page=await env.DB.prepare("SELECT entity_name,source_id,record_json FROM "+archiveTable+" WHERE migration_batch=? AND entity_name='ExamQuestion' ORDER BY source_id LIMIT ? OFFSET ?").bind(sourceBatch,limit,offset).all();
    stagedRows.push(...(page.results||[]));
  } else {
    for(let offset=0;;offset+=100){
      const page=await env.DB.prepare("SELECT entity_name,source_id,record_json FROM "+archiveTable+" WHERE migration_batch=? AND entity_name IN ("+entityFilter+") ORDER BY entity_name,source_id LIMIT 100 OFFSET ?").bind(sourceBatch,offset).all();
      const rows=page.results||[];stagedRows.push(...rows);if(rows.length<100)break;
      if(offset>=50000)throw new Error('The saved migration package exceeds the safe 50,000-record processing limit. Split the export into smaller packages.');
    }
  }
  if(archiveReplay&&!stagedRows.length)return new Response(JSON.stringify({error:'This saved package contains no supported records to import.'}),{status:404,headers:{...headers,'Content-Type':'application/json'}});
  const groups={Enrollment:[],AcademicIntake:[],FeeStructure:[],FeePayment:[],AdditionalFee:[],Course:[],CourseUnit:[],Exam:[],ExamQuestion:[],ExamAttempt:[],StudentResult:[],Assignment:[],AssignmentSubmission:[],ExamSettings:[],SystemSettings:[],GradingSystem:[],SystemUser:[],ModuleAssignment:[],MarksApproval:[],MarksConflict:[],StaffApplication:[],AttendanceRecord:[],EClassAttendance:[],ModuleCompletion:[],Graduate:[],Certificate:[],CertDeliveryConfirmation:[],StudentStatusHistory:[],StudentEditRequest:[],NewsPost:[],OnlineForm:[],SupportTicket:[],Campus:[],CertificateTemplate:[],ClassRatingForm:[],CustomerAccount:[],CvDesign:[],DeviceSession:[],DocumentAccessPolicy:[],ICTServiceItem:[],InstitutionDocument:[],InstitutionRules:[],InstitutionSettings:[],PaymentMethod:[],PosCustomerLink:[],QRSession:[],ServiceCategory:[],ServiceOrder:[],StampDesign:[],StudentProject:[],TrustedPlatform:[],Venue:[]};
  for(const row of stagedRows) {
    try{const parsed=JSON.parse(row.record_json);if(!parsed.id&&!parsed._id&&!parsed.uuid&&!parsed.ID&&!parsed.Id)parsed._migration_source_id=row.source_id;groups[row.entity_name].push(parsed);}
    catch{return new Response(JSON.stringify({error:'A staged student or fee record could not be read. The transfer was not completed.'}),{status:500,headers:{...headers,'Content-Type':'application/json'}});}
  }
  // A complete export may contain entities beyond student enrolments. Archive-only packages are valid; the operational student/fee importer simply has nothing to process.
  const c={sourceBatch,sourceStudents:groups.Enrollment.length,attendanceImported:0,attendanceAlreadyPresent:0,attendanceSkipped:0,studentStatusHistoryImported:0,studentStatusHistorySkipped:0,studentEditRequestsImported:0,studentEditRequestsAlreadyPresent:0,studentEditRequestsSkipped:0,newsPostsImported:0,newsPostsAlreadyPresent:0,newsPostsSkipped:0,onlineFormsImported:0,onlineFormsAlreadyPresent:0,onlineFormsSkipped:0,supportTicketsImported:0,supportTicketsAlreadyPresent:0,supportTicketsSkipped:0,legacyRecordsImported:0,legacyRecordsAlreadyPresent:0,legacyRecordsSkipped:0,moduleCompletionsImported:0,moduleCompletionsAlreadyPresent:0,moduleCompletionsSkipped:0,graduatesImported:0,graduatesAlreadyPresent:0,graduatesSkipped:0,certificatesImported:0,certificatesAlreadyPresent:0,certificatesSkipped:0,certificateDeliveriesLinked:0,academicIntakesImported:0,academicIntakesAlreadyPresent:0,academicIntakesSkipped:0,accountsCreated:0,existingAccountsLinked:0,enrollmentsCreated:0,enrollmentsAlreadyPresent:0,admissionNumbersUpdated:0,admissionNumberConflicts:0,skippedStudents:0,passwordSetupRequired:0,feeStructuresImported:0,feeStructuresSkipped:0,feePaymentsImported:0,additionalFeesImported:0,additionalFeesSkipped:0,openingBalanceEntries:0,archivedCoursesCreated:0,modulesImported:0,modulesAlreadyPresent:0,modulesSkipped:0,moduleAssignmentsImported:0,moduleAssignmentsAlreadyPresent:0,moduleAssignmentsSkipped:0,examsImported:0,examsAlreadyPresent:0,examsSkipped:0,examsRecoveredFromAttempts:0,legacyQuestionsRecovered:0,questionsImported:0,questionsAlreadyPresent:0,questionsSkipped:0,assignmentsImported:0,assignmentsAlreadyPresent:0,assignmentsSkipped:0,assignmentSubmissionsImported:0,assignmentSubmissionsAlreadyPresent:0,assignmentSubmissionsSkipped:0,examAttemptsImported:0,examAttemptsAlreadyPresent:0,examAttemptsSkipped:0,examApprovalsImported:0,studentResultsImported:0,studentResultsAlreadyPresent:0,studentResultsRestored:0,studentResultsSkipped:0,marksConflictsImported:0,marksConflictsAlreadyPresent:0,marksConflictsSkipped:0,staffApplicationsImported:0,staffApplicationsAlreadyPresent:0,staffApplicationsSkipped:0,systemUsersImported:0,systemUsersAlreadyPresent:0,systemUsersSkipped:0,staffPasswordSetupRequired:0,warnings:[]};
  try {
    if(questionsOnly){
      if(!batchMode)for(const question of groups.ExamQuestion)await migrationGuard('ExamQuestion '+sourceRecordId(question),()=>importExamQuestion(env.DB,question,tokenRow.created_by,c),c);
      const offset=Math.max(0,Math.floor(Number(body.offset)||0));
      const limit=Math.min(30,Math.max(1,Math.floor(Number(body.limit)||25)));
      const nextOffset=offset+stagedRows.length;
      const totalRow=await env.DB.prepare("SELECT COUNT(*) AS count FROM "+archiveTable+" WHERE migration_batch=? AND entity_name='ExamQuestion'").bind(sourceBatch).first();
      const total=Number(totalRow?.count||0);
      const done=nextOffset>=total;
      if(done&&body.finalize===true&&!deferTokenUse){
        await env.DB.prepare('UPDATE base44_migration_tokens SET used_at=CURRENT_TIMESTAMP WHERE token_hash=? AND used_at IS NULL').bind(tokenHash).run();
        try {
          await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)')
            .bind(uuid(),tokenRow.created_by,'base44_exam_question_archive_import_completed','migration',sourceBatch.slice(0,24)).run();
        } catch (auditError) {
          console.warn('Base44 question archive imported, but its optional audit entry could not be written:', String(auditError?.message || auditError));
        }
      }
      return new Response(JSON.stringify({completed:done,questionsOnly:true,sourceBatch,processed:stagedRows.length,nextOffset:done?null:nextOffset,total,questionsImported:c.questionsImported,questionsAlreadyPresent:c.questionsAlreadyPresent,questionsSkipped:c.questionsSkipped,tokenFinalized:done&&body.finalize===true&&!deferTokenUse}),{status:200,headers:{...headers,'Content-Type':'application/json'}});
    }
    if(!batchMode||batchEntity==='FeeStructure')for(const fee of groups.FeeStructure)await migrationGuard('FeeStructure '+sourceRecordId(fee),()=>importFeeStructure(env.DB,fee,c),c);
    const sourceCourses=new Map(groups.Course.map(x=>[sourceRecordId(x),x]));
    const sourceModules=new Map(groups.CourseUnit.map(x=>[sourceRecordId(x),x]));
    const imported=[];
    if(!batchMode||batchEntity==='AcademicIntake')await migrationGuard('AcademicIntake batch',()=>importAcademicIntakes(env.DB,groups.AcademicIntake,c),c);
    if(!batchMode||batchEntity==='AttendanceRecord')for(const record of groups.AttendanceRecord)await migrationGuard('AttendanceRecord '+sourceRecordId(record),()=>importAttendanceRecord(env.DB,record,'AttendanceRecord',tokenRow.created_by,c,sourceCourses,sourceModules),c);
    if(!batchMode||batchEntity==='EClassAttendance')for(const record of groups.EClassAttendance)await migrationGuard('EClassAttendance '+sourceRecordId(record),()=>importAttendanceRecord(env.DB,record,'EClassAttendance',tokenRow.created_by,c,sourceCourses,sourceModules),c);
    if(!batchMode||batchEntity==='ModuleCompletion')for(const record of groups.ModuleCompletion)await migrationGuard('ModuleCompletion '+sourceRecordId(record),()=>importModuleCompletion(env.DB,record,tokenRow.created_by,c,sourceCourses,sourceModules),c);
    if(!batchMode||batchEntity==='Graduate')for(const record of groups.Graduate)await migrationGuard('Graduate '+sourceRecordId(record),()=>importGraduate(env.DB,record,tokenRow.created_by,c),c);
    if(!batchMode||batchEntity==='Certificate')for(const record of groups.Certificate)await migrationGuard('Certificate '+sourceRecordId(record),()=>importCertificate(env.DB,record,tokenRow.created_by,c),c);
    if(!batchMode||batchEntity==='CertDeliveryConfirmation')for(const record of groups.CertDeliveryConfirmation)await migrationGuard('CertDeliveryConfirmation '+sourceRecordId(record),()=>importCertificateDelivery(env.DB,record,groups.Certificate,c),c);
    if(!batchMode||batchEntity==='StudentStatusHistory')for(const record of groups.StudentStatusHistory)await migrationGuard('StudentStatusHistory '+sourceRecordId(record),()=>importStudentStatusHistory(env.DB,record,tokenRow.created_by,c),c);
    if(!batchMode||batchEntity==='StudentEditRequest')for(const record of groups.StudentEditRequest)await migrationGuard('StudentEditRequest '+sourceRecordId(record),()=>importStudentEditRequest(env.DB,record,tokenRow.created_by,c),c);
    if(!batchMode||batchEntity==='NewsPost')for(const record of groups.NewsPost)await migrationGuard('NewsPost '+sourceRecordId(record),()=>importNewsPost(env.DB,record,tokenRow.created_by,c),c);
    if(!batchMode||batchEntity==='OnlineForm')for(const record of groups.OnlineForm)await migrationGuard('OnlineForm '+sourceRecordId(record),()=>importOnlineForm(env.DB,record,tokenRow.created_by,c),c);
    if(!batchMode||batchEntity==='SupportTicket')for(const record of groups.SupportTicket)await migrationGuard('SupportTicket '+sourceRecordId(record),()=>importSupportTicket(env.DB,record,tokenRow.created_by,c),c);
    const nativeEntities=new Set(['AcademicIntake','AdditionalFee','Assignment','AssignmentSubmission','AttendanceRecord','CertDeliveryConfirmation','Certificate','Course','CourseUnit','EClassAttendance','Enrollment','Exam','ExamAttempt','ExamQuestion','ExamSettings','FeePayment','FeeStructure','GradingSystem','Graduate','MarksApproval','MarksConflict','ModuleAssignment','ModuleCompletion','NewsPost','OnlineForm','StaffApplication','StudentEditRequest','StudentResult','StudentStatusHistory','SupportTicket','SystemSettings','SystemUser']);
    if(batchMode&&!nativeEntities.has(batchEntity))for(const record of groups[batchEntity]||[])await migrationGuard(batchEntity+' '+sourceRecordId(record),()=>importLegacyWorkspaceRecord(env.DB,record,batchEntity,tokenRow.created_by,c),c);
    if(!batchMode)for(const [entity,records] of Object.entries(groups))if(!nativeEntities.has(entity))for(const record of records||[])await migrationGuard(entity+' '+sourceRecordId(record),()=>importLegacyWorkspaceRecord(env.DB,record,entity,tokenRow.created_by,c),c);
    if(!batchMode||batchEntity==='Enrollment')for(const student of groups.Enrollment){const item=await migrationGuard('Enrollment '+sourceRecordId(student),()=>importStudent(env.DB,student,tokenRow.created_by,c),c);if(item&&!academicOnly)imported.push(item);}
    if(!batchMode||batchEntity==='ExamSettings')await migrationGuard('ExamSettings',()=>importExamSettings(env.DB,groups.ExamSettings),c);
    if(!batchMode||batchEntity==='SystemSettings')await migrationGuard('marks category weights',()=>importMarksWeights(env.DB,groups.SystemSettings),c);
    if(!batchMode||batchEntity==='SystemSettings')await migrationGuard('report-card settings',()=>importReportCardSettings(env.DB,groups.SystemSettings),c);
    if(!batchMode||batchEntity==='GradingSystem')await migrationGuard('grading settings',()=>importGradingSystem(env.DB,groups.GradingSystem),c);
    if(!batchMode||batchEntity==='CourseUnit')for(const module of groups.CourseUnit)await migrationGuard('CourseUnit '+sourceRecordId(module),()=>importCourseModule(env.DB,module,tokenRow.created_by,c,sourceCourses),c);
    if(!batchMode||batchEntity==='SystemUser')await migrationGuard('SystemUser records',()=>importSystemUsers(env.DB,groups.SystemUser,tokenRow.created_by,c),c);
    if(!batchMode||batchEntity==='ModuleAssignment')for(const assignment of groups.ModuleAssignment)await migrationGuard('ModuleAssignment '+sourceRecordId(assignment),()=>importModuleAssignment(env.DB,assignment,tokenRow.created_by,c,groups.SystemUser),c);
    if(!batchMode||batchEntity==='Exam')for(const exam of groups.Exam)await migrationGuard('Exam '+sourceRecordId(exam),()=>importExam(env.DB,exam,tokenRow.created_by,c,sourceCourses,sourceModules),c);
    // Recover legacy exam shells from attempt metadata when Base44 no longer has the parent Exam row.
    // This preserves historical attempts and their questions without publishing a new live paper.
    if(!batchMode||batchEntity==='ExamAttempt')for(const attempt of groups.ExamAttempt)await migrationGuard('ExamAttempt student identity '+sourceRecordId(attempt),()=>importDerivedStudent(env.DB,attempt,'ExamAttempt',tokenRow.created_by,c),c);
    if(!batchMode||batchEntity==='StudentResult')for(const result of groups.StudentResult)await migrationGuard('StudentResult student identity '+sourceRecordId(result),()=>importDerivedStudent(env.DB,result,'StudentResult',tokenRow.created_by,c),c);
    if(!batchMode||batchEntity==='ExamAttempt')for(const attempt of groups.ExamAttempt)await migrationGuard('ExamAttempt parent '+sourceRecordId(attempt),()=>ensureExamForAttempt(env.DB,attempt,tokenRow.created_by,c,sourceCourses,sourceModules,groups.ExamQuestion),c);
    for(const question of groups.ExamQuestion)await importExamQuestion(env.DB,question,tokenRow.created_by,c);
    if(!batchMode||batchEntity==='Assignment')for(const assignment of groups.Assignment)await migrationGuard('Assignment '+sourceRecordId(assignment),()=>importAssignment(env.DB,assignment,tokenRow.created_by,c,sourceCourses,sourceModules),c);
    if(!batchMode||batchEntity==='AssignmentSubmission')for(const submission of groups.AssignmentSubmission)await migrationGuard('AssignmentSubmission '+sourceRecordId(submission),()=>importAssignmentSubmission(env.DB,submission,tokenRow.created_by,c),c);
    if(!batchMode||batchEntity==='ExamAttempt')for(const attempt of groups.ExamAttempt)await migrationGuard('ExamAttempt '+sourceRecordId(attempt),()=>importExamAttempt(env.DB,attempt,tokenRow.created_by,c),c);
    if(!batchMode||batchEntity==='MarksConflict')for(const conflict of groups.MarksConflict)await migrationGuard('MarksConflict '+sourceRecordId(conflict),()=>importMarksConflict(env.DB,conflict,tokenRow.created_by,c,sourceCourses,sourceModules),c);
    if(!batchMode||batchEntity==='StudentResult')groups.StudentResult.sort((a,b)=>Date.parse(clean(a.updated_date||a.created_date,40)||'1970-01-01')-Date.parse(clean(b.updated_date||b.created_date,40)||'1970-01-01'));
    if(!batchMode||batchEntity==='StudentResult')for(const result of groups.StudentResult)await migrationGuard('StudentResult '+sourceRecordId(result),()=>importStudentResult(env.DB,result,tokenRow.created_by,c,sourceCourses,sourceModules),c);
    if(!batchMode||batchEntity==='StaffApplication')for(const application of groups.StaffApplication)await migrationGuard('StaffApplication '+sourceRecordId(application),()=>importStaffApplication(env.DB,application,tokenRow.created_by,c),c);
    if(!batchMode||batchEntity==='Enrollment')for(const fee of groups.AdditionalFee) {
      try {
      const sourceId=sourceRecordId(fee);
      const sourceEnrollmentId=clean(fee.enrollment_id,120);
      const mapping=await env.DB.prepare("SELECT destination_id,user_id FROM base44_student_import_map WHERE entity_name='Enrollment' AND source_id=?").bind(sourceEnrollmentId).first();
      const amount=Math.round(num(fee.amount));
      if(!sourceId||!mapping||amount<=0||clean(fee.status,40).toLowerCase()==='deactivated') { c.additionalFeesSkipped++; continue; }
      const itemName='Additional fee - '+(clean(fee.reason||fee.description,80)||'Other');
      await env.DB.prepare("INSERT OR IGNORE INTO enrollment_fee_items(id,enrollment_id,fee_item_id,item_name,amount,due_stage,created_at) VALUES(?,?,NULL,? ,?,'anytime',?)")
        .bind('b44addfee-'+sourceId.slice(-24),mapping.destination_id,itemName,amount,clean(fee.issued_date||fee.created_date,40)||new Date().toISOString()).run();
      await env.DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('AdditionalFee',?,?,?) ON CONFLICT(entity_name,source_id) DO UPDATE SET destination_id=excluded.destination_id,user_id=excluded.user_id,imported_at=CURRENT_TIMESTAMP")
        .bind(sourceId,'b44addfee-'+sourceId.slice(-24),mapping.user_id).run();
      c.additionalFeesImported++;

      } catch(cause) { c.warnings.push('AdditionalFee '+sourceRecordId(fee)+' was retained in the archive after an import error: '+String(cause?.message||cause)); }
    }
    // A learner may have several course enrolments. Keep one account and derive its overall status from all of them.
    if(!batchMode||batchEntity==='Enrollment') { const lifecycleByEmail=new Map();
    for(const student of groups.Enrollment) {
      const email=clean(student.student_email||student.email,254).toLowerCase();
      if(!email)continue;
      const st=clean(student.status||student.current_status,40).toLowerCase();
      const current=lifecycleByEmail.get(email)||{hasActive:false,hasSuspended:false,hasGraduate:false,hasDismissed:false};
      if(st==='active')current.hasActive=true;
      if(st==='suspended'||st==='deferred')current.hasSuspended=true;
      if(st==='graduated'||st==='completed')current.hasGraduate=true;
      if(st==='dismissed')current.hasDismissed=true;
      lifecycleByEmail.set(email,current);
    }
    for(const [email,state] of lifecycleByEmail) {
      const accountStatus=state.hasActive||state.hasGraduate?'active':'disabled';
      const profileStatus=state.hasActive?'active':state.hasSuspended?'suspended':'archived';
      const account=await env.DB.prepare('SELECT id FROM users WHERE lower(email)=lower(?)').bind(email).first();
      if(account?.id?.startsWith('b44usr-')) {
        await env.DB.prepare('UPDATE users SET status=? WHERE id=?').bind(accountStatus,account.id).run();
        await env.DB.prepare('UPDATE user_profiles SET student_status=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?').bind(profileStatus,account.id).run();
      }
    }
    const paidByEnrollment=new Map();
    for(const payment of groups.FeePayment) {
      try {
      const sourcePaymentId=sourceRecordId(payment);
      const sourceEnrollmentId=clean(payment.enrollment_id,120);
      if(!sourcePaymentId||!sourceEnrollmentId)continue;
      const mapping=await env.DB.prepare("SELECT destination_id,user_id FROM base44_student_import_map WHERE entity_name='Enrollment' AND source_id=?").bind(sourceEnrollmentId).first();
      if(!mapping){c.warnings.push('A fee payment was skipped because its student enrollment was not imported.');continue;}
      const amount=Math.round(num(payment.amount));
      if(amount<=0)continue;
      const st=clean(payment.status,40).toLowerCase();
      const status=st==='verified'||st==='paid'||payment.amount_confirmed===true?'paid':st==='rejected'||st==='failed'?'failed':'pending';
      const paymentId='b44pay-'+sourcePaymentId.slice(-24);
      const existingPayment=await env.DB.prepare('SELECT id FROM payments WHERE id=?').bind(paymentId).first();
      if(existingPayment) {
        await env.DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('FeePayment',?,?,?) ON CONFLICT(entity_name,source_id) DO UPDATE SET destination_id=excluded.destination_id,user_id=excluded.user_id,imported_at=CURRENT_TIMESTAMP")
          .bind(sourcePaymentId,paymentId,mapping.user_id).run();
        continue;
      }
      const mpesaCode=clean(payment.mpesa_code,80);
      if(mpesaCode) {
        const receiptDuplicate=await env.DB.prepare('SELECT id FROM payments WHERE receipt_number=? AND amount=? AND reference_id=? LIMIT 1').bind(mpesaCode,amount,mapping.destination_id).first();
        if(receiptDuplicate) {
          c.warnings.push('Skipped repeated fee receipt '+mpesaCode+' for an existing student payment.');
          await env.DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('FeePayment',?,?,?) ON CONFLICT(entity_name,source_id) DO UPDATE SET destination_id=excluded.destination_id,user_id=excluded.user_id,imported_at=CURRENT_TIMESTAMP")
            .bind(sourcePaymentId,receiptDuplicate.id,mapping.user_id).run();
          continue;
        }
      }
      await env.DB.prepare("INSERT OR IGNORE INTO payments(id,purpose,reference_id,phone,amount,status,receipt_number,internal_receipt_number,display_reference,result_description,transaction_date,created_at,updated_at) VALUES(?,'enrollment',?,?,?,?,?,?,?,?,?,?,?)")
        .bind(paymentId,mapping.destination_id,clean(payment.payment_phone,40)||clean(payment.phone,40)||'Not recorded',amount,status,
          clean(payment.mpesa_code,80)||null,'B44-PAY-'+sourcePaymentId.replace(/[^a-z0-9]/gi,'').slice(-16).toUpperCase(),
          'BASE44-FEE-'+sourcePaymentId.slice(-10).toUpperCase(),
          'Imported student fee payment from Base44 ('+clean(payment.payment_method,40)+').',
          clean(payment.payment_date||payment.created_date,40)||null,
          clean(payment.created_date,40)||new Date().toISOString(),
          clean(payment.updated_date||payment.created_date,40)||new Date().toISOString()).run();
      if(status==='paid')paidByEnrollment.set(sourceEnrollmentId,(paidByEnrollment.get(sourceEnrollmentId)||0)+amount);
      await env.DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('FeePayment',?,?,?) ON CONFLICT(entity_name,source_id) DO UPDATE SET destination_id=excluded.destination_id,user_id=excluded.user_id,imported_at=CURRENT_TIMESTAMP")
        .bind(sourcePaymentId,paymentId,mapping.user_id).run();
      c.feePaymentsImported++;

      } catch(cause) { c.warnings.push('FeePayment '+sourceRecordId(payment)+' was retained in the archive after an import error: '+String(cause?.message||cause)); }
    }
    for(const item of imported) {
      const targetPaid=Math.max(0,Math.round(item.amountPaid));
      const detailPaid=paidByEnrollment.get(item.sourceId)||0;
      const opening=Math.max(0,targetPaid-detailPaid);
      if(opening>0) {
        const openingId='b44open-'+item.sourceId.slice(-24);
        const priorOpening=await env.DB.prepare("SELECT id FROM payments WHERE reference_id=? AND purpose='enrollment' AND amount=? AND result_description LIKE 'Imported cumulative opening balance from Base44%' LIMIT 1").bind(item.enrollmentId,opening).first();
        if(!priorOpening) {
          await env.DB.prepare("INSERT OR IGNORE INTO payments(id,purpose,reference_id,phone,amount,status,internal_receipt_number,display_reference,result_description,created_at,updated_at) VALUES(?,'enrollment',?,?,?,'paid',?,?,?,?,?)")
            .bind(openingId,item.enrollmentId,clean(item.source.student_phone,40)||'Not recorded',opening,
              'B44-OPEN-'+item.sourceId.replace(/[^a-z0-9]/gi,'').slice(-16).toUpperCase(),
              'BASE44-OPENING-'+item.sourceId.slice(-10).toUpperCase(),
              'Imported cumulative opening balance from Base44 Enrollment.amount_paid; individual fee receipts are listed separately.',
              clean(item.source.created_date,40)||new Date().toISOString(),
              clean(item.source.updated_date||item.source.created_date,40)||new Date().toISOString()).run();
          c.openingBalanceEntries++;
        }
      }
      const paid=Math.max(targetPaid,detailPaid);
      const due=Math.max(0,Math.round(item.totalFee));
      const paymentStatus=due>0&&paid>=due?'paid':paid>0?'pending':'unpaid';
      await env.DB.prepare('UPDATE enrollments SET payment_status=? WHERE id=?').bind(paymentStatus,item.enrollmentId).run();
    }
    }
    if(!deferTokenUse)await env.DB.prepare('UPDATE base44_migration_tokens SET used_at=CURRENT_TIMESTAMP WHERE token_hash=? AND used_at IS NULL').bind(tokenHash).run();
    // Audit history is supplementary: a legacy actor reference must never roll back
    // or falsely fail otherwise successful, idempotent archive reconciliation.
    try {
      await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)')
        .bind(uuid(),tokenRow.created_by,academicOnly?'base44_academic_archive_import_completed':'base44_student_and_fee_migration_completed','migration',sourceBatch.slice(0,24)).run();
    } catch (auditError) {
      c.warnings.push('The records were processed, but the optional audit-history entry could not be written: ' + String(auditError?.message || auditError));
    }
    return new Response(JSON.stringify({
      completed:batchMode?body._batchMeta.done:true,batchEntity:batchMode?body._batchMeta.entity:undefined,processed:batchMode?body._batchMeta.processed:undefined,total:batchMode?body._batchMeta.total:undefined,nextOffset:batchMode&&!body._batchMeta.done?body._batchMeta.nextOffset:null,scope:academicOnly?['Enrollment','AcademicIntake','Course','CourseUnit','Exam','ExamQuestion','ExamAttempt','StudentResult','Assignment','AssignmentSubmission','ExamSettings','SystemSettings','GradingSystem','SystemUser','ModuleAssignment','MarksApproval','MarksConflict','StaffApplication'] :['Enrollment','AcademicIntake','FeeStructure','FeePayment','AdditionalFee','Course','CourseUnit','Exam','ExamQuestion','ExamAttempt','StudentResult','Assignment','AssignmentSubmission','ExamSettings','SystemSettings','GradingSystem','SystemUser','ModuleAssignment','MarksApproval','MarksConflict','StaffApplication'],sourceBatch,
      studentEnrollmentsImported:c.sourceStudents-c.skippedStudents,academicIntakesImported:c.academicIntakesImported,academicIntakesAlreadyPresent:c.academicIntakesAlreadyPresent,academicIntakesSkipped:c.academicIntakesSkipped,studentAccountsCreated:c.accountsCreated,existingAccountsLinked:c.existingAccountsLinked,
      enrollmentsCreated:c.enrollmentsCreated,enrollmentsAlreadyPresent:c.enrollmentsAlreadyPresent,admissionNumbersUpdated:c.admissionNumbersUpdated,admissionNumberConflicts:c.admissionNumberConflicts,skippedStudents:c.skippedStudents,
      passwordSetupRequired:c.passwordSetupRequired,feeStructuresImported:c.feeStructuresImported,feeStructuresSkipped:c.feeStructuresSkipped,
      feePaymentsImported:c.feePaymentsImported,additionalFeesImported:c.additionalFeesImported,additionalFeesSkipped:c.additionalFeesSkipped,openingBalanceEntries:c.openingBalanceEntries,archivedCoursesCreated:c.archivedCoursesCreated,examsImported:c.examsImported,examsAlreadyPresent:c.examsAlreadyPresent,examsSkipped:c.examsSkipped,examsRecoveredFromAttempts:c.examsRecoveredFromAttempts,legacyQuestionsRecovered:c.legacyQuestionsRecovered,modulesImported:c.modulesImported,modulesAlreadyPresent:c.modulesAlreadyPresent,modulesSkipped:c.modulesSkipped,moduleAssignmentsImported:c.moduleAssignmentsImported,moduleAssignmentsAlreadyPresent:c.moduleAssignmentsAlreadyPresent,moduleAssignmentsSkipped:c.moduleAssignmentsSkipped,questionsImported:c.questionsImported,questionsAlreadyPresent:c.questionsAlreadyPresent,questionsSkipped:c.questionsSkipped,attendanceImported:c.attendanceImported,attendanceAlreadyPresent:c.attendanceAlreadyPresent,attendanceSkipped:c.attendanceSkipped,moduleCompletionsImported:c.moduleCompletionsImported,moduleCompletionsAlreadyPresent:c.moduleCompletionsAlreadyPresent,moduleCompletionsSkipped:c.moduleCompletionsSkipped,graduatesImported:c.graduatesImported,graduatesAlreadyPresent:c.graduatesAlreadyPresent,graduatesSkipped:c.graduatesSkipped,certificatesImported:c.certificatesImported,certificatesAlreadyPresent:c.certificatesAlreadyPresent,certificatesSkipped:c.certificatesSkipped,certificateDeliveriesLinked:c.certificateDeliveriesLinked,studentStatusHistoryImported:c.studentStatusHistoryImported,studentStatusHistorySkipped:c.studentStatusHistorySkipped,studentEditRequestsImported:c.studentEditRequestsImported,studentEditRequestsAlreadyPresent:c.studentEditRequestsAlreadyPresent,studentEditRequestsSkipped:c.studentEditRequestsSkipped,newsPostsImported:c.newsPostsImported,newsPostsAlreadyPresent:c.newsPostsAlreadyPresent,newsPostsSkipped:c.newsPostsSkipped,onlineFormsImported:c.onlineFormsImported,onlineFormsAlreadyPresent:c.onlineFormsAlreadyPresent,onlineFormsSkipped:c.onlineFormsSkipped,supportTicketsImported:c.supportTicketsImported,supportTicketsAlreadyPresent:c.supportTicketsAlreadyPresent,supportTicketsSkipped:c.supportTicketsSkipped,legacyRecordsImported:c.legacyRecordsImported,legacyRecordsAlreadyPresent:c.legacyRecordsAlreadyPresent,legacyRecordsSkipped:c.legacyRecordsSkipped,assignmentsImported:c.assignmentsImported,assignmentsAlreadyPresent:c.assignmentsAlreadyPresent,assignmentsSkipped:c.assignmentsSkipped,assignmentSubmissionsImported:c.assignmentSubmissionsImported,assignmentSubmissionsAlreadyPresent:c.assignmentSubmissionsAlreadyPresent,assignmentSubmissionsSkipped:c.assignmentSubmissionsSkipped,examAttemptsImported:c.examAttemptsImported,examAttemptsAlreadyPresent:c.examAttemptsAlreadyPresent,examAttemptsSkipped:c.examAttemptsSkipped,examApprovalsImported:c.examApprovalsImported,studentResultsImported:c.studentResultsImported,studentResultsAlreadyPresent:c.studentResultsAlreadyPresent,studentResultsRestored:c.studentResultsRestored,studentResultsSkipped:c.studentResultsSkipped,marksConflictsImported:c.marksConflictsImported,marksConflictsAlreadyPresent:c.marksConflictsAlreadyPresent,marksConflictsSkipped:c.marksConflictsSkipped,staffApplicationsImported:c.staffApplicationsImported,staffApplicationsAlreadyPresent:c.staffApplicationsAlreadyPresent,staffApplicationsSkipped:c.staffApplicationsSkipped,systemUsersImported:c.systemUsersImported,systemUsersAlreadyPresent:c.systemUsersAlreadyPresent,systemUsersSkipped:c.systemUsersSkipped,staffPasswordSetupRequired:c.staffPasswordSetupRequired,stagedRecordsProcessed:stagedRows.length,warnings:c.warnings
    }),{status:200,headers:{...headers,'Content-Type':'application/json'}});
  } catch(cause) {
    console.error('Focused Base44 student/fee migration failed:',String(cause?.message||cause));
    return new Response(JSON.stringify({error:'The student and fee transfer stopped before completion. The token remains available for retry.',detail:String(cause?.message||cause),progress:c}),{status:500,headers:{...headers,'Content-Type':'application/json'}});
  }
}