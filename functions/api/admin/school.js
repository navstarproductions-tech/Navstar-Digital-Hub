import { requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, uuid } from '../../_shared/http.js';

async function audit(db, actorId, action, entityType, entityId) {
  await db.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)')
    .bind(uuid(), actorId, action, entityType, entityId).run();
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('School management database is not configured.', 503);
  const access = await requireRole(request, env, ['admin', 'principal']);
  if (access.response) return access.response;
  const schoolId = safeString(new URL(request.url).searchParams.get('schoolId'), 80);
  const schools = await env.DB.prepare('SELECT id, school_code, name, school_type, curriculum, registration_number, email, phone, county, address, status, created_at FROM schools ORDER BY name').all();
  const selected = schoolId || schools.results?.[0]?.id || '';
  if (!selected) return json({ schools: [], years: [], classes: [], learners: [], subjects: [], feeStructures: [] });
  const school = await env.DB.prepare('SELECT id FROM schools WHERE id = ?').bind(selected).first();
  if (!school) return error('Selected school was not found.', 404);
  const [years, classes, learners, subjects, feeStructures] = await Promise.all([
    env.DB.prepare('SELECT id, name, start_date, end_date, is_current FROM school_academic_years WHERE school_id = ? ORDER BY start_date DESC').bind(selected).all(),
    env.DB.prepare('SELECT c.id, c.name, c.education_stage, c.grade_level, c.stream, c.capacity, c.status, y.name AS academic_year FROM school_classes c JOIN school_academic_years y ON y.id = c.academic_year_id WHERE c.school_id = ? ORDER BY y.start_date DESC, c.name').bind(selected).all(),
    env.DB.prepare('SELECT l.id, l.admission_number, l.first_name, l.middle_name, l.last_name, l.date_of_birth, l.gender, l.admission_date, l.status, c.name AS class_name FROM school_learners l LEFT JOIN school_classes c ON c.id = l.class_id WHERE l.school_id = ? ORDER BY l.created_at DESC LIMIT 500').bind(selected).all(),
    env.DB.prepare('SELECT id, code, name, education_stage, grade_level, status FROM school_subjects WHERE school_id = ? ORDER BY name').bind(selected).all(),
    env.DB.prepare('SELECT f.id, f.name, f.education_stage, f.grade_level, f.programme_name, f.currency, f.total_amount, f.status, y.name AS academic_year, t.name AS term FROM school_fee_structures f LEFT JOIN school_academic_years y ON y.id = f.academic_year_id LEFT JOIN school_terms t ON t.id = f.term_id WHERE f.school_id = ? ORDER BY f.created_at DESC').bind(selected).all(),
  ]);
  return json({ schools: schools.results ?? [], selectedSchoolId: selected, years: years.results ?? [], classes: classes.results ?? [], learners: learners.results ?? [], subjects: subjects.results ?? [], feeStructures: feeStructures.results ?? [] });
}

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('School management database is not configured.', 503);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;
  let body;
  try { body = await readJson(request, 16384); } catch { return error('Invalid request body.'); }
  const action = safeString(body.action, 40);
  const schoolId = safeString(body.schoolId, 80);

  if (action === 'create_school') {
    const name = safeString(body.name, 120);
    const schoolType = safeString(body.schoolType, 32);
    const code = safeString(body.schoolCode, 24).toUpperCase();
    const curriculum = safeString(body.curriculum, 40) || 'CBC';
    if (name.length < 2 || !/^[A-Z0-9-]{3,24}$/.test(code) || !['primary','junior_secondary','senior_secondary','mixed','college','other'].includes(schoolType)) return error('Enter a valid institution name, code and institution type.');
    const id = uuid();
    try {
      await env.DB.prepare('INSERT INTO schools (id, school_code, name, school_type, curriculum, registration_number, email, phone, county, address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, code, name, schoolType, curriculum, safeString(body.registrationNumber, 80) || null, safeString(body.email, 254) || null, safeString(body.phone, 32) || null, safeString(body.county, 80) || null, safeString(body.address, 240) || null).run();
      await env.DB.prepare('INSERT INTO school_memberships (id, school_id, user_id, role) VALUES (?, ?, ?, ?)')
        .bind(uuid(), id, access.user.id, 'school_admin').run();
    } catch (cause) {
      if (String(cause?.message || '').toLowerCase().includes('unique')) return error('That institution code is already in use.', 409);
      throw cause;
    }
    await audit(env.DB, access.user.id, 'school_created', 'school', id);
    return json({ id, name, schoolCode: code }, 201);
  }

  if (!schoolId || !(await env.DB.prepare('SELECT id FROM schools WHERE id = ?').bind(schoolId).first())) return error('Select a valid institution before adding school records.');

  if (action === 'create_year') {
    const name = safeString(body.name, 40);
    const start = safeString(body.startDate, 10);
    const end = safeString(body.endDate, 10);
    if (!name || !/^\\d{4}-\\d{2}-\\d{2}$/.test(start) || !/^\\d{4}-\\d{2}-\\d{2}$/.test(end) || end < start) return error('Enter a valid academic year name and date range.');
    const id = uuid();
    const current = body.isCurrent === true;
    if (current) await env.DB.prepare('UPDATE school_academic_years SET is_current = 0 WHERE school_id = ?').bind(schoolId).run();
    await env.DB.prepare('INSERT INTO school_academic_years (id, school_id, name, start_date, end_date, is_current) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, schoolId, name, start, end, current ? 1 : 0).run();
    await audit(env.DB, access.user.id, 'academic_year_created', 'academic_year', id);
    return json({ id }, 201);
  }

  if (action === 'create_class') {
    const yearId = safeString(body.academicYearId, 80);
    const name = safeString(body.name, 80);
    const stage = safeString(body.educationStage, 32);
    const grade = safeString(body.gradeLevel, 40);
    const stream = safeString(body.stream, 32);
    const capacity = body.capacity === '' || body.capacity == null ? null : Number(body.capacity);
    const year = await env.DB.prepare('SELECT id FROM school_academic_years WHERE id = ? AND school_id = ?').bind(yearId, schoolId).first();
    if (!year || name.length < 1 || !grade || !['primary','junior_secondary','senior_secondary','college','other'].includes(stage) || (capacity !== null && (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 5000))) return error('Complete the class details with a valid academic year and capacity.');
    const id = uuid();
    try {
      await env.DB.prepare('INSERT INTO school_classes (id, school_id, academic_year_id, name, education_stage, grade_level, stream, capacity) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, schoolId, yearId, name, stage, grade, stream, capacity).run();
    } catch (cause) {
      if (String(cause?.message || '').toLowerCase().includes('unique')) return error('That class and stream already exists for this academic year.', 409);
      throw cause;
    }
    await audit(env.DB, access.user.id, 'class_created', 'school_class', id);
    return json({ id }, 201);
  }

  if (action === 'create_learner') {
    const admission = safeString(body.admissionNumber, 40);
    const first = safeString(body.firstName, 80);
    const middle = safeString(body.middleName, 80);
    const last = safeString(body.lastName, 80);
    const classId = safeString(body.classId, 80) || null;
    const gender = safeString(body.gender, 24) || null;
    const dob = safeString(body.dateOfBirth, 10) || null;
    if (!admission || first.length < 1 || last.length < 1 || (dob && !/^\\d{4}-\\d{2}-\\d{2}$/.test(dob))) return error('Admission number, first name and surname are required.');
    if (classId && !(await env.DB.prepare('SELECT id FROM school_classes WHERE id = ? AND school_id = ?').bind(classId, schoolId).first())) return error('Choose a class belonging to this institution.');
    const id = uuid();
    try {
      await env.DB.prepare('INSERT INTO school_learners (id, school_id, admission_number, first_name, middle_name, last_name, date_of_birth, gender, national_id_or_birth_cert, class_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, schoolId, admission, first, middle || null, last, dob, gender, safeString(body.identityReference, 80) || null, classId).run();
    } catch (cause) {
      if (String(cause?.message || '').toLowerCase().includes('unique')) return error('That admission number is already registered at this institution.', 409);
      throw cause;
    }
    await audit(env.DB, access.user.id, 'learner_registered', 'school_learner', id);
    return json({ id, admissionNumber: admission }, 201);
  }

  if (action === 'create_subject') {
    const name = safeString(body.name, 100);
    const stage = safeString(body.educationStage, 32);
    const grade = safeString(body.gradeLevel, 40);
    if (name.length < 2 || !['primary','junior_secondary','senior_secondary','college','other'].includes(stage)) return error('Enter a subject name and valid education stage.');
    const id = uuid();
    await env.DB.prepare('INSERT INTO school_subjects (id, school_id, code, name, education_stage, grade_level) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, schoolId, safeString(body.code, 24) || null, name, stage, grade || null).run();
    await audit(env.DB, access.user.id, 'subject_created', 'school_subject', id);
    return json({ id }, 201);
  }

  if (action === 'create_fee_structure') {
    const name = safeString(body.name, 100);
    const amount = Number(body.totalAmount);
    const stage = safeString(body.educationStage, 32) || null;
    const grade = safeString(body.gradeLevel, 40) || null;
    const programme = safeString(body.programmeName, 100) || null;
    const yearId = safeString(body.academicYearId, 80) || null;
    if (name.length < 2 || !Number.isSafeInteger(amount) || amount < 0 || amount > 10000000) return error('Enter a fee structure name and valid amount in KSh.');
    if (yearId && !(await env.DB.prepare('SELECT id FROM school_academic_years WHERE id = ? AND school_id = ?').bind(yearId, schoolId).first())) return error('Select an academic year belonging to this institution.');
    const id = uuid();
    await env.DB.prepare('INSERT INTO school_fee_structures (id, school_id, academic_year_id, education_stage, grade_level, programme_name, name, currency, total_amount, status, effective_from) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, schoolId, yearId, stage, grade, programme, name, 'KES', amount, 'draft', safeString(body.effectiveFrom, 10) || null).run();
    await audit(env.DB, access.user.id, 'fee_structure_created', 'fee_structure', id);
    return json({ id, status: 'draft' }, 201);
  }

  return error('Unknown school management action.');
}
