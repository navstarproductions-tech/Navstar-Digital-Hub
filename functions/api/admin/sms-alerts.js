import { requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, normalizePhone, readJson, safeString, uuid } from '../../_shared/http.js';
import { sendTextSms } from '../../_shared/notifications.js';

export async function onRequestGet({request,env}){
  if(!env.DB)return error('SMS alert records are not configured.',503);
  const access=await requireRole(request,env,['admin','principal']);
  if(access.response)return access.response;
  const rows=await env.DB.prepare(`
    SELECT l.id,l.user_id AS userId,u.name AS recipientName,u.email,l.recipient_phone AS phone,
      l.title,l.message,l.status,l.provider_message_id AS providerMessageId,
      l.provider_response AS providerResponse,l.created_at AS createdAt,s.name AS sentBy
    FROM admin_sms_delivery_logs l JOIN users u ON u.id=l.user_id
    JOIN users s ON s.id=l.sent_by ORDER BY l.created_at DESC LIMIT 200
  `).all();
  return json({deliveries:rows.results||[],configured:Boolean(env.TEXTSMS_API_KEY&&env.TEXTSMS_PARTNER_ID)});
}

export async function onRequestPost({request,env}){
  if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
  if(!env.DB)return error('SMS alert records are not configured.',503);
  const access=await requireRole(request,env,['admin']);
  if(access.response)return access.response;
  if(!env.TEXTSMS_API_KEY||!env.TEXTSMS_PARTNER_ID)return error('SMS delivery is not configured. Set the TextSMS API key and partner ID in the server environment.',503);
  let body;try{body=await readJson(request,8192)}catch{return error('Invalid SMS request.',400)}
  const userId=safeString(body.userId,80),title=safeString(body.title,120),message=safeString(body.message,1200);
  if(!userId||title.length<3||message.length<3)return error('Select a recipient and enter a title and message.',400);
  const recipient=await env.DB.prepare(`
    SELECT u.id,u.name,u.email,COALESCE(p.portal_role,u.role) AS role,p.phone
    FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id
    WHERE u.id=? AND u.status='active' LIMIT 1
  `).bind(userId).first();
  if(!recipient)return error('The selected account is not active.',404);
  const phone=normalizePhone(recipient.phone);
  if(!phone)return error('This account does not have a valid Kenyan mobile number on its profile.',409);
  const id=uuid();
  let providerResult;
  try{
    providerResult=await sendTextSms(env,phone,title+'\\n'+message);
  }catch(cause){
    const reason=safeString(cause instanceof Error?cause.message:'SMS provider rejected the message.',500);
    await env.DB.prepare(`INSERT INTO admin_sms_delivery_logs(id,user_id,recipient_phone,title,message,status,provider_response,sent_by) VALUES(?,?,?,?,?,'failed',?,?)`)
      .bind(id,recipient.id,phone,title,message,reason,access.user.id).run().catch(()=>{});
    console.error('Admin SMS delivery failed:',reason);
    return error('The SMS provider did not accept this message. '+reason,502);
  }
  try{
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO admin_sms_delivery_logs(id,user_id,recipient_phone,title,message,status,provider_message_id,provider_response,sent_by) VALUES(?,?,?,?,?,'sent',?,?,?)`)
        .bind(id,recipient.id,phone,title,message,safeString(providerResult.messageId,160)||null,safeString(providerResult.responseDescription,300),access.user.id),
      env.DB.prepare('INSERT INTO notifications(id,user_id,title,message) VALUES(?,?,?,?)').bind(uuid(),recipient.id,title,message),
      env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),access.user.id,'admin_sms_sent','sms_delivery',id)
    ]);
  }catch(cause){
    console.error('SMS was accepted by provider but local delivery logging failed:',String(cause?.message||cause));
    return error('The SMS provider accepted this message, but Navstar could not save its local delivery record. Do not resend automatically. Provider reference: '+safeString(providerResult.messageId,160),503);
  }
  return json({sent:true,id,recipient:recipient.name,phone,provider:providerResult.provider,messageId:providerResult.messageId||null});
}
