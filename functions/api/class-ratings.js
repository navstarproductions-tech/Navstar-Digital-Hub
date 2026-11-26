import { requireRole } from '../_shared/auth.js';
import { error,isSameOrigin,json,readJson,safeString,uuid } from '../_shared/http.js';

const questionTypes=new Set(['rating','text','longtext','choice']);
function parseItems(value){try{const parsed=JSON.parse(value||'[]');return Array.isArray(parsed)?parsed:[]}catch{return []}}
function parseObject(value){try{const parsed=JSON.parse(value||'{}');return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{}}catch{return {}}}
function cleanFormItems(items){
 if(!Array.isArray(items)||items.length<1||items.length>50)throw new Error('A rating form must contain between 1 and 50 questions.');
 const ids=new Set();
 return items.map((item,index)=>{
  const id=safeString(item?.id,80)||'q'+(index+1),label=safeString(item?.label,240),type=safeString(item?.type,20);
  if(!label)throw new Error('Every question needs a label.');
  if(!questionTypes.has(type))throw new Error('Choose a supported question type for every question.');
  if(ids.has(id))throw new Error('Question identifiers must be unique.');ids.add(id);
  const question={id,label,type,required:item?.required!==false};
  if(type==='choice'){
   const options=Array.isArray(item.options)?[...new Set(item.options.map(value=>safeString(value,120)).filter(Boolean))]:[];
   if(options.length<2||options.length>20)throw new Error('Choice questions need between 2 and 20 options.');
   question.options=options;
  }
  return question;
 });
}
function cleanAnswers(items,answers){
 if(!answers||typeof answers!=='object'||Array.isArray(answers))throw new Error('Submit your answers for the rating form.');
 const clean={};let ratingTotal=0,ratingCount=0;const textFeedback=[];
 for(const item of items){
  const value=answers[item.id];
  const empty=value===undefined||value===null||String(value).trim()==='';
  if(item.required&&empty)throw new Error('Please answer: '+item.label);
  if(empty){clean[item.id]='';continue;}
  if(item.type==='rating'){
   const rating=Number(value);if(!Number.isInteger(rating)||rating<1||rating>5)throw new Error('Choose a rating from 1 to 5 for: '+item.label);
   clean[item.id]=rating;ratingTotal+=rating;ratingCount++;
  }else if(item.type==='choice'){
   if(!item.options?.includes(String(value)))throw new Error('Choose one of the listed options for: '+item.label);
   clean[item.id]=String(value);
  }else{
   const text=String(value).trim();if(text.length>3000)throw new Error('Keep each written response below 3,000 characters.');
   clean[item.id]=text;if(text)textFeedback.push(item.label+': '+text);
  }
 }
 return {answers:clean,overallRating:ratingCount?ratingTotal/ratingCount:0,feedback:textFeedback.join('\n\n').slice(0,3000)};
}

export async function onRequestGet({request,env}){
 if(!env.DB)return error('Class rating records are not configured.',503);
 const access=await requireRole(request,env,['student','admin','principal']);if(access.response)return access.response;
 if(access.user.role==='student'){
  const [courses,ratings,formRow]=await Promise.all([
   env.DB.prepare(`SELECT DISTINCT c.id,c.title FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE lower(e.email)=lower(?) AND e.status='accepted' ORDER BY c.title`).bind(access.user.email).all(),
   env.DB.prepare(`SELECT r.id,r.course_id AS courseId,r.module_id AS moduleId,r.rating,r.feedback,r.created_at AS createdAt,r.updated_at AS updatedAt FROM course_class_ratings r WHERE r.user_id=? ORDER BY r.updated_at DESC`).bind(access.user.id).all(),
   env.DB.prepare("SELECT id,title,description,items_json,status,created_at AS createdAt,updated_at AS updatedAt FROM class_rating_forms WHERE status='active' ORDER BY updated_at DESC LIMIT 1").first().catch(()=>null)
  ]);
  const form=formRow?{...formRow,items:parseItems(formRow.items_json)}:null;
  const responses=form?await env.DB.prepare('SELECT id,form_id AS formId,course_id AS courseId,answers_json,overall_rating AS overallRating,created_at AS createdAt,updated_at AS updatedAt FROM class_rating_responses WHERE form_id=? AND user_id=? ORDER BY updated_at DESC').bind(form.id,access.user.id).all():{results:[]};
  return json({courses:courses.results||[],ratings:ratings.results||[],form,responses:(responses.results||[]).map(item=>({...item,answers:parseObject(item.answers_json)}))});
 }
 const [rows,forms,responses]=await Promise.all([
  env.DB.prepare(`SELECT r.id,r.course_id AS courseId,r.module_id AS moduleId,r.rating,r.feedback,r.created_at AS createdAt,r.updated_at AS updatedAt,u.name AS studentName,u.email,c.title AS courseTitle,m.title AS moduleTitle FROM course_class_ratings r JOIN users u ON u.id=r.user_id JOIN courses c ON c.id=r.course_id LEFT JOIN course_modules m ON m.id=r.module_id ORDER BY r.updated_at DESC LIMIT 1000`).all(),
  env.DB.prepare('SELECT id,title,description,items_json,status,created_at AS createdAt,updated_at AS updatedAt FROM class_rating_forms ORDER BY updated_at DESC LIMIT 100').all(),
  env.DB.prepare(`SELECT r.id,r.form_id AS formId,r.course_id AS courseId,r.answers_json,r.overall_rating AS overallRating,r.created_at AS createdAt,r.updated_at AS updatedAt,u.name AS studentName,u.email,c.title AS courseTitle,f.title AS formTitle FROM class_rating_responses r JOIN users u ON u.id=r.user_id JOIN courses c ON c.id=r.course_id JOIN class_rating_forms f ON f.id=r.form_id ORDER BY r.updated_at DESC LIMIT 2000`).all()
 ]);
 return json({ratings:rows.results||[],forms:(forms.results||[]).map(form=>({...form,items:parseItems(form.items_json)})),responses:(responses.results||[]).map(response=>({...response,answers:parseObject(response.answers_json)}))});
}

export async function onRequestPost({request,env}){
 if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
 if(!env.DB)return error('Class rating records are not configured.',503);
 let body;try{body=await readJson(request,24000)}catch{return error('Invalid class rating request.',400)}
 if(body.action==='save_form'){
  const access=await requireRole(request,env,['admin','principal']);if(access.response)return access.response;
  const id=safeString(body.id,80)||uuid(),title=safeString(body.title,120),description=safeString(body.description,1000);
  if(!title)return error('Enter a title for the rating form.',400);
  let items;try{items=cleanFormItems(body.items)}catch(cause){return error(cause.message||'The rating form is invalid.',400)}
  const status=body.isActive===true?'active':'draft';
  const statements=[];
  if(status==='active')statements.push(env.DB.prepare("UPDATE class_rating_forms SET status='draft',updated_at=CURRENT_TIMESTAMP WHERE status='active' AND id<>?").bind(id));
  statements.push(env.DB.prepare(`INSERT INTO class_rating_forms(id,title,description,items_json,status,created_by,updated_by)
   VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,items_json=excluded.items_json,status=excluded.status,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
   .bind(id,title,description,JSON.stringify(items),status,access.user.id,access.user.id));
  statements.push(env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),access.user.id,'class_rating_form_saved','class_rating_form',id));
  await env.DB.batch(statements);
  return json({saved:true,form:{id,title,description,status,items}});
 }
 if(body.action==='submit_form'){
  const access=await requireRole(request,env,['student']);if(access.response)return access.response;
  const formId=safeString(body.formId,80),courseId=safeString(body.courseId,80);
  const form=await env.DB.prepare("SELECT id,title,items_json FROM class_rating_forms WHERE id=? AND status='active'").bind(formId).first();
  if(!form)return error('This class-rating form is no longer active.',409);
  const enrollment=await env.DB.prepare("SELECT id FROM enrollments WHERE lower(email)=lower(?) AND course_id=? AND status='accepted' LIMIT 1").bind(access.user.email,courseId).first();
  if(!enrollment)return error('You can submit feedback only for a course in which your enrolment is accepted.',403);
  let cleaned;try{cleaned=cleanAnswers(parseItems(form.items_json),body.answers)}catch(cause){return error(cause.message||'Please review your answers.',400)}
  const id=uuid();
  const statements=[env.DB.prepare(`INSERT INTO class_rating_responses(id,form_id,user_id,course_id,answers_json,overall_rating,feedback)
   VALUES(?,?,?,?,?,?,?) ON CONFLICT(form_id,user_id,course_id) DO UPDATE SET answers_json=excluded.answers_json,overall_rating=excluded.overall_rating,feedback=excluded.feedback,updated_at=CURRENT_TIMESTAMP`)
   .bind(id,formId,access.user.id,courseId,JSON.stringify(cleaned.answers),cleaned.overallRating,cleaned.feedback)];
  if(cleaned.overallRating>0){
   const legacyId=uuid(),legacyRating=Math.max(1,Math.min(5,Math.round(cleaned.overallRating)));
   statements.push(env.DB.prepare(`INSERT INTO course_class_ratings(id,user_id,course_id,module_id,rating,feedback) VALUES(?,?,?,NULL,?,?)
    ON CONFLICT(user_id,course_id) DO UPDATE SET rating=excluded.rating,feedback=excluded.feedback,updated_at=CURRENT_TIMESTAMP`)
    .bind(legacyId,access.user.id,courseId,legacyRating,cleaned.feedback));
  }
  statements.push(env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),access.user.id,'class_rating_form_submitted','class_rating_response',formId+':'+courseId));
  await env.DB.batch(statements);
  return json({saved:true,overallRating:cleaned.overallRating});
 }
 const access=await requireRole(request,env,['student']);if(access.response)return access.response;
 const courseId=safeString(body.courseId,80),moduleId=safeString(body.moduleId,80),rating=Number(body.rating),feedback=safeString(body.feedback,3000);
 if(!courseId||!Number.isInteger(rating)||rating<1||rating>5)return error('Select a course and a rating from one to five stars.',400);
 const enrollment=await env.DB.prepare("SELECT id FROM enrollments WHERE lower(email)=lower(?) AND course_id=? AND status='accepted' LIMIT 1").bind(access.user.email,courseId).first();
 if(!enrollment)return error('You can rate only a course in which your enrolment is accepted.',403);
 if(moduleId){const module=await env.DB.prepare('SELECT id FROM course_modules WHERE id=? AND course_id=?').bind(moduleId,courseId).first();if(!module)return error('The selected module does not belong to this course.',400);}
 await env.DB.prepare(`INSERT INTO course_class_ratings(id,user_id,course_id,module_id,rating,feedback) VALUES(?,?,?,?,?,?)
  ON CONFLICT(user_id,course_id) DO UPDATE SET module_id=excluded.module_id,rating=excluded.rating,feedback=excluded.feedback,updated_at=CURRENT_TIMESTAMP`)
  .bind(uuid(),access.user.id,courseId,moduleId||null,rating,feedback).run();
 return json({saved:true});
}
