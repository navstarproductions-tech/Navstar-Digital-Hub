import { requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json } from '../../_shared/http.js';

function host(env) {
  return String(env.DARAJA_ENVIRONMENT || '').toLowerCase() === 'production'
    ? 'api.safaricom.co.ke' : 'sandbox.safaricom.co.ke';
}
async function accessToken(env) {
  const auth = btoa(env.DARAJA_CONSUMER_KEY + ':' + env.DARAJA_CONSUMER_SECRET);
  const response = await fetch('https://' + host(env) + '/oauth/v1/generate?grant_type=client_credentials', {
    headers: { Authorization: 'Basic ' + auth }, signal: AbortSignal.timeout(10000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.access_token) throw new Error('Safaricom authentication failed.');
  return data.access_token;
}

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;
  const required = ['DARAJA_CONSUMER_KEY','DARAJA_CONSUMER_SECRET','DARAJA_SHORTCODE','APP_ORIGIN'];
  if (required.some(key => !env[key])) return error('Daraja C2B registration is not configured.', 503);
  let origin;
  try { origin = new URL(env.APP_ORIGIN); } catch { return error('APP_ORIGIN is invalid.', 503); }
  if (origin.protocol !== 'https:') return error('C2B callback origin must use HTTPS.', 503);
  const confirmation = new URL('/api/payments/c2b-confirmation', origin).toString();
  const validation = new URL('/api/payments/c2b-validation', origin).toString();
  try {
    const token = await accessToken(env);
    const response = await fetch('https://' + host(env) + '/mpesa/c2b/v1/registerurl', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ShortCode: String(env.DARAJA_SHORTCODE),
        ResponseType: 'Completed',
        ConfirmationURL: confirmation,
        ValidationURL: validation,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || (result?.ResponseCode !== undefined && String(result.ResponseCode) !== '0')) {
      console.error('Daraja C2B URL registration rejected:', response.status, JSON.stringify(result).slice(0, 500));
      return error('Safaricom did not register the PayBill confirmation URLs. Check C2B API activation and shortcode permissions.', 502);
    }
    return json({ registered: true, response: result, message: 'Safaricom accepted the C2B URL registration request. New direct PayBill payments will appear after Safaricom posts their confirmation callbacks.' });
  } catch (cause) {
    console.error('C2B URL registration failed:', String(cause?.message || cause));
    return error('Could not register the PayBill confirmation URLs with Safaricom.', 502);
  }
}
