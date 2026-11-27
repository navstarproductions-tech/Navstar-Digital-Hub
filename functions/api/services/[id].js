import { requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, uuid } from '../../_shared/http.js';

export async function onRequestDelete({ request, env, params }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Services database is not configured.', 503);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;
  const id = safeString(params.id, 80);
  const result = await env.DB.prepare("UPDATE services SET status = 'paused' WHERE id = ?").bind(id).run();
  if (!result.meta?.changes) return error('Service not found.', 404);
  await env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)')
    .bind(uuid(), access.user.id, 'service_paused', 'service', id).run();
  return json({ id, status: 'paused' });
}
export async function onRequestPatch({ request, env, params }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Services database is not configured.', 503);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;
  let body;
  try { body = await readJson(request, 4096); } catch { return error('Invalid request body.'); }
  const id = safeString(params.id, 80);
  const name = safeString(body.name, 120);
  const category = safeString(body.category, 60);
  const price = safeString(body.price, 80) || 'Contact us';
  const priceAmount = body.priceAmount === undefined || body.priceAmount === null || body.priceAmount === '' ? null : Number(body.priceAmount);
  if (name.length < 2 || !category) return error('Service name and category are required.');
  if (priceAmount !== null && (!Number.isSafeInteger(priceAmount) || priceAmount < 1 || priceAmount > 150000)) return error('Enter a valid whole-shilling online amount.');
  const result = await env.DB.prepare('UPDATE services SET name = ?, category = ?, price_label = ?, price_amount = ? WHERE id = ?')
    .bind(name, category, price, priceAmount, id).run();
  if (!result.meta?.changes) return error('Service not found.', 404);
  await env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)')
    .bind(uuid(), access.user.id, 'service_updated', 'service', id).run();
  return json({ id, name, category, price, priceAmount, status: 'active' });
}
