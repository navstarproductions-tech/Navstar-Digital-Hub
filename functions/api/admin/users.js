import { hashPassword, requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, normalizePhone, readJson, safeString, uuid } from '../../_shared/http.js';
import { nextReference } from '../../_shared/references.js';
import { passwordPolicyError } from '../../_shared/password-policy.js';

const roles = ['student', 'tutor', 'admissions', 'principal', 'admin', 'finance'];
const prefixes = { student: 'ST', tutor: 'TU', admissions: 'AM', principal: 'PR', admin: 'AD', finance: 'FN' };

async function studentEnrollmentRules(db) {
  const row = await db.prepare("SELECT value FROM system_state WHERE key = 'admin-configuration'").first();
  try { return JSON.parse(row?.value || '{}')['enrollment-settings'] || {}; } catch { return {}; }
}

async function checkExistingStudentEnrollment(db, courseId, identityNumber, email) {
  const row = await db.prepare(`
    SELECT COUNT(DISTINCT e.course_id) AS course_count,
      MAX(CASE WHEN e.course_id = ? THEN 1 ELSE 0 END) AS same_course
    FROM enrollments e
    JOIN users u ON lower(u.email) = lower(e.email)
    LEFT JOIN user_profiles p ON p.user_id = u.id
    WHERE u.role = 'student' AND u.status = 'active'
      AND ((? <> '' AND (e.identity_number = ? OR p.national_id = ?))
        OR (? <> '' AND lower(e.email) = lower(?)))
  `).bind(courseId, identityNumber || '', identityNumber || '', identityNumber || '', email || '', email || '').first();
  return { sameCourse: Number(row?.same_course || 0) === 1, courseCount: Number(row?.course_count || 0) };
}

async function createStaffId(db, role) {
  const prefix = prefixes[role] || 'ST';
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const number = String(crypto.getRandomValues(new Uint32Array(1))[0] % 100000).padStart(5, '0');
    const staffId = `${prefix}${number}`;
    const exists = await db.prepare('SELECT user_id FROM user_profiles WHERE staff_id = ?').bind(staffId).first();
    if (!exists) return staffId;
  }
  throw new Error('Could not generate a unique staff ID. Please try again.');
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('User service is not configured.', 503);
  const access = await requireRole(request, env, ['admin', 'principal']);
  if (access.response) return access.response;
  const users = await env.DB.prepare(`
    SELECT u.id, u.name, u.email, COALESCE(p.portal_role,u.role) AS role, CASE WHEN COALESCE(p.portal_role,u.role)='student' THEN COALESCE(p.student_status,u.status) ELSE u.status END AS status, u.created_at,
      p.staff_id AS staffId, p.profile_photo_url AS profilePhotoUrl, p.national_id AS nationalId, p.phone, p.citizenship, p.country, p.province, p.county,
      p.sub_county AS subCounty, p.constituency, p.ward, p.location, p.sub_location AS subLocation,
      p.date_of_birth AS dateOfBirth, p.gender, p.department, p.job_title AS jobTitle, p.employment_type AS employmentType, p.joined_on AS joinedOn, p.address, (SELECT e.course_id FROM enrollments e WHERE lower(e.email)=lower(u.email) AND e.status='accepted' ORDER BY e.created_at DESC LIMIT 1) AS activeCourseId,
      NULL AS enrollmentId, 0 AS pendingActivation
    FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
    ORDER BY u.created_at DESC LIMIT 300
  `).all();
  const missingAccounts = await env.DB.prepare(`
    SELECT 'pending:' || e.id AS id,e.full_name AS name,e.email,'student' AS role,'pending_activation' AS status,e.created_at,
      NULL AS staffId,NULL AS profilePhotoUrl,e.identity_number AS nationalId,e.phone,NULL AS citizenship,'Kenya' AS country,NULL AS province,
      e.county,NULL AS subCounty,NULL AS constituency,NULL AS ward,e.town AS location,NULL AS subLocation,e.date_of_birth AS dateOfBirth,
      e.gender,NULL AS department,NULL AS jobTitle,e.study_mode AS employmentType,NULL AS joinedOn,e.address,e.course_id AS activeCourseId,
      e.id AS enrollmentId,1 AS pendingActivation
    FROM enrollments e
    WHERE e.status='accepted'
      AND NOT EXISTS(SELECT 1 FROM users u WHERE lower(u.email)=lower(e.email) AND u.role='student')
    ORDER BY e.created_at DESC LIMIT 300
  `).all();
  return json({ users: [...(users.results ?? []), ...(missingAccounts.results ?? [])] });
}

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('User service is not configured.', 503);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;
  let body;
  try { body = await readJson(request, 8192); } catch { return error('Invalid request body.'); }
  const name = safeString(body.name, 120);
  const email = safeString(body.email, 254).toLowerCase();
  const role = safeString(body.role, 24);
  const password = String(body.password ?? '');
  const confirmPassword = String(body.confirmPassword ?? '');
  let enrollment = null;
  if (role === 'student') {
    const courseId = safeString(body.courseId, 80);
    const course = await env.DB.prepare('SELECT id, title, price FROM courses WHERE id = ? AND status = ?').bind(courseId, 'active').first();
    const admissionFee = course ? await env.DB.prepare("SELECT COALESCE(SUM(amount),0) AS total FROM course_fee_items WHERE course_id=? AND lower(item_name)='admission fee' AND active=1 AND required=1 AND due_stage='enrollment'").bind(course.id).first() : null;
    if (course && Number(admissionFee?.total||0)<1) return error('Configure a positive Admission fee for this course under Courses → Fee Structures before creating the student account.');
    const phone = normalizePhone(body.phone);
    const emergencyPhone = normalizePhone(body.emergencyContactPhone);
    const dateOfBirth = safeString(body.dateOfBirth, 10);
    const studyMode = safeString(body.studyMode, 40);
    const educationLevel = safeString(body.educationLevel, 40);
    const county = safeString(body.county, 80);
    const town = safeString(body.town, 80);
    const emergencyName = safeString(body.emergencyContactName, 120);
    const consent = body.consent === true || body.consent === 'on';
    if (!course) return error('Select an available course from the Navstar course catalogue.', 404);
    if (!phone || !emergencyPhone || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || !studyMode || !educationLevel || !county || !town || !emergencyName || !consent) {
      return error('Complete all required student-enrollment fields with valid details.');
    }
    const identityNumber = safeString(body.identityNumber || body.nationalId, 80);
    const existing = await checkExistingStudentEnrollment(env.DB, course.id, identityNumber, email);
    if (existing.sameCourse) return error('This student is already registered for the selected course. Please choose another course or contact Admissions.', 409);
    const rules = await studentEnrollmentRules(env.DB);
    const maximumCourses = Number(rules.maximumCourses);
    if (Number.isInteger(maximumCourses) && maximumCourses > 0 && existing.courseCount >= maximumCourses) {
      return error(`The student has reached the maximum of ${maximumCourses} course(s) allowed by Navstar. Please contact Admissions for assistance.`, 409);
    }
    enrollment = { id: uuid(), displayRef: await nextReference(env.DB, 'ENR'), course, phone, emergencyPhone, dateOfBirth, studyMode, educationLevel, county, town, emergencyName, consent, identityNumber };
  }
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !roles.includes(role)) return error('Enter a valid full name, email and portal role.');
  const passwordError = passwordPolicyError(password);
  if (passwordError) return error(passwordError);
  if (password !== confirmPassword) return error('The passwords do not match.');
  const id = uuid();
  const staffId = await createStaffId(env.DB, role);
  const hashed = await hashPassword(password);
  const baseRole = role === 'finance' ? 'admissions' : role;
  try {
    await env.DB.prepare('INSERT INTO users (id, name, email, role, password_hash, password_salt, must_change_password) VALUES (?, ?, ?, ?, ?, ?, 0)')
      .bind(id, name, email, baseRole, hashed.hash, hashed.salt).run();
    await env.DB.prepare(`
      INSERT INTO user_profiles (
        user_id, staff_id, portal_role, national_id, phone, date_of_birth, gender, citizenship, country,
        province, county, sub_county, constituency, ward, location, sub_location,
        department, job_title, employment_type, joined_on, address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, staffId, role, safeString(body.nationalId, 32) || null, safeString(body.phone, 32) || null, safeString(body.dateOfBirth, 10) || null,
      safeString(body.gender, 30) || null, safeString(body.citizenship, 80) || null,
      safeString(body.country, 80) || 'Kenya', safeString(body.province, 100) || null,
      safeString(body.county, 100) || null, safeString(body.subCounty, 100) || null,
      safeString(body.constituency, 100) || null, safeString(body.ward, 100) || null,
      safeString(body.location, 100) || null, safeString(body.subLocation, 100) || null,
      safeString(body.department, 100) || null, safeString(body.jobTitle, 120) || null,
      safeString(body.employmentType, 40) || null, safeString(body.joinedOn, 10) || null,
      safeString(body.address, 240) || null
    ).run();
    if (enrollment) {
      await env.DB.prepare(`
        INSERT INTO enrollments (
          id, display_ref, course_id, full_name, email, phone, date_of_birth, identity_number, gender, nationality,
          study_mode, education_level, preferred_intake, experience, county, town, address,
          emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, support_needs, consent
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).bind(
        enrollment.id, enrollment.displayRef, enrollment.course.id, name, email, enrollment.phone, enrollment.dateOfBirth,
        enrollment.identityNumber || null, safeString(body.gender, 40) || null, safeString(body.nationality, 80) || null,
        enrollment.studyMode, enrollment.educationLevel, safeString(body.preferredIntake, 20) || null,
        safeString(body.experience, 2000) || null, enrollment.county, enrollment.town, safeString(body.address, 250) || null,
        enrollment.emergencyName, enrollment.emergencyPhone, safeString(body.emergencyContactRelationship, 80) || null,
        safeString(body.supportNeeds, 2000) || null
      ).run();
    }
  } catch (cause) {
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run().catch(() => {});
    if (String(cause?.message || '').toLowerCase().includes('unique')) return error('An account with this email or staff ID already exists.', 409);
    console.error('Account creation failed:', String(cause));
    return error('The account could not be created. Please check the profile details and try again.', 500);
  }
  try { await env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)').bind(uuid(), access.user.id, 'user_created', 'user', id).run(); }
  catch (cause) { console.error('Account audit write failed:', String(cause)); }
  return json({ user: { id, name, email, role, status: 'active', staffId }, staffId, enrollment: enrollment ? { id: enrollment.id, reference: enrollment.displayRef, course_id: enrollment.course.id, full_name: name, email, status: 'submitted', payment_status: 'unpaid', created_at: new Date().toISOString() } : null }, 201);
}
