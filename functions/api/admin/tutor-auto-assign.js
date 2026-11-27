import { requireRole } from '../../_shared/auth.js';
import { error,isSameOrigin,json,readJson,safeString,uuid } from '../../_shared/http.js';
function tokens(value){return new Set(String(value||'').toLowerCase().split(/[,;|\/\n]+/).flatMap(x=>x.trim().split(/[^a-z0-9+#]+/)).filter(x=>x.length>2));}
export async function onRequestGet({request,env}){
 if(!env.DB)return error('Tutor allocation database is not configured.',503);
 const access=await requireRole(request,env,['admin','principal']);if(access.response)return access.response;
 const rows=await env.DB.prepare("SELECT u.id,u.name,u.email,COALESCE(p.subject_specialisations,'') AS specialisations,COALESCE(p.is_teaching,0) AS is_teaching,COALESCE(p.teaching_courses,'[]') AS teaching_courses,COALESCE(p.portal_role,u.role) AS role FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id WHERE COALESCE(p.portal_role,u.role) IN ('tutor','admin','principal') AND u.status='active' ORDER BY u.name").all();
 return json({tutors:rows.results||[]});
}
export async function onRequestPost({request,env}){
 if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
 if(!env.DB)return error('Tutor allocation database is not configured.',503);
 const access=await requireRole(request,env,['admin','principal']);if(access.response)return access.response;
 let body;try{body=await readJson(request,12000);}catch{return error('Invalid tutor allocation request.');}
 const action=safeString(body.action,24);
 if(action==='save_teaching_profile'){
  const staffId=safeString(body.tutorId,80),value=safeString(body.specialisations,1000),isTeaching=body.isTeaching===true?1:0;
  let courseIds=[];if(Array.isArray(body.courseIds))courseIds=[...new Set(body.courseIds.map(x=>safeString(x,80)).filter(Boolean))].slice(0,100);
  const staff=await env.DB.prepare("SELECT u.id FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id WHERE u.id=? AND COALESCE(p.portal_role,u.role) IN ('tutor','admin','principal') AND u.status='active'").bind(staffId).first();
  if(!staff)return error('Active tutor, administrator or principal account not found.',404);
  if(!isTeaching)courseIds=[];
  await env.DB.prepare("UPDATE user_profiles SET subject_specialisations=?,is_teaching=?,teaching_courses=? WHERE user_id=?").bind(value,isTeaching,JSON.stringify(courseIds),staffId).run();
  await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),access.user.id,'staff_teaching_profile_updated','user',staffId).run();
  return json({saved:true,isTeaching,courseIds});
 }
 if(action==='preview'||action==='apply'){
  const [tutorsResult,modulesResult,workResult]=await Promise.all([
   env.DB.prepare("SELECT u.id,u.name,COALESCE(p.subject_specialisations,'') AS specialisations,COALESCE(p.is_teaching,0) AS is_teaching,COALESCE(p.teaching_courses,'[]') AS teaching_courses FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id WHERE COALESCE(p.portal_role,u.role) IN ('tutor','admin','principal') AND u.status='active'").all(),
   env.DB.prepare("SELECT m.id,m.title,m.description,m.course_id,c.title AS course_title FROM course_modules m JOIN courses c ON c.id=m.course_id WHERE m.status!='archived' ORDER BY c.title,m.sort_order").all(),
   env.DB.prepare('SELECT tutor_user_id,COUNT(*) AS n FROM module_tutor_assignments GROUP BY tutor_user_id').all()
  ]);
  const tutors=(tutorsResult.results||[]).filter(t=>Number(t.is_teaching)===1).map(t=>({...t,courseIds:(()=>{try{return JSON.parse(t.teaching_courses||'[]')}catch{return []}})()})).filter(t=>t.courseIds.length>0),allModules=modulesResult.results||[],requestedCourses=Array.isArray(body.courseIds)?[...new Set(body.courseIds.map(x=>safeString(x,80)).filter(Boolean))]:[],modules=requestedCourses.length?allModules.filter(m=>requestedCourses.includes(m.course_id)):[],work=new Map((workResult.results||[]).map(x=>[x.tutor_user_id,Number(x.n)]));
  const suggestions=[];
  for(const module of modules){
   const assigned=await env.DB.prepare('SELECT tutor_user_id FROM module_tutor_assignments WHERE module_id=?').bind(module.id).all();
   if((assigned.results||[]).length)continue;
   const target=tokens(module.title+' '+module.description);
   const candidates=tutors.filter(t=>t.courseIds.includes(module.course_id)).map(t=>{const spec=tokens(t.specialisations);let score=0;for(const token of target)if(spec.has(token))score++;return {id:t.id,name:t.name,score,workload:work.get(t.id)||0};}).filter(x=>x.score>0&&x.workload<12).sort((a,b)=>b.score-a.score||a.workload-b.workload);
   if(!candidates.length)continue;
   if(candidates.length>1&&candidates[0].score===candidates[1].score)continue;
   suggestions.push({moduleId:module.id,moduleTitle:module.title,courseTitle:module.course_title,tutorId:candidates[0].id,tutorName:candidates[0].name,matchScore:candidates[0].score});
  }
  if(action==='preview')return json({suggestions,unmatched:modules.length-suggestions.length,applied:false,courseIds:requestedCourses});
  const confirmed=Array.isArray(body.moduleIds)?new Set(body.moduleIds.map(x=>String(x))):new Set();
  const selected=suggestions.filter(x=>confirmed.has(x.moduleId));
  for(const item of selected)await env.DB.prepare('INSERT OR IGNORE INTO module_tutor_assignments(id,module_id,tutor_user_id,assigned_by) VALUES(?,?,?,?)').bind(uuid(),item.moduleId,item.tutorId,access.user.id).run();
  return json({applied:selected.length,suggestions:selected});
 }
 return error('Unsupported tutor allocation action.');
}
