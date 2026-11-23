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
  if (body.status !== undefined) {
    const status = safeString(body.status, 24).toLowerCase();
    if (!['active','disabled'].includes(status)) return error('Choose Active or Disabled (archived).');
    const target = await env.DB.prepare("SELECT id, role, status FROM users WHERE id = ?").bind(id).first();
    if (!target) return error('User account not found.', 404);
    if (target.role !== 'student') return error('Student status actions can only be applied to student accounts.', 409);
    if (id === access.user.id) return error('You cannot change your own account status.');
    await env.DB.prepare('UPDATE users SET status = ? WHERE id = ?').bind(status, id).run();
    if (status === 'disabled') await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();
    await env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)')
      .bind(uuid(), access.user.id, 'student_status_' + status, 'user', id).run();
    return json({ updated: true, id, status });
  }
  const current = await env.DB.prepare('SELECT id, role FROM users WHERE id = ?').bind(id).first();
  const currentProfile = await env.DB.prepare('SELECT staff_id FROM user_profiles WHERE user_id = ?').bind(id).first();
  if (!current) return error('User account not found.', 404);

  const name = safeString(body.name, 120);
  const role = safeString(body.role, 24);
  const nationalId = safeString(body.nationalId, 32);
  const dateOfBirth = safeString(body.dateOfBirth, 10);
  const joinedOn = safeString(body.joinedOn, 10);
  if (name.length < 2 || !roles.includes(role)) return error('Enter a valid name and portal role.');
  if (id === access.user.id && role !== 'admin') return error('You cannot remove your own administrator access.');
  if (nationalId && !/^[A-Za-z0-9/-]{4,32}$/.test(nationalId)) return error('Enter a valid National ID or identity reference.');
  if (dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return error('Enter a valid date of birth.');
  if (joinedOn && !/^\d{4}-\d{2}-\d{2}$/.test(joinedOn)) return error('Enter a valid date joined.');

  await env.DB.prepare('UPDATE users SET name = ?, role = ? WHERE id = ?').bind(name, role === 'finance' ? 'admissions' : role, id).run();
  let staffId = currentProfile?.staff_id || '';
  if (!staffId) {
    const prefix = { admin: 'AD', principal: 'PR', finance: 'FN', admissions: 'AM', tutor: 'TU', student: 'ST' }[role] || 'ST';
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = prefix + String(10000 + Math.floor(Math.random() * 90000));
      const duplicate = await env.DB.prepare('SELECT user_id FROM user_profiles WHERE staff_id = ?').bind(candidate).first();
      if (!duplicate) { staffId = candidate; break; }
    }
    if (!staffId) return error('A staff ID could not be assigned to this account. Please retry.', 503);
  }
  await env.DB.prepare(`
    INSERT INTO user_profiles (user_id, staff_id, portal_role, national_id, phone, date_of_birth, gender, citizenship, country,
      county, sub_county, constituency, ward, location, sub_location, department, job_title, employment_type, joined_on, address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET portal_role=excluded.portal_role, national_id=excluded.national_id, phone=excluded.phone,
      date_of_birth=excluded.date_of_birth, gender=excluded.gender, citizenship=excluded.citizenship, country=excluded.country,
      county=excluded.county, sub_county=excluded.sub_county, constituency=excluded.constituency, ward=excluded.ward,
      location=excluded.location, sub_location=excluded.sub_location, department=excluded.department, job_title=excluded.job_title,
      employment_type=excluded.employment_type, joined_on=excluded.joined_on, address=excluded.address, updated_at=CURRENT_TIMESTAMP
  `).bind(
    id, staffId, role, nationalId || null, safeString(body.phone, 32) || null, dateOfBirth || null,
    safeString(body.gender, 30) || null, safeString(body.citizenship, 80) || null, 'Kenya',
    safeString(body.county, 100) || null, safeString(body.subCounty, 100) || null,
    safeString(body.constituency, 100) || safeString(body.subCounty, 100) || null,
    safeString(body.ward, 100) || null, safeString(body.location, 100) || null,
    safeString(body.subLocation, 100) || null, safeString(body.department, 100) || null,
    safeString(body.jobTitle, 120) || null, safeString(body.employmentType, 40) || null,
    joinedOn || null, safeString(body.address, 240) || null
  ).run();
  return json({ updated: true, id });
}
