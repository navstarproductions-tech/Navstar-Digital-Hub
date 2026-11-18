import { getSession } from '../../_shared/auth.js';
import { error, json } from '../../_shared/http.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('Authentication service is not configured.', 503);
  const user = await getSession(request, env);
  if (!user) return error('Sign in required.', 401);
  const timeoutRow = await env.DB.prepare("SELECT value FROM system_state WHERE key = 'session-timeout-minutes'").first().catch(() => null);
  const sessionTimeoutMinutes = Math.max(5, Math.min(480, Number(timeoutRow?.value ?? 480) || 480));
  return json({ user, sessionTimeoutMinutes });
}