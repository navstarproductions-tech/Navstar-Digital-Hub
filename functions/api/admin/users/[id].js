import { requireRole } from '../../../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, uuid } from '../../../_shared/http.js';

const roles = ['student', 'tutor', 'admissions', 'principal', 'admin', 'finance'];

export async function onRequestPatch({ request, env, params }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('User service is not configured.', 503);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;
  const id = safeString(params?.id, 80);
  if (!id) return error('User ID is required.');
  let body;
  try { body = await readJson(request, 8192); } catch { return error('Invalid user details.'); }
  const current = await env.DB.prepare('SELECT id, role FROM users WHERE id = ?').bind(id).first();
  if (!current) return error('User account not found.', 404);
  const name = safeString(body.name, 120);
  const role = safeString(body.role, 24);
  if (name.length < 2 || !roles.includes(role)) return error('Enter a valid name and portal role.');
  if (id === access.user.id && role !== 'admin') return error('You cannot remove your own administrator access.');
  const nationalId = safeString(body.nationalId, 32);
  if (nationalId && !/^[A-Za-z0-9/-]{4,32}$/.test(nationalId)) return error('Enter a valid National ID or identity reference.');
  await env.DB.prepare('UPDATE users SET name = ?, role = ? WHERE id = ?').bind(name, role === 'finance' ? 'admissions' : role, id).run();
  await env.DB.prepare(`
    UPDATE user_profiles SET portal_role = ?, national_id = ?, phone = ?, citizenship = ?, country = ?,
      county = ?, sub_county = ?, constituency = ?, ward = ?, department = ?, job_title = ?, employment_type = ?, joined_on = ?,
      updated_at = CURRENT_TIMESTAMP WHERE user_id = ?
  `).bind(role, nationalId || null, safeString(body.phone, 32) || null, safeString(body.citizenship, 80) || null,
    safeString(body.country, 80) || 'Kenya', safeString(body.county, 100) || null,
    safeString(body.subCounty, 100) || null, safeString(body.constituency, 100) || safeString(body.subCounty, 100) || null,
    safeString(body.ward, 100) || null, safeString(body.department, 100) || null,
    safeString(body.jobTitle, 120) || null, safeString(body.employmentType, 40) || null,
    safeString(body.joinedOn, 10) || null, id).run();
  await env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)').bind(uuid(), access.user.id, 'user_profile_admin_updated', 'user', id).run().catch(() => {});
  return json({ updated: true, id });
}
