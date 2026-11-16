import { hashPassword } from '../../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, uuid } from '../../_shared/http.js';
import { rateLimited } from '../../_shared/rate-limit.js';

export async function onRequestGet({ env }) {
  if (!env.DB) return error('Admin setup is not configured.', 503);
  const admin = await env.DB.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").first();
  const used = await env.DB.prepare("SELECT value FROM system_state WHERE key = 'admin-bootstrap-used'").first();
  return json({
    adminExists: Number(admin?.count ?? 0) > 0,
    setupAvailable: Number(admin?.count ?? 0) === 0 && !used,
  });
}

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Admin setup is not configured.', 503);
  if (await rateLimited(env.DB, request, 'admin-bootstrap', { maximum: 3, minutes: 60 })) return error('Setup limit reached. Try again later.', 429);

  let body;
  try { body = await readJson(request, 4096); } catch { return error('Invalid request body.'); }
  const name = safeString(body.name, 120);
  const email = safeString(body.email, 254).toLowerCase();
  const password = String(body.password ?? '');
  const confirmPassword = String(body.confirmPassword ?? '');
  if (name.length < 2 || !email.includes('@')) return error('Please enter your full name and a valid email address.');
  if (password.length < 6 || password.length > 200) return error('Your password must contain at least 6 characters.');
  if (password !== confirmPassword) return error('The passwords do not match.');

  const existing = await env.DB.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").first();
  if (Number(existing?.count ?? 0) > 0) return error('An administrator already exists. Please sign in.', 409);
  const lock = await env.DB.prepare("INSERT INTO system_state (key, value) VALUES ('admin-bootstrap-used', '1') ON CONFLICT(key) DO NOTHING").run();
  if (!lock.meta?.changes) return error('First Admin setup has already been used. Please sign in.', 409);
  const passwordRecord = await hashPassword(password);
  const id = uuid();
  await env.DB.prepare(`
    INSERT INTO users (id, name, email, role, password_hash, password_salt)
    VALUES (?, ?, ?, 'admin', ?, ?)
  `).bind(id, name, email, passwordRecord.hash, passwordRecord.salt).run();
  await env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)')
    .bind(uuid(), id, 'bootstrap_admin_created', 'user', id).run();
  return json({ created: true, userId: id }, 201);
}
