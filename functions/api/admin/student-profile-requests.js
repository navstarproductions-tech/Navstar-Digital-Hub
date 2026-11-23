import { requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, uuid } from '../../_shared/http.js';

const profileFields = new Set([
  'national_id','phone','date_of_birth','gender','citizenship','country','province','county',
  'sub_county','constituency','ward','location','sub_location','department','job_title',
  'employment_type','joined_on','address'
]);

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('Student profile requests are not configured.', 503);
  const access = await requireRole(request, env, ['admin', 'principal']);
  if (access.response) return access.response;
  const rows = await env.DB.prepare(`
    SELECT r.id,r.user_id AS userId,r.changes_json AS changesJson,r.status,r.review_note AS reviewNote,
      r.created_at AS createdAt,r.reviewed_at AS reviewedAt,u.name AS studentName,u.email,
      p.staff_id AS studentId
    FROM student_profile_change_requests r
    JOIN users u ON u.id=r.user_id
    LEFT JOIN user_profiles p ON p.user_id=u.id
    ORDER BY CASE WHEN r.status='pending' THEN 0 ELSE 1 END,r.created_at DESC LIMIT 300
  `).all();
  return json({ requests: (rows.results || []).map(row => {
    let changes = {};
    try { changes = JSON.parse(row.changesJson || '{}'); } catch {}
    return { id: row.id, userId: row.userId, studentName: row.studentName, email: row.email, studentId: row.studentId, changes, status: row.status, reviewNote: row.reviewNote, createdAt: row.createdAt, reviewedAt: row.reviewedAt };
  }) });
}

export async function onRequestPatch({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Student profile requests are not configured.', 503);
  const access = await requireRole(request, env, ['admin', 'principal']);
  if (access.response) return access.response;
  let body;
  try { body = await readJson(request, 4096); } catch { return error('Invalid review request.'); }
  const id = safeString(body.id, 80);
  const action = safeString(body.action, 20);
  const reviewNote = safeString(body.reviewNote, 1000);
  if (!id || !['approve','reject'].includes(action)) return error('Choose an approval or rejection action.');
  if (action === 'reject' && reviewNote.trim().length < 5) return error('Enter a short reason before rejecting the request.');
  const row = await env.DB.prepare(`SELECT id,user_id,changes_json,status FROM student_profile_change_requests WHERE id=?`).bind(id).first();
  if (!row) return error('Profile change request not found.', 404);
  if (row.status !== 'pending') return error('This request has already been reviewed.', 409);
  let changes;
  try { changes = JSON.parse(row.changes_json || '{}'); } catch { return error('The stored change request is invalid. Contact technical support.', 500); }
  const statements = [];
  if (action === 'approve') {
    const name = Object.prototype.hasOwnProperty.call(changes, 'name') ? safeString(changes.name, 120) : '';
    if (Object.prototype.hasOwnProperty.call(changes, 'name') && name.length < 2) return error('The requested student name is invalid.');
    if (name) statements.push(env.DB.prepare('UPDATE users SET name=? WHERE id=?').bind(name, row.user_id));
    for (const [column, value] of Object.entries(changes)) {
      if (!profileFields.has(column)) continue;
      statements.push(env.DB.prepare(`UPDATE user_profiles SET ${column}=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?`).bind(value === '' ? null : value, row.user_id));
    }
  }
  statements.push(env.DB.prepare('UPDATE student_profile_change_requests SET status=?,review_note=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=? AND status=\'pending\'')
    .bind(action === 'approve' ? 'approved' : 'rejected', reviewNote, access.user.id, id));
  statements.push(env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)')
    .bind(uuid(), access.user.id, 'student_profile_change_' + action, 'student_profile_change_request', id));
  await env.DB.batch(statements);
  return json({ reviewed: true, id, status: action === 'approve' ? 'approved' : 'rejected' });
}
