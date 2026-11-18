import { error, isSameOrigin, json, readJson, safeString, uuid } from '../../../_shared/http.js';

const emailPattern = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
const digest = async (value) => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
};
const code = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');

export async function onRequestPost({ request, env, context }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB || !env.RESEND_API_KEY || !env.MAIL_FROM) return error('Email recovery is not configured. Navstar must configure its email service first.', 503);
  let body;
  try { body = await readJson(request, 2048); } catch { return error('Enter a valid email address.'); }
  const email = safeString(body.email, 254).toLowerCase();
  if (!emailPattern.test(email)) return error('Enter a valid email address.');

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ipHash = await digest(ip);
  const recent = await env.DB.prepare("SELECT COUNT(*) AS count FROM admin_recovery_codes WHERE email = ? AND created_at > datetime('now', '-1 hour')").bind(email).first();
  const recentIp = await env.DB.prepare("SELECT COUNT(*) AS count FROM admin_recovery_codes WHERE id IN (SELECT id FROM admin_recovery_codes WHERE created_at > datetime('now', '-1 hour')) AND substr(id,1,0) = ?").bind(ipHash).first().catch(() => ({count:0}));
  if (Number(recent?.count || 0) >= 3) return error('Too many recovery requests. Please wait before requesting another code.', 429);

  const admin = await env.DB.prepare(`
    SELECT u.id, u.name, u.email, p.staff_id AS staffId
    FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
    WHERE lower(u.email) = ? AND COALESCE(p.portal_role, u.role) = 'admin' AND u.status = 'active'
    LIMIT 1
  `).bind(email).first();

  // Keep the public response identical whether or not the email belongs to an Admin.
  if (!admin) return json({ sent: true, message: 'If that address belongs to an active Navstar Admin, a recovery code has been sent.' });

  const otp = code();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await env.DB.prepare("UPDATE admin_recovery_codes SET used_at = datetime('now') WHERE email = ? AND used_at IS NULL").bind(email).run();
  await env.DB.prepare('INSERT INTO admin_recovery_codes (id, user_id, email, otp_hash, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(uuid(), admin.id, email, await digest(otp), expiresAt).run();

  const html = `<div style="font-family:Arial,sans-serif;background:#f1f5f9;padding:28px"><div style="max-width:560px;margin:auto;background:#fff;border-radius:18px;overflow:hidden"><div style="background:#071a38;padding:26px;color:#fff"><div style="font-size:12px;letter-spacing:3px;color:#fbbf24;font-weight:bold">HOME OF TECHNOCRATS</div><h1 style="margin:12px 0 0;font-size:25px">Admin account recovery</h1><div style="color:#cbd5e1;margin-top:6px">NAVSTAR DIGITAL HUB</div></div><div style="padding:28px;color:#0f172a"><p>Hello ${admin.name.replace(/[&<>"]/g, '')},</p><p>We received a request to recover your Navstar administrator account.</p><div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px"><p style="margin:0 0 8px;color:#1d4ed8;font-size:12px;font-weight:bold">ADMIN LOGIN DETAILS</p><p style="margin:4px 0"><b>Login email:</b> ${admin.email}</p><p style="margin:4px 0"><b>Admin ID:</b> ${admin.staffId || 'Use your email address to sign in'}</p></div><p style="margin-top:24px">Your one-time verification code is:</p><div style="font-size:34px;letter-spacing:10px;font-weight:bold;color:#1d4ed8;padding:14px 0">${otp}</div><p>This code expires in 10 minutes and can only be used once. If you did not request recovery, ignore this email and secure your mailbox.</p><p style="font-size:12px;color:#64748b">Navstar Digital Hub · HOME OF TECHNOCRATS</p></div></div></div>`;
  const task = fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [admin.email], subject: 'Navstar Admin account recovery code', html, text: `Hello ${admin.name}. Your Navstar Admin login email is ${admin.email}. Admin ID: ${admin.staffId || 'Use your email to sign in'}. Your verification code is ${otp}. It expires in 10 minutes.` })
  }).then(async (response) => {
    if (!response.ok) {
      await env.DB.prepare('UPDATE admin_recovery_codes SET used_at = datetime(\'now\') WHERE email = ? AND otp_hash = ?').bind(email, await digest(otp)).run();
      console.error('Admin recovery email failed:', response.status, (await response.text()).slice(0, 500));
    }
  }).catch((cause) => console.error('Admin recovery email delivery failed:', String(cause)));
  if (typeof context?.waitUntil === 'function') context.waitUntil(task);
  else await task;
  return json({ sent: true, message: 'If that address belongs to an active Navstar Admin, a recovery code has been sent. Check your inbox and spam folder.' });
}
