import { requireRole } from '../../_shared/auth.js';
import { error, json } from '../../_shared/http.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('Audit service is not configured.',503);
  const access = await requireRole(request,env,['admin','principal']);
  if (access.response) return access.response;
  try {
    const result = await env.DB.prepare(`
      SELECT a.id,a.action,a.entity_type,a.entity_id,a.created_at,
        COALESCE(u.name,'System') AS actor_name
      FROM audit_logs a
      LEFT JOIN users u ON u.id=a.actor_id
      WHERE a.entity_type IN ('student_certificate','certificate_settings','student','graduation')
         OR a.action LIKE '%certificate%'
         OR a.action LIKE '%graduation%'
      ORDER BY a.created_at DESC
      LIMIT 300
    `).all();
    return json({logs:result.results||[]});
  } catch (cause) {
    console.error('Certificate audit log read failed:',String(cause?.stack||cause));
    return error('Certificate audit records could not be loaded.',500);
  }
}
