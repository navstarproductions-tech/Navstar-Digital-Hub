import { requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, uuid } from '../../_shared/http.js';

const allowedStatuses = ['submitted', 'under_review', 'accepted', 'rejected'];

export async function onRequestPatch(context) {
  const {request,env,params}=context;
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Admissions database is not configured.', 503);
  const access = await requireRole(request, env, ['admin', 'admissions']);
  if (access.response) return access.response;

  let body;
  try { body = await readJson(request, 2048); } catch { return error('Invalid request body.'); }
  const id = safeString(params.id, 80);
  const status = safeString(body.status, 24);
  if (!id || !allowedStatuses.includes(status)) return error('Choose a valid application status.');

  const existing = await env.DB.prepare('SELECT id FROM enrollments WHERE id = ?').bind(id).first();
  if (!existing) return error('Application not found.', 404);

  if(status==='accepted') return error('Use the Admissions confirmation action so the student account, profile, admission number and secure portal setup are created together.',409);

  await env.DB.prepare('UPDATE enrollments SET status = ? WHERE id = ?').bind(status, id).run();
  await env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)')
    .bind(uuid(), access.user.id, 'enrollment_status_updated', 'enrollment', id).run();
  return json({ id, status });
}
