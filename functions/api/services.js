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
  if (body.action === 'bulk_create_services') {
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length < 1 || rows.length > 100) return error('Upload between 1 and 100 service rows.');
    const normalized = rows.map((row, index) => ({
      name: safeString(row?.name, 120),
      category: safeString(row?.category, 60),
      price: safeString(row?.price, 80) || 'Contact us',
      priceAmount: row?.priceAmount === '' || row?.priceAmount == null ? null : Number(row.priceAmount),
    }));
    const invalid = normalized.findIndex(row => row.name.length < 2 || !row.category || (row.priceAmount !== null && (!Number.isSafeInteger(row.priceAmount) || row.priceAmount < 1 || row.priceAmount > 150000)));
    if (invalid >= 0) return error(`Service row ${invalid + 1} has an invalid name, category or amount. Nothing was imported.`);
    const prepared = [];
    for (const row of normalized) prepared.push({ ...row, id: uuid(), reference: await nextReference(env.DB, 'SRV') });
    const statements = prepared.flatMap(row => [
      env.DB.prepare('INSERT INTO services (id, display_ref, name, category, price_label, price_amount) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(row.id, row.reference, row.name, row.category, row.price, row.priceAmount),
      env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)')
        .bind(uuid(), access.user.id, 'service_created', 'service', row.id),
    ]);
    try { await env.DB.batch(statements); }
    catch (cause) {
      console.error('Navstar bulk service import failed:', String(cause?.stack || cause));
      return error('The service import could not be saved. No existing services were changed. Check your rows and try again.', 500);
    }
    return json({ imported: prepared.length, services: prepared.map(({ id, reference, name, category, price, priceAmount }) => ({ id, reference, name, category, price, priceAmount, status: 'active' })) }, 201);
  }

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