import { requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, safeString, uuid } from '../../_shared/http.js';

function initials(title) {
  const words = String(title || '').trim().split(/\\s+/).filter(Boolean);
  const letters = words.map(word => word.replace(/[^A-Za-z]/g, '')[0] || '').join('').toUpperCase();
  return (letters || 'NS').slice(0, 3);
}
function intakeCode(value) {
  const text = String(value || '').trim();
  const monthYear = text.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\\s+(20\\d{2})/i);
  if (monthYear) {
    const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    return String(months.indexOf(monthYear[1].toLowerCase()) + 1).padStart(2,'0') + monthYear[2].slice(-2);
  }
  const numeric = text.match(/^(0[1-9]|1[0-2])\\/?(\\d{2}|20\\d{2})$/);
  if (numeric) return numeric[1] + numeric[2].slice(-2);
  return '';
}
export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Admissions database is not configured.', 503);
  const access = await requireRole(request, env, ['admin','admissions']);
  if (access.response) return access.response;
  let body = {};
  try { body = await request.json(); } catch { return error('Invalid request body.'); }
  const enrollmentId = safeString(body.enrollmentId,80);
  if (!enrollmentId) return error('Select a student application.');
  const enrollment = await env.DB.prepare(`
    SELECT e.id,e.admission_number,e.preferred_intake,c.id AS course_id,c.title,c.course_code
    FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.id=?
  `).bind(enrollmentId).first();
  if (!enrollment) return error('Student application not found.',404);
  if (enrollment.admission_number) return json({ admissionNumber: enrollment.admission_number, alreadyAssigned: true });
  const intake = intakeCode(enrollment.preferred_intake);
  if (!intake) return error('The intake must include a month and year, for example September 2026, before an admission number can be generated.',409);
  let courseCode = String(enrollment.course_code || '').trim().toUpperCase();
  if (!courseCode) {
    const position = await env.DB.prepare('SELECT COUNT(*) AS n FROM courses WHERE created_at < (SELECT created_at FROM courses WHERE id=?) OR (created_at = (SELECT created_at FROM courses WHERE id=?) AND id <= ?)').bind(enrollment.course_id,enrollment.course_id,enrollment.course_id).first();
    const number = Number(position?.n || 0);
    if (number < 1 || number > 999) return error('Course sequence is outside the supported three-digit range. Set a valid course code in Course Management.',409);
    courseCode = initials(enrollment.title) + String(number).padStart(3,'0');
    await env.DB.prepare('UPDATE courses SET course_code=? WHERE id=? AND (course_code IS NULL OR course_code=?)').bind(courseCode,enrollment.course_id,'').run();
  }
  if (!/^[A-Z]{1,4}\\d{3}$/.test(courseCode)) return error('Set the course code in the format CP003 (letters followed by exactly three digits).',409);
  const seq = await env.DB.prepare(`
    INSERT INTO admission_number_sequences(course_id,intake_code,last_number) VALUES(?,?,1)
    ON CONFLICT(course_id,intake_code) DO UPDATE SET last_number=last_number+1,updated_at=CURRENT_TIMESTAMP
    RETURNING last_number
  `).bind(enrollment.course_id,intake).first();
  const serial = Number(seq?.last_number || 0);
  if (serial < 1 || serial > 999) return error('This course and intake have reached the three-digit admission number limit.',409);
  const admissionNumber = courseCode + '/' + intake + '-' + String(serial).padStart(3,'0');
  try {
    await env.DB.prepare('UPDATE enrollments SET admission_number=? WHERE id=? AND (admission_number IS NULL OR admission_number=?)').bind(admissionNumber,enrollmentId,'').run();
  } catch {
    return error('Admission number could not be saved. Refresh the student record and try again.',409);
  }
  await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)')
    .bind(uuid(),access.user.id,'admission_number_generated','enrollment',enrollmentId).run();
  return json({ admissionNumber, courseCode, intakeCode:intake });
}
