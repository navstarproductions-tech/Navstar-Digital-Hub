import { hashPassword } from '../../_shared/auth.js';
import { passwordPolicyError } from '../../_shared/password-policy.js';
import { constantTimeEqual, error, isSameOrigin, json, readJson, safeString, uuid } from '../../_shared/http.js';
import { rateLimited } from '../../_shared/rate-limit.js';

export async function onRequestGet({ env }) {
  if (!env.DB) return error('Admin setup is not configured.', 503);
  const admin = await env.DB.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active'").first();
  const adminExists = Number(admin?.count ?? 0) > 0;
  return json({ adminExists, setupAvailable: !adminExists, setupRequiresPrivateKey: true });
}

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB || !env.ADMIN_RESET_TOKEN) return error('Admin setup is not configured. Add the ADMIN_RESET_TOKEN secret to the Production environment.', 503);
  if (await rateLimited(env.DB, request, 'admin-fresh-setup', { maximum: 3, minutes: 60 })) return error('Setup limit reached. Try again later.', 429);

  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (token.length < 32 || !constantTimeEqual(token, env.ADMIN_RESET_TOKEN)) return error('Invalid Admin setup key.', 403);

  let body;
  try { body = await readJson(request, 4096); } catch { return error('Invalid request body.'); }
  const name = safeString(body.name, 120);
  const email = safeString(body.email, 254).toLowerCase();
  const password = String(body.password ?? '');
  const confirmPassword = String(body.confirmPassword ?? '');
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return error('Enter your full name and a valid email address.');
  const passwordError = passwordPolicyError(password);
  if (passwordError) return error(passwordError);
  if (password !== confirmPassword) return error('The passwords do not match.');

  const collision = await env.DB.prepare("SELECT id, role FROM users WHERE email = ? COLLATE NOCASE").bind(email).first();
  if (collision && collision.role !== 'admin') return error('This email is already used by a ' + collision.role + ' account. Keep that account and use a different email for Admin.', 409);

  // If this email belongs to an existing (even disabled) Admin, reuse that exact row
  // to avoid unique-email conflicts and preserve its linked records.
  const existing = collision || await env.DB.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, created_at ASC LIMIT 1").first();
  const passwordRecord = await hashPassword(password);
  const adminId = existing?.id || uuid();

  let accountSaved = false;
  try {
    if (existing) {
      await env.DB.prepare("UPDATE users SET name = ?, email = ?, password_hash = ?, password_salt = ?, status = 'active', must_change_password = 0 WHERE id = ?")
        .bind(name, email, passwordRecord.hash, passwordRecord.salt, adminId).run();
      accountSaved = true;
      // Secondary cleanup must never turn a successful credential update into a false failure.
      try { await env.DB.prepare("UPDATE users SET status = 'disabled' WHERE role = 'admin' AND id != ? AND status = 'active'").bind(adminId).run(); } catch (cause) { console.error('Admin secondary-account cleanup failed:', String(cause)); }
      try { await env.DB.prepare("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE role = 'admin')").run(); } catch (cause) { console.error('Admin session cleanup failed:', String(cause)); }
      try { await env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)').bind(uuid(), adminId, 'admin_fresh_setup', 'user', adminId).run(); } catch (cause) { console.error('Admin audit write failed:', String(cause)); }
    } else {
      await env.DB.prepare("INSERT INTO users (id, name, email, role, password_hash, password_salt, must_change_password, status) VALUES (?, ?, ?, 'admin', ?, ?, 0, 'active')")
        .bind(adminId, name, email, passwordRecord.hash, passwordRecord.salt).run();
      accountSaved = true;
      try { await env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)').bind(uuid(), adminId, 'admin_first_setup', 'user', adminId).run(); } catch (cause) { console.error('Admin audit write failed:', String(cause)); }
    }
  } catch (cause) {
    if (String(cause?.message || '').toLowerCase().includes('unique')) return error('That email is already registered. Please use another email.', 409);
    console.error('Admin fresh setup failed:', String(cause));
    if (accountSaved) return json({ created: true, message: 'Your Admin credentials were saved. You can now sign in.' }, 201);
    return error('Admin account could not be saved. Please check the setup key and try again. Existing records have been retained.', 500);
  }
  return json({ created: true, message: 'Your new Admin login is ready. You can now sign in.' }, 201);
}
