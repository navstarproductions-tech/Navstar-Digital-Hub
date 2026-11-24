import { sha256 } from '../../_shared/auth.js';
import { setCustomerSession } from '../../_shared/customer-auth.js';
import { error, isSameOrigin, json, readJson, safeString } from '../../_shared/http.js';
export async function onRequestPost({request,env}) {
 if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
 if(!env.DB)return error('Customer account storage is not configured.',503);
 let body;try{body=await readJson(request,4096);}catch{return error('Enter the verification code sent to your email.');}
 const email=safeString(body.email,254).toLowerCase(),code=String(body.code||'').replace(/\s/g,'');
 if(!email.includes('@')||!/^\d{6}$/.test(code))return error('Enter the valid six-digit verification code.');
 const pending=await env.DB.prepare('SELECT * FROM customer_registration_otps WHERE email=? COLLATE NOCASE').bind(email).first();
 if(!pending)return error('No pending registration was found. Please start registration again.',404);
 if(new Date(pending.expires_at).getTime()<=Date.now()){await env.DB.prepare('DELETE FROM customer_registration_otps WHERE email=?').bind(email).run();return error('Your verification code has expired. Please register again.',410);}
 if(Number(pending.attempts)>=5){await env.DB.prepare('DELETE FROM customer_registration_otps WHERE email=?').bind(email).run();return error('Too many incorrect codes. Please start registration again.',429);}
 if(await sha256(code)!==pending.otp_hash){await env.DB.prepare('UPDATE customer_registration_otps SET attempts=attempts+1 WHERE email=?').bind(email).run();return error('That verification code is incorrect. Please check your email and try again.',400);}
 const existing=await env.DB.prepare('SELECT id FROM customer_accounts WHERE email=? COLLATE NOCASE').bind(email).first();
 if(existing){await env.DB.prepare('DELETE FROM customer_registration_otps WHERE email=?').bind(email).run();return error('An account with this email already exists. Please sign in.',409);}
 const id=pending.id;
 try {
  await env.DB.prepare('INSERT INTO customer_accounts (id,full_name,email,phone,password_hash,password_salt) VALUES (?,?,?,?,?,?)').bind(id,pending.full_name,pending.email,pending.phone,pending.password_hash,pending.password_salt).run();
  const profileJson = typeof pending.profile_json === 'string' && pending.profile_json ? pending.profile_json : '{}';
  await env.DB.prepare('INSERT INTO customer_profiles (customer_id,profile_json,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)').bind(id,profileJson).run();
  await env.DB.prepare('DELETE FROM customer_registration_otps WHERE email=?').bind(email).run();
  const cookie=await setCustomerSession(env,id);
  return json({customer:{id,fullName:pending.full_name,email:pending.email,phone:pending.phone},message:'Your email is verified and your Navstar account is ready.'},201,{'Set-Cookie':cookie});
 } catch(cause) {const ref=crypto.randomUUID().slice(0,8).toUpperCase();console.error('Customer OTP verification failed ['+ref+']:',String(cause?.message||cause));return error('We could not complete account verification. Please contact Navstar support and quote '+ref+'.',500);}
}