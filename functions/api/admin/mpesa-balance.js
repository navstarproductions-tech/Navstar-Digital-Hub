import { requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, uuid } from '../../_shared/http.js';

function darajaHost(env) {
  return env.DARAJA_ENVIRONMENT === 'production' ? 'api.safaricom.co.ke' : 'sandbox.safaricom.co.ke';
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
export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Database is not configured.', 503);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;

  const required = ['DARAJA_CONSUMER_KEY','DARAJA_CONSUMER_SECRET','DARAJA_INITIATOR_NAME','DARAJA_SECURITY_CREDENTIAL','DARAJA_SHORTCODE','DARAJA_BALANCE_CALLBACK_URL','DARAJA_CALLBACK_TOKEN','APP_ORIGIN'];
  if (required.some(key => !env[key])) return error('Live M-Pesa balance enquiry is not configured. Ask the administrator to complete the secure Daraja configuration.', 503);

  let callback;
  try {
    callback = new URL(env.DARAJA_BALANCE_CALLBACK_URL);
    const appOrigin = new URL(env.APP_ORIGIN);
    if (callback.protocol !== 'https:' || callback.origin !== appOrigin.origin || callback.pathname !== '/api/payments/balance-callback') {
      return error('The balance callback must be the public HTTPS Navstar callback URL.', 503);
    }
    callback.searchParams.set('token', env.DARAJA_CALLBACK_TOKEN);
  } catch {
    return error('The balance callback URL is invalid.', 503);
  }

  try {
    const token = await getAccessToken(env);
    const response = await fetch('https://' + darajaHost(env) + '/mpesa/accountbalance/v1/query', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Initiator: env.DARAJA_INITIATOR_NAME,
        SecurityCredential: env.DARAJA_SECURITY_CREDENTIAL,
        CommandID: 'AccountBalance',
        PartyA: env.DARAJA_SHORTCODE,
        IdentifierType: env.DARAJA_IDENTIFIER_TYPE || '4',
        Remarks: 'Navstar Digital Hub balance enquiry',
        QueueTimeOutURL: callback.toString(),
        ResultURL: callback.toString(),
      }),
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json().catch(() => null);
    const requestId = result?.OriginatorConversationID || result?.ConversationID;
    if (!response.ok || !requestId) {
      console.error('Daraja balance enquiry was not accepted:', response.status, JSON.stringify(result).slice(0, 500));
      return error('Safaricom did not accept the balance enquiry. Check Account Balance API access and the secure configuration.', 502);
    }
    await env.DB.prepare('INSERT INTO mpesa_balance_snapshots (id, request_id, result_description, requested_by) VALUES (?, ?, ?, ?)')
      .bind(uuid(), requestId, result.ResponseDescription || 'Accepted by Safaricom; waiting for callback.', access.user.id).run();
    return json({ accepted: true, message: 'Safaricom accepted the balance enquiry. The balance will appear after its callback.' });
  } catch (cause) {
    console.error('Daraja balance enquiry failed:', String(cause?.message || cause));
    return error('Could not contact Safaricom Account Balance API. No balance has been assumed.', 502);
  }
}
