import { requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, uuid } from '../../_shared/http.js';

export async function onRequestPut({ request, env, params }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Course database is not configured.', 503);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;
  let body;
  try { body = await readJson(request, 4096); } catch { return error('Invalid request body.'); }
  const id = safeString(params.id, 80);
  const title = safeString(body.title, 120);
  const description = safeString(body.description, 1000);
  const duration = safeString(body.duration, 80);
  const image = safeString(body.image, 500);
  const category = safeString(body.category, 60) || 'Professional';
  const level = safeString(body.level, 24) || 'Beginner';
  const price = Number(body.price);
  const courseCode = safeString(body.courseCode, 8).toUpperCase();
  if (courseCode && !/^[A-Z]{1,4}\d{3}$/.test(courseCode)) return error('Course code must use letters followed by three digits, for example CP003.');
  if (title.length < 2 || !Number.isSafeInteger(price) || price < 0 || price > 1000000) return error('Valid course title and whole-KSh fee are required.');
  const existing = await env.DB.prepare("SELECT id FROM courses WHERE id = ? AND status = 'active'").bind(id).first();
  if (!existing) return error('Active course not found.', 404);
  await env.DB.prepare('UPDATE courses SET title = ?, description = ?, duration = ?, image_url = ?, category = ?, price = ?, level = ?, course_code = ? WHERE id = ?')
    .bind(title, description, duration, image, category, price, level, courseCode || null, id).run();
  await env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)')
    .bind(uuid(), access.user.id, 'course_updated', 'course', id).run();
  return json({ id, title, description, duration, image, category, price, level, course_code:courseCode || null, status: 'active' });
}

export async function onRequestDelete({ request, env, params }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Course database is not configured.', 503);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;
  const id = safeString(params.id, 80);
  const result = await env.DB.prepare("UPDATE courses SET status = 'archived' WHERE id = ? AND status = 'active'").bind(id).run();
  if (!result.meta?.changes) return error('Active course not found.', 404);
  await env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)')
    .bind(uuid(), access.user.id, 'course_archived', 'course', id).run();
  return json({ id, status: 'archived' });
}