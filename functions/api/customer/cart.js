import { getCustomerSession } from '../../_shared/customer-auth.js';
import { error,isSameOrigin,json,readJson,safeString,uuid } from '../../_shared/http.js';
export async function onRequestGet({request,env}){
 if(!env.DB)return error('Customer cart is not configured yet.',503);
 const customer=await getCustomerSession(request,env);if(!customer)return error('Sign in to access your saved cart.',401);
 const cart=await env.DB.prepare('SELECT id FROM customer_carts WHERE customer_id=?').bind(customer.id).first();
 if(!cart)return json({items:[]});
 const result=await env.DB.prepare('SELECT id,item_type AS itemType,item_id AS itemId,quantity,instructions FROM customer_cart_items WHERE cart_id=? ORDER BY created_at').bind(cart.id).all();
 return json({items:result.results||[]});
}
export async function onRequestPost({request,env}){
 if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
 if(!env.DB)return error('Customer cart is not configured yet.',503);
 const customer=await getCustomerSession(request,env);if(!customer)return error('Sign in to save your cart.',401);
 let body;try{body=await readJson(request,4096)}catch{return error('Invalid cart request.')}
 const action=safeString(body.action,16),type=safeString(body.itemType,12),itemId=safeString(body.itemId,100);
 let cart=await env.DB.prepare('SELECT id FROM customer_carts WHERE customer_id=?').bind(customer.id).first();
 if(!cart){const id=uuid();await env.DB.prepare('INSERT INTO customer_carts (id,customer_id) VALUES (?,?)').bind(id,customer.id).run();cart={id};}
 if(action==='clear'){await env.DB.prepare('DELETE FROM customer_cart_items WHERE cart_id=?').bind(cart.id).run();}
 else if(action==='remove'){if(!itemId||!['service','course'].includes(type))return error('Choose a valid cart item.');await env.DB.prepare('DELETE FROM customer_cart_items WHERE cart_id=? AND item_type=? AND item_id=?').bind(cart.id,type,itemId).run();}
 else if(action==='add'||action==='update'){
  if(!itemId||!['service','course'].includes(type))return error('Choose a valid cart item.');
  const quantity=Math.max(1,Math.min(99,Number.parseInt(body.quantity,10)||1));
  const available=type==='course'?await env.DB.prepare("SELECT id FROM courses WHERE id=? AND status='active'").bind(itemId).first():await env.DB.prepare("SELECT id FROM services WHERE id=? AND status='active'").bind(itemId).first();
  if(!available)return error('This item is no longer available.',404);
  if(action==='add')await env.DB.prepare('INSERT INTO customer_cart_items (id,cart_id,item_type,item_id,quantity,instructions) VALUES (?,?,?,?,?,?) ON CONFLICT(cart_id,item_type,item_id) DO UPDATE SET quantity=MIN(99,customer_cart_items.quantity+excluded.quantity),instructions=excluded.instructions').bind(uuid(),cart.id,type,itemId,quantity,safeString(body.instructions,1000)).run();
  else await env.DB.prepare('INSERT INTO customer_cart_items (id,cart_id,item_type,item_id,quantity,instructions) VALUES (?,?,?,?,?,?) ON CONFLICT(cart_id,item_type,item_id) DO UPDATE SET quantity=excluded.quantity,instructions=excluded.instructions').bind(uuid(),cart.id,type,itemId,quantity,safeString(body.instructions,1000)).run();
 }else return error('Unsupported cart action.');
 await env.DB.prepare("UPDATE customer_carts SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(cart.id).run();
 const result=await env.DB.prepare('SELECT id,item_type AS itemType,item_id AS itemId,quantity,instructions FROM customer_cart_items WHERE cart_id=? ORDER BY created_at').bind(cart.id).all();
 return json({items:result.results||[]});
}
