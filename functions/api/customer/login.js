import { loginCustomer,setCustomerSession } from '../../_shared/customer-auth.js';
import { error,isSameOrigin,json,readJson,safeString,sha256,uuid } from '../../_shared/http.js';
export async function onRequestPost({request,env}) {
  if(!isSameOrigin(request)) return error('Cross-origin request rejected.',403);
  if(!env.DB) return error('Customer accounts are not configured yet.',503);
  let body;try{body=await readJson(request,4096);}catch{return error('Invalid sign-in details.');}
  const email=safeString(body.email,254).toLowerCase(),password=String(body.password||'');
  if(!email.includes('@')||password.length<1||password.length>200)return error('Enter your email and password.');
  const emailHash=await sha256(email),ipHash=await sha256(request.headers.get('CF-Connecting-IP')||'unknown');
  const attempts=await env.DB.prepare("SELECT COUNT(*) AS count FROM login_attempts WHERE email_hash=? AND ip_hash=? AND datetime(created_at)>datetime('now','-15 minutes')").bind(emailHash,ipHash).first();
  if(Number(attempts?.count||0)>=8)return error('Too many sign-in attempts. Try again later.',429);
  const customer=await loginCustomer(env,email,password);
  if(!customer){await env.DB.prepare('INSERT INTO login_attempts (id,email_hash,ip_hash) VALUES (?,?,?)').bind(uuid(),emailHash,ipHash).run();return error('Email or password is incorrect.',401);}
  await env.DB.prepare('DELETE FROM login_attempts WHERE email_hash=? AND ip_hash=?').bind(emailHash,ipHash).run();
  const cookie=await setCustomerSession(env,customer.id);
  return json({customer},200,{'Set-Cookie':cookie});
}
