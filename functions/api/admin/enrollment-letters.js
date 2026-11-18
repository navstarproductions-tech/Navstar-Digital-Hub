import { requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, uuid } from '../../_shared/http.js';

const templates = {
  admission: ['Admission letter', 'We are pleased to acknowledge your application to Navstar Digital Hub. Your admission is subject to the official decision recorded by Admissions.'],
  acceptance: ['Offer and acceptance letter', 'We are pleased to offer you admission to the course shown below. Please follow the Student Portal setup instructions and the approved fee arrangements.'],
  rejection: ['Application decision letter', 'After reviewing your application, Navstar Digital Hub is unable to offer admission at this time. The reason recorded by Admissions is included below.'],
  withdrawal: ['Course withdrawal acknowledgement', 'This letter confirms that your withdrawal from the course has been recorded by Navstar Digital Hub. Please contact Finance for any applicable account reconciliation.']
};

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('Admissions letters are not configured.', 503);
  const access = await requireRole(request, env, ['admin','admissions','principal']);
  if (access.response) return access.response;
  const enrollmentId = safeString(new URL(request.url).searchParams.get('enrollmentId'), 80);
  if (!enrollmentId) return error('Application reference is required.');
  const result = await env.DB.prepare('SELECT id,letter_type,subject,body,created_at FROM enrollment_letters WHERE enrollment_id = ? ORDER BY created_at DESC LIMIT 50').bind(enrollmentId).all();
  return json({ letters: result.results || [] });
}

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Admissions letters are not configured.', 503);
  const access = await requireRole(request, env, ['admin','admissions','principal']);
  if (access.response) return access.response;
  let body;
  try { body = await readJson(request, 2048); } catch { return error('Invalid letter request.'); }
  const enrollmentId = safeString(body.enrollmentId, 80);
  const type = safeString(body.letterType, 30);
  if (!enrollmentId || !templates[type]) return error('Choose a valid letter type.');
  const record = await env.DB.prepare(`SELECT e.display_ref,e.full_name,e.email,e.phone,e.preferred_intake,e.status,e.payment_status,e.admissions_decision_reason,e.course_id,c.title AS course_title,c.price AS course_fee
    FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.id=?`).bind(enrollmentId).first();
  if (!record) return error('Application not found.', 404);
  if (type === 'acceptance' && record.status !== 'accepted') return error('An acceptance letter can only be generated for an accepted application.', 409);
  if (type === 'rejection' && record.status !== 'rejected') return error('A rejection letter can only be generated after a rejection decision.', 409);
  if (type === 'withdrawal' && record.status !== 'withdrawn') return error('A withdrawal letter can only be generated after a withdrawal is recorded.', 409);
  const [subject, intro] = templates[type];
  const configRow = await env.DB.prepare("SELECT value FROM system_state WHERE key = 'admin-configuration'").first();
  let configuration = {}; try { configuration = JSON.parse(configRow?.value || '{}'); } catch {}
  const installmentLines = String(configuration['enrollment-settings']?.installmentPlans || '').split(/\r?\n/).map(line => line.split('|').map(part => part.trim())).filter(parts => parts.length >= 3 && (parts[0] === record.course_id || parts[0].toLowerCase() === String(record.course_title).toLowerCase()));
  const installmentSchedule = installmentLines.length
    ? installmentLines.map((parts,index) => `${index+1}. ${parts[1]} — KSh ${Number(parts[2]).toLocaleString('en-KE')}${parts[3] ? ' · Due '+parts[3] : ''}`).join('\n')
    : 'Contact Admissions / Finance for the approved instalment dates.';
  const bodyText = `NAVSTAR DIGITAL HUB\nHOME OF TECHNOCRATS\n\n${subject.toUpperCase()}\n\nDate: ${new Date().toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi', dateStyle: 'long' })}\nReference: ${record.display_ref}\n\nDear ${record.full_name},\n\n${intro}\n\nApplicant: ${record.full_name}\nApplication reference: ${record.display_ref}\nCourse: ${record.course_title}\nIntake: ${record.preferred_intake || 'As confirmed by Admissions'}\nPublished course fee: KSh ${Number(record.course_fee).toLocaleString('en-KE')}\nApplication status: ${record.status}\nPayment status: ${record.payment_status}\n\nAdmissions note: ${record.admissions_decision_reason || 'Please contact Admissions for further details.'}\n\nFor assistance, contact navstardigitalhub@gmail.com or 0797688576.\n\nYours faithfully,\nAdmissions Office\nNAVSTAR DIGITAL HUB\nHOME OF TECHNOCRATS`;
  const id = uuid();
  await env.DB.prepare('INSERT INTO enrollment_letters (id,enrollment_id,letter_type,subject,body,created_by) VALUES (?,?,?,?,?,?)')
    .bind(id, enrollmentId, type, subject, bodyText, access.user.id).run();
  await env.DB.prepare('INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id) VALUES (?,?,?,?,?)')
    .bind(uuid(), access.user.id, 'enrollment_letter_generated_' + type, 'enrollment', enrollmentId).run();
  return json({ id, letterType: type, subject, body: bodyText, reference: record.display_ref });
}
