import { hashPassword } from '../../../_shared/auth.js';
import { error, isSameOrigin, json, readJson, uuid } from '../../../_shared/http.js';
import { passwordPolicyError } from '../../../_shared/password-policy.js';

const digest = async value => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
};
const strongAdminPasswordError = password => {
  if (password.length < 14 || password.length > 200) return 'Use at least 14 characters for an administrator password.';
  if ([/[A-Z]/.test(password),/[a-z]/.test(password),/[0-9]/.test(password),/[^A-Za-z0-9]/.test(password)].filter(Boolean).length < 3) return 'Use at least three character types: uppercase, lowercase, number and symbol.';
  return '';
};

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Recovery service is not configured.', 503);
  const resetToken = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (resetToken.length < 32) return error('Verify your registered contact before resetting the password.', 403);
  let body;
  try { body = await readJson(request, 4096); } catch { return error('Invalid password details.'); }
  const password = String(body.password || '');
  const confirmPassword = String(body.confirmPassword || '');
  const record = await env.DB.prepare(`
    SELECT r.id,r.user_id,r.email,COALESCE(p.portal_role,u.role) AS role
    FROM student_recovery_codes r
    JOIN users u ON u.id=r.user_id
    LEFT JOIN user_profiles p ON p.user_id=u.id
    WHERE r.reset_token_hash=? AND r.verified_at IS NOT NULL AND r.used_at IS NULL
      AND datetime(r.verified_at)>datetime('now','-15 minutes')
      AND lower(u.email)=r.email AND u.status='active'
    ORDER BY r.created_at DESC LIMIT 1
  `).bind(await digest(resetToken)).first();
  if (!record) return error('Your verified recovery session has expired. Request a new code.', 403);
  const policyError = record.role === 'admin' ? strongAdminPasswordError(password) : passwordPolicyError(password);
  if (policyError) return error(policyError);
  if (password !== confirmPassword) return error('The passwords do not match.');

  const hashed = await hashPassword(password);
  const update = await env.DB.prepare('UPDATE users SET password_hash=?,password_salt=?,must_change_password=0 WHERE id=? AND lower(email)=? AND status=\'active\'')
    .bind(hashed.hash,hashed.salt,record.user_id,record.email).run();
  if (Number(update?.meta?.changes ?? 0) < 1) return error('This account is no longer active. Contact Navstar support.', 409);

  await env.DB.prepare("UPDATE student_recovery_codes SET used_at=datetime('now'),reset_token_hash=NULL WHERE id=?").bind(record.id).run();
  await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(record.user_id).run();
  try {
    await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)')
      .bind(uuid(),record.user_id,'account_contact_otp_recovery','user',record.user_id).run();
  } catch (cause) { console.error('Account recovery audit write failed:',String(cause)); }
  return json({ recovered:true,message:'Your Navstar portal password has been reset. Sign in using your registered login details and new password.' });
}
