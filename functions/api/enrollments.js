import { getSession } from '../_shared/auth.js';
import { error, isSameOrigin, json, normalizePhone, readJson, safeString, uuid } from '../_shared/http.js';
import { rateLimited } from '../_shared/rate-limit.js';
import { nextReference } from '../_shared/references.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

async function currentIntake(DB) {
  const row = await DB.prepare("SELECT value FROM system_state WHERE key = 'admin-configuration'").first();
  let config = {}; try { config = JSON.parse(row?.value || '{}'); } catch {}
  const section = config['academic-intakes'] || {};
  const today = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const entries = String(section.intakes || '').split(/\r?\n/).map(line => line.split('|').map(part => part.trim())).filter(parts => parts.length >= 3 && parts[0]);
  const mapped = entries.map(parts => ({ name: parts[0], enrollmentOpen: parts[1], enrollmentClose: parts[2], trainingStart: parts[3] || '', trainingEnd: parts[4] || '', graduationDate: parts[5] || '' }));
  if (!mapped.length && section.currentIntake) mapped.push({ name: section.currentIntake, enrollmentOpen: section.enrollmentOpen || '', enrollmentClose: section.enrollmentClose || '', trainingStart: section.trainingStart || '', trainingEnd: section.trainingEnd || '', graduationDate: section.graduationDate || '' });
  const open = mapped.find(item => item.enrollmentOpen && item.enrollmentClose && today >= item.enrollmentOpen && today <= item.enrollmentClose);
  const upcoming = mapped.filter(item => item.enrollmentOpen && item.enrollmentOpen > today).sort((a,b) => a.enrollmentOpen.localeCompare(b.enrollmentOpen))[0];
  return open ? { ...open, status: 'open' } : upcoming ? { ...upcoming, status: 'upcoming' } : mapped.length ? { ...mapped.sort((a,b) => b.enrollmentClose.localeCompare(a.enrollmentClose))[0], status: 'closed' } : null;
}

async function enrollmentRules(DB) {
  const row = await DB.prepare("SELECT value FROM system_state WHERE key = 'admin-configuration'").first();
  try {
    const all = JSON.parse(row?.value || '{}');
    return all['enrollment-settings'] || {};
  } catch { return {}; }
}

async function existingStudentCourse(DB, { courseId, identityNumber, email }) {
  if (!identityNumber && !email) return { sameCourse: false, courseCount: 0 };
  const row = await DB.prepare(`
    SELECT COUNT(DISTINCT e.course_id) AS course_count,
      MAX(CASE WHEN e.course_id = ? THEN 1 ELSE 0 END) AS same_course
    FROM enrollments e
    JOIN users u ON lower(u.email) = lower(e.email)
    LEFT JOIN user_profiles p ON p.user_id = u.id
    WHERE u.role = 'student' AND u.status = 'active'
      AND e.status IN ('submitted','under_review','accepted')
      AND ((? <> '' AND (e.identity_number = ? OR p.national_id = ?))
        OR (? <> '' AND lower(e.email) = lower(?)))
  `).bind(courseId, identityNumber || '', identityNumber || '', identityNumber || '', email || '', email || '').first();
  return { sameCourse: Number(row?.same_course || 0) === 1, courseCount: Number(row?.course_count || 0) };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Admissions service is not configured.', 503);
  if (await rateLimited(env.DB, request, 'enrollment', { maximum: 5, minutes: 30 })) return error('Too many applications from this connection. Try again later.', 429);

  let body;
  try { body = await readJson(request, 16384); } catch { return error('Invalid request body.'); }
  const intake = await currentIntake(env.DB);
  if (!intake || intake.status !== 'open') return error(intake?.status === 'upcoming' ? `Enrollment is not open yet. The next intake is ${intake.name}, opening ${intake.enrollmentOpen}.` : 'Enrollment is currently closed. Please check the next intake dates on the Courses page.', 403);
  const courseId = safeString(body.courseId, 80);
  const course = await env.DB.prepare('SELECT id, title, price FROM courses WHERE id = ? AND status = ?').bind(courseId, 'active').first();
  if (!course) return error('Selected course is not available.', 404);

  const fullName = safeString(body.fullName, 120);
  const email = safeString(body.email, 254).toLowerCase();
  const phone = normalizePhone(body.phone);
  const dateOfBirth = safeString(body.dateOfBirth, 10);
  const identityType = safeString(body.identityType, 30);
  const studyMode = safeString(body.studyMode, 40);
  const educationLevel = safeString(body.educationLevel, 40);
  const county = safeString(body.county, 80);
  const town = safeString(body.town, 80);
  const emergencyContactName = safeString(body.emergencyContactName, 120);
  const emergencyContactPhone = normalizePhone(body.emergencyContactPhone);
  const consent = body.consent === true || body.consent === 'on';
  const birthTime = datePattern.test(dateOfBirth) ? new Date(`${dateOfBirth}T00:00:00Z`).getTime() : NaN;
  const age = Number.isFinite(birthTime) ? Math.floor((Date.now() - birthTime) / 31557600000) : -1;
  if (!['national-id','maisha-card','birth-certificate','passport'].includes(identityType) || !safeString(body.identityNumber, 80) || age < 18 || fullName.length < 2 || !emailPattern.test(email) || !phone || !datePattern.test(dateOfBirth) || !studyMode || !educationLevel || !county || !town || !emergencyContactName || !emergencyContactPhone || !consent) {
    return error('Complete all required fields with valid contact details.');
  }

  const identityNumber = safeString(body.identityNumber, 80);
  const rules = await enrollmentRules(env.DB);
  const studentRecord = await existingStudentCourse(env.DB, { courseId: course.id, identityNumber, email });
  if (studentRecord.sameCourse) return error('This student is already registered for the selected course. Please choose another course or contact Admissions.', 409);
  const maximumCourses = Number(rules.maximumCourses);
  if (Number.isInteger(maximumCourses) && maximumCourses > 0 && studentRecord.courseCount >= maximumCourses) {
    return error(`The student has reached the maximum of ${maximumCourses} course(s) allowed by Navstar. Please contact Admissions for assistance.`, 409);
  }

  const configuredMinimum = Number(rules.minimumEnrollmentPayment || 0);
  const amountDueNow = configuredMinimum > 0 ? configuredMinimum : Number(course.price);
  if (!Number.isSafeInteger(amountDueNow) || amountDueNow < 1 || amountDueNow > Number(course.price)) return error('The minimum enrolment payment in Admin Settings must be at least KSh 1 and cannot exceed the published course fee.', 409);

  const id = uuid();
  const displayRef = await nextReference(env.DB, 'ENR');
  await env.DB.prepare(`
    INSERT INTO enrollments (
      id, display_ref, course_id, full_name, email, phone, date_of_birth, identity_type, identity_number, gender, nationality,
      study_mode, education_level, preferred_intake, experience, county, town, address, sub_county, ward, location, sub_location,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, support_needs, consent
      , status, payment_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'under_review', 'pending')
  `).bind(
    id, displayRef, course.id, fullName, email, phone, dateOfBirth, identityType, identityNumber || null,
    safeString(body.gender, 40) || null, safeString(body.nationality, 80) || null, studyMode, educationLevel,
    safeString(intake.name, 80) || null, safeString(body.experience, 2000) || null, county, town,
    safeString(body.address, 250) || null, safeString(body.subCounty, 100) || null, safeString(body.ward, 100) || null, safeString(body.location, 100) || null, safeString(body.subLocation, 100) || null, emergencyContactName, emergencyContactPhone,
    safeString(body.emergencyContactRelationship, 80) || null, safeString(body.supportNeeds, 2000) || null,
  ).run();

  return json({ id, reference: displayRef, status: 'awaiting_payment', paymentRequired: true, amountDueNow, course: { id: course.id, title: course.title, amount: course.price } }, 201);
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('Admissions service is not configured.', 503);
  const user = await getSession(request, env);
  if (!user) return error('Sign in required.', 401);
  let query;
  if (['admin', 'admissions', 'principal'].includes(user.role)) {
    query = env.DB.prepare(`SELECT id, display_ref AS reference, course_id, full_name, email, phone, status, payment_status, created_at FROM enrollments ORDER BY created_at DESC LIMIT 200`);
  } else if (user.role === 'student') {
    query = env.DB.prepare(`
      SELECT e.id, e.display_ref AS reference, e.course_id, c.title AS course_title, c.price AS course_fee,
        e.full_name, e.email, e.phone, e.date_of_birth, e.gender, e.nationality, e.study_mode,
        e.education_level, e.preferred_intake, e.county, e.town, e.address, e.status,
        e.payment_status, e.created_at,
        COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.purpose = 'enrollment' AND p.reference_id = e.id AND p.status = 'paid'), 0) AS amount_paid,
        (SELECT p.receipt_number FROM payments p WHERE p.purpose = 'enrollment' AND p.reference_id = e.id
          AND p.status = 'paid' AND p.receipt_number IS NOT NULL ORDER BY p.updated_at DESC LIMIT 1) AS latest_receipt,
        (SELECT p.id FROM payments p WHERE p.purpose = 'enrollment' AND p.reference_id = e.id
          AND p.status = 'paid' ORDER BY p.updated_at DESC LIMIT 1) AS latest_payment_id
      FROM enrollments e JOIN courses c ON c.id = e.course_id
      WHERE e.email = ? COLLATE NOCASE ORDER BY e.created_at DESC
    `).bind(user.email);
  } else {
    return error('Tutor access must be assigned to specific classes before student records are visible.', 403);
  }
  const result = await query.all();
  return json({ enrollments: result.results ?? [] });
}