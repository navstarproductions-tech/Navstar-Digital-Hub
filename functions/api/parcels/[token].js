import { error, isSameOrigin, json, normalizePhone, readJson, safeString, uuid } from '../../_shared/http.js';
import { startStkPush, darajaReady } from '../../_shared/daraja.js';
import { queueCustomerNotice } from '../../_shared/notifications.js';

async function hashToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}
async function findParcel(env, token) {
  if (!/^[a-f0-9]{64}$/.test(token || '')) return null;
  const tokenHash = await hashToken(token);
  return env.DB.prepare(`
    SELECT p.id,p.parcel_ref AS parcelRef,p.customer_type AS customerType,
      p.customer_name AS customerName,p.recipient_name AS recipientName,
      p.recipient_address AS recipientAddress,p.recipient_phone AS recipientPhone,p.contents_json AS contentsJson,
      p.quantity,p.amount,p.payment_mode AS paymentMode,p.delivery_status AS deliveryStatus,
      p.recipient_confirmed_at AS confirmedAt,p.recipient_confirmation_name AS confirmedBy,
      r.id AS serviceRequestId,
      COALESCE((SELECT SUM(amount) FROM payments WHERE purpose='service' AND reference_id=r.id AND status='paid'),0) AS paidAmount,
      (SELECT receipt_number FROM payments WHERE purpose='service' AND reference_id=r.id AND status='paid' ORDER BY updated_at DESC LIMIT 1) AS mpesaReceipt
    FROM parcels p JOIN service_requests r ON r.id=p.service_request_id WHERE p.token_hash=?
  `).bind(tokenHash).first();
}
function publicParcel(row) {
  const paid = Math.min(Number(row.amount), Number(row.paidAmount || 0));
  return {
    parcelRef: row.parcelRef, customerName: row.customerName === 'Walk-in Customer' ? 'Walk-in Customer' : row.customerName,
    recipientName: row.recipientName, recipientAddress: row.recipientAddress,
    contents: JSON.parse(row.contentsJson || '[]'), quantity: row.quantity,
    amount: Number(row.amount), paidAmount: paid, balance: Math.max(0, Number(row.amount) - paid),
    paymentMode: row.paymentMode, paid: paid >= Number(row.amount),
    deliveryStatus: row.deliveryStatus, confirmedAt: row.confirmedAt,
    confirmedBy: row.confirmedBy, mpesaReceipt: row.mpesaReceipt
  };
}
export async function onRequestGet({ params, env }) {
  if (!env.DB) return error('Parcel service is unavailable.', 503);
  const parcel = await findParcel(env, params.token);
  if (!parcel) return error('This parcel link is invalid or has expired.', 404);
  return json({ parcel: publicParcel(parcel) });
}
export async function onRequestPost(context) {
  const { request, env, params } = context;
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Parcel service is unavailable.', 503);
  const parcel = await findParcel(env, params.token);
  if (!parcel) return error('This parcel link is invalid or has expired.', 404);
  if (parcel.deliveryStatus === 'delivered') return error('Delivery has already been confirmed.', 409);
  let body;
  try { body = await readJson(request, 2048); } catch { return error('Invalid confirmation details.'); }
  const action = safeString(body.action, 20);
  if (action === 'pay') {
    if (Number(parcel.paidAmount || 0) >= Number(parcel.amount)) return error('This parcel is already fully paid.', 409);
    if (!darajaReady(env)) return error('M-Pesa payment is not configured. Please contact Navstar.', 503);
    const phone = normalizePhone(body.phone);
    if (!/^254\d{9}$/.test(phone)) return error('Enter a valid Kenyan M-Pesa number.');
    const existing = await env.DB.prepare("SELECT id,amount FROM payments WHERE purpose='service' AND reference_id=? AND phone=? AND status IN ('pending','initiating') AND created_at >= datetime('now','-10 minutes') ORDER BY created_at DESC LIMIT 1").bind(parcel.serviceRequestId, phone).first();
    if (existing && Number(existing.amount) === Number(parcel.amount) - Number(parcel.paidAmount || 0)) return json({ status:'pending', message:'An M-Pesa prompt is already active. Complete it on your phone.' });
    const amount = Number(parcel.amount) - Number(parcel.paidAmount || 0);
    const paymentId = uuid();
    await env.DB.prepare('INSERT INTO payments (id,purpose,reference_id,phone,amount,display_reference) VALUES (?,?,?,?,?,?)')
      .bind(paymentId,'service',parcel.serviceRequestId,phone,amount,parcel.parcelRef).run();
    try {
      const prompt = await startStkPush(env,{phone,amount,accountReference:parcel.parcelRef,description:'NAVSTAR PARCEL'});
      await env.DB.prepare("UPDATE payments SET status='pending',merchant_request_id=?,checkout_request_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(prompt.merchantRequestId,prompt.checkoutRequestId,paymentId).run();
      return json({ status:'pending', message:prompt.customerMessage });
    } catch (cause) {
      await env.DB.prepare("UPDATE payments SET status='failed',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(paymentId).run();
      return error(cause instanceof Error ? cause.message : 'M-Pesa prompt could not be started.', 502);
    }
  }
  if (action === 'confirm_delivery') {
    const paidTotal = Number(parcel.paidAmount || 0);
    if (paidTotal < Number(parcel.amount)) return error('Payment is not yet verified. Complete the M-Pesa prompt before confirming delivery.', 409);
    const confirmationName = safeString(body.name, 140);
    const confirmationPhone = normalizePhone(body.phone);
    if (confirmationName.length < 2 || !/^254\d{9}$/.test(confirmationPhone)) return error('Enter your name and a valid phone number to confirm receipt.');
    if (parcel.recipientPhone && confirmationPhone !== parcel.recipientPhone) return error('Use the recipient phone number registered for this parcel.', 403);
    const result = await env.DB.prepare(`UPDATE parcels SET delivery_status='delivered',recipient_confirmed_at=CURRENT_TIMESTAMP,
      recipient_confirmation_name=?,recipient_confirmation_phone=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND delivery_status!='delivered' AND token_hash=?`)
      .bind(confirmationName,confirmationPhone,parcel.id,await hashToken(params.token)).run();
    if (!result.meta?.changes) return error('This parcel has already been confirmed.', 409);
    await env.DB.prepare('INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id) VALUES (?,?,?,?,?)')
      .bind(uuid(),null,'parcel_delivery_confirmed','parcel',parcel.id).run();
    const thanks = `Thank you, ${confirmationName}. You have confirmed receipt of Navstar parcel ${parcel.parcelRef}. We appreciate your trust in Navstar Digital Hub — HOME OF TECHNOCRATS.`;
    queueCustomerNotice(context,env,{email:'',phone:confirmationPhone,subject:'Navstar parcel delivered',message:thanks});
    return json({ status:'delivered', message:thanks });
  }
  return error('Choose a valid parcel action.');
}
