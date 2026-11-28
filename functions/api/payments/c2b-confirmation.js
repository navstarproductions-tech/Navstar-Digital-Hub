import { json, safeString } from '../../_shared/http.js';

function cleanPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (/^254[17]\d{8}$/.test(digits)) return '+' + digits;
  if (/^0[17]\d{8}$/.test(digits)) return '+254' + digits.slice(1);
  return '';
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ResultCode: 1, ResultDesc: 'Database unavailable' }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ ResultCode: 1, ResultDesc: 'Invalid callback' }, 400); }

  const transactionId = safeString(body?.TransID, 32);
  const shortcode = safeString(body?.BusinessShortCode, 20);
  const amount = Number(body?.TransAmount);
  if (!transactionId || !shortcode || !Number.isFinite(amount) || amount <= 0) {
    return json({ ResultCode: 1, ResultDesc: 'Required transaction details missing' }, 400);
  }
  if (env.DARAJA_SHORTCODE && shortcode !== String(env.DARAJA_SHORTCODE)) {
    console.error('C2B callback shortcode mismatch:', shortcode);
    return json({ ResultCode: 1, ResultDesc: 'Business shortcode mismatch' }, 400);
  }

  const payerName = [body?.FirstName, body?.MiddleName, body?.LastName]
    .map(value => safeString(value, 80)).filter(Boolean).join(' ');
  const billReference = safeString(body?.BillRefNumber, 120);
  const phone = cleanPhone(body?.MSISDN);
  const receivedAt = new Date().toISOString();
  try {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO mpesa_c2b_transactions
        (id, transaction_id, business_shortcode, bill_reference, amount, msisdn, payer_name,
         transaction_time, org_account_balance, raw_callback, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), transactionId, shortcode, billReference, amount, phone || null,
      payerName, safeString(body?.TransTime, 20) || null,
      safeString(body?.OrgAccountBalance, 120) || null,
      JSON.stringify(body).slice(0, 12000), receivedAt).run();

    // Reconcile only exact Navstar account references. Unmatched payments remain visible
    // in the business PayBill register and are never assigned to an arbitrary student.
    const enrollment = await env.DB.prepare(`SELECT e.id, e.course_id,
        CASE WHEN EXISTS(SELECT 1 FROM enrollment_fee_items ef WHERE ef.enrollment_id=e.id)
          THEN (SELECT COALESCE(SUM(ef.amount),0) FROM enrollment_fee_items ef WHERE ef.enrollment_id=e.id)
          ELSE c.price END AS course_fee
      FROM enrollments e JOIN courses c ON c.id=e.course_id
      WHERE e.display_ref = ? LIMIT 1`).bind(billReference).first();
    if (enrollment) {
      const paid = await env.DB.prepare(`SELECT
          COALESCE((SELECT SUM(amount) FROM payments WHERE purpose='enrollment' AND reference_id=? AND status='paid'),0) +
          COALESCE((SELECT SUM(amount) FROM mpesa_c2b_transactions WHERE bill_reference=?),0) AS total`)
        .bind(enrollment.id, billReference).first();
      await env.DB.prepare("UPDATE enrollments SET payment_status = ? WHERE id = ?")
        .bind(Number(paid?.total || 0) >= Number(enrollment.course_fee || 0) ? 'paid' : 'pending', enrollment.id).run();
    }
    const service = await env.DB.prepare('SELECT id, amount FROM service_requests WHERE display_ref = ? LIMIT 1').bind(billReference).first();
    if (service) {
      const servicePaid = await env.DB.prepare(`SELECT
          COALESCE((SELECT SUM(amount) FROM payments WHERE purpose='service' AND reference_id=? AND status='paid'),0) +
          COALESCE((SELECT SUM(amount) FROM mpesa_c2b_transactions WHERE bill_reference=?),0) AS total`)
        .bind(service.id, billReference).first();
      if (Number(servicePaid?.total || 0) >= Number(service.amount || 0)) {
        await env.DB.prepare("UPDATE service_requests SET status = 'paid' WHERE id = ?").bind(service.id).run();
      }
    }
  } catch (cause) {
    console.error('Could not store Safaricom C2B confirmation:', String(cause?.message || cause));
    return json({ ResultCode: 1, ResultDesc: 'Could not record transaction' }, 500);
  }
  return json({ ResultCode: 0, ResultDesc: 'Accepted' });
}
