import { sha256, hashPassword, verifyPassword } from './auth.js';

const cookieName = '__Host-navstar_customer';
const lifetime = 60 * 60 * 24 * 30;

function base64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function readCookie(request) {
  const cookies = request.headers.get('Cookie') || '';
  for (const part of cookies.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === cookieName) return value.join('=');
  }
  return '';
}
export async function registerCustomer(env, data) {
  const credentials = await hashPassword(data.password);
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO customer_accounts (id,full_name,email,phone,password_hash,password_salt) VALUES (?,?,?,?,?,?)')
    .bind(id,data.fullName,data.email,data.phone || null,credentials.hash,credentials.salt).run();
  return { id, fullName:data.fullName, email:data.email, phone:data.phone || null };
}
export async function loginCustomer(env, email, password) {
  const customer = await env.DB.prepare("SELECT id,full_name,email,phone,password_hash,password_salt FROM customer_accounts WHERE email = ? COLLATE NOCASE AND status = 'active'").bind(email).first();
  if (!customer || !(await verifyPassword(password,customer.password_salt,customer.password_hash))) return null;
  return { id:customer.id, fullName:customer.full_name, email:customer.email, phone:customer.phone };
}
export async function setCustomerSession(env, customerId) {
  const token = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const expires = new Date(Date.now()+lifetime*1000).toISOString();
  await env.DB.prepare('INSERT INTO customer_sessions (token_hash,customer_id,expires_at) VALUES (?,?,?)').bind(await sha256(token),customerId,expires).run();
  return `${cookieName}=${token}; Path=/; Max-Age=${lifetime}; HttpOnly; Secure; SameSite=Lax`;
}
export async function getCustomerSession(request, env) {
  const token = readCookie(request);
  if (!token || !env.DB) return null;
  return env.DB.prepare(`SELECT c.id,c.full_name AS fullName,c.email,c.phone
    FROM customer_sessions s JOIN customer_accounts c ON c.id=s.customer_id
    WHERE s.token_hash=? AND s.expires_at>? AND c.status='active'`)
    .bind(await sha256(token),new Date().toISOString()).first();
}
export async function clearCustomerSession(request, env) {
  const token = readCookie(request);
  if (token && env.DB) await env.DB.prepare('DELETE FROM customer_sessions WHERE token_hash=?').bind(await sha256(token)).run();
  return `${cookieName}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}
