import { normalizePhone } from './http.js';

export function darajaReady(env) {
  return Boolean(
    env.DARAJA_CONSUMER_KEY &&
    env.DARAJA_CONSUMER_SECRET &&
    env.DARAJA_PASSKEY &&
    env.DARAJA_SHORTCODE &&
    env.DARAJA_CALLBACK_TOKEN &&
    env.APP_ORIGIN
  );
}

function darajaHost(env) {
  return String(env.DARAJA_ENVIRONMENT || '').trim().toLowerCase() === 'production'
    ? 'api.safaricom.co.ke'
    : 'sandbox.safaricom.co.ke';
}

function formatTimestamp(date = new Date(Date.now() + 3 * 60 * 60 * 1000)) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}

async function readProviderBody(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function providerMessage(body, fallback) {
  const message = body?.CustomerMessage || body?.ResponseDescription ||
    body?.errorMessage || body?.error_description || body?.error;
  return typeof message === 'string' && message.trim()
    ? message.trim().replace(/[\r\n]+/g, ' ').slice(0, 240)
    : fallback;
}

let cachedAccessToken = '';
let cachedAccessTokenExpiresAt = 0;
let cachedAccessTokenKey = '';
let accessTokenRequest = null;
let accessTokenRequestKey = '';

async function getAccessToken(env) {
  const tokenKey = `${darajaHost(env)}:${String(env.DARAJA_CONSUMER_KEY || '')}`;
  if (cachedAccessToken && cachedAccessTokenKey === tokenKey && cachedAccessTokenExpiresAt > Date.now() + 60000) return cachedAccessToken;
  if (accessTokenRequest && accessTokenRequestKey === tokenKey) return accessTokenRequest;
  const requestToken = async () => {
  const authorization = btoa(`${env.DARAJA_CONSUMER_KEY}:${env.DARAJA_CONSUMER_SECRET}`);
  let response;
  try {
    response = await fetch(`https://${darajaHost(env)}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${authorization}` },
      signal: AbortSignal.timeout(10000),
    });
  } catch (cause) {
    if (cause?.name === 'TimeoutError' || cause?.name === 'AbortError') {
      throw new Error('Safaricom authentication timed out. Check the Daraja environment and try again.');
    }
    throw new Error('Could not connect to Safaricom authentication. Please try again.');
  }
  const body = await readProviderBody(response);
  if (!response.ok || !body.access_token) {
    const detail = providerMessage(body, 'Check the Daraja Consumer Key and Consumer Secret.');
    throw new Error(`Safaricom authentication failed (HTTP ${response.status}): ${detail}`);
  }
  cachedAccessToken = String(body.access_token);
  cachedAccessTokenKey = tokenKey;
  const expiresIn = Math.max(120, Number(body.expires_in || 3599));
  cachedAccessTokenExpiresAt = Date.now() + Math.min(expiresIn, 3599) * 1000;
  return cachedAccessToken;
  };
  const pendingRequest = requestToken();
  accessTokenRequest = pendingRequest;
  accessTokenRequestKey = tokenKey;
  try { return await pendingRequest; }
  finally {
    if (accessTokenRequest === pendingRequest) {
      accessTokenRequest = null;
      accessTokenRequestKey = '';
    }
  }
}

export async function startStkPush(env, { phone, amount, accountReference, description }) {
  if (!darajaReady(env)) throw new Error('Daraja is not configured on the backend. Check the payment credentials, callback token and APP_ORIGIN settings.');
  const normalizedPhone = normalizePhone(phone);
  const value = Number(amount);
  if (!normalizedPhone || !Number.isInteger(value) || value < 1 || value > 150000) {
    throw new Error('Invalid Kenyan phone number or payment amount.');
  }

  let callbackUrl;
  try {
    callbackUrl = new URL('/api/payments/callback', env.APP_ORIGIN);
    if (callbackUrl.protocol !== 'https:') throw new Error('HTTPS is required.');
  } catch {
    throw new Error('The M-Pesa callback address is invalid. Set APP_ORIGIN to the live HTTPS website address.');
  }

  const timestamp = formatTimestamp();
  const shortcode = String(env.DARAJA_SHORTCODE).trim();
  const password = btoa(`${shortcode}${env.DARAJA_PASSKEY}${timestamp}`);
  callbackUrl.searchParams.set('token', env.DARAJA_CALLBACK_TOKEN);
  const accessToken = await getAccessToken(env);

  let response;
  try {
    response = await fetch(`https://${darajaHost(env)}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: env.DARAJA_TRANSACTION_TYPE || 'CustomerPayBillOnline',
        Amount: value,
        PartyA: normalizedPhone,
        PartyB: shortcode,
        PhoneNumber: normalizedPhone,
        CallBackURL: callbackUrl.toString(),
        AccountReference: String(accountReference || 'NAVSTAR').slice(0, 12),
        TransactionDesc: String(description || 'NAVSTAR PAYMENT').slice(0, 13),
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (cause) {
    if (cause?.name === 'TimeoutError' || cause?.name === 'AbortError') {
      throw new Error('Safaricom did not respond to the M-Pesa prompt request in time. Check the payment status before trying again.');
    }
    throw new Error('Could not connect to Safaricom STK Push. Please try again.');
  }

  const body = await readProviderBody(response);
  if (!response.ok || String(body.ResponseCode) !== '0' || !body.CheckoutRequestID) {
    const detail = providerMessage(body, 'Safaricom rejected the STK Push request. Check the shortcode, passkey, transaction type and Daraja environment.');
    const code = body?.ResponseCode ?? body?.errorCode;
    throw new Error(`M-Pesa prompt was rejected${code !== undefined ? ` (code ${String(code).slice(0, 30)})` : ''}: ${detail}`);
  }

  return {
    merchantRequestId: body.MerchantRequestID,
    checkoutRequestId: body.CheckoutRequestID,
    customerMessage: body.CustomerMessage ?? 'Check your phone for the payment prompt.',
    phone: normalizedPhone,
    amount: value,
  };
}
