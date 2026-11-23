import { requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, uuid } from '../../_shared/http.js';

const roles = ['student', 'tutor', 'admissions', 'principal', 'admin', 'finance'];

async function getProfileColumns(db) {
  const result = await db.prepare('PRAGMA table_info(user_profiles)').all();
  return new Set((result.results || []).map(column => column.name));
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('Profile service is not configured.', 503);
  const access = await requireRole(request, env, roles);
  if (access.response) return access.response;
  const columns = await getProfileColumns(env.DB);
  const nationalIdField = columns.has('national_id') ? 'p.national_id AS nationalId' : 'NULL AS nationalId';
  const addressField = columns.has('address') ? 'p.address' : 'NULL AS address';
  const profile = await env.DB.prepare(`
    SELECT u.id, u.name, u.email, COALESCE(p.portal_role, u.role) AS role, u.created_at,
      p.staff_id AS staffId, ${nationalIdField}, p.phone, p.date_of_birth AS dateOfBirth,
      p.gender, p.citizenship, p.country, p.province, p.county, p.sub_county AS subCounty,
      p.constituency, p.ward, p.location, p.sub_location AS subLocation, p.department,
      p.job_title AS jobTitle, p.employment_type AS employmentType, p.joined_on AS joinedOn, ${addressField},
      p.profile_photo_url AS profilePhotoUrl
    FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id WHERE u.id = ?
  `).bind(access.user.id).first();
  if (!profile) return error('Profile not found.', 404);
  const settingsRow = await env.DB.prepare("SELECT value FROM system_state WHERE key = 'site-settings'").first();
  let settings = {};
  try { settings = settingsRow?.value ? JSON.parse(settingsRow.value) : {}; } catch { settings = {}; }
  let changeRequests = [];
  if (profile.role === 'student') {
    const requestRows = await env.DB.prepare("SELECT id,status,review_note AS reviewNote,created_at AS createdAt,reviewed_at AS reviewedAt FROM student_profile_change_requests WHERE user_id=? ORDER BY created_at DESC LIMIT 10").bind(access.user.id).all();
    changeRequests = requestRows.results || [];
  }
  return json({ profile, changeRequests, geographyOptions: { locations: Array.isArray(settings.locationOptions) ? settings.locationOptions : [], subLocations: Array.isArray(settings.subLocationOptions) ? settings.subLocationOptions : [] } });
}

export async function onRequestPatch({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Profile service is not configured.', 503);
  const access = await requireRole(request, env, roles);
  if (access.response) return access.response;
  let body;
  try { body = await readJson(request, 8192); } catch { return error('Invalid profile details.'); }

  const name = safeString(body.name, 120);
  const nationalId = safeString(body.nationalId, 32);
  const phone = safeString(body.phone, 32);
  const dateOfBirth = safeString(body.dateOfBirth, 10);
  const gender = safeString(body.gender, 30);
  const citizenship = safeString(body.citizenship, 80);
  const country = safeString(body.country, 80) || 'Kenya';
  const province = safeString(body.province, 100);
  const county = safeString(body.county, 100);
  const subCounty = safeString(body.subCounty, 100);
  const constituency = safeString(body.constituency, 100);
  const ward = safeString(body.ward, 100);
  const location = safeString(body.location, 100);
  const subLocation = safeString(body.subLocation, 100);
  const department = safeString(body.department, 100);
  const jobTitle = safeString(body.jobTitle, 120);
  const employmentType = safeString(body.employmentType, 40);
  const joinedOn = safeString(body.joinedOn, 10);
  const address = safeString(body.address, 240);
  const requestedStaffId = safeString(body.staffId, 16).toUpperCase();

  if (name.length < 2) return error('Enter your full name.');
  if (dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return error('Enter a valid date of birth.');
  if (joinedOn && !/^\d{4}-\d{2}-\d{2}$/.test(joinedOn)) return error('Enter a valid date joined.');
  if (nationalId && !/^[A-Za-z0-9/-]{4,32}$/.test(nationalId)) return error('Enter a valid National ID or identity reference.');

  if (requestedStaffId) {
    if (access.user.role !== 'admin') return error('Only the Admin can change the primary Admin staff ID from this profile.', 403);
    if (!/^AD[0-9]{5}$/.test(requestedStaffId)) return error('Admin staff ID must be AD followed by five digits, for example AD12345.');
    const duplicate = await env.DB.prepare('SELECT user_id FROM user_profiles WHERE staff_id = ? AND user_id <> ?')
      .bind(requestedStaffId, access.user.id).first();
    if (duplicate) return error('That staff ID is already assigned to another account.', 409);
  }

  const existingProfile = await env.DB.prepare('SELECT staff_id AS staffId FROM user_profiles WHERE user_id = ?').bind(access.user.id).first();
  let staffId = requestedStaffId || existingProfile?.staffId || '';
  if (!staffId) {
    const prefixes = { admin: 'AD', principal: 'PR', finance: 'FN', admissions: 'AM', tutor: 'TU', student: 'ST' };
    const prefix = prefixes[access.user.role] || 'ST';
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = prefix + String(10000 + Math.floor(Math.random() * 90000));
      const duplicate = await env.DB.prepare('SELECT user_id FROM user_profiles WHERE staff_id = ?').bind(candidate).first();
      if (!duplicate) { staffId = candidate; break; }
    }
    if (!staffId) return error('A unique staff ID could not be generated. Please retry.', 503);
  }

  const columns = await getProfileColumns(env.DB);
  const profileValues = {
    staff_id: staffId, portal_role: access.user.role, phone: phone || null,
    date_of_birth: dateOfBirth || null, gender: gender || null, citizenship: citizenship || null,
    country, province: province || null, county: county || null, sub_county: subCounty || null,
    constituency: constituency || null, ward: ward || null, location: location || null,
    sub_location: subLocation || null, department: department || null, job_title: jobTitle || null,
    employment_type: employmentType || null, joined_on: joinedOn || null,
  };
  if (columns.has('national_id')) profileValues.national_id = nationalId || null;
  if (columns.has('address')) profileValues.address = address || null;
  if (access.user.role === 'student') {
    const currentUser = await env.DB.prepare('SELECT name FROM users WHERE id=?').bind(access.user.id).first();
    const currentProfile = await env.DB.prepare('SELECT * FROM user_profiles WHERE user_id=?').bind(access.user.id).first();
    const changes = {};
    if (name !== String(currentUser?.name || '')) changes.name = name;
    for (const [column, value] of Object.entries(profileValues)) {
      if (column === 'staff_id' || column === 'portal_role' || !columns.has(column)) continue;
      if (String(currentProfile?.[column] ?? '') !== String(value ?? '')) changes[column] = value ?? '';
    }
    if (!Object.keys(changes).length) return json({ requestSubmitted: false, message: 'There are no profile changes to submit.' });
    const pending = await env.DB.prepare("SELECT id FROM student_profile_change_requests WHERE user_id=? AND status='pending' LIMIT 1").bind(access.user.id).first();
    if (pending) return error('You already have a profile correction awaiting administrator review. Wait for that decision before submitting another request.', 409);
    const requestId = uuid();
    await env.DB.prepare("INSERT INTO student_profile_change_requests(id,user_id,changes_json) VALUES(?,?,?)")
      .bind(requestId, access.user.id, JSON.stringify(changes)).run();
    await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)')
      .bind(uuid(), access.user.id, 'student_profile_change_submitted', 'student_profile_change_request', requestId).run();
    return json({ requestSubmitted: true, requestId, message: 'Your profile correction request has been sent to Navstar Administration for review. Your current profile remains unchanged until it is approved.' }, 201);
  }

  const profileColumns = Object.keys(profileValues);
  const insertColumns = ['user_id', ...profileColumns];
  const placeholders = insertColumns.map(() => '?').join(', ');
  const updateAssignments = profileColumns.map(column => column + ' = excluded.' + column).concat('updated_at = CURRENT_TIMESTAMP').join(', ');
  const profileStatement = env.DB.prepare(
    'INSERT INTO user_profiles (' + insertColumns.join(', ') + ') VALUES (' + placeholders + ') ' +
    'ON CONFLICT(user_id) DO UPDATE SET ' + updateAssignments
  ).bind(access.user.id, ...profileColumns.map(column => profileValues[column]));
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, access.user.id),
    profileStatement,
  ]);

  await env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)')
    .bind(uuid(), access.user.id, requestedStaffId ? 'admin_staff_id_and_profile_updated' : 'profile_updated', 'user', access.user.id)
    .run().catch(() => {});
  const refreshed = await onRequestGet({ request, env });
  const result = await refreshed.json();
  const missingProfileColumns = ['national_id', 'address'].filter(column => !columns.has(column));
  return json({ ...result, ...(missingProfileColumns.length ? { warning: `Some optional profile fields are not yet stored in the database (${missingProfileColumns.join(', ')}). Apply the matching database migrations to enable them.` } : {}) });
}
