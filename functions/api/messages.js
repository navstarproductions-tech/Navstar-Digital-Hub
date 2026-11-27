import { requireRole } from '../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, uuid } from '../_shared/http.js';

const STAFF_ROLES = ['admin', 'principal', 'admissions', 'tutor'];
const ALL_ROLES = ['student', ...STAFF_ROLES];

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('Messaging is not configured.', 503);
  const access = await requireRole(request, env, ALL_ROLES);
  if (access.response) return access.response;
  const user = access.user;
  const [rows, contacts] = await Promise.all([
    env.DB.prepare(`
      SELECT m.id,m.thread_id AS threadId,m.sender_id AS senderId,m.recipient_id AS recipientId,
        m.subject,m.body,m.read_at AS readAt,m.created_at AS createdAt,
        s.name AS senderName,s.role AS senderRole,r.name AS recipientName,r.role AS recipientRole
      FROM portal_messages m
      JOIN users s ON s.id=m.sender_id
      JOIN users r ON r.id=m.recipient_id
      WHERE m.sender_id=? OR m.recipient_id=?
      ORDER BY m.created_at ASC LIMIT 1000
    `).bind(user.id, user.id).all(),
    user.role === 'student'
      ? env.DB.prepare(`SELECT u.id,u.name,COALESCE(p.portal_role,u.role) AS role
          FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id
          WHERE u.status='active' AND COALESCE(p.portal_role,u.role) IN ('admin','principal','admissions','tutor')
          ORDER BY CASE COALESCE(p.portal_role,u.role) WHEN 'tutor' THEN 0 WHEN 'admissions' THEN 1 ELSE 2 END,u.name LIMIT 200`).all()
      : env.DB.prepare(`SELECT u.id,u.name,COALESCE(p.portal_role,u.role) AS role
          FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id
          WHERE u.status='active' AND COALESCE(p.portal_role,u.role)='student'
          ORDER BY u.name LIMIT 300`).all()
  ]);
  return json({ messages: rows.results || [], contacts: contacts.results || [] });
}

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Messaging is not configured.', 503);
  const access = await requireRole(request, env, ALL_ROLES);
  if (access.response) return access.response;
  let body;
  try { body = await readJson(request, 12000); } catch { return error('Invalid message.'); }
  const sender = access.user;
  const recipientId = safeString(body.recipientId, 80);
  const subject = safeString(body.subject, 160);
  const messageBody = safeString(body.body, 5000);
  const threadId = safeString(body.threadId, 80) || uuid();
  if (!recipientId || messageBody.trim().length < 2) return error('Choose a recipient and enter a message.');
  if (recipientId === sender.id) return error('You cannot send a message to yourself.');
  const recipient = await env.DB.prepare(`
    SELECT u.id,u.name,COALESCE(p.portal_role,u.role) AS role
    FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id
    WHERE u.id=? AND u.status='active'
  `).bind(recipientId).first();
  if (!recipient) return error('The selected recipient is unavailable.', 404);
  if (sender.role === 'student' && !STAFF_ROLES.includes(recipient.role)) return error('Students can message active Navstar staff accounts only.', 403);
  if (STAFF_ROLES.includes(sender.role) && recipient.role !== 'student') return error('Staff can message active student accounts only.', 403);
  if (!ALL_ROLES.includes(sender.role)) return error('This account cannot use portal messaging.', 403);

  const existing = await env.DB.prepare('SELECT id FROM portal_messages WHERE thread_id=? LIMIT 1').bind(threadId).first();
  if (existing) {
    const participant = await env.DB.prepare(`
      SELECT id FROM portal_messages
      WHERE thread_id=? AND ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?))
      LIMIT 1
    `).bind(threadId, sender.id, recipientId, recipientId, sender.id).first();
    if (!participant) return error('This conversation is not available to your account.', 403);
  }

  const id = uuid();
  const messageSubject = existing ? '' : (subject || 'Student portal message');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO portal_messages(id,thread_id,sender_id,recipient_id,subject,body) VALUES(?,?,?,?,?,?)')
      .bind(id, threadId, sender.id, recipientId, messageSubject, messageBody.trim()),
    env.DB.prepare('INSERT INTO notifications(id,user_id,title,message) VALUES(?,?,?,?)')
      .bind(uuid(), recipientId, 'New portal message', (messageSubject ? messageSubject + ' · ' : '') + 'From ' + sender.name + ': ' + messageBody.trim().slice(0, 180))
  ]);
  return json({ sent: true, messageId: id, threadId });
}

export async function onRequestPatch({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Messaging is not configured.', 503);
  const access = await requireRole(request, env, ALL_ROLES);
  if (access.response) return access.response;
  let body;
  try { body = await readJson(request, 2000); } catch { return error('Invalid message update.'); }
  const threadId = safeString(body.threadId, 80);
  if (!threadId) return error('Conversation not found.');
  await env.DB.prepare(`
    UPDATE portal_messages SET read_at=CURRENT_TIMESTAMP
    WHERE thread_id=? AND recipient_id=? AND read_at IS NULL
  `).bind(threadId, access.user.id).run();
  return json({ read: true });
}
