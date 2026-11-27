import { requireRole } from '../../_shared/auth.js';
import { error, json } from '../../_shared/http.js';
export async function onRequestGet({request,env}){
 if(!env.DB)return error('Services database is not configured.',503);
 const access=await requireRole(request,env,['admin','principal','finance','admissions']);
 if(access.response)return access.response;
 const rows=await env.DB.prepare("SELECT id,display_ref AS reference,name,category,price_label AS price,price_amount AS priceAmount,status FROM services ORDER BY category,name").all();
 return json({services:(rows.results||[]).map(row=>({...row,priceAmount:row.priceAmount===null?null:Number(row.priceAmount)}))});
}
