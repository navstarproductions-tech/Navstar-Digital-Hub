import { requireRole } from '../../_shared/auth.js';
import { error,isSameOrigin,json,readJson,safeString,uuid } from '../../_shared/http.js';

const codePrefix=(title)=>String(title||'').toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean).map(x=>x[0]).join('').slice(0,4)||'MOD';
function nextModuleCode(prefix,used){for(let i=1;i<=9999;i++){const code=prefix+String(i).padStart(3,'0');if(!used.has(code))return code;}return null;}
export async function onRequestGet({request,env}){
 if(!env.DB)return error('Course code database is unavailable.',503);
 const access=await requireRole(request,env,['admin','principal']);if(access.response)return access.response;
 const [c,m]=await Promise.all([
  env.DB.prepare("SELECT id,title,course_code,status FROM courses WHERE status = 'active' ORDER BY title").all(),
  env.DB.prepare("SELECT m.id,m.course_id,m.title,m.module_code,m.status,c.title AS course_title,c.course_code FROM course_modules m JOIN courses c ON c.id=m.course_id WHERE c.status = 'active' ORDER BY c.title,m.sort_order,m.title").all()
 ]);
 return json({courses:c.results||[],modules:m.results||[]});
}
export async function onRequestPost({request,env}){
 if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
 if(!env.DB)return error('Course code database is unavailable.',503);
 const access=await requireRole(request,env,['admin','principal']);if(access.response)return access.response;
 let body;try{body=await readJson(request,30000);}catch{return error('Invalid course code request.');}
 const action=safeString(body.action,20);
 const [c,m]=await Promise.all([
  env.DB.prepare("SELECT id,title,course_code,status FROM courses WHERE status = 'active' ORDER BY title").all(),
  env.DB.prepare("SELECT m.id,m.course_id,m.title,m.module_code,m.status,c.title AS course_title,c.course_code FROM course_modules m JOIN courses c ON c.id=m.course_id WHERE c.status = 'active' ORDER BY c.title,m.sort_order,m.title").all()
 ]);
 const courses=c.results||[],modules=m.results||[];
 if(action==='generate'){
  const replaceExisting=body.replaceExisting===true;
  const usedCourse=new Set(replaceExisting?[]:courses.map(x=>String(x.course_code||'').toUpperCase()).filter(Boolean));
  let sequence=1;const courseCodes=[];
  for(const course of courses){if(!replaceExisting&&/^NAV-\d{3}$/.test(String(course.course_code||'').toUpperCase()))continue;while(usedCourse.has('NAV-'+String(sequence).padStart(3,'0')))sequence++;const code='NAV-'+String(sequence++).padStart(3,'0');usedCourse.add(code);courseCodes.push({id:course.id,title:course.title,code});}
  const usedMods=new Set(replaceExisting?[]:modules.map(x=>String(x.module_code||'').toUpperCase()).filter(Boolean)),moduleCodes=[];
  for(const mod of modules){if(!replaceExisting&&/^[A-Z]{1,4}\d{3,4}$/.test(String(mod.module_code||'').toUpperCase()))continue;const prefix=codePrefix(mod.course_title);const code=nextModuleCode(prefix,usedMods);if(!code)continue;usedMods.add(code);moduleCodes.push({id:mod.id,courseId:mod.course_id,title:mod.title,courseTitle:mod.course_title,code});}
  return json({courseCodes,moduleCodes,generatedCourseCount:courseCodes.length,generatedModuleCount:moduleCodes.length,replaceExisting});
 }
 if(action==='save'){
  const cc=Array.isArray(body.courseCodes)?body.courseCodes:[],mc=Array.isArray(body.moduleCodes)?body.moduleCodes:[];
  const courseMap=new Map(courses.map(x=>[x.id,x.course_code||''])),moduleMap=new Map(modules.map(x=>[x.id,x.module_code||'']));
  const proposedCourses=new Map(),proposedModules=new Map();
  for(const x of cc){const id=safeString(x.id,80),code=safeString(x.code,12).toUpperCase();if(!courseMap.has(id)||!/^NAV-\d{3}$/.test(code))return error('Invalid course code or course record.');if([...proposedCourses.values()].includes(code))return error('Duplicate course code '+code+'. Each course code must be unique.');proposedCourses.set(id,code);}
  const updatingCourseIds=new Set(proposedCourses.keys());
  for(const [id,value] of courseMap){if(!updatingCourseIds.has(id)&&value&&[...proposedCourses.values()].includes(String(value).toUpperCase()))return error('Duplicate course code '+value+'. Each course code must be unique.');}
  for(const x of mc){const id=safeString(x.id,80),code=safeString(x.code,12).toUpperCase();if(!moduleMap.has(id)||!/^[A-Z]{1,4}\d{3,4}$/.test(code))return error('Invalid module code or module record.');if([...proposedModules.values()].includes(code))return error('Duplicate module code '+code+'. Each module code must be unique.');proposedModules.set(id,code);}
  const updatingModuleIds=new Set(proposedModules.keys());
  for(const [id,value] of moduleMap){if(!updatingModuleIds.has(id)&&value&&[...proposedModules.values()].includes(String(value).toUpperCase()))return error('Duplicate module code '+value+'. Each module code must be unique.');}
  const statements=[];
  for(const [id,code] of proposedCourses)statements.push(env.DB.prepare('UPDATE courses SET course_code=? WHERE id=?').bind(code,id));
  for(const [id,code] of proposedModules)statements.push(env.DB.prepare('UPDATE course_modules SET module_code=? WHERE id=?').bind(code,id));
  if(statements.length)await env.DB.batch(statements);
  await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),access.user.id,'course_module_codes_saved_or_replaced','course_catalogue','all').run();
  return json({saved:statements.length});
 }
 if(action==='delete_codes'){
  const courseIds=Array.isArray(body.courseIds)?body.courseIds.map(x=>safeString(x,80)).filter(Boolean):[];
  const moduleIds=Array.isArray(body.moduleIds)?body.moduleIds.map(x=>safeString(x,80)).filter(Boolean):[];
  const statements=[
   ...courseIds.map(id=>env.DB.prepare("UPDATE courses SET course_code=NULL WHERE id=?").bind(id)),
   ...moduleIds.map(id=>env.DB.prepare("UPDATE course_modules SET module_code=NULL WHERE id=?").bind(id))
  ];
  if(statements.length)await env.DB.batch(statements);
  await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),access.user.id,'course_module_codes_cleared','course_catalogue','selected').run();
  return json({deleted:statements.length});
 }
 if(action==='publish'){
  const moduleIds=Array.isArray(body.moduleIds)?body.moduleIds.map(x=>safeString(x,80)).filter(Boolean):[];
  if(!moduleIds.length)return error('Select coded modules to publish.');
  const rows=await env.DB.prepare('SELECT id,module_code,status FROM course_modules WHERE id IN ('+moduleIds.map(()=>'?').join(',')+')').bind(...moduleIds).all();
  if((rows.results||[]).some(x=>!x.module_code))return error('Modules must have codes saved before publishing.');
  const q=env.DB.prepare("UPDATE course_modules SET status='published',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status!='published'");
  await env.DB.batch((rows.results||[]).map(x=>q.bind(x.id)));
  await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),access.user.id,'coded_modules_published','course_modules',moduleIds.join(',').slice(0,80)).run();
  return json({published:rows.results?.length||0});
 }
 return error('Unsupported course code action.');
}