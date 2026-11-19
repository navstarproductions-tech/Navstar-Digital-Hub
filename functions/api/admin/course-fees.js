import { requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, uuid } from '../../_shared/http.js';

export async function onRequestGet({request,env}) {
  if (!env.DB) return error('Fee structure database is not configured.',503);
  const access=await requireRole(request,env,['admin','finance','admissions']);
  if(access.response)return access.response;
  const courseId=safeString(new URL(request.url).searchParams.get('courseId'),80);
  if(!courseId)return error('Select a course.');
  const course=await env.DB.prepare('SELECT id,title,price,course_code FROM courses WHERE id=?').bind(courseId).first();
  if(!course)return error('Course not found.',404);
  let rows=await env.DB.prepare('SELECT id,item_name AS itemName,amount,due_stage AS dueStage,required,sort_order AS sortOrder,active FROM course_fee_items WHERE course_id=? AND active=1 ORDER BY sort_order,item_name').bind(courseId).all();
  if(!(rows.results||[]).length){const price=Math.max(0,Number(course.price)||0),admission=Math.min(100,price),tuition=Math.max(0,price-admission);await env.DB.batch([env.DB.prepare('INSERT OR IGNORE INTO course_fee_items(id,course_id,item_name,amount,due_stage,required,sort_order,active) VALUES(?,?,?,?,?,?,?,1)').bind('admission-'+courseId,courseId,'Admission fee',admission,'enrollment',1,1),env.DB.prepare('INSERT OR IGNORE INTO course_fee_items(id,course_id,item_name,amount,due_stage,required,sort_order,active) VALUES(?,?,?,?,?,?,?,1)').bind('tuition-'+courseId,courseId,'Tuition fee',tuition,'before_term',1,2),env.DB.prepare('INSERT OR IGNORE INTO course_fee_items(id,course_id,item_name,amount,due_stage,required,sort_order,active) VALUES(?,?,?,?,?,?,?,1)').bind('registration-'+courseId,courseId,'Registration fee',0,'enrollment',0,3),env.DB.prepare('INSERT OR IGNORE INTO course_fee_items(id,course_id,item_name,amount,due_stage,required,sort_order,active) VALUES(?,?,?,?,?,?,?,1)').bind('examination-'+courseId,courseId,'Examination fee',0,'before_term',0,4),env.DB.prepare('INSERT OR IGNORE INTO course_fee_items(id,course_id,item_name,amount,due_stage,required,sort_order,active) VALUES(?,?,?,?,?,?,?,1)').bind('materials-'+courseId,courseId,'Learning materials',0,'anytime',0,5)]);rows=await env.DB.prepare('SELECT id,item_name AS itemName,amount,due_stage AS dueStage,required,sort_order AS sortOrder,active FROM course_fee_items WHERE course_id=? AND active=1 ORDER BY sort_order,item_name').bind(courseId).all();}
  const legacy=await env.DB.prepare(`
    SELECT COUNT(*) AS total FROM enrollments e
    WHERE e.course_id=? AND e.status IN ('submitted','under_review','accepted')
      AND NOT EXISTS (
        SELECT 1 FROM course_fee_items f
        WHERE f.course_id=e.course_id AND lower(f.item_name)='admission fee'
          AND f.active=1 AND f.required=1 AND f.due_stage='enrollment' AND f.amount>=100
      )
  `).bind(courseId).first();
  return json({course,items:rows.results||[],studentsWithoutAdmissionFee:Number(legacy?.total||0)});
}
export async function onRequestPut({request,env}) {
  if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
  if(!env.DB)return error('Fee structure database is not configured.',503);
  const access=await requireRole(request,env,['admin']);
  if(access.response)return access.response;
  let body;try{body=await readJson(request,16384);}catch{return error('Invalid fee structure request.');}
  const courseId=safeString(body.courseId,80);
  const items=Array.isArray(body.items)?body.items:[];
  if(!courseId||!items.length||items.length>40)return error('Choose a course and provide between 1 and 40 fee items.');
  const course=await env.DB.prepare('SELECT id,price FROM courses WHERE id=?').bind(courseId).first();
  if(!course)return error('Course not found.',404);
  const names=new Set();
  const normalized=[];
  for(const item of items){
    const itemName=safeString(item.itemName,100);
    const amount=Number(item.amount);
    const dueStage=['enrollment','before_term','anytime'].includes(item.dueStage)?item.dueStage:'anytime';
    if(!itemName||!Number.isSafeInteger(amount)||amount<0||amount>1000000)return error('Each fee item needs a name and a whole-shilling amount from KSh 0 to KSh 1,000,000.');
    if(names.has(itemName.toLowerCase()))return error('Fee item names must be unique within a course.');
    names.add(itemName.toLowerCase());
    normalized.push({id:safeString(item.id,80)||uuid(),itemName,amount,dueStage,required:item.required===false?0:1,sortOrder:Number.isSafeInteger(Number(item.sortOrder))?Number(item.sortOrder):normalized.length+1,active:item.active===false?0:1});
  }
  const admission=normalized.find(item=>item.itemName.toLowerCase()==='admission fee'&&item.active===1);
  if(!admission||admission.amount<100||admission.required!==1||admission.dueStage!=='enrollment')return error('Keep an active, required Admission fee of at least KSh 100, due at enrolment. It must be included in the published course fee total.');
  const total=normalized.filter(item=>item.active===1).reduce((sum,item)=>sum+item.amount,0);
  if(total!==Number(course.price))return error('Active fee items must total the published course fee of KSh '+Number(course.price).toLocaleString('en-KE')+'. Adjust the fee items or update the course fee first.');
  const statements=[env.DB.prepare('UPDATE course_fee_items SET active=0,updated_at=CURRENT_TIMESTAMP WHERE course_id=?').bind(courseId),...normalized.map(item=>env.DB.prepare(`
    INSERT INTO course_fee_items(id,course_id,item_name,amount,due_stage,required,sort_order,active)
    VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(course_id,item_name) DO UPDATE SET amount=excluded.amount,due_stage=excluded.due_stage,required=excluded.required,sort_order=excluded.sort_order,active=excluded.active,updated_at=CURRENT_TIMESTAMP
  `).bind(item.id,courseId,item.itemName,item.amount,item.dueStage,item.required,item.sortOrder,item.active))];
  await env.DB.batch(statements);
  // Existing student fee snapshots are immutable; this edit applies to future enrolments only.
  await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)')
    .bind(uuid(),access.user.id,'course_fee_structure_updated','course',courseId).run();
  const rows=await env.DB.prepare('SELECT id,item_name AS itemName,amount,due_stage AS dueStage,required,sort_order AS sortOrder,active FROM course_fee_items WHERE course_id=? AND active=1 ORDER BY sort_order,item_name').bind(courseId).all();
  return json({items:rows.results||[],saved:true});
}
