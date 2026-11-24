import { hashPassword, sha256 } from '../../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, normalizePhone, uuid } from '../../_shared/http.js';
import { rateLimited } from '../../_shared/rate-limit.js';
import { passwordPolicyError } from '../../_shared/password-policy.js';
import { sendBrandedEmail } from '../../_shared/notifications.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Customer account storage is not configured.', 503);
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) return error('Account verification email is not configured. Please contact Navstar support.', 503);

  if (await rateLimited(env.DB, request, 'customer-register-ip', { maximum: 30, minutes: 15 })) {
    return error('Too many registration attempts from this network. Please wait a little while and try again.', 429);
  }

  let body;
  try { body = await readJson(request, 8192); } catch { return error('Invalid registration details.'); }
  const fullName = safeString(body.fullName, 120);
  const email = safeString(body.email, 254).toLowerCase();
  const phone = body.phone ? normalizePhone(body.phone) : '';
  const password = String(body.password || '');
  const inputProfile = body.profile && typeof body.profile === 'object' ? body.profile : {};
  const nationalId = safeString(inputProfile.nationalId, 20).replace(/\s+/g, '');
  const dob = safeString(inputProfile.dob, 20);
  const gender = safeString(inputProfile.gender, 20);
  const profileFields = ['alternativePhone','province','county','subcounty','constituency','ward','district','division','location','sublocation','area'];
  const profile = {};
  for (const field of profileFields) profile[field] = safeString(inputProfile[field], 120);
  if (!/^\d{6,12}$/.test(nationalId) || !/^\d{4}-\d{2}-\d{2}$/.test(dob) || !['Male','Female','Other','Prefer not to say'].includes(gender)) {
    return error('Enter a valid National ID, date of birth, and gender.');
  }
  if (profile.alternativePhone && !normalizePhone(profile.alternativePhone)) return error('Enter a valid alternative phone number.');
  profile.nationalIdHash = await sha256(nationalId);
  profile.nationalIdLast4 = nationalId.slice(-4);
  profile.dob = dob;
  profile.gender = gender;
  profile.alternativePhone = profile.alternativePhone ? normalizePhone(profile.alternativePhone) : '';

  if (fullName.length < 2 || !emailPattern.test(email) || (body.phone && !phone)) {
    return error('Enter your full name, a valid email address, and a valid phone number if supplied.');
  }
  if (await rateLimited(env.DB, request, 'customer-register-email', { maximum: 8, minutes: 30 }, email)) {
    return error('Too many attempts for this email address. Please wait a little while and try again.', 429);
  }

  const policyError = passwordPolicyError(password);
  if (policyError) return error(policyError);
  if (password !== String(body.confirmPassword || '')) return error('The passwords do not match.');

  try {
    const existing = await env.DB.prepare('SELECT id FROM customer_accounts WHERE email = ? COLLATE NOCASE').bind(email).first();
    if (existing) return error('An account with this email already exists. Please sign in or use password reset.', 409);

    const credentials = await hashPassword(password);
    const otp = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
    const otpHash = await sha256(otp);
    const id = uuid();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await env.DB.prepare(`INSERT INTO customer_registration_otps
      (id, email, full_name, phone, password_hash, password_salt, otp_hash, expires_at, attempts, profile_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      ON CONFLICT(email) DO UPDATE SET
        id = excluded.id, full_name = excluded.full_name, phone = excluded.phone,
        password_hash = excluded.password_hash, password_salt = excluded.password_salt,
        otp_hash = excluded.otp_hash, expires_at = excluded.expires_at, attempts = 0,
        profile_json = excluded.profile_json,
        created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`)
      .bind(id, email, fullName, phone || null, credentials.hash, credentials.salt, otpHash, expiresAt, JSON.stringify(profile)).run();

    const delivery = await sendBrandedEmail(env, {
      email,
      subject: 'Verify your Navstar Digital Hub account',
      heading: 'Complete your account registration',
      preheader: 'Your one-time verification code expires in 10 minutes.',
      message: `Hello ${fullName},

Thank you for choosing Navstar Digital Hub. Use the verification code below to confirm that you own this email address and complete your account registration.

YOUR ONE-TIME CODE: ${otp}

This code expires in 10 minutes and can be used once only. If you did not request this account, ignore this email. Never share this code with anyone.

After verification, you can sign in to manage your Navstar services, course enquiries and customer activity.

Regards,
Navstar Digital Hub
HOME OF TECHNOCRATS`,
    });
    if (!delivery.ok) {
      await env.DB.prepare('DELETE FROM customer_registration_otps WHERE email = ?').bind(email).run();
      return error('We could not send your verification code. Please try again later or contact Navstar support.', 503);
    }
    return json({ verificationRequired: true, message: 'A six-digit verification code has been sent to your email. It expires in 10 minutes.' }, 202);
  } catch (cause) {
    const ref = crypto.randomUUID().slice(0, 8).toUpperCase();
    const detail = String(cause?.message || cause || '');
    console.error('Customer registration initiation failed [' + ref + ']:', detail);
    if (/no such table|no such column|schema/i.test(detail)) {
      return error('Customer verification storage is not ready. Please contact Navstar support and quote ' + ref + '.', 503);
    }
    return error('We could not start your account registration. Please contact Navstar support and quote ' + ref + '.', 500);
  }
}
