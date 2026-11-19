import { error, isSameOrigin, json, readJson, safeString, uuid, normalizePhone } from '../../../_shared/http.js';
import { sendCustomerNotice } from '../../../_shared/notifications.js';

const digest = async value => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
};
const makeCode = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Account recovery is not configured.', 503);
  let body;
  try { body = await readJson(request, 2048); } catch { return error('Enter your registered email or mobile number.'); }
  const channel = body.channel === 'sms' ? 'sms' : 'email';
  const rawIdentifier = safeString(body.identifier ?? body.email ?? '', 254);
  const identifier = channel === 'sms' ? normalizePhone(rawIdentifier) : rawIdentifier.toLowerCase();
  if (channel === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) return error('Enter a valid registered email address.');
  if (channel === 'sms' && !identifier) return error('Enter a valid Kenyan mobile number.');

  if (channel === 'email' && (!env.RESEND_API_KEY || !env.MAIL_FROM)) return error('Email recovery is temporarily unavailable. Choose SMS or contact Navstar support.', 503);
  if (channel === 'sms' && (!env.TEXTSMS_API_KEY || !env.TEXTSMS_PARTNER_ID)) return error('SMS recovery is temporarily unavailable. Choose email or contact Navstar support.', 503);

  const recent = await env.DB.prepare("SELECT COUNT(*) AS count FROM student_recovery_codes WHERE recovery_identifier = ? AND delivery_channel = ? AND julianday(created_at) > julianday('now', '-1 hour')").bind(identifier, channel).first();
  if (Number(recent?.count || 0) >= 3) return error('Too many recovery requests. Please wait before requesting another code.', 429);

  let account = null;
  if (channel === 'email') {
    account = await env.DB.prepare(`
      SELECT u.id,u.name,u.email,p.phone AS profile_phone,(SELECT e.phone FROM enrollments e WHERE lower(e.email)=lower(u.email) ORDER BY e.created_at DESC LIMIT 1) AS enrollment_phone
      FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id
      WHERE lower(u.email)=? AND u.status='active' LIMIT 1
    `).bind(identifier).first();
  } else {
    const variants = [identifier, '0' + identifier.slice(3), '+' + identifier];
    const marks = variants.map(() => '?').join(',');
    account = await env.DB.prepare(`
      SELECT u.id,u.name,u.email,COALESCE(p.phone,(SELECT e.phone FROM enrollments e WHERE lower(e.email)=lower(u.email) ORDER BY e.created_at DESC LIMIT 1)) AS phone
      FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id
      WHERE u.status='active' AND (
        p.phone IN (${marks}) OR EXISTS (SELECT 1 FROM enrollments e WHERE lower(e.email)=lower(u.email) AND e.phone IN (${marks}))
      ) LIMIT 1
    `).bind(...variants,...variants).first();
    if (account) { const matchedPhone=[account.profile_phone,account.enrollment_phone].find(value=>normalizePhone(value)===identifier); if(matchedPhone) account.phone=matchedPhone; else account=null; }
  }

  const genericMessage = channel === 'sms'
    ? 'If an active Navstar portal account matches that mobile number, a verification code will arrive shortly.'
    : 'If an active Navstar portal account matches that email address, a verification code will arrive shortly. Check your inbox and spam folder.';
  if (!account) return json({ sent: true, message: genericMessage });

  account.phone = account.phone || account.profile_phone || account.enrollment_phone || '';\n  const otp = makeCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await env.DB.prepare("UPDATE student_recovery_codes SET used_at=datetime('now'),reset_token_hash=NULL WHERE user_id=? AND used_at IS NULL").bind(account.id).run();
  await env.DB.prepare('INSERT INTO student_recovery_codes (id,user_id,email,otp_hash,expires_at,recovery_identifier,delivery_channel) VALUES (?,?,?,?,?,?,?)')
    .bind(uuid(),account.id,account.email,await digest(otp),expiresAt,identifier,channel).run();

  const message = `Greetings, You are receiving an account security message from Navstar Digital Hub. Your one-time password reset code is ${otp}. It expires in 10 minutes, allows five attempts and can be used once. If you did not request this reset, ignore this message. HOME OF TECHNOCRATS.`;
  const results = await sendCustomerNotice(env, {
    email: channel === 'email' ? account.email : '',
    phone: channel === 'sms' ? account.phone : '',
    subject: 'Your Navstar account password reset code',
    message,
  });
  if (!results.some(result => result.status === 'fulfilled')) {
    await env.DB.prepare("UPDATE student_recovery_codes SET used_at=datetime('now') WHERE user_id=? AND recovery_identifier=? AND used_at IS NULL").bind(account.id,identifier).run();
    return error('The verification code could not be delivered. Try the other contact method or contact Navstar support.', 502);
  }
  return json({ sent: true, message: genericMessage });
}
