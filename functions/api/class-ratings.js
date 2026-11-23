import { requireRole } from '../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, uuid } from '../_shared/http.js';

export async function onRequestGet({request,env}){
  if(!env.DB)return error('Class rating records are not configured.',503);
  const url=new URL(request.url);
  const access=await requireRole(request,env,['student','admin','principal']);
  if(access.response)return access.response;
  if(access.user.role==='student'){
    const [courses,ratings]=await Promise.all([
      env.DB.prepare(`SELECT DISTINCT c.id,c.title FROM enrollments e JOIN courses c ON c.id=e.course_id
        WHERE lower(e.email)=lower(?) AND e.status='accepted' ORDER BY c.title`).bind(access.user.email).all(),
      env.DB.prepare(`SELECT r.id,r.course_id AS courseId,r.module_id AS moduleId,r.rating,r.feedback,r.created_at AS createdAt,r.updated_at AS updatedAt
        FROM course_class_ratings r WHERE r.user_id=? ORDER BY r.updated_at DESC`).bind(access.user.id).all()
    ]);
    return json({courses:courses.results||[],ratings:ratings.results||[]});
  }
  const rows=await env.DB.prepare(`SELECT r.id,r.course_id AS courseId,r.module_id AS moduleId,r.rating,r.feedback,
    r.created_at AS createdAt,r.updated_at AS updatedAt,u.name AS studentName,u.email,c.title AS courseTitle,m.title AS moduleTitle
    FROM course_class_ratings r JOIN users u ON u.id=r.user_id JOIN courses c ON c.id=r.course_id
    LEFT JOIN course_modules m ON m.id=r.module_id ORDER BY r.updated_at DESC LIMIT 1000`).all();
  return json({ratings:rows.results||[]});
}

export async function onRequestPost({request,env}){
  if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
  if(!env.DB)return error('Class rating records are not configured.',503);
  const access=await requireRole(request,env,['student']);
  if(access.response)return access.response;
  let body;try{body=await readJson(request,8192)}catch{return error('Invalid class rating request.',400)}
  const courseId=safeString(body.courseId,80),moduleId=safeString(body.moduleId,80),rating=Number(body.rating),feedback=safeString(body.feedback,3000);
  if(!courseId||!Number.isInteger(rating)||rating<1||rating>5)return error('Select a course and a rating from one to five stars.',400);
  const enrollment=await env.DB.prepare(`SELECT id FROM enrollments WHERE lower(email)=lower(?) AND course_id=? AND status='accepted' LIMIT 1`).bind(access.user.email,courseId).first();
  if(!enrollment)return error('You can rate only a course in which your enrolment is accepted.',403);
  if(moduleId){const module=await env.DB.prepare('SELECT id FROM course_modules WHERE id=? AND course_id=?').bind(moduleId,courseId).first();if(!module)return error('The selected module does not belong to this course.',400);}
  const id=uuid();
  await env.DB.prepare(`INSERT INTO course_class_ratings(id,user_id,course_id,module_id,rating,feedback)
    VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,course_id) DO UPDATE SET module_id=excluded.module_id,
    rating=excluded.rating,feedback=excluded.feedback,updated_at=CURRENT_TIMESTAMP`)
    .bind(id,access.user.id,courseId,moduleId||null,rating,feedback).run();
  return json({saved:true});
}
