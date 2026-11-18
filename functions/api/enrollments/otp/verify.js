import { error, isSameOrigin, json, readJson, safeString } from '../../../_shared/http.js';
import { rateLimited } from '../../../_shared/rate-limit.js';

const digest = async (value) => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
};
const makeToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Admissions verification is not configured.', 503);
  if (await rateLimited(env.DB, request, 'enrollment-otp-verify', { maximum: 8, minutes: 15 })) return error('Too many verification attempts. Request a new code later.', 429);
  let body;
  try { body = await readJson(request, 2048); } catch { return error('Enter your email, phone and verification code.'); }
  const email = safeString(body.email, 254).trim().toLowerCase();
  const phone = safeString(body.phone, 32);
  const otp = safeString(body.otp, 6);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(otp)) return error('The verification code is invalid.');
  const record = await env.DB.prepare(`SELECT id, otp_hash, attempts, expires_at FROM enrollment_application_otps
    WHERE email = ? AND phone = ? AND consumed_at IS NULL AND verified_at IS NULL
    ORDER BY created_at DESC LIMIT 1`).bind(email, phone).first();
  if (!record || Number(record.attempts) >= 5 || Date.parse(record.expires_at) <= Date.now()) return error('The code has expired or is invalid. Request a new code.', 400);
  if (await digest(otp) !== record.otp_hash) {
    await env.DB.prepare('UPDATE enrollment_application_otps SET attempts = attempts + 1 WHERE id = ?').bind(record.id).run();
    return error('The verification code is incorrect. Check it and try again.', 400);
  }
  const token = makeToken();
  await env.DB.prepare('UPDATE enrollment_application_otps SET verified_at = ?, verification_token_hash = ? WHERE id = ? AND consumed_at IS NULL')
    .bind(new Date().toISOString(), await digest(token), record.id).run();
  return json({ verified: true, verificationToken: token, message: 'Email and phone verified. You can now submit your application.' });
}
