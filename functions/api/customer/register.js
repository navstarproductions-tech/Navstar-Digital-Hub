import { hashPassword, sha256 } from '../../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, normalizePhone, uuid } from '../../_shared/http.js';
import { rateLimited } from '../../_shared/rate-limit.js';
import { passwordPolicyError } from '../../_shared/password-policy.js';
import { sendBrandedEmail } from '../../_shared/notifications.js';
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export async function onRequestPost({request,env}) {
 if(!isSameOrigin(request)) return error('Cross-origin request rejected.',403);
 if(!env.DB) return error('Customer account storage is not configured.',503);
 if(!env.RESEND_API_KEY||!env.MAIL_FROM) return error('Account verification email is not configured. Please contact Navstar support.',503);
 let body;try{body=await readJson(request,8192);}catch{return error('Invalid registration details.');}
 const fullName=safeString(body.fullName,120),email=safeString(body.email,254).toLowerCase(),phone=body.phone?normalizePhone(body.phone):'',password=String(body.password||'');
 if(fullName.length<2||!emailPattern.test(email)||(body.phone&&!phone))return error('Enter your full name, a valid email address and a valid phone number if supplied.');
 const policyError=passwordPolicyError(password);if(policyError)return error(policyError);
 if(password!==String(body.confirmPassword||''))return error('The passwords do not match.');
 if(await rateLimited(env.DB,request,'customer-register',{maximum:5,minutes:30},email))return error('Too many verification requests. Please wait before trying again.',429);
 try {
  const existing=await env.DB.prepare('SELECT id FROM customer_accounts WHERE email=? COLLATE NOCASE').bind(email).first();
  if(existing)return error('An account with this email already exists. Please sign in instead.',409);
  const credentials=await hashPassword(password),otp=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,'0'),otpHash=await sha256(otp),id=uuid(),expiresAt=new Date(Date.now()+600000).toISOString();
  await env.DB.prepare(`INSERT INTO customer_registration_otps (id,email,full_name,phone,password_hash,password_salt,otp_hash,expires_at,attempts) VALUES (?,?,?,?,?,?,?,?,0)
   ON CONFLICT(email) DO UPDATE SET id=excluded.id,full_name=excluded.full_name,phone=excluded.phone,password_hash=excluded.password_hash,password_salt=excluded.password_salt,otp_hash=excluded.otp_hash,expires_at=excluded.expires_at,attempts=0,created_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`).bind(id,email,fullName,phone||null,credentials.hash,credentials.salt,otpHash,expiresAt).run();
  const delivery=await sendBrandedEmail(env,{email,subject:'Verify your Navstar Digital Hub account',heading:'Complete your account registration',preheader:'Your one-time verification code expires in 10 minutes.',message:`Hello ${fullName},\n\nThank you for choosing Navstar Digital Hub. Use the verification code below to confirm that you own this email address and complete your account registration.\n\nYOUR ONE-TIME CODE: ${otp}\n\nThis code expires in 10 minutes and can be used once only. If you did not request this account, ignore this email. Never share this code with anyone.\n\nAfter verification, you can sign in to manage your Navstar services, course enquiries and customer activity.\n\nRegards,\nNavstar Digital Hub\nHOME OF TECHNOCRATS`});
  if(!delivery.ok){await env.DB.prepare('DELETE FROM customer_registration_otps WHERE email=?').bind(email).run();return error('We could not send your verification code. Please try again later or contact Navstar support.',503);}
  return json({verificationRequired:true,message:'A six-digit verification code has been sent to your email. It expires in 10 minutes.'},202);
 } catch(cause) {
  const ref=crypto.randomUUID().slice(0,8).toUpperCase(),detail=String(cause?.message||cause||'');
  console.error('Customer registration initiation failed ['+ref+']:',detail);
  if(/no such table|no such column|schema/i.test(detail))return error('Customer verification storage is not ready. Please contact Navstar support and quote '+ref+'.',503);
  return error('We could not start your account registration. Please contact Navstar support and quote '+ref+'.',500);
 }
}