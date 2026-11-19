import { requireRole } from '../../_shared/auth.js';
import { error,isSameOrigin,json,readJson,safeString,uuid } from '../../_shared/http.js';

const roles=['admin','principal','finance'];
function makeBarcode(){return 'NS'+Date.now().toString(36).toUpperCase()+crypto.randomUUID().replace(/-/g,'').slice(0,8).toUpperCase();}
export async function onRequestGet({request,env}){
 if(!env.DB)return error('Business operations database is not configured.',503);
 const access=await requireRole(request,env,roles);if(access.response)return access.response;
 const url=new URL(request.url),view=url.searchParams.get('view')||'overview';
 if(view==='products'){const r=await env.DB.prepare('SELECT * FROM business_products ORDER BY name LIMIT 1000').all();return json({products:r.results||[]});}
 if(view==='sales'){const r=await env.DB.prepare('SELECT * FROM business_sales ORDER BY created_at DESC LIMIT 500').all();return json({sales:r.results||[]});}
 const [products,sales,revenue,lowStock,top]=await Promise.all([
  env.DB.prepare('SELECT COUNT(*) AS n FROM business_products WHERE status=?').bind('active').first(),
  env.DB.prepare('SELECT COUNT(*) AS n FROM business_sales').first(),
  env.DB.prepare("SELECT COALESCE(SUM(total_amount),0) AS n FROM business_sales WHERE payment_status='paid'").first(),
  env.DB.prepare('SELECT COUNT(*) AS n FROM business_products WHERE status=? AND stock_quantity<=reorder_level').bind('active').first(),
  env.DB.prepare("SELECT i.product_name AS name,SUM(i.quantity) AS quantity,SUM(i.line_total) AS value FROM business_sale_items i JOIN business_sales s ON s.id=i.sale_id WHERE s.payment_status='paid' GROUP BY i.product_id ORDER BY quantity DESC LIMIT 10").all()
 ]);
 return json({products:Number(products?.n||0),sales:Number(sales?.n||0),verifiedRevenue:Number(revenue?.n||0),lowStock:Number(lowStock?.n||0),topProducts:top.results||[]});
}
export async function onRequestPost({request,env}){
 if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
 if(!env.DB)return error('Business operations database is not configured.',503);
 const access=await requireRole(request,env,roles);if(access.response)return access.response;
 let body;try{body=await readJson(request,20000);}catch{return error('Invalid operations request.');}
 const action=safeString(body.action,32);
 if(action==='save_product'){
  const name=safeString(body.name,160),id=safeString(body.id,80)||uuid(),price=Number(body.unitPrice),stock=Number(body.stockQuantity),reorder=Number(body.reorderLevel||0);
  if(name.length<2||!Number.isSafeInteger(price)||price<0||!Number.isSafeInteger(stock)||stock<0||!Number.isSafeInteger(reorder)||reorder<0)return error('Enter a product name and valid price and stock quantities.');
  const old=await env.DB.prepare('SELECT id,barcode FROM business_products WHERE id=?').bind(id).first();
  const barcode=safeString(body.barcode,80)||old?.barcode||makeBarcode();
  await env.DB.prepare('INSERT INTO business_products(id,name,sku,barcode,category,unit_price,stock_quantity,reorder_level,status,created_by) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,sku=excluded.sku,barcode=excluded.barcode,category=excluded.category,unit_price=excluded.unit_price,stock_quantity=excluded.stock_quantity,reorder_level=excluded.reorder_level,status=excluded.status,updated_at=CURRENT_TIMESTAMP')
   .bind(id,name,safeString(body.sku,80)||null,barcode,safeString(body.category,100),price,stock,reorder,['active','paused','archived'].includes(body.status)?body.status:'active',access.user.id).run();
  await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),access.user.id,'business_product_saved','business_product',id).run();
  return json({saved:true,id,barcode});
 }
 if(action==='generate_missing_barcodes'){
  const rows=(await env.DB.prepare("SELECT id FROM business_products WHERE barcode IS NULL OR barcode='' LIMIT 500").all()).results||[];
  for(const row of rows)await env.DB.prepare("UPDATE business_products SET barcode=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND (barcode IS NULL OR barcode='')").bind(makeBarcode(),row.id).run();
  return json({generated:rows.length});
 }
 if(action==='create_sale'){
  const items=Array.isArray(body.items)?body.items.slice(0,100):[];
  if(!items.length)return error('Add at least one product to the sale.');
  const saleId=uuid(),receipt='NS-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+saleId.slice(0,8).toUpperCase();
  let subtotal=0;const lines=[];
  for(const item of items){
   const barcode=safeString(item.barcode,80),productId=safeString(item.productId,80);
   const product=await env.DB.prepare('SELECT id,name,unit_price,stock_quantity FROM business_products WHERE status=? AND (id=? OR barcode=?)').bind('active',productId,barcode).first();
   const quantity=Number(item.quantity);
   if(!product||!Number.isSafeInteger(quantity)||quantity<1||quantity>999||product.stock_quantity<quantity)return error('A product is missing or stock is insufficient. Check the scanned items.');
   const lineTotal=Number(product.unit_price)*quantity;subtotal+=lineTotal;lines.push({product,quantity,lineTotal});
  }
  const discount=Number(body.discountAmount||0);if(!Number.isSafeInteger(discount)||discount<0||discount>subtotal)return error('Invalid discount.');
  await env.DB.prepare('INSERT INTO business_sales(id,receipt_number,customer_name,customer_phone,subtotal,discount_amount,total_amount,payment_method,payment_status,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)')
   .bind(saleId,receipt,safeString(body.customerName,140),safeString(body.customerPhone,32),subtotal,discount,subtotal-discount,['cash','mpesa','bank','card'].includes(body.paymentMethod)?body.paymentMethod:'pending','pending',access.user.id).run();
  for(const line of lines){
   await env.DB.prepare('INSERT INTO business_sale_items(id,sale_id,product_id,product_name,quantity,unit_price,line_total) VALUES(?,?,?,?,?,?,?)').bind(uuid(),saleId,line.product.id,line.product.name,line.quantity,line.product.unit_price,line.lineTotal).run();
   await env.DB.prepare('UPDATE business_products SET stock_quantity=stock_quantity-?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND stock_quantity>=?').bind(line.quantity,line.product.id,line.quantity).run();
  }
  return json({created:true,saleId,receiptNumber:receipt,totalAmount:subtotal-discount,paymentStatus:'pending'});
 }
 if(action==='confirm_cash_sale'){
  const saleId=safeString(body.saleId,80);const sale=await env.DB.prepare("SELECT id FROM business_sales WHERE id=? AND payment_status='pending' AND payment_method='cash'").bind(saleId).first();
  if(!sale)return error('Only a pending cash sale can be confirmed.',404);
  await env.DB.prepare("UPDATE business_sales SET payment_status='paid' WHERE id=?").bind(saleId).run();
  await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),access.user.id,'cash_sale_confirmed','business_sale',saleId).run();
  return json({confirmed:true});
 }
 return error('Unsupported business operations action.');
}
