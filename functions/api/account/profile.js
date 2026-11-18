import { requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, uuid } from '../../_shared/http.js';

const roles = ['student', 'tutor', 'admissions', 'principal', 'admin', 'finance'];

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('Profile service is not configured.', 503);
  const access = await requireRole(request, env, roles);
  if (access.response) return access.response;
  const profile = await env.DB.prepare(`
    SELECT u.id, u.name, u.email, COALESCE(p.portal_role, u.role) AS role, u.created_at,
      p.staff_id AS staffId, p.national_id AS nationalId, p.phone, p.date_of_birth AS dateOfBirth,
      p.gender, p.citizenship, p.country, p.province, p.county, p.sub_county AS subCounty,
      p.constituency, p.ward, p.location, p.sub_location AS subLocation, p.department,
      p.job_title AS jobTitle, p.employment_type AS employmentType, p.joined_on AS joinedOn,
      p.profile_photo_url AS profilePhotoUrl
    FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id WHERE u.id = ?
  `).bind(access.user.id).first();
  if (!profile) return error('Profile not found.', 404);
  return json({ profile });
}

export async function onRequestPatch({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Profile service is not configured.', 503);
  const access = await requireRole(request, env, roles);
  if (access.response) return access.response;
  let body;
  try { body = await readJson(request, 8192); } catch { return error('Invalid profile details.'); }
  const name = safeString(body.name, 120);
  const nationalId = safeString(body.nationalId, 32);
  const phone = safeString(body.phone, 32);
  const dateOfBirth = safeString(body.dateOfBirth, 10);
  const gender = safeString(body.gender, 30);
  const citizenship = safeString(body.citizenship, 80);
  const country = safeString(body.country, 80) || 'Kenya';
  const province = safeString(body.province, 100);
  const county = safeString(body.county, 100);
  const subCounty = safeString(body.subCounty, 100);
  const constituency = safeString(body.constituency, 100);
  const ward = safeString(body.ward, 100);
  const location = safeString(body.location, 100);
  const subLocation = safeString(body.subLocation, 100);
  const department = safeString(body.department, 100);
  const jobTitle = safeString(body.jobTitle, 120);
  const employmentType = safeString(body.employmentType, 40);
  const joinedOn = safeString(body.joinedOn, 10);
  if (name.length < 2) return error('Enter your full name.');
  if (dateOfBirth && !/^\\d{4}-\\d{2}-\\d{2}$/.test(dateOfBirth)) return error('Enter a valid date of birth.');
  if (nationalId && !/^[A-Za-z0-9/-]{4,32}$/.test(nationalId)) return error('Enter a valid National ID or identity reference.');
  await env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, access.user.id).run();
  await env.DB.prepare(`
    UPDATE user_profiles SET national_id = ?, phone = ?, date_of_birth = ?, gender = ?, citizenship = ?,
      country = ?, province = ?, county = ?, sub_county = ?, constituency = ?, ward = ?, location = ?,
      sub_location = ?, department = ?, job_title = ?, employment_type = ?, joined_on = ?,
      updated_at = CURRENT_TIMESTAMP WHERE user_id = ?
  `).bind(nationalId || null, phone || null, dateOfBirth || null, gender || null, citizenship || null,
    country, province || null, county || null, subCounty || null, constituency || null, ward || null,
    location || null, subLocation || null, department || null, jobTitle || null, employmentType || null,
    joinedOn || null, access.user.id).run();
  await env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)').bind(uuid(), access.user.id, 'profile_updated', 'user', access.user.id).run().catch(() => {});
  return onRequestGet({ request, env });
}
