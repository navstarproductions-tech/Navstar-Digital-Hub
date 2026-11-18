import { createSession, sha256 } from '../../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString } from '../../_shared/http.js';

const staffRoles = ['admin', 'tutor', 'admissions', 'principal', 'finance'];
const normalizeStaffId = value => safeString(value, 20).toUpperCase().replace(/[^A-Z0-9]/g, '');
const normalizeNationalId = value => safeString(value, 32).replace(/[^0-9]/g, '');

async function getNationalIdColumn(db) {
  const result = await db.prepare('PRAGMA table_info(user_profiles)').all();
  return (result.results || []).some(column => column.name === 'national_id');
}

async function checkAttempts(db, staffId, ipHash) {
  const staffHash = await sha256('staff:' + staffId);
  const row = await db.prepare(`
    SELECT COUNT(*) AS count FROM login_attempts
    WHERE email_hash = ? AND ip_hash = ? AND datetime(created_at) > datetime('now', '-15 minutes')
  `).bind(staffHash, ipHash).first();
  return { staffHash, count: Number(row?.count || 0) };
}

async function recordAttempt(db, staffHash, ipHash) {
  await db.prepare('INSERT INTO login_attempts (id, email_hash, ip_hash) VALUES (?, ?, ?)')
    .bind(crypto.randomUUID(), staffHash, ipHash).run();
}

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Staff authentication is not configured.', 503);
  let body;
  try { body = await readJson(request, 4096); } catch { return error('Invalid request.'); }

  const action = safeString(body.action, 12);
  const staffId = normalizeStaffId(body.staffId);
  const role = safeString(body.role, 24);
  if (!['lookup', 'verify'].includes(action) || staffId.length < 6 || !staffRoles.includes(role)) {
    return error('Enter a valid Staff ID and select the correct staff portal.', 400);
  }

  const ipHash = await sha256(request.headers.get('CF-Connecting-IP') || 'unknown');
  const attempts = await checkAttempts(env.DB, staffId, ipHash);
  if (attempts.count >= 8) return error('Too many verification attempts. Please wait 15 minutes before trying again.', 429);

  const nationalIdAvailable = await getNationalIdColumn(env.DB);
  if (!nationalIdAvailable) return error('Staff identity verification is not yet enabled. The database identity migration must be applied first.', 503);

  const staff = await env.DB.prepare(`
    SELECT u.id, u.name, u.email, u.status,
      COALESCE(p.portal_role, u.role) AS role, p.staff_id AS staffId,
      p.national_id AS nationalId, p.department, p.job_title AS jobTitle
    FROM user_profiles p JOIN users u ON u.id = p.user_id
    WHERE REPLACE(UPPER(p.staff_id), '-', '') = ? AND u.status = 'active'
    LIMIT 1
  `).bind(staffId).first();

  if (!staff || staff.role !== role) {
    await recordAttempt(env.DB, attempts.staffHash, ipHash);
    return error('We could not match that Staff ID to the selected portal. Check the ID and portal, then try again.', 404);
  }

  if (action === 'lookup') {
    await recordAttempt(env.DB, attempts.staffHash, ipHash);
    return json({
      matched: true,
      staff: {
        name: staff.name,
        staffId: staff.staffId,
        role: staff.role,
        department: staff.department || '',
        jobTitle: staff.jobTitle || '',
      },
    });
  }

  const suppliedNationalId = normalizeNationalId(body.nationalId);
  const savedNationalId = normalizeNationalId(staff.nationalId);
  if (!suppliedNationalId || !savedNationalId || suppliedNationalId !== savedNationalId) {
    await recordAttempt(env.DB, attempts.staffHash, ipHash);
    return error('National ID confirmation did not match the staff record. Please check and try again.', 401);
  }

  await env.DB.prepare('DELETE FROM login_attempts WHERE email_hash = ? AND ip_hash = ?').bind(attempts.staffHash, ipHash).run();
  const cookie = await createSession(env, staff.id);
  return json({
    user: { id: staff.id, name: staff.name, role: staff.role, mustChangePassword: false },
  }, 200, { 'Set-Cookie': cookie });
}
