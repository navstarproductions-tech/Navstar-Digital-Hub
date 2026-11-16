import { clearCustomerSession } from '../../_shared/customer-auth.js';
import { error,isSameOrigin,json } from '../../_shared/http.js';
export async function onRequestPost({request,env}) {
  if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
  const cookie=await clearCustomerSession(request,env);
  return json({ok:true},200,{'Set-Cookie':cookie});
}
