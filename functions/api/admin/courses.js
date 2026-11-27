import { requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, safeString, uuid } from '../../_shared/http.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('Course database is unavailable.', 503);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;
  const rows = await env.DB.prepare("SELECT id,title,description,duration,image_url AS image,category,price,status,level,course_code FROM courses WHERE status != 'active' ORDER BY title").all();
  return json({ courses: rows.results ?? [] });
}

export async function onRequestDelete({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Course database is unavailable.', 503);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;
  let body = {};
  try { body = await request.json(); } catch { /* id is supplied in the URL */ }
  const id = safeString(body.id, 80);
  if (!id) return error('Course ID is required.');
  const course = await env.DB.prepare("SELECT id,status FROM courses WHERE id=?").bind(id).first();
  if (!course) return error('Course not found.', 404);
  if (course.status === 'active') return error('Archive the course before permanently deleting it.', 409);
  const [enrolments, modules, feeItems] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS count FROM enrollments WHERE course_id=?').bind(id).first(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM course_modules WHERE course_id=?').bind(id).first(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM course_fee_items WHERE course_id=?').bind(id).first()
  ]);
  const linked = Number(enrolments?.count || 0) + Number(modules?.count || 0) + Number(feeItems?.count || 0);
  if (linked) return error('This archived course still has linked records (' + Number(enrolments?.count || 0) + ' enrolments, ' + Number(modules?.count || 0) + ' modules, ' + Number(feeItems?.count || 0) + ' fee items). It has been kept safely to protect those records.', 409);
  await env.DB.prepare('DELETE FROM courses WHERE id=? AND status != ?').bind(id, 'active').run();
  await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)')
    .bind(uuid(), access.user.id, 'archived_course_permanently_deleted', 'course', id).run();
  return json({ id, deleted: true });
}
