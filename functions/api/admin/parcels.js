import { requireRole } from '../_shared/auth.js';
import { error, isSameOrigin, json, normalizePhone, readJson, safeString, uuid } from '../_shared/http.js';
import { nextReference } from '../_shared/references.js';

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}
async function hashToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('Parcel database is not configured.', 503);
  const access = await requireRole(request, env, ['admin', 'principal', 'finance']);
  if (access.response) return access.response;
  const result = await env.DB.prepare(`
    SELECT p.id, p.delivery_token AS deliveryToken, p.parcel_ref AS parcelRef, p.customer_type AS customerType,
      p.customer_name AS customerName, p.recipient_name AS recipientName,
      p.recipient_phone AS recipientPhone, p.recipient_address AS recipientAddress,
      p.contents_json AS contentsJson, p.quantity, p.amount, p.payment_mode AS paymentMode,
      p.delivery_status AS deliveryStatus, p.recipient_confirmed_at AS confirmedAt,
      p.recipient_confirmation_name AS confirmedBy, p.created_at AS createdAt,
      r.display_ref AS serviceReference,
      COALESCE((SELECT SUM(amount) FROM payments WHERE purpose='service' AND reference_id=r.id AND status='paid'),0) AS paidAmount,
      (SELECT receipt_number FROM payments WHERE purpose='service' AND reference_id=r.id AND status='paid' ORDER BY updated_at DESC LIMIT 1) AS mpesaReceipt
    FROM parcels p JOIN service_requests r ON r.id=p.service_request_id
    ORDER BY p.created_at DESC LIMIT 200
  `).all();
  return json({ parcels: result.results ?? [] });
}

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Parcel database is not configured.', 503);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;
  let body;
  try { body = await readJson(request, 12000); } catch { return error('Invalid parcel details.'); }
  const suppliedCustomerName = safeString(body.customerName, 140);
  const customerType = suppliedCustomerName ? (['individual','organisation'].includes(body.customerType) ? body.customerType : 'individual') : 'walk_in';
  const customerName = suppliedCustomerName || 'Walk-in Customer';
  const recipientName = safeString(body.recipientName, 140);
  const recipientPhone = normalizePhone(body.recipientPhone);
  const recipientAddress = safeString(body.recipientAddress, 300);
  const contents = safeString(body.contents, 1200);
  const quantity = Number(body.quantity || 1);
  const amount = Number(body.amount);
  const paymentMode = body.paymentMode === 'pay_on_delivery' ? 'pay_on_delivery' : 'pay_now';
  if (!recipientName || contents.length < 2 || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000 ||
      !Number.isSafeInteger(amount) || amount < 1 || amount > 150000) return error('Enter recipient, parcel contents, quantity and a valid amount.');
  if (recipientPhone && !/^254\d{9}$/.test(recipientPhone)) return error('Enter a valid Kenyan recipient phone number.');
  const requestedServiceId = safeString(body.serviceId, 80);\n  const service = requestedServiceId\n    ? await env.DB.prepare("SELECT id, name FROM services WHERE id=? AND status='active'").bind(requestedServiceId).first()\n    : await env.DB.prepare("SELECT id, name FROM services WHERE status='active' ORDER BY name LIMIT 1").first();
  if (!service) return error('The service catalogue is unavailable. Please contact support.', 503);

  const parcelId = uuid();
  const serviceRequestId = uuid();\n  const payerPhone = normalizePhone(body.payerPhone) || recipientPhone || '254700000000';
  const parcelRef = await nextReference(env.DB, 'PKG');
  const serviceRef = await nextReference(env.DB, 'SRV');
  const token = randomToken();
  const tokenHash = await hashToken(token);
  const notes = JSON.stringify({ parcel: true, serviceName: service.name, contents, quantity, recipientName, recipientAddress });
  await env.DB.batch([
    env.DB.prepare('INSERT INTO service_requests (id,display_ref,service_id,customer_name,phone,amount,notes,email,status) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(serviceRequestId, serviceRef, service.id, customerName, payerPhone, amount, notes, null, 'pending'),
    env.DB.prepare(`INSERT INTO parcels
      (id,service_request_id,parcel_ref,token_hash,customer_type,customer_name,recipient_name,recipient_phone,recipient_address,contents_json,quantity,amount,payment_mode,delivery_status,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(parcelId, serviceRequestId, parcelRef, tokenHash, token, customerType, customerName, recipientName, recipientPhone || null, recipientAddress || null, JSON.stringify([{description:contents,quantity}]), quantity, amount, paymentMode, 'awaiting_payment', access.user.id),
    env.DB.prepare('INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id) VALUES (?,?,?,?,?)')
      .bind(uuid(), access.user.id, 'parcel_created', 'parcel', parcelId)
  ]);
  const base = new URL(request.url).origin;
  return json({ id: parcelId, serviceRequestId, parcelRef, serviceReference: serviceRef, serviceName: service.name, amount, paymentMode, status: 'awaiting_payment', deliveryUrl: base + '/delivery/' + token, token }, 201);
}
