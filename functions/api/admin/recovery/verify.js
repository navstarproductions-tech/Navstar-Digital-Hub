import { error, isSameOrigin, json, readJson, safeString } from '../../../_shared/http.js';

const digest = async (value) => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
};
const token = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Recovery service is not configured.', 503);
  let body;
  try { body = await readJson(request, 2048); } catch { return error('Enter your email and verification code.'); }
  const email = safeString(body.email, 254).toLowerCase();
  const otp = safeString(body.otp, 6);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(otp)) return error('The email or verification code is incorrect.', 400);

  const record = await env.DB.prepare(`
    SELECT id, user_id, otp_hash, attempts, expires_at
    FROM admin_recovery_codes
    WHERE email = ? AND used_at IS NULL AND verified_at IS NULL
    ORDER BY created_at DESC LIMIT 1
  `).bind(email).first();
  if (!record || Number(record.attempts) >= 5 || new Date(record.expires_at).getTime() <= Date.now()) return error('The code has expired or is invalid. Request a new code.', 400);
  const supplied = await digest(otp);
  if (supplied !== record.otp_hash) {
    await env.DB.prepare('UPDATE admin_recovery_codes SET attempts = attempts + 1 WHERE id = ?').bind(record.id).run();
    return error('The verification code is incorrect. Check it and try again.', 400);
  }
  const resetToken = token();
  await env.DB.prepare('UPDATE admin_recovery_codes SET verified_at = ?, reset_token_hash = ? WHERE id = ?')
    .bind(new Date().toISOString(), await digest(resetToken), record.id).run();
  return json({ verified: true, resetToken, message: 'Email verified. Set a new Admin password to finish recovery.' });
}
