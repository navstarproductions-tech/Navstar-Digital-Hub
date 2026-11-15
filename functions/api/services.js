import { getSession, requireRole } from '../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, uuid } from '../_shared/http.js';
import { nextReference } from '../_shared/references.js';

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ services: [] });
  const rows = await env.DB.prepare("SELECT id, display_ref AS reference, name, category, price_label AS price, price_amount AS priceAmount, status FROM services WHERE status = 'active' ORDER BY name").all();
  return json({ services: rows.results ?? [] });
}

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Services database is not configured.', 503);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;
  let body;
  try { body = await readJson(request, 4096); } catch { return error('Invalid request body.'); }
  const name = safeString(body.name, 120);
  const category = safeString(body.category, 60);
  const price = safeString(body.price, 80) || 'Contact us';
  const priceAmount = body.priceAmount === undefined || body.priceAmount === null || body.priceAmount === '' ? null : Number(body.priceAmount);
  if (priceAmount !== null && (!Number.isSafeInteger(priceAmount) || priceAmount < 1 || priceAmount > 150000)) return error('Enter a valid service payment amount.');
  if (name.length < 2 || !category) return error('Service name and category are required.');
  const id = uuid();
  const reference = await nextReference(env.DB, 'SRV');
  await env.DB.prepare('INSERT INTO services (id, display_ref, name, category, price_label, price_amount) VALUES (?, ?, ?, ?, ?, ?)').bind(id, reference, name, category, price, priceAmount).run();
  await env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)')
    .bind(uuid(), access.user.id, 'service_created', 'service', id).run();
  return json({ id, reference, name, category, price, priceAmount, status: 'active' }, 201);
}