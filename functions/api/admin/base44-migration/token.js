import { requireRole, sha256 } from '../../../_shared/auth.js';
import { error, isSameOrigin, json, uuid } from '../../../_shared/http.js';

function tokenValue() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;
  const token = tokenValue();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await env.DB.prepare('INSERT INTO base44_migration_tokens (token_hash, created_by, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(token), access.user.id, expiresAt).run();
  return json({ token, expiresAt, message: 'Copy this token now. It is shown only once and expires in one hour.' }, 201);
}
