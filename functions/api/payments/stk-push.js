import { requireRole } from '../../_shared/auth.js';
import { startStkPush, darajaReady } from '../../_shared/daraja.js';
import { error, isSameOrigin, json, normalizePhone, readJson, safeString, uuid } from '../../_shared/http.js';
import { rateLimited } from '../../_shared/rate-limit.js';

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Payments service is not configured.', 503);
  if (!darajaReady(env)) return error('Payment provider is not configured on the backend.', 503);
  if (await rateLimited(env.DB, request, 'stk-push', { maximum: 15, minutes: 10 })) return error('Several M-Pesa prompts have been sent recently. Please wait briefly before requesting another.', 429);

  let body;
  try { body = await readJson(request, 4096); } catch { return error('Invalid request body.'); }
  const purpose = safeString(body.purpose, 20);
  const reference = safeString(body.reference, 80);
  const phone = normalizePhone(body.phone);
  if (!reference || !phone || !['enrollment', 'donation', 'service'].includes(purpose)) return error('Invalid payment request.');

  let amount;
  let displayReference;
  if (purpose === 'donation') {
    const donation = await env.DB.prepare('SELECT id, display_ref, phone, amount, status FROM donations WHERE id = ?').bind(reference).first();
    if (!donation || donation.status !== 'pending' || donation.phone !== phone) return error('Donation request not found.', 404);
    amount = donation.amount;
    displayReference = donation.display_ref;
  } else if (purpose === 'enrollment') {
    const enrollment = await env.DB.prepare(`
      SELECT enrollments.id, enrollments.display_ref, enrollments.phone, enrollments.payment_status, courses.price
      FROM enrollments JOIN courses ON courses.id = enrollments.course_id WHERE enrollments.id = ?
    `).bind(reference).first();
    if (!enrollment || enrollment.phone !== phone || enrollment.payment_status === 'paid') return error('Enrollment payment is not available.', 404);
    amount = enrollment.price;
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
    return json({ id: paymentId, reference: displayReference, status: 'pending', message: prompt.customerMessage });
  } catch (errorValue) {
    await env.DB.prepare("UPDATE payments SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(paymentId).run();
    return error(errorValue instanceof Error ? errorValue.message : 'Payment prompt could not be started.', 502);
  }
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('Payments service is not configured.', 503);
  const url = new URL(request.url);
  const reference = safeString(url.searchParams.get('reference'), 80);
  if (!reference) return error('Payment reference is required.');
  const payment = await env.DB.prepare('SELECT id, purpose, reference_id, display_reference AS reference, phone, amount, status, receipt_number, internal_receipt_number, result_code, result_description, transaction_date, callback_phone, callback_amount, created_at, updated_at FROM payments WHERE id = ?').bind(reference).first();
  if (!payment) return error('Payment not found.', 404);
  return json({ payment });
}