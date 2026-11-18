import { requireRole } from '../../_shared/auth.js';
import { error, json } from '../../_shared/http.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('Payment records are not configured.',503);
  const access = await requireRole(request,env,['admin','principal','admissions','finance']);
  if (access.response) return access.response;
  const result = await env.DB.prepare(`
    SELECT p.id,p.purpose,p.display_reference,p.internal_receipt_number AS receipt_number,
      p.receipt_number AS mpesa_receipt,p.amount,p.phone,p.status,p.updated_at,
      COALESCE(e.full_name,s.customer_name,'Customer') AS payer_name,
      COALESCE(c.title,CASE WHEN p.purpose='donation' THEN 'Donation' ELSE 'Service payment' END) AS description
    FROM payments p
    LEFT JOIN enrollments e ON p.purpose='enrollment' AND e.id=p.reference_id
    LEFT JOIN courses c ON c.id=e.course_id
    LEFT JOIN service_requests s ON p.purpose='service' AND s.id=p.reference_id
    WHERE p.status='paid'
    ORDER BY p.updated_at DESC LIMIT 300
  `).all();
  return json({payments:result.results ?? []});
}
