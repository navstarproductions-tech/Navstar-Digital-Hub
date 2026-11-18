import { error, json, safeString } from '../../_shared/http.js';
function equal(a,b){if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;}
export async function onRequestPost({request,env}) {
 if(!env.DB||!env.DARAJA_CALLBACK_TOKEN)return error('Callback is not configured.',503);
 const url=new URL(request.url);if(!equal(url.searchParams.get('token')||'',env.DARAJA_CALLBACK_TOKEN))return error('Not found.',404);
 let body;try{body=await request.json();}catch{return error('Invalid callback body.');}
 const result=body?.Result;if(!result)return error('Invalid balance callback.');
 const params=result.ResultParameters?.ResultParameter||[], parsed=Object.fromEntries(params.map(x=>[x.Key,x.Value]));
 const balanceText=safeString(parsed.AccountBalance,1000), conversation=safeString(result.OriginatorConversationID,120);
 const match=balanceText.match(/KES\s*\|?\s*([0-9,]+(?:\.[0-9]+)?)/i)||balanceText.match(/\|\s*([0-9,]+(?:\.[0-9]+)?)\s*\|/);
 const amount=match?Number(match[1].replace(/,/g,'')):null;
 const row=await env.DB.prepare('SELECT id FROM mpesa_balance_snapshots WHERE request_id=? ORDER BY created_at DESC LIMIT 1').bind(conversation).first();
 if(row) await env.DB.prepare('UPDATE mpesa_balance_snapshots SET result_code=?,result_description=?,balance_text=?,balance_amount=?,raw_result=?,received_at=? WHERE id=?').bind(Number(result.ResultCode),safeString(result.ResultDesc,500),balanceText||null,Number.isFinite(amount)?amount:null,JSON.stringify(body).slice(0,12000),new Date().toISOString(),row.id).run();
 return json({ResultCode:0,ResultDesc:'Accepted'});
}