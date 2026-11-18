import { requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, uuid } from '../../_shared/http.js';
const host = env => env.DARAJA_ENVIRONMENT === 'production' ? 'api.safaricom.co.ke' : 'sandbox.safaricom.co.ke';
async function getToken(env) {
 const auth=btoa(env.DARAJA_CONSUMER_KEY+':'+env.DARAJA_CONSUMER_SECRET);
 const response=await fetch('https://'+host(env)+'/oauth/v1/generate?grant_type=client_credentials',{headers:{Authorization:'Basic '+auth},signal:AbortSignal.timeout(10000)});
 const data=await response.json(); if(!response.ok||!data.access_token) throw new Error('Authentication failed'); return data.access_token;
}
export async function onRequestPost({request,env}) {
 if(!isSameOrigin(request)) return error('Cross-origin request rejected.',403);
 if(!env.DB) return error('Database is not configured.',503);
 const access=await requireRole(request,env,['admin']); if(access.response) return access.response;
 if(!env.DARAJA_CONSUMER_KEY||!env.DARAJA_CONSUMER_SECRET||!env.DARAJA_INITIATOR_NAME||!env.DARAJA_SECURITY_CREDENTIAL||!env.DARAJA_SHORTCODE||!env.DARAJA_BALANCE_CALLBACK_URL||!env.DARAJA_CALLBACK_TOKEN)
  return error('Live balance lookup is not enabled. Configure Daraja Account Balance initiator, security credential and public callback URL in Cloudflare secrets.',503);
 const id=uuid(), callback=new URL(env.DARAJA_BALANCE_CALLBACK_URL); callback.searchParams.set('token',env.DARAJA_CALLBACK_TOKEN);
 try {
  const accessToken=await getToken(env);
  const response=await fetch('https://'+host(env)+'/mpesa/accountbalance/v1/query',{method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:JSON.stringify({Initiator:env.DARAJA_INITIATOR_NAME,SecurityCredential:env.DARAJA_SECURITY_CREDENTIAL,CommandID:'AccountBalance',PartyA:env.DARAJA_SHORTCODE,IdentifierType:env.DARAJA_IDENTIFIER_TYPE||'4',Remarks:'Navstar balance check',QueueTimeOutURL:callback.toString(),ResultURL:callback.toString()}),signal:AbortSignal.timeout(15000)});
  const result=await response.json(); if(!response.ok||!result.OriginatorConversationID) return error('Safaricom did not accept the balance enquiry. Check Daraja permissions and configuration.',502);
  await env.DB.prepare('INSERT INTO mpesa_balance_snapshots (id,request_id,result_description,requested_by) VALUES (?,?,?,?)').bind(id,result.OriginatorConversationID,result.ResponseDescription||'Accepted by Safaricom',access.user.id).run();
  return json({accepted:true,message:'Safaricom accepted the balance enquiry. The live balance will appear after its callback.'});
 } catch { return error('Could not contact Safaricom Account Balance API. No balance has been assumed.',502); }
}