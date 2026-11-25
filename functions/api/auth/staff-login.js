import { createSession, sha256 } from '../../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, uuid, normalizePhone } from '../../_shared/http.js';
import { sendCustomerNotice } from '../../_shared/notifications.js';

const staffRoles = ['admin', 'tutor', 'admissions', 'principal', 'finance'];
const normalizeStaffId = value => safeString(value, 20).toUpperCase().replace(/[^A-Z0-9]/g, '');
const digest = async value => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
};
const makeCode = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
const maskEmail = value => { const [name,domain] = String(value || '').split('@'); return name && domain ? name.slice(0,1) + '****@' + domain : ''; };
const maskPhone = value => { const digits=String(value||'').replace(/\D/g,''); return digits.length>=7 ? digits.slice(0,3)+'****'+digits.slice(-2) : ''; };

async function checkAttempts(db, staffId, ipHash) {
  const staffHash = await sha256('staff:' + staffId);
  const row = await db.prepare("SELECT COUNT(*) AS count FROM login_attempts WHERE email_hash=? AND ip_hash=? AND datetime(created_at)>datetime('now','-15 minutes')").bind(staffHash,ipHash).first();
  return { staffHash, count:Number(row?.count||0) };
}
async function recordAttempt(db, staffHash, ipHash) {
  await db.prepare('INSERT INTO login_attempts (id,email_hash,ip_hash) VALUES (?,?,?)').bind(crypto.randomUUID(),staffHash,ipHash).run();
}

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.',403);
  if (!env.DB) return error('Staff authentication is not configured.',503);
  let body; try { body=await readJson(request,4096); } catch { return error('Invalid request.'); }
  const action=safeString(body.action,12), staffId=normalizeStaffId(body.staffId), role=safeString(body.role,24);
  if (!['lookup','send','verify'].includes(action)||staffId.length<6||!staffRoles.includes(role)) return error('Enter a valid Staff ID and select the correct staff portal.',400);
  const ipHash=await sha256(request.headers.get('CF-Connecting-IP')||'unknown');
  const attempts=await checkAttempts(env.DB,staffId,ipHash);
  if (attempts.count>=8) return error('Too many verification attempts. Please wait 15 minutes before trying again.',429);
  const staff=await env.DB.prepare(`
    SELECT u.id,u.name,u.email,u.status,
      CASE WHEN lower(trim(u.role)) IN ('admin','tutor','admissions','principal','finance') THEN lower(trim(u.role)) ELSE lower(trim(COALESCE(NULLIF(p.portal_role,''),u.role))) END AS role,
      p.staff_id AS staffId,p.department,p.job_title AS jobTitle,p.phone AS phone
    FROM user_profiles p JOIN users u ON u.id=p.user_id
    WHERE REPLACE(UPPER(p.staff_id),'-','')=? AND u.status='active' LIMIT 1
  `).bind(staffId).first();
  if (!staff||staff.role!==role.toLowerCase()) { await recordAttempt(env.DB,attempts.staffHash,ipHash); return error('We could not match that Staff ID to the selected portal. Check the ID and portal, then try again.',404); }

  if (action==='lookup') {
    await recordAttempt(env.DB,attempts.staffHash,ipHash);
    return json({matched:true,staff:{name:staff.name,role:staff.role,department:staff.department||'',jobTitle:staff.jobTitle||'',emailMasked:maskEmail(staff.email),phoneMasked:maskPhone(staff.phone),hasEmail:!!staff.email,hasPhone:!!normalizePhone(staff.phone)}});
  }

  const channel=body.channel==='sms'?'sms':'email';
  const identifier=channel==='sms'?normalizePhone(staff.phone):String(staff.email||'').trim().toLowerCase();
  if (!identifier) return error(channel==='sms'?'No registered mobile number is available. Ask the administrator to update your staff profile.':'No registered email address is available. Ask the administrator to update your staff profile.',409);

  if (action==='send') {
    if (channel==='email'&&(!env.RESEND_API_KEY||!env.MAIL_FROM)) return error('Email verification is not configured. Contact Navstar support.',503);
    if (channel==='sms'&&(!env.TEXTSMS_API_KEY||!env.TEXTSMS_PARTNER_ID)) return error('SMS verification is not configured. Contact Navstar support.',503);
    const recent=await env.DB.prepare("SELECT COUNT(*) AS count FROM student_recovery_codes WHERE user_id=? AND delivery_channel=? AND julianday(created_at)>julianday('now','-1 hour')").bind(staff.id,channel).first();
    if(Number(recent?.count||0)>=5) return error('Too many verification codes requested. Please wait before trying again.',429);
    const code=makeCode(),expiresAt=new Date(Date.now()+10*60*1000).toISOString();
    await env.DB.prepare("UPDATE student_recovery_codes SET used_at=datetime('now'),reset_token_hash=NULL WHERE user_id=? AND used_at IS NULL").bind(staff.id).run();
    await env.DB.prepare('INSERT INTO student_recovery_codes (id,user_id,email,otp_hash,expires_at,recovery_identifier,delivery_channel) VALUES (?,?,?,?,?,?,?)')
      .bind(uuid(),staff.id,staff.email,await digest(code),expiresAt,identifier,channel).run();
    const message=`Your Navstar Digital Hub staff sign-in verification code is ${code}. It expires in 10 minutes and can be used once. Never share this code with anyone. If you did not request it, ignore this message.`;
    const sent=await sendCustomerNotice(env,{email:channel==='email'?staff.email:'',phone:channel==='sms'?staff.phone:'',subject:'Navstar staff sign-in verification code',message});
    if(!sent.some(item=>item.status==='fulfilled'&&item.value?.ok!==false)){
      await env.DB.prepare("UPDATE student_recovery_codes SET used_at=datetime('now') WHERE user_id=? AND used_at IS NULL").bind(staff.id).run();
      return error('The verification code could not be delivered. Try the other contact method or contact Navstar support.',502);
    }
    return json({sent:true,message:`Verification code sent to your registered ${channel==='sms'?'mobile number':'email address'}.`});
  }

  const otp=safeString(body.otp,6);
  if(!/^\d{6}$/.test(otp)) return error('Enter the six-digit verification code.');
  const record=await env.DB.prepare(`SELECT id,otp_hash,attempts,expires_at FROM student_recovery_codes WHERE user_id=? AND recovery_identifier=? AND delivery_channel=? AND used_at IS NULL AND verified_at IS NULL ORDER BY created_at DESC LIMIT 1`).bind(staff.id,identifier,channel).first();
  if(!record||Number(record.attempts)>=5||new Date(record.expires_at).getTime()<=Date.now()) return error('The code has expired or is invalid. Request a new code.');
  if(await digest(otp)!==record.otp_hash){await env.DB.prepare('UPDATE student_recovery_codes SET attempts=attempts+1 WHERE id=?').bind(record.id).run();return error('The verification code is incorrect. Check it and try again.',401);}
  await env.DB.prepare("UPDATE student_recovery_codes SET used_at=datetime('now'),verified_at=? WHERE id=?").bind(new Date().toISOString(),record.id).run();
  await env.DB.prepare('DELETE FROM login_attempts WHERE email_hash=? AND ip_hash=?').bind(attempts.staffHash,ipHash).run();
  const cookie=await createSession(env,staff.id,request);
  return json({user:{id:staff.id,name:staff.name,role:staff.role,mustChangePassword:false}},200,{'Set-Cookie':cookie});
}
