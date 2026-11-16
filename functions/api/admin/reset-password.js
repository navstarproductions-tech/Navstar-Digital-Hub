import { hashPassword } from '../../_shared/auth.js';
import { constantTimeEqual, error, isSameOrigin, json, readJson, safeString, uuid } from '../../_shared/http.js';
import { rateLimited } from '../../_shared/rate-limit.js';

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB || !env.ADMIN_RESET_TOKEN) return error('Admin password reset is not configured. Add ADMIN_RESET_TOKEN as a Cloudflare secret.', 503);
  if (await rateLimited(env.DB, request, 'admin-password-reset', { maximum: 3, minutes: 60 })) return error('Reset limit reached. Try again later.', 429);

  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (token.length < 32 || !constantTimeEqual(token, env.ADMIN_RESET_TOKEN)) return error('Invalid reset authorization.', 403);

  let body;
  try { body = await readJson(request, 4096); } catch { return error('Invalid request body.'); }
  const requestedName = safeString(body.name, 120);
  const email = safeString(body.email, 254).toLowerCase();
  const password = String(body.password ?? '');
  const confirmPassword = String(body.confirmPassword ?? password);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return error('Enter a valid administrator email address.');
  if (password.length < 14 || password.length > 200) return error('Choose a password of at least 14 characters.');
  if (password !== confirmPassword) return error('The passwords do not match.');

  // Never convert a student, tutor, customer, or staff account into an Admin.
  const collision = await env.DB.prepare('SELECT id, role, name FROM users WHERE email = ? COLLATE NOCASE').bind(email).first();
  if (collision && collision.role !== 'admin') return error('That email already belongs to another portal account. Use a different email for Admin.', 409);

  // Reuse the Admin row matching this email, including a disabled row, to avoid
  // unique-email conflicts and preserve records linked to that account.
  const existing = collision || await env.DB.prepare("SELECT id, name FROM users WHERE role = 'admin' ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, created_at ASC LIMIT 1").first();
  const name = requestedName || existing?.name || 'Navstar Administrator';
  const record = await hashPassword(password);
  const adminId = existing?.id || uuid();
  let accountSaved = false;

  try {
    if (existing) {
      await env.DB.prepare("UPDATE users SET name = ?, email = ?, password_hash = ?, password_salt = ?, status = 'active', must_change_password = 0 WHERE id = ?")
        .bind(name, email, record.hash, record.salt, adminId).run();
      accountSaved = true;
      try {
        await env.DB.prepare("UPDATE users SET status = 'disabled' WHERE role = 'admin' AND id != ? AND status = 'active'").bind(adminId).run();
      } catch (cause) { console.error('Admin secondary-account cleanup failed:', String(cause)); }
      try {
        await env.DB.prepare("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE role = 'admin')").run();
      } catch (cause) { console.error('Admin session cleanup failed:', String(cause)); }
      try {
        await env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)')
          .bind(uuid(), adminId, 'admin_password_reset', 'user', adminId).run();
      } catch (cause) { console.error('Admin reset audit write failed:', String(cause)); }
    } else {
      await env.DB.prepare("INSERT INTO users (id, name, email, role, password_hash, password_salt, must_change_password, status) VALUES (?, ?, ?, 'admin', ?, ?, 0, 'active')")
        .bind(adminId, name, email, record.hash, record.salt).run();
      accountSaved = true;
      try {
        await env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)')
          .bind(uuid(), adminId, 'admin_password_reset', 'user', adminId).run();
      } catch (cause) { console.error('Admin reset audit write failed:', String(cause)); }
    }
  } catch (cause) {
    if (String(cause?.message || '').toLowerCase().includes('unique')) return error('That email is already registered. Use a different email for Admin.', 409);
    console.error('Admin password reset failed:', String(cause));
    if (accountSaved) return json({ recovered: true, message: 'Admin credentials were saved. You can now sign in.' });
    return error('Admin password reset could not be completed. Existing records have been retained.', 500);
  }

  return json({ recovered: true, message: 'Admin account is ready. Sign in with the new email and password.' });
}
