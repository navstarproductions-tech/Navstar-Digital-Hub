import { requireRole } from '../../_shared/auth.js';
import { error, json, readJson, safeString } from '../../_shared/http.js';

export async function onRequestGet({request,env}){
  if(!env.DB)return error('Device management is not configured.',503);
  const access=await requireRole(request,env,['admin','principal']);
  if(access.response)return access.response;
  const result=await env.DB.prepare(`
    SELECT s.token_hash AS id,s.user_id AS userId,u.name,u.email,
      COALESCE(p.portal_role,u.role) AS role,s.user_agent AS userAgent,
      s.created_at AS createdAt,s.last_seen_at AS lastSeenAt,s.expires_at AS expiresAt,
      CASE WHEN s.expires_at > ? THEN 'active' ELSE 'expired' END AS status
    FROM sessions s JOIN users u ON u.id=s.user_id
    LEFT JOIN user_profiles p ON p.user_id=u.id
    WHERE u.status='active'
    ORDER BY CASE WHEN s.expires_at > ? THEN 0 ELSE 1 END,s.last_seen_at DESC,s.created_at DESC
    LIMIT 1000
  `).bind(new Date().toISOString(),new Date().toISOString()).all();
  return json({sessions:result.results||[]});
}

export async function onRequestPatch({request,env}){
  if(!env.DB)return error('Device management is not configured.',503);
  const access=await requireRole(request,env,['admin']);
  if(access.response)return access.response;
  let body;
  try{body=await readJson(request,2048);}catch{return error('Invalid request body.');}
  const sessionId=safeString(body.sessionId,128);
  if(!/^[a-f0-9]{64}$/i.test(sessionId))return error('Select a valid session.',400);
  const result=await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(sessionId).run();
  if(!result.meta?.changes)return error('That session no longer exists. Refresh the register.',404);
  return json({revoked:true});
}
