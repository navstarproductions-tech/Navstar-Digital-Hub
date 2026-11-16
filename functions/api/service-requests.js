import { requireRole } from '../_shared/auth.js';
import { error, isSameOrigin, json, normalizePhone, readJson, safeString, uuid } from '../_shared/http.js';
import { rateLimited } from '../_shared/rate-limit.js';
import { nextReference } from '../_shared/references.js';
import { sendCustomerNotice } from '../_shared/notifications.js';

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Service requests are not configured.', 503);
  if (await rateLimited(env.DB, request, 'service-request', { maximum: 5, minutes: 15 })) return error('Too many service requests. Try again later.', 429);
  let body;
  try { body = await readJson(request, 16000); } catch { return error('Invalid request body.'); }
  const customerName = safeString(body.customerName, 120);
  const phone = normalizePhone(body.phone);
  const email = safeString(body.email, 254).toLowerCase();
  if (email && (!email.includes('@') || email.startsWith('@') || email.endsWith('@'))) return error('Enter a valid email address.');
  if (customerName.length < 2 || !phone) return error('Enter your name and a valid M-Pesa phone number.');

  const submitted = Array.isArray(body.items) && body.items.length
    ? body.items.slice(0, 30)
    : [{ serviceId: safeString(body.serviceId, 80), quantity: 1, instructions: safeString(body.notes, 1000) }];
  if (!submitted.length || submitted.length > 30) return error('Add between 1 and 30 services to your order.');
  const orderItems = [];
  let total = 0;
  for (const item of submitted) {
    const serviceId = safeString(item.serviceId, 80);
    const quantity = Number(item.quantity || 1);
    if (!serviceId || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000) return error('Check the selected services and quantities.');
    const service = await env.DB.prepare("SELECT id, name, category, price_amount, price_label FROM services WHERE id = ? AND status = 'active'").bind(serviceId).first();
    if (!service || !Number.isSafeInteger(service.price_amount) || service.price_amount < 1) return error('One of the selected services needs a quotation. Please contact Navstar before checkout.', 400);
    const lineTotal = service.price_amount * quantity;
    if (!Number.isSafeInteger(lineTotal) || total + lineTotal > 150000) return error('Order total exceeds the online checkout limit. Please contact Navstar for assistance.');
    total += lineTotal;
    orderItems.push({ serviceId, code: safeString(item.code, 40), name: service.name, category: service.category, unitPrice: service.price_amount, quantity, instructions: safeString(item.instructions, 1200), lineTotal });
  }
  const id = uuid();
  const reference = await nextReference(env.DB, 'SRV');
  const summary = JSON.stringify({ items: orderItems, customerInstructions: safeString(body.notes, 2000) });
  await env.DB.prepare('INSERT INTO service_requests (id, display_ref, service_id, customer_name, phone, amount, notes, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, reference, orderItems[0].serviceId, customerName, phone, total, summary, email || null).run();
  await sendCustomerNotice(env, { email, phone, subject: 'Navstar service order received', message: `Hello ${customerName}, your Navstar order ${reference} has been registered with ${orderItems.length} service item(s). Total: KSh ${total.toLocaleString('en-KE')}. We will update you on its progress. HOME OF TECHNOCRATS.` });
  return json({ id, reference, amount: total, items: orderItems, status: 'pending' }, 201);
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('Service requests are not configured.', 503);
  const access = await requireRole(request, env, ['admin', 'principal', 'admissions']);
  if (access.response) return access.response;
  const url = new URL(request.url);
  const reference = safeString(url.searchParams.get('reference'), 80);
  if (!reference) return error('Service reference is required.');
  const row = await env.DB.prepare('SELECT id, display_ref AS reference, service_id, customer_name, phone, amount, status, created_at FROM service_requests WHERE id = ? OR display_ref = ?').bind(reference, reference).first();
  if (!row) return error('Service request not found.', 404);
  return json({ request: row });
}
