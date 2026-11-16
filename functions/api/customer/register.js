import { registerCustomer,setCustomerSession } from '../../_shared/customer-auth.js';
import { error,isSameOrigin,json,readJson,safeString,normalizePhone } from '../../_shared/http.js';
import { rateLimited } from '../../_shared/rate-limit.js';

const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export async function onRequestPost({request,env}) {
  if(!isSameOrigin(request)) return error('Cross-origin request rejected.',403);
  if(!env.DB) return error('Customer accounts are not configured yet.',503);
  if(await rateLimited(env.DB,request,'customer-register',{maximum:5,minutes:30})) return error('Too many registration attempts. Please try again later.',429);
  let body; try{body=await readJson(request,8192);}catch{return error('Invalid registration details.');}
  const fullName=safeString(body.fullName,120), email=safeString(body.email,254).toLowerCase();
  const phone=body.phone ? normalizePhone(body.phone) : '';
  const password=String(body.password||'');
  if(fullName.length<2||!emailPattern.test(email)||(body.phone&&!phone)||password.length<10||password.length>200) return error('Enter your name, a valid email, a valid phone number if supplied, and a password of at least 10 characters.');
  try {
    const customer=await registerCustomer(env,{fullName,email,phone,password});
    const cookie=await setCustomerSession(env,customer.id);
    return json({customer},201,{'Set-Cookie':cookie});
  } catch(e) {
    if(String(e).includes('UNIQUE')) return error('An account with this email already exists. Please sign in instead.',409);
    return error('We could not create your account. Please try again.',500);
  }
}
