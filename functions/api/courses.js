import { requireRole } from '../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, uuid } from '../_shared/http.js';

const OFFICIAL_COURSE_IDS = ['computer-programming','advanced-programming','web-design','graphic-design','robotics-automation','video-editing','html-css','computer-maintenance','integrated-digital-services','python-programming'];

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ courses: [] });
  const placeholders = OFFICIAL_COURSE_IDS.map(() => '?').join(',');
  const order = OFFICIAL_COURSE_IDS.map((id, index) => `WHEN '${id}' THEN ${index}`).join(' ');
  const rows = await env.DB.prepare(`SELECT id, title, description, duration, image_url AS image, category, price, status, level, course_code FROM courses WHERE status = 'active' AND id IN (${placeholders}) ORDER BY CASE id ${order} END`).bind(...OFFICIAL_COURSE_IDS).all();
  return json({ courses: rows.results ?? [] });
}

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Course database is not configured.', 503);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;
  let body;
  try { body = await readJson(request, 4096); } catch { return error('Invalid request body.'); }
  const title = safeString(body.title, 120);
  const description = safeString(body.description, 1000);
  const duration = safeString(body.duration, 80);
  const image = safeString(body.image, 500);
  const category = safeString(body.category, 60) || 'Professional';
  const level = safeString(body.level, 24) || 'Beginner';
  const price = Number(body.price);
  const courseCode = safeString(body.courseCode, 8).toUpperCase();
  if (courseCode && !/^[A-Z]{1,4}\d{3}$/.test(courseCode)) return error('Course code must use letters followed by three digits, for example CP003.');
  if (title.length < 2 || !Number.isSafeInteger(price) || price < 0 || price > 1000000) return error('Valid course title and fee are required.');
  const id = uuid();
  await env.DB.prepare("INSERT INTO courses (id, title, description, duration, image_url, category, price, status, level, course_code) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)")
    .bind(id, title, description, duration, image, category, price, level, courseCode || null).run();
  await env.DB.prepare("INSERT OR IGNORE INTO course_fee_items(id,course_id,item_name,amount,due_stage,required,sort_order,active) VALUES(?,?,'Admission fee',0,'enrollment',1,1,1)").bind('admission-'+id,id).run();
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO course_fee_items(id,course_id,item_name,amount,due_stage,required,sort_order,active) VALUES(?,?, 'Tuition fee',?,'before_term',1,2,1)").bind('tuition-'+id,id,price),
    env.DB.prepare("INSERT OR IGNORE INTO course_fee_items(id,course_id,item_name,amount,due_stage,required,sort_order,active) VALUES(?,?,'Registration fee',0,'enrollment',0,3,1)").bind('registration-'+id,id),
    env.DB.prepare("INSERT OR IGNORE INTO course_fee_items(id,course_id,item_name,amount,due_stage,required,sort_order,active) VALUES(?,?,'Examination fee',0,'before_term',0,4,1)").bind('examination-'+id,id),
    env.DB.prepare("INSERT OR IGNORE INTO course_fee_items(id,course_id,item_name,amount,due_stage,required,sort_order,active) VALUES(?,?,'Learning materials',0,'anytime',0,5,1)").bind('materials-'+id,id)
  ]);
  await env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)')
    .bind(uuid(), access.user.id, 'course_created', 'course', id).run();
  return json({ id, title, description, duration, image, category, price, level, course_code: courseCode || null, status: 'active' }, 201);
}
