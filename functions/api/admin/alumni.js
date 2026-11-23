import { requireRole } from '../../_shared/auth.js';
import { error,json } from '../../_shared/http.js';
export async function onRequestGet({request,env}){
 if(!env.DB)return error('Alumni records are not configured.',503);
 const access=await requireRole(request,env,['admin','principal']);if(access.response)return access.response;
 const result=await env.DB.prepare(`
  SELECT g.id,g.user_id AS userId,g.course_id AS courseId,g.status,g.completed_at AS completedAt,
    u.name,u.email,p.phone,p.staff_id AS studentId,c.title AS courseTitle,
    (SELECT e.admission_number FROM enrollments e WHERE e.course_id=g.course_id AND lower(e.email)=lower(u.email) ORDER BY e.created_at DESC LIMIT 1) AS admissionNumber
  FROM student_graduation_records g
  JOIN users u ON u.id=g.user_id
  JOIN courses c ON c.id=g.course_id
  LEFT JOIN user_profiles p ON p.user_id=u.id
  ORDER BY CASE g.status WHEN 'graduated' THEN 0 WHEN 'eligible' THEN 1 WHEN 'candidate' THEN 2 ELSE 3 END,g.completed_at DESC,u.name
 `).all();
 return json({alumni:result.results||[]});
}
