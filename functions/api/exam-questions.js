import { getSession, requireRole } from '../_shared/auth.js';
import { error,isSameOrigin,json,readJson,safeString,uuid } from '../_shared/http.js';
import { syncModuleResult } from '../_shared/module-marks.js';

const staff=['admin','principal','tutor'];
const admin=['admin','principal'];
function categoryMaximum(type,settings={}){
 const grading=settings.grading||settings||{},kind=String(type||'').toLowerCase();
 const key=({cat:'catOutOf',test:'catOutOf',practical:'practicalOutOf',exam:'finalOutOf'}[kind]||'finalOutOf');
 const fallback=({cat:30,test:30,practical:20,exam:50}[kind]||50);
 const snake=key.replace(/[A-Z]/g,m=>'_'+m.toLowerCase()),value=Number(grading[key]??grading[snake]);
 return Number.isFinite(value)&&value>0?value:fallback;
}

function scaleScore(raw,rawMax,target){return Math.round((Number(raw||0)/(Number(rawMax)>0?Number(rawMax):100))*Number(target)*100)/100;}
function shuffled(items){const result=[...items];for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
function selectExamQuestions(bank,maxPoints,mode='marks',questionCount=10,shuffleOrder=true){
 const pool=shuffled(bank),target=Math.max(1,Math.floor(Number(maxPoints)||100));
 let selected=[];
 if(mode==='count'){
  let total=0;for(const q of pool){const points=Math.max(1,Number(q.points)||1);if(selected.length>=Math.max(1,Math.min(500,Number(questionCount)||10)))break;if(total+points<=target){selected.push(q);total+=points;}}
 }else{
  const reachable=new Uint8Array(target+1),previousSum=new Int32Array(target+1),previousIndex=new Int32Array(target+1);
  previousSum.fill(-1);previousIndex.fill(-1);reachable[0]=1;
  for(let i=0;i<pool.length;i++){const points=Math.max(1,Number(pool[i].points)||1);if(points>target)continue;for(let sum=target;sum>=points;sum--){if(!reachable[sum]&&reachable[sum-points]){reachable[sum]=1;previousSum[sum]=sum-points;previousIndex[sum]=i;}}if(reachable[target])break;}
  let best=target;while(best>0&&!reachable[best])best--;
  while(best>0){const index=previousIndex[best];if(index<0)break;selected.push(pool[index]);best=previousSum[best];}
 }
 if(shuffleOrder)return shuffled(selected);
 return selected.sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0)||String(a.id).localeCompare(String(b.id)));
}
function parseJsonObject(value,fallback={}){try{const parsed=JSON.parse(value||'{}');return parsed&&typeof parsed==='object'?parsed:fallback;}catch{return fallback;}}
function sameAnswer(submitted,expected){if(Array.isArray(submitted)||Array.isArray(expected)){if(!Array.isArray(submitted)||!Array.isArray(expected))return false;return [...submitted].map(String).sort().join('\u0000')===[...expected].map(String).sort().join('\u0000');}return JSON.stringify(submitted)===JSON.stringify(expected);}

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
 const requestUrl=new URL(request.url),assessmentId=safeString(requestUrl.searchParams.get('assessmentId'),80),attemptId=safeString(requestUrl.searchParams.get('attemptId'),80);
 const assessment=await env.DB.prepare('SELECT a.id,a.course_id,a.module_id,a.title,CASE WHEN a.max_points>0 THEN a.max_points ELSE 100 END AS max_points,a.status,a.starts_at,a.due_at,a.duration_minutes,a.max_attempts,a.require_admin_approval,a.allow_result_review,a.shuffle_questions,a.shuffle_options,a.question_selection_mode,a.question_count,c.title AS course_title,m.title AS module_title,NULL AS module_code FROM course_assessments a JOIN courses c ON c.id=a.course_id LEFT JOIN course_modules m ON m.id=a.module_id WHERE a.id=?').bind(assessmentId).first();
 if(!assessment||!(await canAccess(env.DB,user,assessment.course_id)))return error('Assessment not available.',404);
 const paperMaximum=Number(assessment.max_points)>0?Number(assessment.max_points):100,student=user.role==='student';
 if(student&&(assessment.status!=='published'||(assessment.starts_at&&Date.parse(assessment.starts_at)>Date.now())||(assessment.due_at&&Date.parse(assessment.due_at)<Date.now())))return error('This examination is not currently open.',403);
 const bank=(await env.DB.prepare('SELECT id,question_text AS questionText,question_type AS questionType,options_json AS optionsJson,points,sort_order AS sortOrder,explanation,correct_answer_json AS correctAnswerJson FROM course_exam_questions WHERE assessment_id=? AND status=? ORDER BY sort_order,id').bind(assessmentId,'active').all()).results||[];
 let revealAnswers=!student,questions=[],savedAnswers={};
 if(student&&attemptId){
  let activeAttempt=await env.DB.prepare("SELECT id,served_question_ids_json,option_order_json FROM exam_runtime_attempts WHERE id=? AND assessment_id=? AND user_id=? AND status='in_progress'").bind(attemptId,assessmentId,user.id).first();
  if(!activeAttempt)return error('Active examination attempt not found.',404);
  let servedIds=[];try{servedIds=JSON.parse(activeAttempt.served_question_ids_json||'[]')}catch{servedIds=[];}
  let optionOrder=parseJsonObject(activeAttempt.option_order_json,{});
  if(!Array.isArray(servedIds)||!servedIds.length){
   const selected=selectExamQuestions(bank,paperMaximum,assessment.question_selection_mode||'marks',assessment.question_count||10,Boolean(assessment.shuffle_questions));
   if(!selected.length)return error('The question bank cannot produce a paper within the configured maximum marks. Add suitable questions or adjust the exam total.',409);
   servedIds=selected.map(q=>q.id);
   optionOrder={};
   for(const q of selected){let options=[];try{options=JSON.parse(q.optionsJson||'[]')}catch{}optionOrder[q.id]=assessment.shuffle_options===0?options:shuffled(options);}
   await env.DB.prepare('UPDATE exam_runtime_attempts SET served_question_ids_json=?,option_order_json=? WHERE id=?').bind(JSON.stringify(servedIds),JSON.stringify(optionOrder),attemptId).run();
  }
  const servedRows=(await env.DB.prepare('SELECT id,question_text AS questionText,question_type AS questionType,options_json AS optionsJson,points,sort_order AS sortOrder,explanation,correct_answer_json AS correctAnswerJson FROM course_exam_questions WHERE assessment_id=? AND id IN ('+servedIds.map(()=>'?').join(',')+')').bind(assessmentId,...servedIds).all()).results||[];
  const byId=new Map(servedRows.map(q=>[q.id,q]));
  const ordered=servedIds.map(id=>byId.get(id)).filter(Boolean);
  if(ordered.length!==servedIds.length)return error('A question in this saved attempt is no longer available. Contact your tutor or administrator.',409);
  const reviewCount=await env.DB.prepare("SELECT COUNT(*) AS n FROM exam_runtime_attempts WHERE assessment_id=? AND user_id=? AND status IN ('submitted','graded') AND attempt_number>=(SELECT max_attempts FROM course_assessments WHERE id=?)").bind(assessmentId,user.id,assessmentId).first();
  revealAnswers=Boolean(assessment.allow_result_review)&&Number(reviewCount?.n||0)>0;
  questions=ordered.map(q=>{let options=[];try{options=JSON.parse(q.optionsJson||'[]')}catch{}const chosen=Array.isArray(optionOrder[q.id])?optionOrder[q.id]:options;return {id:q.id,questionText:q.questionText,questionType:q.questionType,options:chosen,points:q.points,sortOrder:q.sortOrder,...(revealAnswers?{correctAnswer:q.correctAnswerJson?JSON.parse(q.correctAnswerJson):null,explanation:q.explanation}:{})};});
  const saved=(await env.DB.prepare('SELECT question_id,answer_json FROM exam_runtime_answers WHERE attempt_id=?').bind(attemptId).all()).results||[];
  savedAnswers=Object.fromEntries(saved.map(row=>{let answer=null;try{answer=JSON.parse(row.answer_json||'null')}catch{}return [row.question_id,answer]}));
 }else if(!student){
  questions=bank.map(q=>({id:q.id,questionText:q.questionText,questionType:q.questionType,options:JSON.parse(q.optionsJson||'[]'),points:q.points,sortOrder:q.sortOrder,correctAnswer:q.correctAnswerJson?JSON.parse(q.correctAnswerJson):null,explanation:q.explanation}));
 }
 let attemptAnswers=[];
 if(!student&&attemptId){
  const staffAttempt=await env.DB.prepare('SELECT id,status,attempt_number,started_at,submitted_at,objective_score,total_score,flagged_count FROM exam_runtime_attempts WHERE id=? AND assessment_id=?').bind(attemptId,assessmentId).first();
  if(!staffAttempt)return error('Examination attempt not found.',404);
  const answerRows=(await env.DB.prepare('SELECT a.question_id,a.answer_json,a.points_awarded,a.is_correct,q.question_text,q.question_type,q.points,q.options_json,q.correct_answer_json,q.explanation FROM exam_runtime_answers a JOIN course_exam_questions q ON q.id=a.question_id WHERE a.attempt_id=? ORDER BY q.sort_order,q.id').bind(attemptId).all()).results||[];
  attemptAnswers=answerRows.map(row=>{let answer=null,options=[],correctAnswer=null;try{answer=JSON.parse(row.answer_json||'null')}catch{}try{options=JSON.parse(row.options_json||'[]')}catch{}try{correctAnswer=row.correct_answer_json?JSON.parse(row.correct_answer_json):null}catch{}return {questionId:row.question_id,questionText:row.question_text,questionType:row.question_type,points:Number(row.points||0),answer,pointsAwarded:row.points_awarded,isCorrect:row.is_correct,options,correctAnswer,explanation:row.explanation};});
  const examSettingsRow=await env.DB.prepare("SELECT settings_json FROM exam_institute_settings WHERE id='default'").first().catch(()=>null);
  let securitySettings={};try{securitySettings=JSON.parse(examSettingsRow?.settings_json||'{}')}catch{securitySettings={};}let examSecurity={};try{examSecurity=JSON.parse(assessment.security_settings_json||'{}')}catch{examSecurity={};}securitySettings={...securitySettings,...examSecurity};
  return json({assessment:{id:assessment.id,title:assessment.title,courseTitle:assessment.course_title,moduleTitle:assessment.module_title,moduleCode:assessment.module_code,maxPoints:paperMaximum,durationMinutes:assessment.duration_minutes},questions,questionCount:bank.length,attempt:staffAttempt,attemptAnswers,securitySettings});
 }
 const examSettingsRow=await env.DB.prepare("SELECT settings_json FROM exam_institute_settings WHERE id='default'").first().catch(()=>null);
 let securitySettings={};try{securitySettings=JSON.parse(examSettingsRow?.settings_json||'{}')}catch{securitySettings={};}let examSecurity={};try{examSecurity=JSON.parse(assessment.security_settings_json||'{}')}catch{examSecurity={};}securitySettings={...securitySettings,...examSecurity};
 return json({assessment:{id:assessment.id,title:assessment.title,courseTitle:assessment.course_title,moduleTitle:assessment.module_title,moduleCode:assessment.module_code,maxPoints:paperMaximum,durationMinutes:assessment.duration_minutes,questionSelectionMode:assessment.question_selection_mode||'marks',questionCount:assessment.question_count||10},questions,questionCount:bank.length,...(student?{securitySettings,savedAnswers}: {})});
}
async function handleQuestionPost({request,env}){
 if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
 if(!env.DB)return error('Exam question database is not configured.',503);
 const user=await getSession(request,env);if(!user)return error('Sign in required.',401);
 let body;try{body=await readJson(request,500000);}catch{return error('Invalid question request.');}
 const action=safeString(body.action,32),assessmentId=safeString(body.assessmentId,80);
 const assessment=await env.DB.prepare('SELECT id,course_id,module_id,title,assessment_type,max_points,status,starts_at,due_at,duration_minutes,max_attempts,require_admin_approval,require_full_fee_payment,require_assignment_submission,question_selection_mode,question_count,shuffle_questions,shuffle_options FROM course_assessments WHERE id=?').bind(assessmentId).first();
 if(!assessment||!(await canAccess(env.DB,user,assessment.course_id)))return error('Assessment not found or access denied.',404);
 const paperMaximum=Number(assessment.max_points)>0?Number(assessment.max_points):100;
 if(action==='delete_question'){
  const access=await requireRole(request,env,staff);if(access.response)return access.response;
  const questionId=safeString(body.questionId,80);
  const result=await env.DB.prepare("UPDATE course_exam_questions SET status='archived' WHERE id=? AND assessment_id=? AND status='active'").bind(questionId,assessmentId).run();
  if(!result.meta?.changes)return error('Question not found or already archived.',404);
  return json({deleted:true});
 }
 if(action==='update_question'){
  const access=await requireRole(request,env,staff);if(access.response)return access.response;
  const q=body.question||{},questionId=safeString(body.questionId,80),question=safeString(q.questionText,2000),type=safeString(q.questionType,24);
  if(!question||!['single_choice','multiple_choice','true_false','short_answer','essay'].includes(type))return error('Enter valid question text and type.');
  let options=Array.isArray(q.options)?q.options.slice(0,12).map(x=>safeString(x,300)).filter(Boolean):[];
  const correct=q.correctAnswer??null;
  if(type==='true_false')options=['True','False'];
  if(['single_choice','multiple_choice','true_false'].includes(type)&&(!options.length||correct===null||correct===''))return error('Objective questions need options and a correct answer.');
  if(type==='single_choice'&&!options.includes(String(correct)))return error('Select one of the listed answer options.');
  if(type==='true_false'&&!['True','False'].includes(String(correct)))return error('Select True or False as the correct answer.');
  const points=Number(q.points||1);if(!Number.isInteger(points)||points<1||points>1000)return error('Question marks must be between 1 and 1000.');
  const other=await env.DB.prepare("SELECT COALESCE(SUM(points),0) AS total FROM course_exam_questions WHERE assessment_id=? AND status='active' AND id<>?").bind(assessmentId,questionId).first();
  if(Number(other?.total||0)+points>paperMaximum)return error('Question marks would exceed the paper maximum of '+paperMaximum+'.');
  const saved=await env.DB.prepare("UPDATE course_exam_questions SET question_text=?,question_type=?,options_json=?,correct_answer_json=?,explanation=?,points=? WHERE id=? AND assessment_id=? AND status='active'").bind(question,type,JSON.stringify(options),JSON.stringify(correct),safeString(q.explanation,1500),points,questionId,assessmentId).run();
  if(!saved.meta?.changes)return error('Question not found or already archived.',404);
  return json({updated:true});
 }
 if(action==='delete_all'){
  const access=await requireRole(request,env,staff);if(access.response)return access.response;
  await env.DB.prepare("UPDATE course_exam_questions SET status='archived' WHERE assessment_id=?").bind(assessmentId).run();
  return json({deleted:true});
 }
 if(action==='generate_ai'){
  const access=await requireRole(request,env,staff);if(access.response)return access.response;
  const topic=safeString(body.topic,500),count=Math.max(1,Math.min(20,Number(body.count)||5)),level=safeString(body.level,40)||'medium';
  const questionType=safeString(body.questionType,40)||'multiple_choice',pointsPerQuestion=Number(body.pointsPerQuestion||2),replaceAll=body.replaceAll===true;
  const module=await env.DB.prepare('SELECT m.title,c.title AS course_title FROM course_assessments a LEFT JOIN course_modules m ON m.id=a.module_id JOIN courses c ON c.id=a.course_id WHERE a.id=?').bind(assessmentId).first();
  if(!module?.title)return error('This exam must be linked to a module before AI can set its questions.',409);
  if(!Number.isInteger(pointsPerQuestion)||pointsPerQuestion<1||pointsPerQuestion>1000)return error('Enter valid marks per question.');
  if(!['multiple_choice','single_choice','true_false','short_answer','mixed'].includes(questionType))return error('Choose a supported AI question type.');
  if(pointsPerQuestion*count>paperMaximum)return error('The requested questions exceed the paper maximum of '+paperMaximum+' marks.');
  const existingTotal=await env.DB.prepare('SELECT COALESCE(SUM(points),0) AS total FROM course_exam_questions WHERE assessment_id=? AND status=?').bind(assessmentId,'active').first();
  if(!replaceAll&&Number(existingTotal?.total||0)+pointsPerQuestion*count>paperMaximum)return error('The new questions would exceed the remaining '+(paperMaximum-Number(existingTotal?.total||0))+' marks.');
  if(!topic&& !module.title)return error('Select a module or enter a topic.');
  const settingsRow=await env.DB.prepare("SELECT value FROM system_state WHERE key='admin-configuration'").first().catch(()=>null);
  let aiSettings={};
  try{const saved=JSON.parse(settingsRow?.value||'{}');aiSettings=saved?.['ai-assistant']||{};}catch{/* Safe defaults. */}
  if(aiSettings.aiEnabled===false||aiSettings.aiExamQuestionGeneration===false)return error('AI exam question generation is currently disabled in Admin Settings → Navstar AI.',403);
  if(!env.AI||typeof env.AI.run!=='function')return error('Cloudflare Workers AI is not connected to this deployment. Check the Production AI binding.',503);
  const model='@cf/meta/llama-3.1-8b-instruct-fast';
  const prompt='Create exactly '+count+' original '+level+' assessment questions for the module "'+module.title+'" in the course "'+module.course_title+'". Exam title: "'+assessment.title+'". '+(topic?'Focus specifically on this topic: '+topic+'.':'Cover the full module syllabus and its key learning outcomes.')+' Question type: '+questionType+'. Each question must carry exactly '+pointsPerQuestion+' marks. Return ONLY compact valid JSON with a "questions" array. Each item must contain questionText, questionType (single_choice, multiple_choice, true_false, short_answer, essay), options (four concise strings for choice questions; [] otherwise), correctAnswer (exact option text or an array for multiple choice; null for written answers), points exactly `+pointsPerQuestion+`, and a brief explanation. Include exactly `+count+` questions. No markdown or commentary.';
  let generated;
  try{
   const result=await env.AI.run(model,{
    messages:[
     {role:'system',content:'You are an expert Kenyan educational assessment author. Produce valid JSON only. Questions must be clear, age-appropriate, academically sound, original and aligned to the stated topic and level. Do not invent a curriculum code.'},
     {role:'user',content:prompt}
    ],
    max_tokens:Math.min(3072,Math.max(700,count*140)),
    temperature:0.2,
    response_format:{type:'json_object'}
   });
   let content=result?.choices?.[0]?.message?.content??result?.response??result?.output_text??'';
   if(Array.isArray(content))content=content.map(part=>typeof part?.text==='string'?part.text:'').filter(Boolean).join('\\n');
   content=String(content||'').trim().replace(/^`{3}(?:json)?/i,'').replace(/`{3}$/,'').trim();
   const first=content.indexOf('{'),last=content.lastIndexOf('}');
   if(first<0||last<=first)throw new Error('The AI model did not return a valid JSON question set.');
   const parsed=JSON.parse(content.slice(first,last+1));
   generated=Array.isArray(parsed)?parsed:parsed.questions;
  }catch(e){
   console.error('Cloudflare AI exam question generation failed',e?.name||'Error',safeString(e?.message,240));
   return error(safeString(e?.message,300)||'Cloudflare AI could not generate questions. Please try again.',502);
  }
  if(!Array.isArray(generated)||!generated.length)return error('Cloudflare AI returned no questions. Try adjusting the topic or question count.',502);
  if(generated.length<count)return error('AI returned fewer questions than requested. Please try again.');
  const normalized=generated.slice(0,count).map(q=>({...q,points:pointsPerQuestion}));
  const totalMarks=normalized.reduce((n,q)=>n+Number(q.points||0),0);
  if(totalMarks>paperMaximum)return error('Generated questions exceed the paper maximum.');
  const supportedTypes=['single_choice','multiple_choice','true_false','short_answer','essay'];
  if(normalized.some(q=>!safeString(q.questionText||q.question,2000)||!supportedTypes.includes(safeString(q.questionType||q.type,24))))return error('The AI returned a question with missing text or an unsupported type. Please retry.');
  if(normalized.some(q=>['single_choice','multiple_choice','true_false'].includes(safeString(q.questionType||q.type,24))&&(!Array.isArray(q.options)||!q.options.length||q.correctAnswer===undefined||q.correctAnswer===null||q.correctAnswer==='')))return error('The AI returned an objective question without options or an answer key. Please retry.');
  try{return await importQuestions(env.DB,user,assessmentId,normalized,{replaceAll});}
  catch(e){const reference=uuid();console.error('Navstar AI question persistence failed',reference,e?.name||'Error',safeString(e?.message,500));return json({error:'AI created the questions, but Navstar could not save them to this paper. Your existing questions have been preserved. Please retry.',code:'QUESTION_SAVE_FAILED',reference},500);}
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
   const current=await env.DB.prepare("SELECT COALESCE(SUM(points),0) AS total FROM course_exam_questions WHERE assessment_id=? AND status='active'").bind(assessmentId).first();
   if(Number(current?.total||0)+points>Number(assessment.max_points))return error('Question marks exceed the paper maximum of '+assessment.max_points+'.');

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
  const buildPaper=async()=>{const bank=(await env.DB.prepare("SELECT id,points,sort_order,options_json FROM course_exam_questions WHERE assessment_id=? AND status='active' ORDER BY sort_order,id").bind(assessmentId).all()).results||[];const selected=selectExamQuestions(bank,paperMaximum,assessment.question_selection_mode||'marks',assessment.question_count||10,Boolean(assessment.shuffle_questions));if(!selected.length)throw new Error('The question bank cannot produce a paper within the configured maximum marks. Add suitable questions or adjust the exam total.');const ids=selected.map(q=>q.id),optionOrder={};for(const q of selected){let options=[];try{options=JSON.parse(q.options_json||'[]')}catch{}optionOrder[q.id]=assessment.shuffle_options===0?options:shuffled(options);}return {ids,optionOrder};};
  const active=await env.DB.prepare("SELECT id,expires_at,attempt_number,served_question_ids_json,option_order_json FROM exam_runtime_attempts WHERE assessment_id=? AND user_id=? AND status='in_progress' ORDER BY attempt_number DESC LIMIT 1").bind(assessmentId,user.id).first();
  if(active){if(Date.parse(active.expires_at)<=Date.now()){await env.DB.prepare("UPDATE exam_runtime_attempts SET status='expired' WHERE id=?").bind(active.id).run();return error('Your examination time has expired.',409);}let ids=[];try{ids=JSON.parse(active.served_question_ids_json||'[]')}catch{ids=[];}if(!Array.isArray(ids)||!ids.length){let paper;try{paper=await buildPaper()}catch(e){return error(e instanceof Error?e.message:'Could not prepare this examination.',409);}await env.DB.prepare('UPDATE exam_runtime_attempts SET served_question_ids_json=?,option_order_json=? WHERE id=?').bind(JSON.stringify(paper.ids),JSON.stringify(paper.optionOrder),active.id).run();ids=paper.ids;}return json({started:true,attemptId:active.id,expiresAt:active.expires_at,attemptNumber:active.attempt_number,resumed:true,servedQuestionCount:ids.length});}
  if(assessment.require_full_fee_payment){
   const enrollment=await env.DB.prepare("SELECT e.course_fee,e.amount_paid FROM enrollments e WHERE e.course_id=? AND lower(e.email)=lower(?) AND e.status='accepted'").bind(assessment.course_id,user.email).first();
   if(!enrollment||Number(enrollment.amount_paid||0)<Number(enrollment.course_fee||0))return error('This exam requires 100% fee payment. Please clear your fee balance before starting.',403);
  }
  if(assessment.require_assignment_submission){
   if(!assessment.module_id)return error('This exam has no linked module, so assignment eligibility cannot be verified.',409);
   const assignment=await env.DB.prepare("SELECT a.id FROM course_assignments a JOIN course_assignment_submissions s ON s.assignment_id=a.id WHERE a.module_id=? AND a.status='published' AND s.user_id=? AND s.status IN ('submitted','graded','approved') LIMIT 1").bind(assessment.module_id,user.id).first();
   if(!assignment)return error('Submit the module assignment before starting this exam.',403);
  }

  if(assessment.require_admin_approval){const approval=await env.DB.prepare('SELECT status FROM exam_attempt_approvals WHERE assessment_id=? AND user_id=?').bind(assessmentId,user.id).first();if(approval?.status!=='approved')return error(approval?.status==='rejected'?'Your examination access was declined. Contact the administrator.':'Your examination attempt is awaiting administrator approval.',403);}
  const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM exam_runtime_attempts WHERE assessment_id=? AND user_id=?').bind(assessmentId,user.id).first();
  if(Number(count?.n||0)>=Math.max(1,Number(assessment.max_attempts||1)))return error('You have used all permitted attempts.',409);
  let paper;try{paper=await buildPaper()}catch(e){return error(e instanceof Error?e.message:'Could not prepare this examination.',409);}
  const id=uuid(),started=new Date().toISOString(),expires=new Date(Date.now()+Math.max(1,Number(assessment.duration_minutes||60))*60000).toISOString(),attemptNumber=Number(count?.n||0)+1;
  await env.DB.prepare("INSERT INTO exam_runtime_attempts(id,assessment_id,user_id,attempt_number,started_at,expires_at,last_activity_at,served_question_ids_json,option_order_json) VALUES(?,?,?,?,?,?,?,?,?)").bind(id,assessmentId,user.id,attemptNumber,started,expires,started,JSON.stringify(paper.ids),JSON.stringify(paper.optionOrder)).run();
  return json({started:true,attemptId:id,expiresAt:expires,attemptNumber,servedQuestionCount:paper.ids.length});
 }
 if(action==='grade_runtime_attempt'){
  const access=await requireRole(request,env,staff);if(access.response)return access.response;
  const attemptId=safeString(body.attemptId,80),attempt=await env.DB.prepare("SELECT id,status,objective_score,user_id FROM exam_runtime_attempts WHERE id=? AND assessment_id=?").bind(attemptId,assessmentId).first();
  if(!attempt||!['submitted','expired','graded'].includes(attempt.status))return error('This examination attempt is not ready for marking.',404);
  const answerRows=(await env.DB.prepare('SELECT a.question_id,a.points_awarded,q.question_type,q.points FROM exam_runtime_answers a JOIN course_exam_questions q ON q.id=a.question_id WHERE a.attempt_id=?').bind(attemptId).all()).results||[];
  const manualMarks=Array.isArray(body.manualMarks)?body.manualMarks:[],markMap=new Map(manualMarks.map(item=>[safeString(item.questionId,80),item]));
  let total=0,objective=0;
  for(const row of answerRows){
   let awarded=Number(row.points_awarded||0);
   if(!['single_choice','multiple_choice','true_false'].includes(row.question_type)){
    const supplied=markMap.get(row.question_id);
    if(supplied){awarded=Number(supplied.pointsAwarded);if(!Number.isInteger(awarded)||awarded<0||awarded>Number(row.points))return error('Enter a whole-number mark between 0 and '+row.points+' for every written answer.');await env.DB.prepare('UPDATE exam_runtime_answers SET points_awarded=?,is_correct=NULL,updated_at=CURRENT_TIMESTAMP WHERE attempt_id=? AND question_id=?').bind(awarded,attemptId,row.question_id).run();}
    else if(row.points_awarded===null||row.points_awarded===undefined)return error('Mark every written answer before completing this review.');
   }else objective+=awarded;
   total+=awarded;
  }
  total=Math.max(0,Math.min(paperMaximum,total));
  const feedback=safeString(body.feedback,3000);
  await env.DB.prepare("UPDATE exam_runtime_attempts SET status='graded',objective_score=?,total_score=?,last_activity_at=CURRENT_TIMESTAMP WHERE id=?").bind(objective,total,attemptId).run();
  const configRow=await env.DB.prepare("SELECT value FROM system_state WHERE key='admin-configuration'").first().catch(()=>null);let config={};try{config=JSON.parse(configRow?.value||'{}')}catch{config={};}
  const targetMaximum=categoryMaximum(assessment.assessment_type,config.grading||{}),scaled=scaleScore(total,paperMaximum,targetMaximum);
  await env.DB.prepare("INSERT INTO course_assessment_results(id,assessment_id,user_id,points_awarded,feedback,published_at,marked_by,raw_points_awarded,published_max_points) VALUES(?,?,?,?,?,NULL,?,?,?) ON CONFLICT(assessment_id,user_id) DO UPDATE SET points_awarded=CASE WHEN excluded.raw_points_awarded>=COALESCE(course_assessment_results.raw_points_awarded,-1) THEN excluded.points_awarded ELSE course_assessment_results.points_awarded END,feedback=CASE WHEN excluded.raw_points_awarded>=COALESCE(course_assessment_results.raw_points_awarded,-1) THEN excluded.feedback ELSE course_assessment_results.feedback END,published_at=CASE WHEN excluded.raw_points_awarded>=COALESCE(course_assessment_results.raw_points_awarded,-1) THEN excluded.published_at ELSE course_assessment_results.published_at END,marked_by=CASE WHEN excluded.raw_points_awarded>=COALESCE(course_assessment_results.raw_points_awarded,-1) THEN excluded.marked_by ELSE course_assessment_results.marked_by END,marked_at=CASE WHEN excluded.raw_points_awarded>=COALESCE(course_assessment_results.raw_points_awarded,-1) THEN CURRENT_TIMESTAMP ELSE course_assessment_results.marked_at END,raw_points_awarded=MAX(COALESCE(course_assessment_results.raw_points_awarded,-1),excluded.raw_points_awarded),published_max_points=CASE WHEN excluded.raw_points_awarded>=COALESCE(course_assessment_results.raw_points_awarded,-1) THEN excluded.published_max_points ELSE course_assessment_results.published_max_points END").bind(uuid(),assessmentId,attempt.user_id,scaled,feedback||'Written answers marked by tutor/administrator.',user.id,total,targetMaximum).run();
  if(assessment.module_id)await syncModuleResult(env.DB,attempt.user_id,assessment.module_id,user.id);
  await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),user.id,'exam_runtime_attempt_graded','exam_attempt',attemptId).run().catch(()=>undefined);
  return json({graded:true,attemptId,objectiveScore:objective,rawScore:total,rawMaximum:paperMaximum,publishedScore:scaled,publishedMaximum:targetMaximum,published:false,feedback});
 }
 if(action==='save_runtime_answers'){
  if(user.role!=='student')return error('Only students can save examination answers.',403);
  const attemptId=safeString(body.attemptId,80),attempt=await env.DB.prepare("SELECT id,expires_at,served_question_ids_json FROM exam_runtime_attempts WHERE id=? AND assessment_id=? AND user_id=? AND status='in_progress'").bind(attemptId,assessmentId,user.id).first();
  if(!attempt)return error('Active examination attempt not found.',404);
  if(Date.parse(attempt.expires_at)<=Date.now()){await env.DB.prepare("UPDATE exam_runtime_attempts SET status='expired' WHERE id=?").bind(attemptId).run();return error('Your examination time has expired.',409);}
  let servedIds=[];try{servedIds=JSON.parse(attempt.served_question_ids_json||'[]')}catch{servedIds=[];}const servedSet=new Set(Array.isArray(servedIds)?servedIds:[]);
  const answers=Array.isArray(body.answers)?body.answers.slice(0,500):[];
  const statements=[];
  for(const answer of answers){
   const questionId=safeString(answer.questionId||answer.question_id,80);
   if(!questionId||!servedSet.has(questionId))continue;
   const question=await env.DB.prepare("SELECT id FROM course_exam_questions WHERE id=? AND assessment_id=?").bind(questionId,assessmentId).first();
   if(!question)continue;
   statements.push(env.DB.prepare("INSERT INTO exam_runtime_answers(id,attempt_id,question_id,answer_json,points_awarded,is_correct) VALUES(?,?,?,?,NULL,NULL) ON CONFLICT(attempt_id,question_id) DO UPDATE SET answer_json=excluded.answer_json,updated_at=CURRENT_TIMESTAMP").bind(uuid(),attemptId,questionId,JSON.stringify(answer.answer??answer.selected_answer??null)));
  }
  if(statements.length)await env.DB.batch(statements);
  await env.DB.prepare("UPDATE exam_runtime_attempts SET last_activity_at=CURRENT_TIMESTAMP WHERE id=?").bind(attemptId).run();
  return json({saved:statements.length});
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
  let servedIds=[];try{servedIds=JSON.parse(attempt.served_question_ids_json||'[]')}catch{servedIds=[];}const servedSet=new Set(Array.isArray(servedIds)?servedIds:[]);
  const answers=Array.isArray(body.answers)?body.answers.slice(0,500):[];
  const examSettingsRow=await env.DB.prepare("SELECT settings_json FROM exam_institute_settings WHERE id='default'").first().catch(()=>null);
  let securitySettings={};try{securitySettings=JSON.parse(examSettingsRow?.settings_json||'{}');}catch{securitySettings={};}
  const negativeEnabled=securitySettings.negativeMarking===true,penaliseUnanswered=securitySettings.penaliseUnanswered===true;
  const fixedDeduction=Math.max(0,Math.min(100,Number(securitySettings.negativeMarkValue)||0));
  const deductionMode=String(securitySettings.negativeDeductionMode||'fixed').toLowerCase();
  const deductionPercent=Math.max(0,Math.min(100,Number(securitySettings.negativeDeductionPercent)||25));
  const applyTo=String(securitySettings.negativeApplyTo||'Multiple Choice only').toLowerCase();
  let score=0,autoMarked=true,negativeDeductions=0;
  for(const answer of answers){
   const questionId=safeString(answer.questionId,80);if(!servedSet.has(questionId))continue;
   const q=await env.DB.prepare('SELECT id,question_type,correct_answer_json,points FROM course_exam_questions WHERE id=? AND assessment_id=?').bind(questionId,assessmentId).first();
   if(!q)continue;
   const submitted=answer.answer??answer.selected_answer??null;let correct=null,points=null;
   if(['single_choice','multiple_choice','true_false'].includes(q.question_type)){
    const expected=JSON.parse(q.correct_answer_json||'null');correct=sameAnswer(submitted,expected);points=correct?Number(q.points):0;
    if(correct)score+=points;
    else if(negativeEnabled&&(['all objective questions','multiple choice & true / false'].includes(applyTo)||applyTo==='multiple choice only'&&['single_choice','multiple_choice'].includes(q.question_type))){
      if((submitted!==null&&submitted!=='')||penaliseUnanswered){
        const minus=Math.min(Number(q.points),deductionMode==='percentage'?Number(q.points)*deductionPercent/100:fixedDeduction);
        score-=minus;negativeDeductions+=minus;
      }
    }
   }else autoMarked=false;
   await env.DB.prepare('INSERT INTO exam_runtime_answers(id,attempt_id,question_id,answer_json,points_awarded,is_correct) VALUES(?,?,?,?,?,?) ON CONFLICT(attempt_id,question_id) DO UPDATE SET answer_json=excluded.answer_json,points_awarded=excluded.points_awarded,is_correct=excluded.is_correct,updated_at=CURRENT_TIMESTAMP').bind(uuid(),attempt.id,q.id,JSON.stringify(submitted),points,correct===null?null:(correct?1:0)).run();
  }
  if(securitySettings.neverBelowZero!==false)score=Math.max(0,score);
  const expired=Date.parse(attempt.expires_at)<=Date.now();
  await env.DB.prepare("UPDATE exam_runtime_attempts SET status=?,submitted_at=CURRENT_TIMESTAMP,last_activity_at=CURRENT_TIMESTAMP,objective_score=?,total_score=? WHERE id=?").bind(autoMarked?'graded':'submitted',score,autoMarked?score:null,attempt.id).run();
  let publishedResult=null;
  if(autoMarked){
   const cfg=await env.DB.prepare("SELECT value FROM system_state WHERE key='admin-configuration'").first();let allConfig={};try{allConfig=JSON.parse(cfg?.value||'{}')}catch{}const gradeText=String(allConfig.grading?.gradeScale||'');const parsedBands=gradeText.split(/\r?\n/).map(line=>line.split('|').map(part=>part.trim())).filter(p=>p[0]&&p[2]!==''&&p[3]!==''&&p[2]!=='—'&&p[3]!=='—'&&Number.isFinite(Number(p[2]))&&Number.isFinite(Number(p[3]))).map(p=>({grade:p[0],min:Number(p[2]),max:Number(p[3]),remarks:p.slice(4).join(' | ')}));let settings={publishedMaximum:Number(allConfig.grading?.publishedMaximum)||100,gradingScale:parsedBands.length?parsedBands:[{grade:'A',min:80,max:100,remarks:'Exceptional performance'},{grade:'B+',min:70,max:79,remarks:'Strong technical skills'},{grade:'B',min:60,max:69,remarks:'Competent work'},{grade:'C',min:50,max:59,remarks:'Satisfactory work'},{grade:'D',min:40,max:49,remarks:'Developing'},{grade:'F',min:0,max:39,remarks:'Essential requirements not met'}]};
   const rawMaximum=Number(assessment.max_points)>0?Number(assessment.max_points):100,central=await env.DB.prepare("SELECT value FROM system_state WHERE key='admin-configuration'").first().catch(()=>null);let marksConfig={};try{marksConfig=JSON.parse(central?.value||'{}')}catch{}const targetMaximum=categoryMaximum(assessment.assessment_type,marksConfig.grading||{}),scaled=scaleScore(score,rawMaximum,targetMaximum),visible=settings.publishResultsAutomatically!==false;
   await env.DB.prepare("INSERT INTO course_assessment_results(id,assessment_id,user_id,points_awarded,feedback,published_at,marked_by,raw_points_awarded,published_max_points) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(assessment_id,user_id) DO UPDATE SET points_awarded=CASE WHEN excluded.raw_points_awarded>=COALESCE(course_assessment_results.raw_points_awarded,-1) THEN excluded.points_awarded ELSE course_assessment_results.points_awarded END,feedback=CASE WHEN excluded.raw_points_awarded>=COALESCE(course_assessment_results.raw_points_awarded,-1) THEN excluded.feedback ELSE course_assessment_results.feedback END,published_at=CASE WHEN excluded.raw_points_awarded>=COALESCE(course_assessment_results.raw_points_awarded,-1) THEN excluded.published_at ELSE course_assessment_results.published_at END,marked_by=CASE WHEN excluded.raw_points_awarded>=COALESCE(course_assessment_results.raw_points_awarded,-1) THEN excluded.marked_by ELSE course_assessment_results.marked_by END,marked_at=CASE WHEN excluded.raw_points_awarded>=COALESCE(course_assessment_results.raw_points_awarded,-1) THEN CURRENT_TIMESTAMP ELSE course_assessment_results.marked_at END,raw_points_awarded=MAX(COALESCE(course_assessment_results.raw_points_awarded,-1),excluded.raw_points_awarded),published_max_points=CASE WHEN excluded.raw_points_awarded>=COALESCE(course_assessment_results.raw_points_awarded,-1) THEN excluded.published_max_points ELSE course_assessment_results.published_max_points END").bind(uuid(),assessmentId,user.id,scaled,'Automatically marked from the submitted examination.',visible?new Date().toISOString():null,user.id,score,targetMaximum).run();
   if(assessment.module_id)await syncModuleResult(env.DB,user.id,assessment.module_id,user.id);
   publishedResult={rawScore:score,rawMaximum,publishedScore:scaled,publishedMaximum:targetMaximum,published:visible};
  }
  return json({submitted:true,attemptId:attempt.id,objectiveScore:score,negativeDeductions,autoMarked,manualMarkingRequired:!autoMarked,expired,publishedResult});
 }
 return error('Unsupported examination action.');
}
async function importQuestions(db,user,assessmentId,items,options={}){
 if(!Array.isArray(items)||!items.length||items.length>500)return error('No valid questions to import.');
 const assessment=await db.prepare('SELECT max_points FROM course_assessments WHERE id=?').bind(assessmentId).first();
 if(!assessment)return error('Exam not found.',404);
 const replaceAll=options.replaceAll===true;
 const current=replaceAll?{total:0}:await db.prepare("SELECT COALESCE(SUM(points),0) AS total FROM course_exam_questions WHERE assessment_id=? AND status='active'").bind(assessmentId).first();
 const normalized=[];
 for(let index=0;index<items.length;index++){
  const q=items[index]||{},question=safeString(q.questionText||q.question,2000),type=safeString(q.type||q.questionType,24),options=Array.isArray(q.options)?q.options.slice(0,12).map(x=>safeString(x,300)):[];
  const answer=q.correctAnswer??q.answer??null;
  if(!question||!['single_choice','multiple_choice','true_false','short_answer','essay'].includes(type))return error('Question '+(index+1)+' has invalid text or question type.');
  if(['single_choice','multiple_choice','true_false'].includes(type)&&(!options.length||answer===null||answer===''))return error('Objective question '+(index+1)+' requires options and a correct answer.');
  const points=Number(q.points||1);if(!Number.isInteger(points)||points<1||points>1000)return error('Question '+(index+1)+' has invalid marks.');
  normalized.push({id:uuid(),question,type,options,answer,explanation:safeString(q.explanation,1500),points,sortOrder:Number.isInteger(Number(q.sortOrder))?Number(q.sortOrder):index});
 }
 const incoming=normalized.reduce((sum,q)=>sum+q.points,0);
 const paperMaximum=Number(assessment.max_points)>0?Number(assessment.max_points):100;
 if(!Number.isFinite(incoming)||Number(current?.total||0)+incoming>paperMaximum)return error('Imported questions would exceed the paper maximum of '+paperMaximum+' marks.');
 const statements=[];
 if(replaceAll)statements.push(db.prepare("UPDATE course_exam_questions SET status='archived' WHERE assessment_id=? AND status='active'").bind(assessmentId));
 for(const q of normalized)statements.push(db.prepare('INSERT INTO course_exam_questions(id,assessment_id,question_text,question_type,options_json,correct_answer_json,explanation,points,sort_order,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(q.id,assessmentId,q.question,q.type,JSON.stringify(q.options),q.answer===null?null:JSON.stringify(q.answer),q.explanation,q.points,q.sortOrder,user.id));
 try{await db.batch(statements);}catch(e){console.error('Navstar exam question save failed',e?.name||'Error',safeString(e?.message,700));throw e;}
 return json({imported:normalized.length,replaced:replaceAll});
}
export async function onRequestPost(context){try{return await handleQuestionPost(context);}catch(e){const reference=uuid(),detail=safeString(e?.message,500)||'Unknown server error';console.error('Navstar exam question API failed',JSON.stringify({reference,name:e?.name||'Error',message:detail,stack:safeString(e?.stack,1800)}));const user=await getSession(context.request,context.env).catch(()=>null);return json({error:'Navstar could not complete this question action. Existing saved questions have been left untouched. Please retry and share the reference with Navstar support.',code:'EXAM_QUESTION_API_FAILED',reference,...(user&&admin.includes(user.role)?{detail}: {})},500);}}
