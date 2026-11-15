import { error, isSameOrigin, json, normalizePhone, readJson, uuid } from '../_shared/http.js';
import { rateLimited } from '../_shared/rate-limit.js';
import { nextReference } from '../_shared/references.js';

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Donations service is not configured.', 503);
  if (await rateLimited(env.DB, request, 'donation', { maximum: 8, minutes: 15 })) return error('Too many donation requests. Try again later.', 429);

  let body;
  try { body = await readJson(request, 4096); } catch { return error('Invalid request body.'); }
  const phone = normalizePhone(body.phone);
  const amount = Number(body.amount);
  if (!phone || !Number.isInteger(amount) || amount < 1 || amount > 150000) return error('Enter a valid phone number and amount.');

  const id = uuid();
  const reference = await nextReference(env.DB, 'DON');
  await env.DB.prepare('INSERT INTO donations (id, display_ref, phone, amount) VALUES (?, ?, ?, ?)').bind(id, reference, phone, amount).run();
  return json({ id, reference, status: 'pending', amount }, 201);
}