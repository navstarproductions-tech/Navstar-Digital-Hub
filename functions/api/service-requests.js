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
  try { body = await readJson(request, 4096); } catch { return error('Invalid request body.'); }
  const serviceId = safeString(body.serviceId, 80);
  const customerName = safeString(body.customerName, 120);
  const phone = normalizePhone(body.phone);
  const email = safeString(body.email, 254).toLowerCase();
  if (email && (!email.includes('@') || email.startsWith('@') || email.endsWith('@'))) return error('Enter a valid email address.');
  const service = await env.DB.prepare("SELECT id, name, price_amount FROM services WHERE id = ? AND status = 'active'").bind(serviceId).first();
  if (!service || !Number.isSafeInteger(service.price_amount) || service.price_amount < 1) return error('This service is not configured for online payment. Please contact Navstar for a quotation.', 400);
  if (customerName.length < 2 || !phone) return error('Enter your name and a valid M-Pesa phone number.');
  const id = uuid();
  const reference = await nextReference(env.DB, 'SRV');
  await env.DB.prepare('INSERT INTO service_requests (id, display_ref, service_id, customer_name, phone, amount, notes, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, reference, service.id, customerName, phone, service.price_amount, safeString(body.notes, 1000) || null, email || null).run();
  await sendCustomerNotice(env, { email, phone, subject: 'Navstar service request received', message: `Hello ${customerName}, your request for ${service.name} has been registered. Reference: ${reference}. Amount: KSh ${service.price_amount}. We will update you on its progress. Navstar Digital Hub — HOME OF TECHNOCRATS.` });
  return json({ id, reference, amount: service.price_amount, service: service.name, status: 'pending' }, 201);
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
