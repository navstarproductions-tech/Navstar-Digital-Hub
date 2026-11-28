import { json, safeString } from '../../_shared/http.js';

function cleanPhone(value) {
  const digits = String(value || '').replace(/\\D/g, '');
  if (/^254[17]\\d{8}$/.test(digits)) return '+' + digits;
  if (/^0[17]\\d{8}$/.test(digits)) return '+254' + digits.slice(1);
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
  } catch (cause) {
    console.error('Could not store Safaricom C2B confirmation:', String(cause?.message || cause));
    return json({ ResultCode: 1, ResultDesc: 'Could not record transaction' }, 500);
  }
  return json({ ResultCode: 0, ResultDesc: 'Accepted' });
}
