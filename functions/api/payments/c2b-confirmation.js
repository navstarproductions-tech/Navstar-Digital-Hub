import { json, safeString } from '../../_shared/http.js';

function darajaHost(env) {
  return String(env.DARAJA_ENVIRONMENT || '').toLowerCase() === 'production' ? 'api.safaricom.co.ke' : 'sandbox.safaricom.co.ke';
}

async function requestFreshBalance(env) {
  const required = ['DARAJA_CONSUMER_KEY','DARAJA_CONSUMER_SECRET','DARAJA_INITIATOR_NAME','DARAJA_SECURITY_CREDENTIAL','DARAJA_SHORTCODE','DARAJA_BALANCE_CALLBACK_URL','DARAJA_CALLBACK_TOKEN','APP_ORIGIN'];
  if (required.some(key => !env[key])) return;
  const recent = await env.DB.prepare("SELECT created_at FROM mpesa_balance_snapshots ORDER BY created_at DESC LIMIT 1").first();
  if (recent?.created_at && Date.now() - Date.parse(recent.created_at + (recent.created_at.endsWith('Z') ? '' : 'Z')) < 30000) return;
  const callback = new URL(env.DARAJA_BALANCE_CALLBACK_URL);
  const origin = new URL(env.APP_ORIGIN);
  if (callback.protocol !== 'https:' || callback.origin !== origin.origin || callback.pathname !== '/api/payments/balance-callback') return;
  callback.searchParams.set('token', env.DARAJA_CALLBACK_TOKEN);
  const auth = btoa(env.DARAJA_CONSUMER_KEY + ':' + env.DARAJA_CONSUMER_SECRET);
  const tokenResponse = await fetch('https://' + darajaHost(env) + '/oauth/v1/generate?grant_type=client_credentials', {
    headers: { Authorization: 'Basic ' + auth }, signal: AbortSignal.timeout(10000),
  });
  const tokenData = await tokenResponse.json().catch(() => null);
  if (!tokenResponse.ok || !tokenData?.access_token) throw new Error('Could not obtain Daraja token for automatic balance refresh.');
  const response = await fetch('https://' + darajaHost(env) + '/mpesa/accountbalance/v1/query', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + tokenData.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Initiator: env.DARAJA_INITIATOR_NAME,
      SecurityCredential: env.DARAJA_SECURITY_CREDENTIAL,
      CommandID: 'AccountBalance',
      PartyA: env.DARAJA_SHORTCODE,
      IdentifierType: env.DARAJA_IDENTIFIER_TYPE || '4',
      Remarks: 'Navstar automatic balance refresh after PayBill receipt',
      QueueTimeOutURL: callback.toString(),
      ResultURL: callback.toString(),
    }),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => null);
  const requestId = result?.OriginatorConversationID || result?.ConversationID;
  if (!response.ok || !requestId) throw new Error('Safaricom did not accept the automatic balance refresh.');
  await env.DB.prepare('INSERT INTO mpesa_balance_snapshots (id, request_id, result_description) VALUES (?, ?, ?)')
    .bind(crypto.randomUUID(), requestId, 'Automatic enquiry after a direct PayBill receipt; waiting for Safaricom callback.').run();
}

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
  try { await requestFreshBalance(env); } catch (cause) { console.error('Automatic balance refresh after PayBill receipt failed:', String(cause?.message || cause)); }
  return json({ ResultCode: 0, ResultDesc: 'Accepted' });
}
