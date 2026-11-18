import { registerCustomer,loginCustomer,setCustomerSession } from '../../_shared/customer-auth.js';
import { error,isSameOrigin,json,readJson,safeString,normalizePhone } from '../../_shared/http.js';
import { rateLimited } from '../../_shared/rate-limit.js';
import { passwordPolicyError } from '../../_shared/password-policy.js';

const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export async function onRequestPost({request,env}) {
  if(!isSameOrigin(request)) return error('Cross-origin request rejected.',403);
  if(!env.DB) return error('Customer accounts are not configured yet.',503);
  if(await rateLimited(env.DB,request,'customer-register',{maximum:5,minutes:30})) return error('Too many registration attempts. Please try again later.',429);
  let body; try{body=await readJson(request,8192);}catch{return error('Invalid registration details.');}
  const fullName=safeString(body.fullName,120), email=safeString(body.email,254).toLowerCase();
  const phone=body.phone ? normalizePhone(body.phone) : '';
  const password=String(body.password||'');
  if(fullName.length<2||!emailPattern.test(email)||(body.phone&&!phone)) return error('Enter your full name, a valid email address, and a valid phone number if supplied.');
  const passwordError = passwordPolicyError(password);
  if (passwordError) return error(passwordError);
  if (password !== String(body.confirmPassword || '')) return error('The passwords do not match.');
  try {
    let customer;
    let created = true;
    try {
      customer = await registerCustomer(env,{fullName,email,phone,password});
    } catch (insertError) {
      const detail = String(insertError?.message || insertError || '');
      if (!/UNIQUE|unique constraint/i.test(detail)) throw insertError;
      // A previous attempt may have saved the account but failed before creating its session.
      customer = await loginCustomer(env,email,password);
      if (!customer) return error('An account with this email already exists. Please sign in or use the password reset option.',409);
      created = false;
    }
    const cookie=await setCustomerSession(env,customer.id);
    return json({customer},created?201:200,{'Set-Cookie':cookie});
  } catch(e) {
    const detail = String(e?.message || e || 'unknown error');
    if(/UNIQUE|unique constraint/i.test(detail)) return error('An account with this email already exists. Please sign in instead.',409);
    const supportRef = crypto.randomUUID().slice(0,8).toUpperCase();
    console.error('Customer registration failed [' + supportRef + ']:', detail);
    if(/no such table|no such column|schema/i.test(detail)) return error('Customer account storage is not fully configured yet. Please contact Navstar support and quote ' + supportRef + '.',503);
    return error('We could not create your account. Please contact Navstar support and quote ' + supportRef + '.',500);
  }
}
