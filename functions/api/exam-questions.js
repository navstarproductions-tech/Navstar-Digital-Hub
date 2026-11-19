import { getSession, requireRole } from '../_shared/auth.js';
import { error,isSameOrigin,json,readJson,safeString,uuid } from '../_shared/http.js';

const staff=['admin','principal','tutor'];
const admin=['admin','principal'];
function parseCsv(text){
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'&&quoted&&text[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=!quoted;else if(c===','&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}else cell+=c;}
 row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows;
}
async function canAccess(db,user,courseId){
 if(admin.includes(user.role))return true;
 if(user.role==='tutor'){
  return Boolean(await db.prepare('SELECT id FROM course_tutor_assignments WHERE course_id=? AND tutor_user_id=? UNION SELECT a.id FROM module_tutor_assignments a JOIN course_modules m ON m.id=a.module_id WHERE m.course_id=? AND a.tutor_user_id=? LIMIT 1').bind(courseId,user.id,courseId,user.id).first());
 }
 if(user.role==='student')return Boolean(await db.prepare("SELECT id FROM enrollments WHERE course_id=? AND lower(email)=lower(?) AND status='accepted'").bind(courseId,user.email).first());
 return false;
}
export async function onRequestGet({request,env}){
 if(!env.DB)return error('Exam question database is not configured.',503);
 const user=await getSession(request,env);if(!user)return error('Sign in required.',401);
 const assessmentId=safeString(new URL(request.url).searchParams.get('assessmentId'),80);
 const assessment=await env.DB.prepare('SELECT id,course_id,status,starts_at,due_at,duration_minutes FROM course_assessments WHERE id=?').bind(assessmentId).first();
 if(!assessment||!(await canAccess(env.DB,user,assessment.course_id)))return error('Assessment not available.',404);
 const student=user.role==='student';
 if(student&&(assessment.status!=='published'||(assessment.starts_at&&Date.parse(assessment.starts_at)>Date.now())||(assessment.due_at&&Date.parse(assessment.due_at)<Date.now())))return error('This examination is not currently open.',403);
 const rows=await env.DB.prepare('SELECT id,question_text AS questionText,question_type AS questionType,options_json AS optionsJson,points,sort_order AS sortOrder,explanation,correct_answer_json AS correctAnswerJson FROM course_exam_questions WHERE assessment_id=? AND status=? ORDER BY sort_order,id').bind(assessmentId,'active').all();
 const questions=(rows.results||[]).map(q=>({id:q.id,questionText:q.questionText,questionType:q.questionType,options:JSON.parse(q.optionsJson||'[]'),points:q.points,sortOrder:q.sortOrder,...(!student?{correctAnswer:q.correctAnswerJson?JSON.parse(q.correctAnswerJson):null,explanation:q.explanation}:{})}));
 return json({assessment:{id:assessment.id,durationMinutes:assessment.duration_minutes},questions});
}
export async function onRequestPost({request,env}){
 if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
 if(!env.DB)return error('Exam question database is not configured.',503);
 const user=await getSession(request,env);if(!user)return error('Sign in required.',401);
 let body;try{body=await readJson(request,500000);}catch{return error('Invalid question request.');}
 const action=safeString(body.action,32),assessmentId=safeString(body.assessmentId,80);
 const assessment=await env.DB.prepare('SELECT id,course_id,status,starts_at,due_at,duration_minutes,max_attempts FROM course_assessments WHERE id=?').bind(assessmentId).first();
 if(!assessment||!(await canAccess(env.DB,user,assessment.course_id)))return error('Assessment not found or access denied.',404);
 if(action==='generate_ai'){
  const access=await requireRole(request,env,staff);if(access.response)return access.response;
  const topic=safeString(body.topic,500),count=Math.max(1,Math.min(20,Number(body.count)||5)),level=safeString(body.level,40)||'intermediate';
  if(!topic)return error('Enter a topic or learning outcome for question generation.');
  if(!env.AI||typeof env.AI.run!=='function')return error('AI question generation is not connected yet. Bind a Cloudflare Workers AI service to this Pages project before using this feature.',503);
  const prompt='Create '+count+' original '+level+' assessment questions about: '+topic+'. Return ONLY valid JSON array. Each object: questionText, questionType (single_choice, multiple_choice, true_false, short_answer, essay), options (array of strings), correctAnswer (string or array), points (integer), explanation. Include answer keys. Use objective types where suitable and include at least one short answer if count permits. No markdown.';
  let generated;
  try{
   const result=await env.AI.run('@cf/meta/llama-3.1-8b-instruct',{messages:[{role:'system',content:'You are an educational assessment author. Output valid JSON only.'},{role:'user',content:prompt}]});
   const raw=String(result?.response||result?.output||'').replace(/^\s*```(?:json)?/i,'').replace(/```\s*$/,'').trim();
   generated=JSON.parse(raw);
  }catch(e){console.error('Workers AI question generation failed',String(e));return error('The AI provider did not return valid questions. Try again or edit the prompt.',502);}
  if(!Array.isArray(generated)||!generated.length)return error('The AI provider returned no questions.',502);
  const result=await importQuestions(env.DB,user,assessmentId,generated.slice(0,count));
  return result;
 }
 if(action==='save_question'||action==='import_questions'){
  const access=await requireRole(request,env,staff);if(access.response)return access.response;
  const items=action==='save_question'?[body.question||body]:Array.isArray(body.questions)?body.questions:[];
  if(!items.length||items.length>500)return error('Provide between 1 and 500 questions.');
  for(const q of items){
   const question=safeString(q.questionText||q.question,2000),type=safeString(q.questionType||q.type,24);
   if(!question||!['single_choice','multiple_choice','true_false','short_answer','essay'].includes(type))return error('Each question needs text and a supported question type.');
   const options=Array.isArray(q.options)?q.options.slice(0,12).map(x=>safeString(x,300)):[];
   const correct=q.correctAnswer??q.answer??null;
   if(['single_choice','multiple_choice','true_false'].includes(type)&&(!options.length||correct===null||correct===''))return error('Objective questions need options and a correct answer.');
   const points=Number(q.points||1);if(!Number.isInteger(points)||points<1||points>1000)return error('Question marks must be between 1 and 1000.');
   await env.DB.prepare('INSERT INTO course_exam_questions(id,assessment_id,question_text,question_type,options_json,correct_answer_json,explanation,points,sort_order,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .bind(uuid(),assessmentId,question,type,JSON.stringify(options),correct===null?null:JSON.stringify(correct),safeString(q.explanation,1500),points,Number.isInteger(Number(q.sortOrder))?Number(q.sortOrder):0,user.id).run();
  }
  return json({saved:items.length});
 }
 if(action==='import_csv'){
  const access=await requireRole(request,env,staff);if(access.response)return access.response;
  const raw=String(body.csv||'');if(raw.length>400000)return error('CSV file is too large.');
  const rows=parseCsv(raw);if(rows.length<2)return error('CSV must include a header and at least one question.');
  const header=rows.shift().map(x=>x.trim().toLowerCase());
  const idx={question:header.indexOf('question'),type:header.indexOf('type'),options:header.indexOf('options'),answer:header.indexOf('answer'),marks:header.indexOf('marks'),explanation:header.indexOf('explanation')};
  if(idx.question<0||idx.type<0||idx.answer<0)return error('CSV headers must include question,type,answer. Optional: options,marks,explanation.');
  const questions=rows.map(r=>({questionText:r[idx.question],type:r[idx.type],options:(r[idx.options]||'').split('|').map(x=>x.trim()).filter(Boolean),answer:r[idx.answer],points:Number(r[idx.marks]||1),explanation:r[idx.explanation]||''}));
  return await importQuestions(env.DB,user,assessmentId,questions);
 }
 if(action==='start_runtime'){
  if(user.role!=='student')return error('Only enrolled students can start an examination.',403);
  if(assessment.status!=='published'||(assessment.starts_at&&Date.parse(assessment.starts_at)>Date.now())||(assessment.due_at&&Date.parse(assessment.due_at)<Date.now()))return error('This examination is not open.',409);
  const active=await env.DB.prepare("SELECT id,expires_at,attempt_number FROM exam_runtime_attempts WHERE assessment_id=? AND user_id=? AND status='in_progress' ORDER BY attempt_number DESC LIMIT 1").bind(assessmentId,user.id).first();
  if(active){if(Date.parse(active.expires_at)<=Date.now()){await env.DB.prepare("UPDATE exam_runtime_attempts SET status='expired' WHERE id=?").bind(active.id).run();return error('Your examination time has expired.',409);}return json({started:true,attemptId:active.id,expiresAt:active.expires_at,attemptNumber:active.attempt_number,resumed:true});}
  const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM exam_runtime_attempts WHERE assessment_id=? AND user_id=?').bind(assessmentId,user.id).first();
  if(Number(count?.n||0)>=Math.max(1,Number(assessment.max_attempts||1)))return error('You have used all permitted attempts.',409);
  const id=uuid(),started=new Date().toISOString(),expires=new Date(Date.now()+Math.max(1,Number(assessment.duration_minutes||60))*60000).toISOString();
  await env.DB.prepare("INSERT INTO exam_runtime_attempts(id,assessment_id,user_id,attempt_number,started_at,expires_at,last_activity_at) VALUES(?,?,?,?,?,?,?)").bind(id,assessmentId,user.id,Number(count?.n||0)+1,started,expires,started).run();
  return json({started:true,attemptId:id,expiresAt:expires,attemptNumber:Number(count?.n||0)+1});
 }
 if(action==='report_violation'){
  if(user.role!=='student')return error('Only students can report an examination event.',403);
  const attemptId=safeString(body.attemptId,80),kind=safeString(body.kind,60);
  const attempt=await env.DB.prepare("SELECT id,expires_at FROM exam_runtime_attempts WHERE id=? AND assessment_id=? AND user_id=? AND status='in_progress'").bind(attemptId,assessmentId,user.id).first();
  if(!attempt)return error('Active examination attempt not found.',404);
  if(Date.parse(attempt.expires_at)<=Date.now()){await env.DB.prepare("UPDATE exam_runtime_attempts SET status='expired' WHERE id=?").bind(attemptId).run();return error('Your examination time has expired.',409);}
  await env.DB.prepare('UPDATE exam_runtime_attempts SET flagged_count=flagged_count+1,last_activity_at=CURRENT_TIMESTAMP WHERE id=?').bind(attemptId).run();
  await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),user.id,'exam_violation_'+kind.slice(0,40),'exam_attempt',attemptId).run();
  return json({recorded:true});
 }
 if(action==='submit_runtime'){
  if(user.role!=='student')return error('Only enrolled students can sit an examination.',403);
  if(assessment.status!=='published'||(assessment.starts_at&&Date.parse(assessment.starts_at)>Date.now())||(assessment.due_at&&Date.parse(assessment.due_at)<Date.now()))return error('This examination is not open.',409);
  const now=Date.now(),attempt=await env.DB.prepare("SELECT * FROM exam_runtime_attempts WHERE assessment_id=? AND user_id=? AND status='in_progress' ORDER BY attempt_number DESC LIMIT 1").bind(assessmentId,user.id).first();
  if(!attempt)return error('Start the examination before submitting answers.',409);
  if(Date.parse(attempt.expires_at)<=now){await env.DB.prepare("UPDATE exam_runtime_attempts SET status='expired' WHERE id=?").bind(attempt.id).run();return error('Your examination time has expired.',409);}
  const answers=Array.isArray(body.answers)?body.answers.slice(0,500):[];
  let score=0,autoMarked=true;
  for(const answer of answers){
   const q=await env.DB.prepare('SELECT id,question_type,correct_answer_json,points FROM course_exam_questions WHERE id=? AND assessment_id=? AND status=?').bind(safeString(answer.questionId,80),assessmentId,'active').first();
   if(!q)continue;
   const submitted=answer.answer??null;let correct=null,points=null;
   if(['single_choice','multiple_choice','true_false'].includes(q.question_type)){
    const expected=JSON.parse(q.correct_answer_json||'null');correct=JSON.stringify(submitted)===JSON.stringify(expected);points=correct?Number(q.points):0;score+=points;
   }else autoMarked=false;
   await env.DB.prepare('INSERT INTO exam_runtime_answers(id,attempt_id,question_id,answer_json,points_awarded,is_correct) VALUES(?,?,?,?,?,?) ON CONFLICT(attempt_id,question_id) DO UPDATE SET answer_json=excluded.answer_json,points_awarded=excluded.points_awarded,is_correct=excluded.is_correct,updated_at=CURRENT_TIMESTAMP').bind(uuid(),attempt.id,q.id,JSON.stringify(submitted),points,correct===null?null:(correct?1:0)).run();
  }
  const expired=Date.parse(attempt.expires_at)<=Date.now();
  await env.DB.prepare("UPDATE exam_runtime_attempts SET status='submitted',submitted_at=CURRENT_TIMESTAMP,last_activity_at=CURRENT_TIMESTAMP,objective_score=?,total_score=? WHERE id=?").bind(score,autoMarked?score:null,attempt.id).run();
  return json({submitted:true,attemptId:attempt.id,objectiveScore:score,autoMarked,manualMarkingRequired:!autoMarked,expired});
 }
 return error('Unsupported examination action.');
}
async function importQuestions(db,user,assessmentId,items){
 if(!items.length||items.length>500)return error('No valid questions to import.');
 for(const q of items){
  const question=safeString(q.questionText||q.question,2000),type=safeString(q.type||q.questionType,24),options=Array.isArray(q.options)?q.options:[];
  if(!question||!['single_choice','multiple_choice','true_false','short_answer','essay'].includes(type))return error('CSV contains an invalid question or type.');
  if(['single_choice','multiple_choice','true_false'].includes(type)&&(!options.length||!q.answer))return error('Objective CSV rows require options and answer.');
  const points=Number(q.points||1);if(!Number.isInteger(points)||points<1||points>1000)return error('Invalid question marks.');
  await db.prepare('INSERT INTO course_exam_questions(id,assessment_id,question_text,question_type,options_json,correct_answer_json,explanation,points,created_by) VALUES(?,?,?,?,?,?,?,?,?)').bind(uuid(),assessmentId,question,type,JSON.stringify(options),JSON.stringify(q.answer),safeString(q.explanation,1500),points,user.id).run();
 }
 return json({imported:items.length});
}
