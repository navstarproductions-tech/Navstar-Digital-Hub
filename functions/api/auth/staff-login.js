import { createSession, sha256 } from '../../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, normalizePhone } from '../../_shared/http.js';

const staffRoles = ['admin', 'tutor', 'admissions', 'principal', 'finance'];
const normalizeStaffId = value => safeString(value, 20).toUpperCase().replace(/[^A-Z0-9]/g, '');
const maskEmail = value => { const [name,domain] = String(value || '').split('@'); return name && domain ? name.slice(0,1) + '****@' + domain : ''; };
const maskPhone = value => { const digits=String(value||'').replace(/\D/g,''); return digits.length>=7 ? digits.slice(0,3)+'****'+digits.slice(-2) : ''; };
const normalizeNationalId = value => String(value || '').replace(/\D/g, '');

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
  if (!['lookup','verify'].includes(action)||staffId.length<6||!staffRoles.includes(role)) return error('Enter a valid Staff ID and select the correct staff portal.',400);
  const ipHash=await sha256(request.headers.get('CF-Connecting-IP')||'unknown');
  const attempts=await checkAttempts(env.DB,staffId,ipHash);
  if (attempts.count>=8) return error('Too many verification attempts. Please wait 15 minutes before trying again.',429);
  const staff=await env.DB.prepare(`
    SELECT u.id,u.name,u.email,u.status,
      CASE WHEN lower(trim(u.role)) IN ('admin','tutor','admissions','principal','finance') THEN lower(trim(u.role)) ELSE lower(trim(COALESCE(NULLIF(p.portal_role,''),u.role))) END AS role,
      p.staff_id AS staffId,p.department,p.job_title AS jobTitle,p.phone AS phone,p.national_id AS nationalId,p.profile_photo_url AS profilePicture
    FROM user_profiles p JOIN users u ON u.id=p.user_id
    WHERE REPLACE(UPPER(p.staff_id),'-','')=? AND u.status='active' LIMIT 1
  `).bind(staffId).first();
  if (!staff||staff.role!==role.toLowerCase()) { await recordAttempt(env.DB,attempts.staffHash,ipHash); return error('We could not match that Staff ID to the selected portal. Check the ID and portal, then try again.',404); }

  if (action==='lookup') {
    await recordAttempt(env.DB,attempts.staffHash,ipHash);
    return json({matched:true,staff:{name:staff.name,role:staff.role,department:staff.department||'',jobTitle:staff.jobTitle||'',emailMasked:maskEmail(staff.email),phoneMasked:maskPhone(staff.phone),hasEmail:!!staff.email,hasPhone:!!normalizePhone(staff.phone),profilePicture:staff.profilePicture||''}});
  }

  const nationalId=normalizeNationalId(body.nationalId);
  const registeredNationalId=normalizeNationalId(staff.nationalId);
  if (nationalId.length<6 || nationalId.length>12) return error('Enter your registered National ID number.',400);
  if (!registeredNationalId) return error('Your National ID is not yet recorded on your staff profile. Contact the administrator to update your staff record.',409);
  if (nationalId!==registeredNationalId) {
    await recordAttempt(env.DB,attempts.staffHash,ipHash);
    return error('The National ID does not match the validated staff account. Check the number and try again.',401);
  }
  await env.DB.prepare('DELETE FROM login_attempts WHERE email_hash=? AND ip_hash=?').bind(attempts.staffHash,ipHash).run();
  const cookie=await createSession(env,staff.id,request);
  return json({user:{id:staff.id,name:staff.name,role:staff.role,mustChangePassword:false}},200,{'Set-Cookie':cookie});
}
