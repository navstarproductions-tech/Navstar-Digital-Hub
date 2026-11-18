import { error, isSameOrigin, json, normalizePhone, readJson, safeString, uuid } from '../../../_shared/http.js';
import { rateLimited } from '../../../_shared/rate-limit.js';

const digest = async (value) => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
};
const makeCode = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Admissions verification is not configured.', 503);
  if (!env.RESEND_API_KEY || !env.MAIL_FROM || !env.AT_USERNAME || !env.AT_API_KEY) {
    return error('Applicant verification is not fully configured. Navstar must configure email and SMS delivery before applications can be submitted.', 503);
  }
  if (await rateLimited(env.DB, request, 'enrollment-otp', { maximum: 3, minutes: 15 })) return error('Too many verification requests. Wait before requesting another code.', 429);
  let body;
  try { body = await readJson(request, 2048); } catch { return error('Enter a valid email and phone number.'); }
  const email = safeString(body.email, 254).trim().toLowerCase();
  const phone = normalizePhone(body.phone);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !phone) return error('Enter a valid email address and Kenyan mobile number.');
  const recent = await env.DB.prepare("SELECT COUNT(*) AS total FROM enrollment_application_otps WHERE email = ? AND julianday(created_at) > julianday('now', '-1 hour')").bind(email).first();
  if (Number(recent?.total || 0) >= 5) return error('This email has reached the verification limit. Please contact Admissions.', 429);

  const emailOtp = makeCode();
  const smsOtp = makeCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await env.DB.prepare("UPDATE enrollment_application_otps SET consumed_at = datetime('now') WHERE email = ? AND phone = ? AND consumed_at IS NULL").bind(email, phone).run();
  await env.DB.prepare('INSERT INTO enrollment_application_otps (id,email,phone,otp_hash,sms_otp_hash,expires_at) VALUES (?,?,?,?,?,?)')
    .bind(uuid(), email, phone, await digest(emailOtp), await digest(smsOtp), expiresAt).run();

  const safeEmail = email.replace(/[&<>"']/g, '');
  const mail = fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [email],
      subject: 'Verify your Navstar Digital Hub application',
      text: `Hello applicant, your Navstar Digital Hub application verification code is ${emailOtp}. It expires in 10 minutes and can only be used once. If you did not request this code, ignore this message.`,
      html: `<div style="font-family:Arial,sans-serif;background:#f1f5f9;padding:28px"><div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;overflow:hidden"><header style="background:#071a38;color:white;padding:24px"><b style="color:#fbbf24">HOME OF TECHNOCRATS</b><h1>Verify your application</h1><p>NAVSTAR DIGITAL HUB</p></header><main style="padding:26px;color:#0f172a"><p>Hello ${safeEmail},</p><p>Use this one-time code to verify your email and phone before submitting your application.</p><div style="font-size:34px;letter-spacing:10px;font-weight:bold;color:#1d4ed8;padding:16px 0">${emailOtp}</div><p>This code expires in 10 minutes. Navstar will never ask you to share it with another person.</p></main></div></div>`
    })
  });
  const smsBody = new URLSearchParams({ username: env.AT_USERNAME, to: phone.startsWith('+') ? phone : '+' + phone, message: `Navstar Digital Hub SMS verification code: ${smsOtp}. Expires in 10 minutes. Do not share this code.` });
  if (env.AT_SENDER_ID) smsBody.set('from', env.AT_SENDER_ID);
  const sms = fetch('https://api.africastalking.com/version1/messaging', {
    method: 'POST',
    headers: { apiKey: env.AT_API_KEY, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: smsBody.toString()
  });
  const [mailResult, smsResult] = await Promise.allSettled([mail, sms]);
  const mailOk = mailResult.status === 'fulfilled' && mailResult.value.ok;
  let smsPayload = null;
  if (smsResult.status === 'fulfilled') smsPayload = await smsResult.value.json().catch(() => null);
  const recipients = smsPayload?.SMSMessageData?.Recipients;
  const smsOk = smsResult.status === 'fulfilled' && smsResult.value.ok
    && Array.isArray(recipients)
    && recipients.some(recipient => ['Success','Sent','Queued'].includes(String(recipient.status || '')) || [100,101,102].includes(Number(recipient.statusCode)));
  if (!mailOk || !smsOk) {
    await env.DB.prepare("UPDATE enrollment_application_otps SET consumed_at = datetime('now') WHERE email = ? AND phone = ? AND otp_hash = ?").bind(email, phone, await digest(emailOtp)).run();
    console.error('Applicant OTP delivery failed', { email: mailOk, sms: smsOk });
    return error('We could not deliver the verification code to both your email and phone. Check your details or contact Navstar Admissions.', 502);
  }
  return json({ sent: true, expiresInSeconds: 600, message: 'Verification code sent to your email and phone. Enter the six-digit code to continue.' });
}
