import { getSession } from '../../_shared/auth.js';
import { rateLimited } from '../../_shared/rate-limit.js';
import { startStkPush, darajaReady } from '../../_shared/daraja.js';
import { error, isSameOrigin, json, normalizePhone, readJson, safeString, uuid } from '../../_shared/http.js';

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Payments service is not configured.', 503);
  if (!darajaReady(env)) return error('Payment provider is not configured on the backend.', 503);

  let body;
  try { body = await readJson(request, 4096); } catch { return error('Invalid request body.'); }
  const purpose = safeString(body.purpose, 20);
  const reference = safeString(body.reference, 80);
  const phone = normalizePhone(body.phone);
  const requestedAmount = body.amount === undefined || body.amount === null || body.amount === '' ? null : Number(body.amount);
  if (requestedAmount !== null && (!Number.isSafeInteger(requestedAmount) || requestedAmount < 1 || requestedAmount > 150000)) return error('Enter a valid payment amount in whole Kenya shillings.');
  if (!reference || !phone || !['enrollment', 'donation', 'service'].includes(purpose)) return error('Invalid payment request.');

  let amount;
  let displayReference;
  if (purpose === 'donation') {
    const donation = await env.DB.prepare('SELECT id, display_ref, phone, amount, status FROM donations WHERE id = ?').bind(reference).first();
    if (!donation || donation.status !== 'pending' || donation.phone !== phone) return error('Donation request not found.', 404);
    amount = donation.amount;
    displayReference = donation.display_ref;
  } else if (purpose === 'enrollment') {
    const session = await getSession(request, env);
    if (!session && await rateLimited(env.DB, request, 'public-enrollment-payment', { maximum: 3, minutes: 15 })) return error('Too many payment prompts. Please wait before trying again.', 429);
    const enrollment = await env.DB.prepare(`
      SELECT enrollments.id, enrollments.display_ref, enrollments.email, enrollments.phone, enrollments.payment_status, enrollments.status, enrollments.approved_initial_payment, courses.price
      FROM enrollments JOIN courses ON courses.id = enrollments.course_id WHERE enrollments.id = ?
    `).bind(reference).first();
    if (!enrollment || enrollment.payment_status === 'paid') return error('Enrollment payment is not available.', 404);
    if (session && !['student', 'admin', 'finance', 'admissions'].includes(session.role)) return error('This account cannot make an enrollment payment.', 403);
    if (session?.role === 'student' && String(enrollment.email).toLowerCase() !== String(session.email).toLowerCase()) return error('You can only pay fees for your own student account.', 403);
    if (!session && enrollment.status !== 'under_review') return error('Sign in to the Student Portal before requesting a payment for an existing enrolment.', 401);
    if (!session && enrollment.phone !== phone) return error('Use the registered phone number or sign in to pay from another phone.', 403);
    const feeSnapshot = await env.DB.prepare(`
      SELECT COUNT(*) AS item_count, COALESCE(SUM(amount),0) AS total_fee,
        COALESCE(SUM(CASE WHEN lower(item_name)='admission fee' AND due_stage='enrollment' THEN amount ELSE 0 END),0) AS admission_fee
      FROM enrollment_fee_items WHERE enrollment_id=?
    `).bind(reference).first();
    const legacyAdmission = await env.DB.prepare("SELECT COALESCE(SUM(amount),0) AS total FROM course_fee_items WHERE course_id=(SELECT course_id FROM enrollments WHERE id=?) AND lower(item_name)='admission fee' AND active=1 AND due_stage='enrollment' AND required=1").bind(reference).first();
    const totalFee = Number(feeSnapshot?.item_count || 0) > 0 ? Number(feeSnapshot.total_fee) : Number(enrollment.price);
    // Legacy enrolments may have a fee snapshot created before the Admission fee was configured.
    // Preserve their saved total while using the active required Admission fee as the first-payment minimum.
    const snapshotAdmissionFee = Number(feeSnapshot?.admission_fee || 0);
    const admissionFee = snapshotAdmissionFee > 0 ? snapshotAdmissionFee : Number(legacyAdmission?.total || 0);
    const isNewAdmission = ['submitted', 'under_review'].includes(enrollment.status);
    if (isNewAdmission && admissionFee < 100) return error('The course Admission fee must be configured at KSh 100 or more before a new student can enrol.', 409);
    const paidRow = await env.DB.prepare("SELECT COALESCE(SUM(amount), 0) AS paid_total FROM payments WHERE purpose = 'enrollment' AND reference_id = ? AND status = 'paid'").bind(reference).first();
    const paidTotal = Number(paidRow?.paid_total || 0);
    if (isNewAdmission && paidTotal === 0) {
      amount = Number(enrollment.status === 'under_review' ? (enrollment.approved_initial_payment ?? admissionFee) : admissionFee);
    } else {
      amount = Math.max(0, totalFee - paidTotal);
    }
    const outstanding = Math.max(0, totalFee - paidTotal);
    if (requestedAmount !== null) amount = requestedAmount;
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > outstanding) return error('Enter an amount greater than zero and no more than your outstanding balance.', 409);
    const firstPaymentMinimum = isNewAdmission && paidTotal === 0 ? Math.max(100, admissionFee) : 1;
    if (paidTotal === 0 && amount < firstPaymentMinimum) return error('A new enrolment requires an initial payment of at least KSh ' + firstPaymentMinimum.toLocaleString('en-KE') + ' (the Admission fee). Existing enrolled students may pay any amount from KSh 1.', 409);
    // Reuse a recent live prompt for this same student, amount and phone.
    const existingPrompt = await env.DB.prepare("SELECT id,amount FROM payments WHERE purpose='enrollment' AND reference_id=? AND phone=? AND status IN ('pending','initiating') AND created_at >= datetime('now','-10 minutes') ORDER BY created_at DESC LIMIT 1").bind(reference, phone).first();
    if (existingPrompt && Number(existingPrompt.amount) === Number(amount)) {
      return json({ id: existingPrompt.id, reference: enrollment.display_ref, status: 'pending', reused: true, message: 'An M-Pesa prompt is already active for this enrolment. Complete it on your phone.' });
    }
    displayReference = enrollment.display_ref;
  } else {
    const service = await env.DB.prepare("SELECT id, display_ref, phone, amount, status FROM service_requests WHERE id = ?").bind(reference).first();
    if (!service || service.status !== 'pending' || service.phone !== phone) return error('Service payment is not available.', 404);
    amount = service.amount;
    displayReference = service.display_ref;
  }

  const paymentId = uuid();
  await env.DB.prepare('INSERT INTO payments (id, purpose, reference_id, phone, amount, display_reference) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(paymentId, purpose, reference, phone, amount, displayReference).run();
  try {
    const prompt = await startStkPush(env, { phone, amount, accountReference: displayReference || paymentId, description: `NAVSTAR ${purpose}` });
    await env.DB.prepare(`
      UPDATE payments SET status = 'pending', merchant_request_id = ?, checkout_request_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(prompt.merchantRequestId, prompt.checkoutRequestId, paymentId).run();
    if (purpose === 'enrollment') await env.DB.prepare("UPDATE enrollments SET payment_status = 'pending' WHERE id = ?").bind(reference).run();
    const administrators = await env.DB.prepare("SELECT id FROM users WHERE role IN ('admin','finance') AND status = 'active'").all();
    if (administrators.results?.length) {
      await env.DB.batch(administrators.results.map((administrator) => env.DB.prepare('INSERT INTO notifications (id,user_id,title,message) VALUES (?,?,?,?)')
        .bind(uuid(), administrator.id, 'M-Pesa prompt sent', `${purpose.toUpperCase()} payment prompt sent to ${phone} for KSh ${amount}. Reference: ${displayReference}.`)));
    }
    return json({ id: paymentId, reference: displayReference, status: 'pending', message: prompt.customerMessage });
  } catch (errorValue) {
    await env.DB.prepare("UPDATE payments SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(paymentId).run();
    return error(errorValue instanceof Error ? errorValue.message : 'Payment prompt could not be started.', 502);
  }
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('Payments service is not configured.', 503);
  const session = await getSession(request, env);
  if (!session) return error('Sign in required.', 401);
  const url = new URL(request.url);
  const reference = safeString(url.searchParams.get('reference'), 80);
  if (!reference) return error('Payment reference is required.');
  const payment = await env.DB.prepare('SELECT id, purpose, reference_id, display_reference AS reference, phone, amount, status, receipt_number, internal_receipt_number, result_code, result_description, transaction_date, callback_phone, callback_amount, created_at, updated_at FROM payments WHERE id = ?').bind(reference).first();
  if (!payment) return error('Payment not found.', 404);
  if (payment.purpose === 'enrollment' && session.role === 'student') {
    const owner = await env.DB.prepare('SELECT email FROM enrollments WHERE id=?').bind(payment.reference_id).first();
    if (!owner || String(owner.email).toLowerCase() !== String(session.email).toLowerCase()) return error('You can only view payments linked to your own account.', 403);
  } else if (!['admin','finance','admissions','principal'].includes(session.role)) {
    return error('This account cannot view this payment.', 403);
  }
  return json({ payment });
}
