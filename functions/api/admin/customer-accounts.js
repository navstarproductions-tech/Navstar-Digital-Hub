import { requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString } from '../../_shared/http.js';

export async function onRequestGet({request,env}) {
  if (!env.DB) return error('Customer account storage is not configured.',503);
  const access=await requireRole(request,env,['admin','principal','admissions','finance']);
  if(access.response)return access.response;
  const result=await env.DB.prepare(`SELECT c.id,c.full_name,c.email,c.phone,c.status,c.created_at,c.updated_at,
    (SELECT COUNT(*) FROM customer_cart_items i JOIN customer_carts cart ON cart.id=i.cart_id WHERE cart.customer_id=c.id) AS cart_items,
    (SELECT COUNT(*) FROM service_requests sr WHERE lower(sr.email)=lower(c.email)) AS service_requests
    FROM customer_accounts c ORDER BY c.created_at DESC LIMIT 1000`).all();
  return json({accounts:result.results||[]});
}

export async function onRequestPut({request,env}) {
  if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
  if(!env.DB)return error('Customer account storage is not configured.',503);
  const access=await requireRole(request,env,['admin']);
  if(access.response)return access.response;
  let body;try{body=await readJson(request,4096);}catch{return error('Invalid account update.');}
  const id=safeString(body.id,80),status=safeString(body.status,20);
  if(!id||!['active','suspended'].includes(status))return error('Choose a valid customer account status.');
  const result=await env.DB.prepare('UPDATE customer_accounts SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(status,id).run();
  if(!result.meta?.changes)return error('Customer account not found.',404);
  if(status==='suspended')await env.DB.prepare('DELETE FROM customer_sessions WHERE customer_id=?').bind(id).run();
  return json({success:true,status});
}
