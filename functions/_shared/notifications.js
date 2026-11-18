const EMAIL_ENDPOINT = 'https://api.resend.com/emails';
const SMS_ENDPOINT = 'https://api.africastalking.com/version1/messaging';
function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character] || character));
}
function brandedEmail({ subject, message, heading = 'A message from Navstar Digital Hub', preheader = 'Official account and service notification' }) {
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');
  return { subject, text: message, html: `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#172b4d"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 12px;background:#f1f5f9"><tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #dbe5f0"><tr><td style="padding:28px;background:linear-gradient(120deg,#061b3b,#0b4387 68%,#087b83);color:#fff"><div style="font-size:22px;font-weight:800;letter-spacing:1px">NAVSTAR DIGITAL HUB</div><div style="margin-top:7px;color:#ffdf83;font-size:11px;font-weight:700;letter-spacing:3px">HOME OF TECHNOCRATS</div><div style="margin-top:12px;color:#dbeafe;font-size:12px;line-height:1.7">Raphael Estates, Room 3 · Opposite Shaban Medical Clinic<br>Off Agorom–Busia Road · 200 m from ACK Nambale Hostels<br>0797 688 576 / 0706 637 485 · navstardigitalhub@gmail.com</div></td></tr><tr><td style="padding:30px 28px"><h1 style="margin:0 0 18px;font-size:22px;color:#0b2d59">${escapeHtml(heading)}</h1><div style="font-size:15px;line-height:1.8;color:#334155">${safeMessage}</div><div style="margin-top:26px;padding:16px;border-radius:12px;background:#eff6ff;color:#1e3a8a;font-size:13px;line-height:1.7"><strong>Need assistance?</strong><br>Contact Navstar Digital Hub using the official contacts above. Never share your password, M-Pesa PIN or one-time verification code with anyone claiming to be support.</div></td></tr><tr><td style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:11px;line-height:1.7">This is an automated message from Navstar Digital Hub.<br>HOME OF TECHNOCRATS · Learn • Create • Innovate • Empower</td></tr></table></td></tr></table></body></html>` };
}
export async function sendBrandedEmail(env, { email, subject, message, heading, preheader }) {
  if (!email || !env.RESEND_API_KEY || !env.MAIL_FROM) {
    console.error('Email not sent: recipient or Resend configuration is missing.');
    return { ok: false, reason: 'Email delivery is not configured.' };
  }
  const template = brandedEmail({ subject, message, heading, preheader });
  const response = await fetch(EMAIL_ENDPOINT, { method:'POST', headers:{ Authorization:`Bearer ${env.RESEND_API_KEY}`, 'Content-Type':'application/json' }, body:JSON.stringify({ from:env.MAIL_FROM, to:[email], subject:template.subject, text:template.text, html:template.html }) });
  if (!response.ok) { const detail=await response.text().catch(()=> ''); console.error('Resend email delivery failed:',response.status,detail.slice(0,500)); return {ok:false,reason:'Email provider rejected the message.'}; }
  return {ok:true};
}
export async function sendCustomerNotice(env, { email, phone, subject, message }) {
  const tasks=[];
  if(email) tasks.push(sendBrandedEmail(env,{email,subject,message,heading:subject}));
  if(phone && env.AT_USERNAME && env.AT_API_KEY) {
    const form=new URLSearchParams({username:env.AT_USERNAME,to:phone.startsWith('+')?phone:`+${phone}`,message});
    if(env.AT_SENDER_ID) form.set('from',env.AT_SENDER_ID);
    tasks.push(fetch(SMS_ENDPOINT,{method:'POST',headers:{apiKey:env.AT_API_KEY,Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:form.toString()}));
  }
  return Promise.allSettled(tasks);
}
export function queueCustomerNotice(context,env,notice) {
  const task=sendCustomerNotice(env,notice).then(results=>{const failed=results.filter(x=>x.status==='rejected'||(x.status==='fulfilled'&&x.value?.ok===false));if(failed.length)console.error('Customer notification delivery failures:',failed.length);}).catch(error=>console.error('Customer notification task failed:',String(error?.message||error)));
  if(typeof context?.waitUntil==='function') context.waitUntil(task); else void task;
}