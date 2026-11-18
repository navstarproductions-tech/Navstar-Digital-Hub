import { error, isSameOrigin, json, normalizePhone, readJson, safeString, uuid } from '../_shared/http.js';
import { rateLimited } from '../_shared/rate-limit.js';
import { nextReference } from '../_shared/references.js';
export async function onRequestPost({request,env}) {
 if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
 if(!env.DB)return error('Donations service is not configured.',503);
 if(await rateLimited(env.DB,request,'donation',{maximum:8,minutes:15}))return error('Too many contribution requests. Try again later.',429);
 let body;try{body=await readJson(request,4096);}catch{return error('Invalid request body.');}
 const phone=normalizePhone(body.phone),amount=Number(body.amount),type=safeString(body.contributionType,20)||'donation';
 const payerName=safeString(body.payerName,120),debtReference=safeString(body.debtReference,80),debtDescription=safeString(body.debtDescription,300);
 if(!['donation','contribution','debt_payment'].includes(type))return error('Choose donation, contribution or debt repayment.');
 if(!phone||!Number.isInteger(amount)||amount<1||amount>150000)return error('Enter a valid phone number and amount.');
 if(type==='debt_payment'&&!debtReference)return error('Enter the debt or deficit reference so the payment can be allocated correctly.');
 const id=uuid(),reference=await nextReference(env.DB,type==='debt_payment'?'DEBT':'DON');
 await env.DB.prepare('INSERT INTO donations (id,display_ref,phone,amount,contribution_type,payer_name,debt_reference,debt_description) VALUES (?,?,?,?,?,?,?,?)')
  .bind(id,reference,phone,amount,type,payerName||null,debtReference||null,debtDescription||null).run();
 return json({id,reference,status:'pending',amount,contributionType:type},201);
}