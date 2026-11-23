import { createSession, hashPassword, sha256, verifyPassword } from '../../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, uuid } from '../../_shared/http.js';

const roles = ['student', 'admin', 'tutor', 'admissions', 'principal', 'finance'];

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Authentication service is not configured.', 503);

  let body;
  try { body = await readJson(request, 4096); } catch { return error('Invalid request body.'); }
  const email = safeString(body.email, 254).toLowerCase();
  const password = String(body.password ?? '');
  const requestedRole = safeString(body.role, 24);
  if (!email.includes('@') || password.length < 6 || password.length > 200 || !roles.includes(requestedRole)) {
    return error('Enter a valid email and password for the selected portal.', 400);
  }

  const emailHash = await sha256(email);
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const ipHash = await sha256(ip);
  const attempt = await env.DB.prepare(`
    SELECT COUNT(*) AS count FROM login_attempts
    WHERE email_hash = ? AND ip_hash = ? AND datetime(created_at) > datetime('now', '-15 minutes')
  `).bind(emailHash, ipHash).first();
  if (Number(attempt?.count ?? 0) >= 8) return error('Too many sign-in attempts. Try again later.', 429);

  const user = await env.DB.prepare(`
    SELECT users.id, users.name, users.email, users.role AS base_role,
      CASE WHEN users.role = 'student' THEN 'student'
           ELSE COALESCE(NULLIF(user_profiles.portal_role, ''), users.role)
      END AS role,
      users.password_hash, users.password_salt, users.must_change_password
    FROM users
    LEFT JOIN user_profiles ON user_profiles.user_id = users.id
    WHERE lower(trim(users.email)) = ? AND users.status = 'active'
    LIMIT 1
  `).bind(email).first();

  // Verify credentials before reporting a portal mismatch. Student is the canonical
  // base role, so an outdated profile-role value cannot lock a genuine student out.
  const passwordValid = user && await verifyPassword(password, user.password_salt, user.password_hash);
  if (!passwordValid) {
    await env.DB.prepare('INSERT INTO login_attempts (id, email_hash, ip_hash) VALUES (?, ?, ?)').bind(uuid(), emailHash, ipHash).run();
    return error('The email or password is incorrect. If you recently reset your password, use the new password and the email registered on your Navstar account.', 401);
  }
  if (user.role !== requestedRole) {
    return error(`Your credentials are valid, but this account is registered for the ${user.role} portal. Please select that portal to continue.`, 403);
  }

  await env.DB.prepare('DELETE FROM login_attempts WHERE email_hash = ? AND ip_hash = ?').bind(emailHash, ipHash).run();
  const cookie = await createSession(env, user.id, request);
  return json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, mustChangePassword: Boolean(user.must_change_password) } }, 200, { 'Set-Cookie': cookie });
}