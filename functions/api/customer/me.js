import { getCustomerSession } from '../../_shared/customer-auth.js';
import { error,json } from '../../_shared/http.js';
export async function onRequestGet({request,env}) {
  if(!env.DB)return error('Customer accounts are not configured yet.',503);
  const customer=await getCustomerSession(request,env);
  if(!customer)return error('Sign in required.',401);
  return json({customer});
}
