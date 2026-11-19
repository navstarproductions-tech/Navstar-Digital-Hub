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
    const balance = await env.DB.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM enrollment_fee_items ef WHERE ef.enrollment_id=enrollments.id) THEN (SELECT COALESCE(SUM(ef.amount),0) FROM enrollment_fee_items ef WHERE ef.enrollment_id=enrollments.id) ELSE courses.price END AS course_fee, COALESCE(SUM(CASE WHEN payments.status = 'paid' THEN payments.amount ELSE 0 END), 0) AS paid_total FROM enrollments JOIN courses ON courses.id = enrollments.course_id LEFT JOIN payments ON payments.reference_id = enrollments.id AND payments.purpose = 'enrollment' WHERE enrollments.id = ? GROUP BY enrollments.id, courses.price").bind(payment.reference_id).first();
    const fullyPaid = Number(balance?.paid_total || 0) >= Number(balance?.course_fee || 0);
    await env.DB.prepare(`UPDATE enrollments SET payment_status = ?, status = CASE WHEN ? = 1 AND status NOT IN ('accepted','rejected','withdrawn') THEN 'submitted' ELSE status END WHERE id = ?`)
      .bind(paid ? (fullyPaid ? 'paid' : 'pending') : 'failed', paid ? 1 : 0, payment.reference_id).run();
  } else if (payment.purpose === 'donation') {
    await env.DB.prepare('UPDATE donations SET status = ?, admin_status = ? WHERE id = ?')
      .bind(paid ? 'paid' : 'failed', paid ? 'pending_review' : 'not_received', payment.reference_id).run();
  } else if (payment.purpose === 'service') {
    await env.DB.prepare('UPDATE service_requests SET status = ? WHERE id = ?')
      .bind(paid ? 'paid' : 'failed', payment.reference_id).run();
  }

  let customer = { email: '', phone: payment.phone, name: 'Customer' };
  let enrollmentDetails = '';
  if (payment.purpose === 'enrollment') {
    const row = await env.DB.prepare(`SELECT e.full_name AS name,e.email,e.phone,e.display_ref,e.preferred_intake,e.status,c.title AS course_title,CASE WHEN EXISTS(SELECT 1 FROM enrollment_fee_items ef WHERE ef.enrollment_id=e.id) THEN (SELECT COALESCE(SUM(ef.amount),0) FROM enrollment_fee_items ef WHERE ef.enrollment_id=e.id) ELSE c.price END AS course_fee
      FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.id=?`).bind(payment.reference_id).first();
    if (row) {
      customer = row;
      const totals = await env.DB.prepare("SELECT COALESCE(SUM(amount),0) AS paid_total FROM payments WHERE purpose='enrollment' AND reference_id=? AND status='paid'").bind(payment.reference_id).first();
      const paidTotal = Number(totals?.paid_total || 0);
      const balanceDue = Math.max(0, Number(row.course_fee || 0) - paidTotal);
      enrollmentDetails = `\n\nAPPLICATION DETAILS\nApplicant: ${row.name}\nApplication reference: ${row.display_ref}\nCourse: ${row.course_title}\nIntake: ${row.preferred_intake || 'As confirmed by Admissions'}\nPublished course fee: KSh ${Number(row.course_fee).toLocaleString('en-KE')}\nTotal confirmed payments: KSh ${paidTotal.toLocaleString('en-KE')}\nOutstanding course balance: KSh ${balanceDue.toLocaleString('en-KE')}\nAdmissions status: ${row.status}`;
    }
  } else if (payment.purpose === 'service') {
    const row = await env.DB.prepare('SELECT customer_name AS name, email, phone FROM service_requests WHERE id = ?').bind(payment.reference_id).first();
    if (row) customer = row;
  } else if (payment.purpose === 'donation') {
    const row = await env.DB.prepare('SELECT phone FROM donations WHERE id = ?').bind(payment.reference_id).first();
    if (row) customer = { ...customer, phone: row.phone };
  }
  const customerMessage = paid
    ? payment.purpose === 'donation'
      ? `Thank you for your generous donation of KSh ${payment.amount} to Navstar Digital Hub. Your contribution has been received successfully. Navstar receipt: ${internalReceipt}. M-Pesa receipt: ${receipt}. Reference: ${payment.display_reference || payment.reference_id}. We sincerely appreciate your support.`
      : `Hello ${customer.name || 'Customer'}, your Navstar ${payment.purpose} payment of KSh ${payment.amount} is confirmed.${enrollmentDetails} Navstar receipt: ${internalReceipt}. M-Pesa receipt: ${receipt}. Reference: ${payment.display_reference || payment.reference_id}. Thank you.`
    : `Hello ${customer.name || 'Customer'}, your Navstar ${payment.purpose} payment was not completed. Reason: ${resultDescription}. Reference: ${payment.display_reference || payment.reference_id}. Please try again or contact Navstar support.`;
  await sendCustomerNotice(env, { email: customer.email, phone: '', subject: paid ? 'Navstar payment and application confirmation' : 'Navstar payment not completed', message: customerMessage });
  if (customer.phone) await sendCustomerNotice(env, { email: '', phone: customer.phone, subject: paid ? 'Navstar payment confirmed' : 'Navstar payment not completed', message: paid
    ? payment.purpose === 'donation'
      ? `Thank you for your generous donation of KSh ${payment.amount} to Navstar Digital Hub. We have received it successfully. Receipt: ${internalReceipt}; M-Pesa: ${receipt}; Reference: ${payment.display_reference || payment.reference_id}. Your support means a lot to us.`
      : `Navstar Digital Hub: KSh ${payment.amount} payment confirmed. Receipt ${internalReceipt}; M-Pesa ${receipt}; reference ${payment.display_reference || payment.reference_id}. Check your email for your detailed course and fee statement.`
    : `Navstar Digital Hub: payment for reference ${payment.display_reference || payment.reference_id} was not completed. ${resultDescription}. Please retry or contact support.` });

  const staff = await env.DB.prepare("SELECT id FROM users WHERE role IN ('admin', 'admissions', 'principal', 'finance') AND status = 'active'").all();
  if (staff.results?.length) {
    const message = paid ? `${payment.purpose} payment ${payment.display_reference || ''} of KSh ${payment.amount} was confirmed. Navstar receipt: ${internalReceipt}. M-Pesa receipt: ${receipt}.` : `${payment.purpose} payment ${payment.display_reference || ''} could not be completed: ${resultDescription}`;
    await env.DB.batch(staff.results.map((user) => env.DB.prepare('INSERT INTO notifications (id, user_id, title, message) VALUES (?, ?, ?, ?)')
      .bind(uuid(), user.id, paid ? 'Payment confirmed' : 'Payment failed', message)));
  }
  return json({ ResultCode: 0, ResultDesc: 'Accepted.' });
}