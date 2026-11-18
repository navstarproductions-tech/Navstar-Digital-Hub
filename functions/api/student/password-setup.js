import { hashPassword } from '../../_shared/auth.js';
import { error, isSameOrigin, json, readJson } from '../../_shared/http.js';

const digest = async value => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
};
const passwordError = password => {
  if (password.length < 14 || password.length > 200) return 'Use at least 14 characters.';
  if ([/[A-Z]/.test(password),/[a-z]/.test(password),/[0-9]/.test(password),/[^A-Za-z0-9]/.test(password)].filter(Boolean).length < 3) return 'Use at least three character types: uppercase, lowercase, number and symbol.';
  return '';
};

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Student account service is not configured.', 503);
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (token.length < 32) return error('Open the secure password setup link sent by Navstar Admissions.', 403);
  let body;
  try { body = await readJson(request, 4096); } catch { return error('Enter your new password.'); }
  const password = String(body.password || '');
  const confirm = String(body.confirmPassword || '');
  const invalid = passwordError(password);
  if (invalid) return error(invalid);
  if (password !== confirm) return error('The passwords do not match.');
  const record = await env.DB.prepare(`SELECT t.id,t.user_id FROM student_password_setup_tokens t
    JOIN users u ON u.id=t.user_id
    WHERE t.token_hash=? AND t.used_at IS NULL AND t.expires_at>?
      AND u.role='student' AND u.status='active' LIMIT 1`).bind(await digest(token), new Date().toISOString()).first();
  if (!record) return error('This password setup link has expired or has already been used. Contact Navstar Admissions for a new link.', 403);
  const hashed = await hashPassword(password);
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET password_hash=?,password_salt=?,must_change_password=0 WHERE id=? AND role=\'student\'').bind(hashed.hash,hashed.salt,record.user_id),
    env.DB.prepare("UPDATE student_password_setup_tokens SET used_at=datetime('now') WHERE id=? AND used_at IS NULL").bind(record.id)
  ]);
  return json({ saved:true, message:'Your Student Portal password has been set. You can now sign in using your registered email and new password.' });
}
