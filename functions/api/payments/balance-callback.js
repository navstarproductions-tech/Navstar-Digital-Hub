import { error, json, safeString } from '../../_shared/http.js';

function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}
export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.DARAJA_CALLBACK_TOKEN) return error('Callback is not configured.', 503);
  const url = new URL(request.url);
  if (!safeEqual(url.searchParams.get('token') || '', env.DARAJA_CALLBACK_TOKEN)) return error('Not found.', 404);

  let body;
  try { body = await request.json(); } catch { return error('Invalid callback body.'); }
  const result = body?.Result;
  if (!result) return error('Invalid balance callback.');
  const params = result.ResultParameters?.ResultParameter;
  const parsed = Object.fromEntries((Array.isArray(params) ? params : []).map(item => [item.Key, item.Value]));
  const balanceText = safeString(parsed.AccountBalance, 1000);
  const requestId = safeString(result.OriginatorConversationID || result.ConversationID, 120);
  const resultCode = Number(result.ResultCode);
  const match = balanceText.match(/KES\s*\|?\s*([0-9,]+(?:\.[0-9]+)?)/i) || balanceText.match(/\|\s*([0-9,]+(?:\.[0-9]+)?)\s*\|/);
  const amount = match ? Number(match[1].replace(/,/g, '')) : null;
  if (!requestId) return json({ ResultCode: 0, ResultDesc: 'Accepted.' });

  const row = await env.DB.prepare('SELECT id FROM mpesa_balance_snapshots WHERE request_id = ? ORDER BY created_at DESC LIMIT 1').bind(requestId).first();
  if (row) {
    await env.DB.prepare('UPDATE mpesa_balance_snapshots SET result_code = ?, result_description = ?, balance_text = ?, balance_amount = ?, raw_result = ?, received_at = ? WHERE id = ?')
      .bind(Number.isFinite(resultCode) ? resultCode : -1, safeString(result.ResultDesc, 500), resultCode === 0 ? (balanceText || null) : null,
        resultCode === 0 && Number.isFinite(amount) ? amount : null, JSON.stringify(body).slice(0, 12000), new Date().toISOString(), row.id).run();
  }
  return json({ ResultCode: 0, ResultDesc: 'Accepted.' });
}
