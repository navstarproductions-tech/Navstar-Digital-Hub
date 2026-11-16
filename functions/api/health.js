import { json } from '../_shared/http.js';
import { darajaReady } from '../_shared/daraja.js';

export function onRequestGet({ env }) {
  return json({
    status: 'ok',
    databaseConfigured: Boolean(env.DB),
    darajaConfigured: darajaReady(env),
    appOriginConfigured: Boolean(env.APP_ORIGIN),
    environment: env.DARAJA_ENVIRONMENT === 'production' ? 'production' : 'sandbox',
  });
}
