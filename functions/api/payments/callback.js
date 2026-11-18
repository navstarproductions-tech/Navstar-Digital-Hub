import { error, json, normalizePhone, readJson, safeString, uuid } from '../../_shared/http.js';
import { sendCustomerNotice } from '../../_shared/notifications.js';
import { nextReference } from '../../_shared/references.js';

function safeEqual(left, right) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

function callbackItems(callback) {
  const items = callback?.CallbackMetadata?.Item;
  return Array.isArray(items) ? Object.fromEntries(items.map((item) => [item.Name, item.Value])) : {};
}

export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.DARAJA_CALLBACK_TOKEN) return error('Callback is not configured.', 503);
  const url = new URL(request.url);
  const received = url.searchParams.get('token') ?? '';
  if (!safeEqual(received, env.DARAJA_CALLBACK_TOKEN)) return error('Not found.', 404);

  let body;
  try { body = await readJson(request, 16384); } catch { return error('Invalid callback body.'); }
  const callback = body?.Body?.stkCallback;
  const checkoutId = safeString(callback?.CheckoutRequestID, 120);
  if (!checkoutId) return error('Invalid payment callback.');
  const payment = await env.DB.prepare('SELECT id, purpose, reference_id, display_reference, phone, amount, status FROM payments WHERE checkout_request_id = ?').bind(checkoutId).first();
  if (!payment) return error('Payment request not found.', 404);
  if (payment.status === 'paid' || payment.status === 'failed') return json({ ResultCode: 0, ResultDesc: 'Callback already processed.' });

  const resultCode = Number(callback.ResultCode);
  const items = callbackItems(callback);
  const callbackPhone = normalizePhone(items.PhoneNumber);
  const callbackAmount = Number(items.Amount);
  if (resultCode === 0 && (callbackPhone !== payment.phone || callbackAmount !== payment.amount || !items.MpesaReceiptNumber)) {
    await env.DB.prepare("UPDATE payments SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(payment.id).run();
    return json({ ResultCode: 0, ResultDesc: 'Callback did not match the payment request.' });
  }

  const paid = resultCode === 0;
  const receipt = paid ? safeString(items.MpesaReceiptNumber, 32) : null;
  const internalReceipt = paid ? await nextReference(env.DB, 'PAY') : null;
  const resultDescription = safeString(callback.ResultDesc, 500) || (paid ? 'Payment confirmed by M-Pesa.' : 'Payment was not completed.');
  const transactionDate = items.TransactionDate ? String(items.TransactionDate) : null;
  await env.DB.prepare(`
    UPDATE payments SET status = ?, admin_status = ?, result_code = ?, receipt_number = ?, internal_receipt_number = ?, result_description = ?, transaction_date = ?, callback_phone = ?, callback_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(paid ? 'paid' : 'failed', paid ? 'pending_review' : 'not_received', Number.isFinite(resultCode) ? resultCode : -1, receipt, internalReceipt, resultDescription, transactionDate, callbackPhone || null, Number.isFinite(callbackAmount) ? callbackAmount : null, payment.id).run();

  if (payment.purpose === 'enrollment') {
    await env.DB.prepare('UPDATE enrollments SET payment_status = ? WHERE id = ?')
      .bind(paid ? 'paid' : 'failed', paid ? 'pending_review' : 'not_received', payment.reference_id).run();
  } else if (payment.purpose === 'donation') {
    await env.DB.prepare('UPDATE donations SET status = ?, admin_status = ? WHERE id = ?')
      .bind(paid ? 'paid' : 'failed', payment.reference_id).run();
  } else if (payment.purpose === 'service') {
    await env.DB.prepare('UPDATE service_requests SET status = ? WHERE id = ?')
      .bind(paid ? 'paid' : 'failed', payment.reference_id).run();
  }

  let customer = { email: '', phone: payment.phone, name: 'Customer' };
  if (payment.purpose === 'enrollment') {
    const row = await env.DB.prepare('SELECT full_name AS name, email, phone FROM enrollments WHERE id = ?').bind(payment.reference_id).first();
    if (row) customer = row;
  } else if (payment.purpose === 'service') {
    const row = await env.DB.prepare('SELECT customer_name AS name, email, phone FROM service_requests WHERE id = ?').bind(payment.reference_id).first();
    if (row) customer = row;
  } else if (payment.purpose === 'donation') {
    const row = await env.DB.prepare('SELECT phone FROM donations WHERE id = ?').bind(payment.reference_id).first();
    if (row) customer = { ...customer, phone: row.phone };
  }
  const customerMessage = paid
    ? `Hello ${customer.name || 'Customer'}, your Navstar ${payment.purpose} payment of KSh ${payment.amount} is confirmed. Navstar receipt: ${internalReceipt}. M-Pesa receipt: ${receipt}. Reference: ${payment.display_reference || payment.reference_id}. Thank you.`
    : `Hello ${customer.name || 'Customer'}, your Navstar ${payment.purpose} payment was not completed. Reason: ${resultDescription}. Reference: ${payment.display_reference || payment.reference_id}. Please try again or contact Navstar support.`;
  await sendCustomerNotice(env, { email: customer.email, phone: customer.phone, subject: paid ? 'Navstar payment confirmed' : 'Navstar payment not completed', message: customerMessage });

  const staff = await env.DB.prepare("SELECT id FROM users WHERE role IN ('admin', 'admissions', 'principal') AND status = 'active'").all();
  if (staff.results?.length) {
    const message = paid ? `${payment.purpose} payment ${payment.display_reference || ''} of KSh ${payment.amount} was confirmed. Navstar receipt: ${internalReceipt}. M-Pesa receipt: ${receipt}.` : `${payment.purpose} payment ${payment.display_reference || ''} could not be completed: ${resultDescription}`;
    await env.DB.batch(staff.results.map((user) => env.DB.prepare('INSERT INTO notifications (id, user_id, title, message) VALUES (?, ?, ?, ?)')
      .bind(uuid(), user.id, paid ? 'Payment confirmed' : 'Payment failed', message)));
  }
  return json({ ResultCode: 0, ResultDesc: 'Accepted.' });
}