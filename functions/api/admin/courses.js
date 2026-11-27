import { requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, safeString, uuid } from '../../_shared/http.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('Course database is unavailable.', 503);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;
  const officialIds = ['computer-programming','advanced-programming','web-design','graphic-design','robotics-automation','video-editing','html-css','computer-maintenance','integrated-digital-services','python-programming'];
  const placeholders = officialIds.map(() => '?').join(',');
  const rows = await env.DB.prepare(`SELECT id,title,description,duration,image_url AS image,category,price,status,level,course_code FROM courses WHERE status != 'active' OR id NOT IN (${placeholders}) ORDER BY status,title`).bind(...officialIds).all();
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
  // Fee structures and modules are dependent course data, not reasons to block deletion.
  // Preserve the course only when a learner is actually enrolled or has completed/graduated.
  const learners = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM enrollments
    WHERE course_id = ?
      AND lower(trim(status)) IN ('accepted','active','enrolled','registered','completed','complete','graduated','graduate','candidate')
  `).bind(id).first();
  const learnerCount = Number(learners?.count || 0);
  if (learnerCount > 0) {
    return error('This course cannot be permanently deleted because ' + learnerCount + ' learner enrolment(s) are linked to it. Active, accepted, registered, completed and graduated learners are protected. Remove or transfer the learner enrolments through the academic process first.', 409);
  }
  // Remove non-learner application records (submitted, under-review or rejected) only.
  // Their fee snapshots are application-owned and are removed with those applications.
  await env.DB.prepare(`
    DELETE FROM enrollment_fee_items
    WHERE enrollment_id IN (
      SELECT id FROM enrollments
      WHERE course_id = ?
        AND lower(trim(status)) NOT IN ('accepted','active','enrolled','registered','completed','complete','graduated','graduate','candidate')
    )
  `).bind(id).run();
  await env.DB.prepare(`
    DELETE FROM enrollments
    WHERE course_id = ?
      AND lower(trim(status)) NOT IN ('accepted','active','enrolled','registered','completed','complete','graduated','graduate','candidate')
  `).bind(id).run();
  // Course-owned modules, fee items and dependent learning resources cascade with the course.
  const deleted = await env.DB.prepare("DELETE FROM courses WHERE id = ? AND status != 'active'").bind(id).run();
  if (!deleted.meta?.changes) return error('The archived course could not be deleted. Refresh the list and try again.', 409);
  await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)')
    .bind(uuid(), access.user.id, 'archived_course_permanently_deleted_with_dependents', 'course', id).run();
  return json({ id, deleted: true });
}
