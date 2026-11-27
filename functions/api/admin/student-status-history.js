import { requireRole } from '../../_shared/auth.js';
import { error, json } from '../../_shared/http.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('Student status history is not configured.',503);
  const access = await requireRole(request,env,['admin','principal']);
  if (access.response) return access.response;
  const url = new URL(request.url);
  const studentId = (url.searchParams.get('studentId') || '').slice(0,80);
  const rows = await env.DB.prepare(`
    SELECT a.id,a.entity_id,a.action,a.created_at,COALESCE(u.name,'System') AS actor_name
    FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id
    WHERE a.entity_type='user' AND a.action LIKE 'student_status_%'
      AND (?='' OR a.entity_id=?)
    ORDER BY a.created_at DESC LIMIT 1000
  `).bind(studentId,studentId).all();
  return json({logs:rows.results||[]});
}
