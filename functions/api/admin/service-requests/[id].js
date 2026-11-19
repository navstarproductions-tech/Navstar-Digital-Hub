import { requireRole } from '../../../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, uuid } from '../../../_shared/http.js';
import { queueCustomerNotice } from '../../../_shared/notifications.js';

const statuses = ['pending', 'paid', 'in_progress', 'ready', 'delivered', 'failed', 'completed', 'cancelled'];
export async function onRequestPatch(context) {
  const { request, env, params } = context;
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Orders database is not configured.', 503);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;
  let body;
  try { body = await readJson(request, 2048); } catch { return error('Invalid request body.'); }
  const status = safeString(body.status, 24);
  if (!statuses.includes(status)) return error('Choose a valid order status.');
  const order = await env.DB.prepare('SELECT customer_name, email, phone, display_ref, amount FROM service_requests WHERE id = ?').bind(params.id).first();
  if (!order) return error('Order not found.', 404);
  const result = await env.DB.prepare('UPDATE service_requests SET status = ? WHERE id = ?').bind(status, params.id).run();
  if (!result.meta?.changes) return error('Order not found.', 404);
  const statusLabel = ({in_progress:'In progress',ready:'Ready for collection or delivery',delivered:'Delivered',completed:'Completed',cancelled:'Cancelled',failed:'Payment failed',paid:'Payment confirmed',pending:'Pending'})[status] || status;
  queueCustomerNotice(context, env, { email: order.email, phone: order.phone, subject: 'Navstar order progress update', message: `Hello ${order.customer_name}, your Navstar service order ${order.display_ref} is now: ${statusLabel}. We will continue to keep you updated. Please contact Navstar Digital Hub if you need assistance. HOME OF TECHNOCRATS.` });
  await env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)')
    .bind(uuid(), access.user.id, 'service_order_status_changed', 'service_request', params.id).run();
  return json({ id: params.id, status });
}
