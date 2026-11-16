import { requireRole } from '../../_shared/auth.js';
import { error, json } from '../../_shared/http.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('Orders database is not configured.', 503);
  const access = await requireRole(request, env, ['admin', 'principal', 'admissions']);
  if (access.response) return access.response;
  const rows = await env.DB.prepare(`
    SELECT r.id, r.display_ref AS reference, r.customer_name AS customerName, r.email,
      r.phone, r.amount, r.notes, r.status, r.created_at AS createdAt,
      s.name AS serviceName
    FROM service_requests r JOIN services s ON s.id = r.service_id
    ORDER BY r.created_at DESC LIMIT 200
  `).all();
  return json({ orders: rows.results ?? [] });
}
