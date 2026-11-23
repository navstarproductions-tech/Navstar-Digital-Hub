import { requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, uuid } from '../../_shared/http.js';

export async function onRequestGet({request,env}){
  if(!env.DB)return error('Campaign storage is not configured.',503);
  const access=await requireRole(request,env,['admin','principal']);
  if(access.response)return access.response;
  const rows=await env.DB.prepare(`
    SELECT c.id,c.campaign_type AS type,c.title,c.message,c.audience,c.channels,c.status,
      c.recipient_count AS recipientCount,c.created_at AS createdAt,u.name AS createdBy
    FROM admin_broadcast_campaigns c JOIN users u ON u.id=c.created_by
    ORDER BY c.created_at DESC LIMIT 100
  `).all();
  const counts=await env.DB.prepare(`
    SELECT COUNT(*) AS allCount,
      SUM(CASE WHEN lower(CASE WHEN lower(u.role)='student' THEN 'student' ELSE COALESCE(NULLIF(p.portal_role,''),u.role) END)='student' THEN 1 ELSE 0 END) AS students,
      SUM(CASE WHEN lower(CASE WHEN lower(u.role)='student' THEN 'student' ELSE COALESCE(NULLIF(p.portal_role,''),u.role) END)<>'student' THEN 1 ELSE 0 END) AS staff
    FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id
    WHERE u.status='active' AND lower(CASE WHEN lower(u.role)='student' THEN 'student' ELSE COALESCE(NULLIF(p.portal_role,''),u.role) END) IN ('student','admin','principal','finance','admissions','tutor')
  `).first();
  return json({campaigns:(rows.results||[]).map(row=>({...row,channels:(()=>{try{return JSON.parse(row.channels||'[]')}catch{return []}})()})),audienceCounts:{all:Number(counts?.allCount||0),students:Number(counts?.students||0),staff:Number(counts?.staff||0)}});
}

export async function onRequestPost({request,env}){
  if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
  if(!env.DB)return error('Campaign storage is not configured.',503);
  const access=await requireRole(request,env,['admin']);
  if(access.response)return access.response;
  let body;try{body=await readJson(request,12000)}catch{return error('Invalid campaign request.',400)}
  const action=safeString(body.action,24);
  const title=safeString(body.title,120).trim();
  const message=safeString(body.message,6000).trim();
  const audience=['students','staff','all'].includes(body.audience)?body.audience:'students';
  if(title.length<3||message.length<5)return error('Enter a campaign title and message.',400);
  const id=uuid();
  if(action==='save_social'){
    const allowed=['Facebook','Instagram','WhatsApp','LinkedIn','X'];
    const channels=Array.isArray(body.channels)?[...new Set(body.channels.filter(item=>allowed.includes(item)))]:[];
    if(!channels.length)return error('Select at least one intended social channel.',400);
    await env.DB.prepare(`INSERT INTO admin_broadcast_campaigns (id,campaign_type,title,message,audience,channels,status,recipient_count,created_by) VALUES (?,'social',?,?,?,?,'draft',0,?)`)
      .bind(id,title,message,audience,JSON.stringify(channels),access.user.id).run();
    return json({saved:true,id,status:'draft'});
  }
  if(action!=='send_broadcast')return error('Unsupported campaign action.',400);
  const rows=await env.DB.prepare(`
    SELECT u.id FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id
    WHERE u.status='active'
      AND (CASE WHEN lower(u.role)='student' THEN 'student' ELSE lower(COALESCE(NULLIF(p.portal_role,''),u.role)) END IN ('student','admin','principal','finance','admissions','tutor'))
      AND (?='all' OR (?='students' AND lower(CASE WHEN lower(u.role)='student' THEN 'student' ELSE COALESCE(NULLIF(p.portal_role,''),u.role) END)='student')
        OR (?='staff' AND lower(CASE WHEN lower(u.role)='student' THEN 'student' ELSE COALESCE(NULLIF(p.portal_role,''),u.role) END)<>'student'))
    ORDER BY u.created_at ASC LIMIT 401
  `).bind(audience,audience,audience).all();
  const recipients=rows.results||[];
  if(recipients.length>400)return error('This broadcast exceeds the 400-recipient safety limit. Narrow the audience and send in smaller groups.',400);
  if(!recipients.length)return error('There are no active accounts in the selected audience.',409);
  const statements=[
    env.DB.prepare(`INSERT INTO admin_broadcast_campaigns (id,campaign_type,title,message,audience,channels,status,recipient_count,created_by) VALUES (?,'broadcast',?,?,?,'["in-app"]','sent',?,?)`)
      .bind(id,title,message,audience,recipients.length,access.user.id),
    ...recipients.map(user=>env.DB.prepare('INSERT INTO notifications (id,user_id,title,message) VALUES (?,?,?,?)').bind(uuid(),user.id,title,message))
  ];
  await env.DB.batch(statements);
  return json({sent:true,id,recipientCount:recipients.length,channel:'in-app'});
}
