import { error, isSameOrigin, json, readJson, safeString, normalizePhone } from '../../../_shared/http.js';

const digest = async value => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
};
const makeToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).split('+').join('-').split('/').join('_').replace(/=+$/, '');
};

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Recovery service is not configured.', 503);
  let body;
  try { body = await readJson(request, 2048); } catch { return error('Enter your email and verification code.'); }
  const channel = body.channel === 'sms' ? 'sms' : 'email';
  const identifier = channel === 'sms' ? normalizePhone(body.identifier) : safeString(body.identifier ?? body.email, 254).toLowerCase();
  const otp = safeString(body.otp, 6);
  if (!identifier || !/^\d{6}$/.test(otp)) return error('The contact or verification code is incorrect.');

  const record = await env.DB.prepare(`
    SELECT id, otp_hash, attempts, expires_at
    FROM student_recovery_codes
    WHERE recovery_identifier = ? AND delivery_channel = ? AND used_at IS NULL AND verified_at IS NULL
    ORDER BY created_at DESC LIMIT 1
  `).bind(identifier, channel).first();
  if (!record || Number(record.attempts) >= 5 || new Date(record.expires_at).getTime() <= Date.now()) return error('The code has expired or is invalid. Request a new code.');
  if (await digest(otp) !== record.otp_hash) {
    await env.DB.prepare('UPDATE student_recovery_codes SET attempts = attempts + 1 WHERE id = ?').bind(record.id).run();
    return error('The verification code is incorrect. Check it and try again.');
  }
  const resetToken = makeToken();
  await env.DB.prepare('UPDATE student_recovery_codes SET verified_at = ?, reset_token_hash = ? WHERE id = ?')
    .bind(new Date().toISOString(), await digest(resetToken), record.id).run();
  return json({ verified: true, resetToken, message: 'Contact verified. Choose a new Navstar portal password.' });
}
