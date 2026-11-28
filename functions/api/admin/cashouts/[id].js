import { requireRole } from '../../../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, uuid } from '../../../_shared/http.js';

function darajaHost(env) {
  return String(env.DARAJA_ENVIRONMENT || '').trim().toLowerCase() === 'production'
    ? 'api.safaricom.co.ke' : 'sandbox.safaricom.co.ke';
}

async function getAccessToken(env) {
  const authorization = btoa(env.DARAJA_CONSUMER_KEY + ':' + env.DARAJA_CONSUMER_SECRET);
  const response = await fetch('https://' + darajaHost(env) + '/oauth/v1/generate?grant_type=client_credentials', {
    headers: { Authorization: 'Basic ' + authorization },
    signal: AbortSignal.timeout(10000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.access_token) throw new Error('Safaricom authentication failed.');
  return payload.access_token;
}

async function sendB2CPayout(env, payout) {
  const required = ['DARAJA_CONSUMER_KEY', 'DARAJA_CONSUMER_SECRET', 'DARAJA_B2C_INITIATOR_NAME',
    'DARAJA_B2C_SECURITY_CREDENTIAL', 'DARAJA_SHORTCODE', 'DARAJA_B2C_CALLBACK_URL',
    'DARAJA_CALLBACK_TOKEN', 'APP_ORIGIN'];
  if (required.some((key) => !env[key])) throw new Error('B2C payout configuration is incomplete.');
  const callback = new URL(env.DARAJA_B2C_CALLBACK_URL);
  const origin = new URL(env.APP_ORIGIN);
  if (callback.protocol !== 'https:' || callback.origin !== origin.origin || callback.pathname !== '/api/payments/b2c-callback') {
    throw new Error('The B2C callback must be the public HTTPS Navstar callback URL.');
  }
  callback.searchParams.set('token', env.DARAJA_CALLBACK_TOKEN);
  const token = await getAccessToken(env);
  const response = await fetch('https://' + darajaHost(env) + '/mpesa/b2c/v3/paymentrequest', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      OriginatorConversationID: payout.originatorConversationId,
      InitiatorName: env.DARAJA_B2C_INITIATOR_NAME,
      SecurityCredential: env.DARAJA_B2C_SECURITY_CREDENTIAL,
      CommandID: 'BusinessPayment',
      Amount: String(payout.amount),
      PartyA: String(env.DARAJA_SHORTCODE),
      PartyB: payout.phone,
      Remarks: payout.remarks.slice(0, 100),
      QueueTimeOutURL: callback.toString(),
      ResultURL: callback.toString(),
      Occassion: payout.remarks.slice(0, 100),
    }),
    signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || String(payload?.ResponseCode) !== '0' || !payload?.OriginatorConversationID) {
    const detail = safeString(payload?.errorMessage || payload?.ResponseDescription || payload?.error || 'Safaricom rejected the payout request.', 300);
    throw new Error(detail);
  }
  return payload;
}

export async function onRequestPatch({ request, env, params }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Cashout requests are not configured.', 503);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;
  let body;
  try { body = await readJson(request, 4096); } catch { return error('Invalid request body.'); }
  const status = safeString(body.status, 20);
  if (!['approved', 'rejected'].includes(status)) return error('Cashout can only be approved or rejected.');

  const existing = await env.DB.prepare(`
    SELECT c.id, c.display_ref, c.amount, c.recipient_phone, c.purpose, c.status,
      b.id AS payout_id, b.status AS payout_status, b.transaction_id
    FROM cashout_requests c LEFT JOIN mpesa_b2c_transactions b ON b.cashout_request_id = c.id
    WHERE c.id = ? LIMIT 1
  `).bind(params.id).first();
  if (!existing) return error('Cashout request not found.', 404);
  if (existing.payout_id) return json({ id: params.id, status: existing.status, payout_status: existing.payout_status, transaction_id: existing.transaction_id, already_submitted: true });
  if (existing.status !== 'pending_approval') return error('This cashout request has already been reviewed.', 409);

  if (status === 'rejected') {
    const rejected = await env.DB.prepare(`
      UPDATE cashout_requests SET status = 'rejected', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'pending_approval'
    `).bind(access.user.id, params.id).run();
    if (!rejected.meta?.changes) return error('Cashout request has already been reviewed.', 409);
    await env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)')
      .bind(uuid(), access.user.id, 'cashout_rejected', 'cashout', params.id).run();
    return json({ id: params.id, status: 'rejected' });
  }

  if (!existing.recipient_phone) return error('This older cashout request has no recipient phone number. Create a new payout request with a phone number.');
  const originatorConversationId = crypto.randomUUID().replace(/-/g, '').slice(0, 18);
  const payoutId = uuid();
  const inserted = await env.DB.prepare(`
    INSERT OR IGNORE INTO mpesa_b2c_transactions
      (id, cashout_request_id, originator_conversation_id, recipient_phone, amount, status, requested_by, approved_by)
    VALUES (?, ?, ?, ?, ?, 'submitting', ?, ?)
  `).bind(payoutId, params.id, originatorConversationId, existing.recipient_phone, existing.amount, access.user.id, access.user.id).run();
  if (!inserted.meta?.changes) return error('A payout attempt already exists for this request. Check its status before taking any further action.', 409);

  const approved = await env.DB.prepare(`
    UPDATE cashout_requests SET status = 'approved', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'pending_approval'
  `).bind(access.user.id, params.id).run();
  if (!approved.meta?.changes) {
    await env.DB.prepare("UPDATE mpesa_b2c_transactions SET status = 'cancelled', result_description = 'Request was already reviewed before submission.' WHERE id = ?").bind(payoutId).run();
    return error('Cashout request has already been reviewed.', 409);
  }

  await env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)')
    .bind(uuid(), access.user.id, 'cashout_b2c_submission_started', 'cashout', params.id).run();

  try {
    const result = await sendB2CPayout(env, {
      originatorConversationId, amount: existing.amount, phone: existing.recipient_phone,
      remarks: 'Navstar ' + (existing.display_ref || 'payout'),
    });
    await env.DB.prepare(`
      UPDATE mpesa_b2c_transactions SET status = 'accepted', conversation_id = ?, result_description = ?, submitted_at = ?
      WHERE id = ?
    `).bind(safeString(result.ConversationID, 120), safeString(result.ResponseDescription, 500), new Date().toISOString(), payoutId).run();
    return json({ id: params.id, status: 'approved', payout_status: 'accepted', message: 'Safaricom accepted the payout request. Final status will update after its callback.' });
  } catch (cause) {
    const description = safeString(cause?.message || 'Payout submission failed.', 500);
    const uncertain = /timeout|timed out|abort|network|connect/i.test(description);
    await env.DB.prepare('UPDATE mpesa_b2c_transactions SET status = ?, result_description = ?, submitted_at = ? WHERE id = ?')
      .bind(uncertain ? 'unknown' : 'failed', description, new Date().toISOString(), payoutId).run();
    console.error('B2C payout submission issue:', description);
    return error(uncertain
      ? 'The request outcome is uncertain. Do not retry or send again until the transaction is checked with Safaricom.'
      : 'Safaricom did not accept the payout: ' + description, 502);
  }
}