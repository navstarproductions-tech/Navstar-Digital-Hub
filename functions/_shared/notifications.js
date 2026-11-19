const EMAIL_ENDPOINT = 'https://api.resend.com/emails';
const TEXTSMS_ENDPOINT = 'https://sms.textsms.co.ke/api/services/sendsms/';
const NAVSTAR_SMS_INTRO = 'Greetings, You are receiving an SMS from Navstar Digital Hub.';

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character] || character));
}
function brandedEmail({ subject, message, heading = 'A message from Navstar Digital Hub', preheader = 'Official account and service notification' }) {
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');
  return { subject, text: message, html: `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#172b4d"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 12px;background:#f1f5f9"><tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #dbe5f0"><tr><td style="padding:28px;background:linear-gradient(120deg,#061b3b,#0b4387 68%,#087b83);color:#fff"><div style="font-size:22px;font-weight:800;letter-spacing:1px">NAVSTAR DIGITAL HUB</div><div style="margin-top:7px;color:#ffdf83;font-size:11px;font-weight:700;letter-spacing:3px">HOME OF TECHNOCRATS</div><div style="margin-top:12px;color:#dbeafe;font-size:12px;line-height:1.7">Raphael Estates, Room 3 · Opposite Shaban Medical Clinic<br>Off Agorom–Busia Road · 200 m from ACK Nambale Hostels<br>0797 688 576 / 0706 637 485 · navstardigitalhub@gmail.com<br><a href="https://navstardigitalhub.co.ke" style="color:#bfdbfe">https://navstardigitalhub.co.ke</a></div></td></tr><tr><td style="padding:30px 28px"><h1 style="margin:0 0 18px;font-size:22px;color:#0b2d59">${escapeHtml(heading)}</h1><div style="font-size:15px;line-height:1.8;color:#334155">${safeMessage}</div><div style="margin-top:26px;padding:16px;border-radius:12px;background:#eff6ff;color:#1e3a8a;font-size:13px;line-height:1.7"><strong>Need assistance?</strong><br>Contact Navstar Digital Hub using the official contacts above. Never share your password, M-Pesa PIN or one-time verification code with anyone claiming to be support.</div></td></tr><tr><td style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:11px;line-height:1.7">This is an automated message from Navstar Digital Hub.<br>HOME OF TECHNOCRATS · Learn • Create • Innovate • Empower</td></tr></table></td></tr></table></body></html>` };
}
export async function sendBrandedEmail(env, { email, subject, message, heading, preheader }) {
  if (!email || !env.RESEND_API_KEY || !env.MAIL_FROM) {
    console.error('Email not sent: recipient or Resend configuration is missing.');
    return { ok: false, reason: 'Email delivery is not configured.' };
  }
  const template = brandedEmail({ subject, message, heading, preheader });
  const response = await fetch(EMAIL_ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: env.MAIL_FROM, to: [email], subject: template.subject, text: template.text, html: template.html }) });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error('Resend email delivery failed:', response.status, detail.slice(0, 500));
    return { ok: false, reason: 'Email provider rejected the message.' };
  }
  return { ok: true, provider: 'Resend' };
}
function normalizeKenyanMobile(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('0') && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.startsWith('7') && digits.length === 9) return `254${digits}`;
  if (digits.startsWith('1') && digits.length === 9) return `254${digits}`;
  return digits;
}
function navstarSmsMessage(message) {
  const body = String(message || '').trim();
  if (!body) return NAVSTAR_SMS_INTRO;
  if (body.toLowerCase().startsWith(NAVSTAR_SMS_INTRO.toLowerCase())) return body;
  return `${NAVSTAR_SMS_INTRO}\n\n${body}\n\nNavstar Digital Hub: https://navstardigitalhub.co.ke`;
}
export async function sendTextSms(env, phone, message) {
  const mobile = normalizeKenyanMobile(phone);
  if (!/^254\d{9}$/.test(mobile)) throw new Error('TextSMS rejected notification: recipient must be a valid Kenyan mobile number.');
  const response = await fetch(TEXTSMS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ apikey: env.TEXTSMS_API_KEY, partnerID: env.TEXTSMS_PARTNER_ID, mobile, message: navstarSmsMessage(message), shortcode: env.TEXTSMS_SENDER_ID || 'TextSMS' }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`TextSMS HTTP error ${response.status}.`);
  const result = payload?.responses?.[0];
  const code = Number(result?.['respose-code'] ?? result?.['response-code']);
  if (code !== 200) {
    const description = String(result?.['response-description'] || payload?.message || 'Unknown TextSMS response');
    throw new Error(`TextSMS delivery request failed (${Number.isFinite(code) ? code : 'no code'}): ${description}`);
  }
  return { provider: 'TextSMS', accepted: true, messageId: result?.messageid ?? null, mobile, responseDescription: result?.['response-description'] || 'Success' };
}
export async function sendCustomerNotice(env, { email, phone, subject, message }) {
  const tasks = [];
  if (email) tasks.push(sendBrandedEmail(env, { email, subject, message, heading: subject }));
  if (phone && env.TEXTSMS_API_KEY && env.TEXTSMS_PARTNER_ID) tasks.push(sendTextSms(env, phone, message));
  else if (phone) console.error('TextSMS notification not sent: TEXTSMS_API_KEY or TEXTSMS_PARTNER_ID is not configured.');
  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === 'rejected' || (result.status === 'fulfilled' && result.value?.ok === false)) {
      console.error('Customer notification delivery failure:', result.status === 'rejected' ? String(result.reason?.message || result.reason) : result.value?.reason);
    }
  }
  return results;
}
export function queueCustomerNotice(context, env, notice) {
  const task = sendCustomerNotice(env, notice).catch((error) => {
    console.error('Customer notification task failed:', String(error?.message || error));
  });
  if (typeof context?.waitUntil === 'function') context.waitUntil(task);
  else void task;
}
