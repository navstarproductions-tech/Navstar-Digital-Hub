import { hashPassword } from '../../../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, uuid } from '../../../_shared/http.js';

const digest = async (value) => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
};
const strongPasswordError = (password) => {
  if (password.length < 14 || password.length > 200) return 'Use at least 14 characters for your new Admin password.';
  if ([/[A-Z]/.test(password), /[a-z]/.test(password), /[0-9]/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length < 3) return 'Use at least three character types: uppercase, lowercase, number and symbol.';
  return '';
};

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Recovery service is not configured.', 503);
  const resetToken = request.headers.get('Authorization')?.replace(/^Bearer\\s+/i, '') || '';
  if (resetToken.length < 32) return error('Verify your email before resetting the password.', 403);
  let body;
  try { body = await readJson(request, 4096); } catch { return error('Invalid password details.'); }
  const password = String(body.password || '');
  const confirmPassword = String(body.confirmPassword || '');
  const policyError = strongPasswordError(password);
  if (policyError) return error(policyError);
  if (password !== confirmPassword) return error('The passwords do not match.');

  const record = await env.DB.prepare(`
    SELECT id, user_id, email FROM admin_recovery_codes
    WHERE reset_token_hash = ? AND verified_at IS NOT NULL AND used_at IS NULL
      AND datetime(verified_at) > datetime('now', '-15 minutes')
    ORDER BY created_at DESC LIMIT 1
  `).bind(await digest(resetToken)).first();
  if (!record) return error('Your verified recovery session has expired. Request a new code.', 403);
  const hashed = await hashPassword(password);
  await env.DB.prepare('UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 0, status = ? WHERE id = ? AND email = ?')
    .bind(hashed.hash, hashed.salt, 'active', record.user_id, record.email).run();
  await env.DB.prepare('UPDATE admin_recovery_codes SET used_at = datetime(\'now\'), reset_token_hash = NULL WHERE id = ?').bind(record.id).run();
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(record.user_id).run();
  try {
    await env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)')
      .bind(uuid(), record.user_id, 'admin_email_otp_recovery', 'user', record.user_id).run();
  } catch (cause) { console.error('Admin recovery audit write failed:', String(cause)); }
  return json({ recovered: true, message: 'Your Admin account password has been reset. Sign in with your registered email and new password.' });
}
