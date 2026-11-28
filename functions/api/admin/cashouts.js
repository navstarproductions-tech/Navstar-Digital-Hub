import { requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, readJson, normalizePhone, safeString, uuid } from '../../_shared/http.js';
import { nextReference } from '../../_shared/references.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('Cashout requests are not configured.', 503);
  const access = await requireRole(request, env, ['admin', 'principal', 'finance']);
  if (access.response) return access.response;
  const rows = await env.DB.prepare(`
    SELECT c.id, c.display_ref AS reference, c.amount, c.status, c.recipient_phone, c.purpose,
      c.created_at, u.name AS requested_by, b.status AS payout_status,
      b.result_description AS payout_description, b.transaction_id, b.submitted_at, b.received_at
    FROM cashout_requests c
    JOIN users u ON u.id = c.requested_by
    LEFT JOIN mpesa_b2c_transactions b ON b.cashout_request_id = c.id
    ORDER BY c.created_at DESC LIMIT 100
  `).all();
  return json({ requests: rows.results ?? [] });
}

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Cashout requests are not configured.', 503);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;
  let body;
  try { body = await readJson(request, 4096); } catch { return error('Invalid request body.'); }
  const amount = Number(body.amount);
  const phone = normalizePhone(body.phone);
  const purpose = safeString(body.purpose || 'Navstar business payout', 100);
  if (!phone) return error('Enter a valid Kenyan M-Pesa phone number.');
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 150000) return error('Enter an amount between KSh 1 and KSh 150,000.');
  const id = uuid();
  const reference = await nextReference(env.DB, 'COT');
  await env.DB.prepare('INSERT INTO cashout_requests (id, display_ref, requested_by, amount, recipient_phone, purpose) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, reference, access.user.id, amount, phone, purpose).run();
  await env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)')
    .bind(uuid(), access.user.id, 'cashout_requested', 'cashout', id).run();
  return json({ id, reference, status: 'pending_approval', amount, recipient_phone: phone, purpose }, 201);
}