import { requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, normalizePhone, readJson, safeString, uuid } from '../../_shared/http.js';
import { nextReference } from '../../_shared/references.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const identityTypes = new Set(['national-id','maisha-card','birth-certificate','passport']);
const consented = value => ['yes','true','1','on'].includes(String(value ?? '').trim().toLowerCase());

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Bulk admissions service is not configured.', 503);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;

  let body;
  try { body = await readJson(request, 128 * 1024); } catch { return error('The import request is invalid or too large.'); }
  if (body.adminConsent !== true) return error('Confirm that you have checked the applicants’ details and recorded their consent before submitting.');
  if (!Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > 40) return error('Submit between 1 and 40 student applications per import.');

  const seen = new Set();
  const preparedRows = [];
  const courseCache = new Map();
  const today = new Date();

  for (let index = 0; index < body.rows.length; index += 1) {
    const raw = body.rows[index] || {};
    const rowNumber = index + 2;
    const fullName = safeString(raw.fullName, 120);
    const email = safeString(raw.email, 254).toLowerCase();
    const phone = normalizePhone(raw.phone);
    const dateOfBirth = safeString(raw.dateOfBirth, 10);
    const identityType = safeString(raw.identityType, 30).toLowerCase();
    const identityNumber = safeString(raw.identityNumber, 80);
    const studyMode = safeString(raw.studyMode, 40);
    const educationLevel = safeString(raw.educationLevel, 40);
    const courseId = safeString(raw.courseId, 80);
    const preferredIntake = safeString(raw.preferredIntake, 80);
    const county = safeString(raw.county, 80);
    const town = safeString(raw.town, 80);
    const emergencyContactName = safeString(raw.emergencyContactName, 120);
    const emergencyContactPhone = normalizePhone(raw.emergencyContactPhone);
    const dobTime = datePattern.test(dateOfBirth) ? new Date(dateOfBirth + 'T00:00:00Z').getTime() : NaN;
    const age = Number.isFinite(dobTime) ? Math.floor((today.getTime() - dobTime) / 31557600000) : -1;

    if (fullName.length < 2 || !emailPattern.test(email) || !phone || !datePattern.test(dateOfBirth) || age < 18 ||
        !identityTypes.has(identityType) || identityNumber.length < 4 || !studyMode || !educationLevel ||
        !courseId || !preferredIntake || !county || !town || emergencyContactName.length < 2 ||
        !emergencyContactPhone || !consented(raw.consent)) {
      return error('CSV row ' + rowNumber + ' is incomplete or invalid. Check name, email, Kenyan phone numbers, adult date of birth, identity type/number, course, intake, study mode, education, location, emergency contact and consent.');
    }

    const duplicateKey = courseId + '|' + email + '|' + identityNumber.toLowerCase();
    if (seen.has(duplicateKey)) return error('CSV row ' + rowNumber + ' duplicates an applicant already included in this import.');
    seen.add(duplicateKey);

    if (!courseCache.has(courseId)) {
      const course = await env.DB.prepare("SELECT id,title,price FROM courses WHERE id=? AND status='active'").bind(courseId).first();
      if (!course) return error('CSV row ' + rowNumber + ' refers to a course that is not active.');
      const fee = await env.DB.prepare("SELECT COALESCE(SUM(amount),0) AS total FROM course_fee_items WHERE course_id=? AND lower(item_name)='admission fee' AND active=1 AND due_stage='enrollment' AND required=1").bind(courseId).first();
      const admissionFee = Number(fee?.total || 0);
      if (!Number.isSafeInteger(admissionFee) || admissionFee < 1 || admissionFee > Number(course.price)) return error('The course ' + course.title + ' needs a valid required Admission fee under Courses → Fee Structures before applications can be imported.');
      courseCache.set(courseId, course);
    }
    const existingUser = await env.DB.prepare("SELECT id,role FROM users WHERE lower(email)=lower(?) LIMIT 1").bind(email).first();
    if (existingUser && existingUser.role !== 'student') return error('CSV row ' + rowNumber + ' uses an email already assigned to a non-student account. Resolve the account before importing.');

    const existing = await env.DB.prepare(`
      SELECT e.id FROM enrollments e
      LEFT JOIN users u ON lower(u.email)=lower(e.email)
      LEFT JOIN user_profiles p ON p.user_id=u.id
      WHERE e.course_id=? AND e.status IN ('submitted','under_review','accepted')
        AND (lower(e.email)=lower(?) OR (?<>'' AND (e.identity_number=? OR p.national_id=?)))
      LIMIT 1
    `).bind(courseId, email, identityNumber, identityNumber, identityNumber).first();
    if (existing) return error('CSV row ' + rowNumber + ' appears to already have an active application for this course. No rows were imported.');

    preparedRows.push({
      id: uuid(), displayRef: await nextReference(env.DB, 'ENR'), fullName, email, phone, dateOfBirth,
      identityType, identityNumber, gender: safeString(raw.gender, 40), nationality: safeString(raw.nationality, 80),
      studyMode, educationLevel, preferredIntake, experience: safeString(raw.experience, 2000),
      county, town, address: safeString(raw.address, 240), subCounty: safeString(raw.subCounty, 80),
      ward: safeString(raw.ward, 80), location: safeString(raw.location, 80), subLocation: safeString(raw.subLocation, 80),
      emergencyContactName, emergencyContactPhone,
      emergencyContactRelationship: safeString(raw.emergencyContactRelationship, 80),
      supportNeeds: safeString(raw.supportNeeds, 2000), course: courseCache.get(courseId)
    });
  }

  const statements = [];
  for (const row of preparedRows) {
    statements.push(env.DB.prepare(`
      INSERT INTO enrollments (
        id,display_ref,course_id,full_name,email,phone,date_of_birth,identity_type,identity_number,gender,nationality,
        study_mode,education_level,preferred_intake,experience,county,town,address,sub_county,ward,location,sub_location,
        emergency_contact_name,emergency_contact_phone,emergency_contact_relationship,support_needs,consent,status,payment_status,
        application_details_json
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,'submitted','unpaid',?)
    `).bind(
      row.id,row.displayRef,row.course.id,row.fullName,row.email,row.phone,row.dateOfBirth,row.identityType,row.identityNumber,
      row.gender||null,row.nationality||null,row.studyMode,row.educationLevel,row.preferredIntake,row.experience||null,
      row.county,row.town,row.address||null,row.subCounty||null,row.ward||null,row.location||null,row.subLocation||null,
      row.emergencyContactName,row.emergencyContactPhone,row.emergencyContactRelationship||null,row.supportNeeds||null,
      JSON.stringify({ source:'admin_bulk_import', importedBy:access.user.id, adminVerifiedDetails:true, consentRecorded:true })
    ));
    statements.push(env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)')
      .bind(uuid(),access.user.id,'admin_bulk_enrollment_submitted','enrollment',row.id));
  }

  try {
    await env.DB.batch(statements);
  } catch (cause) {
    console.error('Bulk enrollment batch failed:', String(cause?.stack || cause));
    return error('The import could not be completed. No applications were submitted. Check the CSV and course fee configuration, then retry.', 500);
  }

  return json({
    submitted: preparedRows.length,
    applications: preparedRows.map(row => ({ id: row.id, reference: row.displayRef, name: row.fullName, email: row.email, course: row.course.title })),
    message: preparedRows.length + ' application(s) submitted to the Admissions review queue. No student portal accounts or passwords were created.'
  }, 201);
}
