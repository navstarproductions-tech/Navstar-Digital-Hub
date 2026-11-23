import { requireRole } from '../../_shared/auth.js';
import { error,json } from '../../_shared/http.js';
export async function onRequestGet({request,env}){
 if(!env.DB)return error('Customer cart storage is not configured.',503);
 const access=await requireRole(request,env,['admin','principal','finance','admissions']);if(access.response)return access.response;
 const rows=await env.DB.prepare(`
  SELECT cart.id AS cartId,cart.updated_at AS updatedAt,c.id AS customerId,c.full_name AS customerName,c.email,c.phone,
    i.id AS itemId,i.item_type AS itemType,i.item_id AS productId,i.quantity,i.instructions,
    CASE WHEN i.item_type='course' THEN co.title ELSE s.name END AS itemName,
    CASE WHEN i.item_type='course' THEN co.price ELSE s.price_amount END AS unitPrice,
    CASE WHEN i.item_type='course' THEN co.status ELSE s.status END AS itemStatus
  FROM customer_carts cart JOIN customer_accounts c ON c.id=cart.customer_id
  JOIN customer_cart_items i ON i.cart_id=cart.id
  LEFT JOIN courses co ON i.item_type='course' AND co.id=i.item_id
  LEFT JOIN services s ON i.item_type='service' AND s.id=i.item_id
  ORDER BY cart.updated_at DESC,i.created_at ASC
 `).all();
 const carts=new Map();
 for(const row of rows.results||[]){
  if(!carts.has(row.cartId))carts.set(row.cartId,{id:row.cartId,customerId:row.customerId,customerName:row.customerName,email:row.email,phone:row.phone,updatedAt:row.updatedAt,items:[],estimatedTotal:0});
  const cart=carts.get(row.cartId),quantity=Number(row.quantity||0),unitPrice=Number(row.unitPrice||0);
  cart.items.push({id:row.itemId,type:row.itemType,productId:row.productId,name:row.itemName||'Unavailable item',quantity,instructions:row.instructions||'',unitPrice:Number.isFinite(unitPrice)?unitPrice:null,status:row.itemStatus||'unavailable'});
  if(Number.isFinite(unitPrice))cart.estimatedTotal+=unitPrice*quantity;
 }
 return json({carts:[...carts.values()]});
}
