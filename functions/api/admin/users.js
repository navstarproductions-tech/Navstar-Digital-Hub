import { hashPassword, requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, uuid } from '../../_shared/http.js';
import { passwordPolicyError } from '../../_shared/password-policy.js';

const roles = ['student', 'tutor', 'admissions', 'principal', 'admin', 'finance'];
const prefixes = { student: 'ST', tutor: 'TU', admissions: 'AM', principal: 'PR', admin: 'AD', finance: 'FN' };

async function createStaffId(db, role) {
  const prefix = prefixes[role] || 'ST';
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const number = String(crypto.getRandomValues(new Uint32Array(1))[0] % 100000).padStart(5, '0');
    const staffId = `${prefix}${number}`;
    const exists = await db.prepare('SELECT user_id FROM user_profiles WHERE staff_id = ?').bind(staffId).first();
    if (!exists) return staffId;
  }
  throw new Error('Could not generate a unique staff ID. Please try again.');
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('User service is not configured.', 503);
  const access = await requireRole(request, env, ['admin', 'principal']);
  if (access.response) return access.response;
  const users = await env.DB.prepare(`
    SELECT u.id, u.name, u.email, COALESCE(p.portal_role,u.role) AS role, u.status, u.created_at,
      p.staff_id AS staffId, p.national_id AS nationalId, p.phone, p.citizenship, p.country, p.province, p.county,
      p.sub_county AS subCounty, p.constituency, p.ward, p.location, p.sub_location AS subLocation,
      p.department, p.job_title AS jobTitle, p.employment_type AS employmentType, p.joined_on AS joinedOn, p.address
    FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
    ORDER BY u.created_at DESC LIMIT 300
  `).all();
  return json({ users: users.results ?? [] });
}

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('User service is not configured.', 503);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;
  let body;
  try { body = await readJson(request, 8192); } catch { return error('Invalid request body.'); }
  const name = safeString(body.name, 120);
  const email = safeString(body.email, 254).toLowerCase();
  const role = safeString(body.role, 24);
  const password = String(body.password ?? '');
  const confirmPassword = String(body.confirmPassword ?? '');
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !roles.includes(role)) return error('Enter a valid full name, email and portal role.');
  const passwordError = passwordPolicyError(password);
  if (passwordError) return error(passwordError);
  if (password !== confirmPassword) return error('The passwords do not match.');
  const id = uuid();
  const staffId = await createStaffId(env.DB, role);
  const hashed = await hashPassword(password);
  const baseRole = role === 'finance' ? 'admissions' : role;
  try {
    await env.DB.prepare('INSERT INTO users (id, name, email, role, password_hash, password_salt, must_change_password) VALUES (?, ?, ?, ?, ?, ?, 0)')
      .bind(id, name, email, baseRole, hashed.hash, hashed.salt).run();
    await env.DB.prepare(`
      INSERT INTO user_profiles (
        user_id, staff_id, portal_role, national_id, phone, date_of_birth, gender, citizenship, country,
        province, county, sub_county, constituency, ward, location, sub_location,
        department, job_title, employment_type, joined_on, address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, staffId, role, safeString(body.nationalId, 32) || null, safeString(body.phone, 32) || null, safeString(body.dateOfBirth, 10) || null,
      safeString(body.gender, 30) || null, safeString(body.citizenship, 80) || null,
      safeString(body.country, 80) || 'Kenya', safeString(body.province, 100) || null,
      safeString(body.county, 100) || null, safeString(body.subCounty, 100) || null,
      safeString(body.constituency, 100) || null, safeString(body.ward, 100) || null,
      safeString(body.location, 100) || null, safeString(body.subLocation, 100) || null,
      safeString(body.department, 100) || null, safeString(body.jobTitle, 120) || null,
      safeString(body.employmentType, 40) || null, safeString(body.joinedOn, 10) || null,
      safeString(body.address, 240) || null
    ).run();
  } catch (cause) {
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run().catch(() => {});
    if (String(cause?.message || '').toLowerCase().includes('unique')) return error('An account with this email or staff ID already exists.', 409);
    console.error('Account creation failed:', String(cause));
    return error('The account could not be created. Please check the profile details and try again.', 500);
  }
  try { await env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)').bind(uuid(), access.user.id, 'user_created', 'user', id).run(); }
  catch (cause) { console.error('Account audit write failed:', String(cause)); }
  return json({ user: { id, name, email, role, status: 'active', staffId }, staffId }, 201);
}
