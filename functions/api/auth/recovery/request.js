import { error, isSameOrigin, json, readJson, safeString, uuid } from '../../../_shared/http.js';

const digest = async (value) => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
};
const makeCode = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
const escapeHtml = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB || !env.RESEND_API_KEY || !env.MAIL_FROM) return error('Student email recovery is not configured. Please contact Navstar support.', 503);
  let body;
  try { body = await readJson(request, 2048); } catch { return error('Enter your registered student email address.'); }
  const email = safeString(body.email, 254).toLowerCase();
  if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) return error('Enter a valid email address.');

  const recent = await env.DB.prepare("SELECT COUNT(*) AS count FROM student_recovery_codes WHERE email = ? AND julianday(created_at) > julianday('now', '-1 hour')").bind(email).first();
  if (Number(recent?.count || 0) >= 3) return error('Too many recovery requests. Please wait before requesting another code.', 429);

  const student = await env.DB.prepare(`
    SELECT u.id, u.name, u.email
    FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
    WHERE lower(u.email) = ? AND COALESCE(p.portal_role, u.role) = 'student' AND u.status = 'active'
    LIMIT 1
  `).bind(email).first();

  // Always return the same response so the endpoint does not disclose whether an email is registered.
  if (!student) return json({ sent: true, message: 'If an active Student Portal account uses that email, a verification code will arrive shortly. Check your inbox and spam folder.' });

  const otp = makeCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await env.DB.prepare("UPDATE student_recovery_codes SET used_at = datetime('now'), reset_token_hash = NULL WHERE email = ? AND used_at IS NULL").bind(email).run();
  await env.DB.prepare('INSERT INTO student_recovery_codes (id, user_id, email, otp_hash, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(uuid(), student.id, email, await digest(otp), expiresAt).run();

  const safeName = escapeHtml(student.name);
  let response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [student.email],
        subject: 'Your Navstar Student Portal password reset code',
        html: `<div style="font-family:Arial,sans-serif;background:#f1f5f9;padding:28px"><div style="max-width:560px;margin:auto;background:#fff;border-radius:18px;overflow:hidden"><div style="background:#082f49;padding:26px;color:#fff"><div style="font-size:12px;letter-spacing:3px;color:#67e8f9;font-weight:bold">HOME OF TECHNOCRATS</div><h1 style="margin:12px 0 0;font-size:25px">Student Portal recovery</h1><div style="color:#cbd5e1;margin-top:6px">NAVSTAR DIGITAL HUB</div></div><div style="padding:28px;color:#0f172a"><p>Hello ${safeName},</p><p>Use this one-time code to reset your Student Portal password:</p><div style="font-size:34px;letter-spacing:10px;font-weight:bold;color:#0e7490;padding:14px 0">${otp}</div><p>This code expires in 10 minutes, can be used once, and allows up to five verification attempts. If you did not request this reset, ignore this email.</p><p style="font-size:12px;color:#64748b">Navstar Digital Hub · HOME OF TECHNOCRATS</p></div></div></div>`,
        text: `Hello ${student.name}. Your Navstar Student Portal verification code is ${otp}. It expires in 10 minutes and can only be used once. If you did not request this reset, ignore this email.`
      })
    });
  } catch (cause) {
    console.error('Student recovery email delivery failed:', String(cause));
  }
  if (!response?.ok) {
    await env.DB.prepare("UPDATE student_recovery_codes SET used_at = datetime('now') WHERE email = ? AND otp_hash = ?").bind(email, await digest(otp)).run();
    console.error('Student recovery email provider rejected delivery:', response?.status || 'network error');
    return error('The verification email could not be sent. Please try again later or contact Navstar support.', 502);
  }
  return json({ sent: true, message: 'If an active Student Portal account uses that email, a verification code will arrive shortly. Check your inbox and spam folder.' });
}
