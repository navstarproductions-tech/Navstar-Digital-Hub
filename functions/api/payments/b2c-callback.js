import { error, json, safeString, constantTimeEqual } from '../../_shared/http.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.DARAJA_CALLBACK_TOKEN) return error('Callback is not configured.', 503);
  const url = new URL(request.url);
  if (!constantTimeEqual(url.searchParams.get('token') || '', env.DARAJA_CALLBACK_TOKEN)) return error('Not found.', 404);

  let body;
  try { body = await request.json(); } catch { return error('Invalid callback body.'); }
  const result = body?.Result;
  if (!result) return json({ ResultCode: 0, ResultDesc: 'Callback received.' });

  const originatorId = safeString(result.OriginatorConversationID, 80);
  if (!originatorId) return json({ ResultCode: 0, ResultDesc: 'Callback acknowledged.' });
  const resultCode = Number(result.ResultCode);
  const parameters = result.ResultParameters?.ResultParameter;
  const values = Object.fromEntries((Array.isArray(parameters) ? parameters : [])
    .filter((item) => item && typeof item.Key === 'string')
    .map((item) => [item.Key, item.Value]));
  const successful = Number.isFinite(resultCode) && resultCode === 0;
  const transactionId = safeString(values.TransactionReceipt || result.TransactionID, 80) || null;
  const description = safeString(result.ResultDesc || (successful ? 'Payment completed.' : 'Payment failed.'), 500);
  const row = await env.DB.prepare('SELECT id, cashout_request_id FROM mpesa_b2c_transactions WHERE originator_conversation_id = ? LIMIT 1')
    .bind(originatorId).first();
  if (row) {
    await env.DB.prepare(`
      UPDATE mpesa_b2c_transactions
      SET status = ?, conversation_id = ?, transaction_id = ?, result_code = ?,
        result_description = ?, raw_result = ?, received_at = ?
      WHERE id = ?
    `).bind(successful ? 'paid' : (Number.isFinite(resultCode) ? 'failed' : 'unknown'),
      safeString(result.ConversationID, 120) || null, transactionId,
      Number.isFinite(resultCode) ? resultCode : null, description,
      JSON.stringify(body).slice(0, 12000), new Date().toISOString(), row.id).run();
    if (successful) {
      await env.DB.prepare("UPDATE cashout_requests SET status = 'paid' WHERE id = ? AND status = 'approved'")
        .bind(row.cashout_request_id).run();
    }
    await env.DB.prepare('INSERT INTO audit_logs (id, action, entity_type, entity_id) VALUES (?, ?, ?, ?)')
      .bind(crypto.randomUUID(), successful ? 'cashout_b2c_paid' : 'cashout_b2c_result_received', 'cashout', row.cashout_request_id).run();
  }
  return json({ ResultCode: 0, ResultDesc: 'Accepted.' });
}