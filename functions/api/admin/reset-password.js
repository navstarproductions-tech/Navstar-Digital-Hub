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
  const email = safeString(body.email, 254).toLowerCase();
  const password = String(body.password ?? '');
  if (!email.includes('@') || password.length < 14 || password.length > 200) return error('Enter the administrator email and a password of at least 14 characters.');
  const user = await env.DB.prepare("SELECT id FROM users WHERE email = ? AND role = 'admin' AND status = 'active'").bind(email).first();
  if (!user) return error('Administrator account not found.', 404);
  const record = await hashPassword(password);
  await env.DB.prepare('UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 0 WHERE id = ?')
    .bind(record.hash, record.salt, user.id).run();
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run();
  await env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)')
    .bind(uuid(), user.id, 'admin_password_reset', 'user', user.id).run();
  return json({ reset: true, message: 'Administrator password reset. Sign in with the new password.' });
}
