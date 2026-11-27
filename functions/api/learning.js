import { getSession, requireRole } from '../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, uuid } from '../_shared/http.js';
import { syncModuleResult } from '../_shared/module-marks.js';

const learnerRoles = ['student'];
const staffRoles = ['admin', 'tutor', 'principal'];
const fullCourseRoles = ['admin', 'principal'];

async function ensureModuleTutorAssignments(db){
  await db.prepare(`CREATE TABLE IF NOT EXISTS module_tutor_assignments (id TEXT PRIMARY KEY,module_id TEXT NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,tutor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(module_id,tutor_user_id))`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_module_tutor_assignments_tutor ON module_tutor_assignments(tutor_user_id,module_id)').run();
  await db.prepare('INSERT OR IGNORE INTO module_tutor_assignments(id,module_id,tutor_user_id,assigned_by) SELECT lower(hex(randomblob(16))),m.id,a.tutor_user_id,a.assigned_by FROM course_modules m JOIN course_tutor_assignments a ON a.course_id=m.course_id').run();
}

async function hasCourseAccess(db, user, courseId) {
  if (fullCourseRoles.includes(user.role)) return true;
  if (user.role === 'tutor') {
    const assigned = await db.prepare('SELECT id FROM course_tutor_assignments WHERE course_id = ? AND tutor_user_id = ?').bind(courseId, user.id).first();
    if (assigned) return true;
    const moduleAssigned = await db.prepare('SELECT a.id FROM module_tutor_assignments a JOIN course_modules m ON m.id=a.module_id WHERE m.course_id=? AND a.tutor_user_id=? LIMIT 1').bind(courseId,user.id).first();
    return Boolean(moduleAssigned);
  }
  if (!learnerRoles.includes(user.role)) return false;
  const enrollment = await db.prepare(
    "SELECT id FROM enrollments WHERE course_id = ? AND email = ? COLLATE NOCASE AND status = 'accepted' LIMIT 1"
  ).bind(courseId, user.email).first();
  return Boolean(enrollment);
}

async function hasModuleAccess(db,user,moduleId,courseId){
  if(fullCourseRoles.includes(user.role))return true;
  if(user.role==='tutor'){
    const assigned=await db.prepare('SELECT id FROM module_tutor_assignments WHERE module_id=? AND tutor_user_id=?').bind(moduleId,user.id).first();
    if(assigned)return true;
    return false;
  }
  return hasCourseAccess(db,user,courseId);
}

async function getPublishedMarksPolicy(db){
 const row=await db.prepare("SELECT value FROM system_state WHERE key='admin-configuration'").first();let config={};try{config=JSON.parse(row?.value||'{}')}catch{}
 const grading=config.grading||{},maximum=Number(grading.publishedMaximum)||100;
 const bands=String(grading.gradeScale||'').split(/\r?\n/).map(line=>line.split('|').map(part=>part.trim())).filter(p=>p[0]&&p[2]!==''&&p[3]!==''&&p[2]!=='—'&&p[3]!=='—'&&Number.isFinite(Number(p[2]))&&Number.isFinite(Number(p[3]))).map(p=>({grade:p[0],min:Number(p[2]),max:Number(p[3])}));
 return {maximum,bands:bands.length?bands:[{grade:'A',min:80,max:100},{grade:'B+',min:70,max:79},{grade:'B',min:60,max:69},{grade:'C',min:50,max:59},{grade:'D',min:40,max:49},{grade:'F',min:0,max:39}]};
}
async function writeAudit(db, userId, action, entityType, entityId) {
  await db.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)')
    .bind(uuid(), userId, action, entityType, entityId).run();
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('Learning database is not configured.', 503);
  const user = await getSession(request, env);
  if (!user) return error('Sign in required.', 401);
  if (user.mustChangePassword) return error('Change your temporary password before using this portal.', 403);
  await ensureModuleTutorAssignments(env.DB);
  if (![...learnerRoles, ...staffRoles].includes(user.role)) return error('This account cannot access the learning workspace.', 403);

  let courses;
  if (user.role === 'student') {
    courses = await env.DB.prepare(`
      SELECT DISTINCT c.id, c.title, c.description, c.duration, c.image_url AS image, c.category, c.level, c.course_code
      FROM courses c JOIN enrollments e ON e.course_id = c.id
      WHERE c.status = 'active' AND e.email = ? COLLATE NOCASE AND e.status = 'accepted'
      ORDER BY c.title
    `).bind(user.email).all();
  } else if (user.role === 'tutor') {
    courses = await env.DB.prepare("SELECT DISTINCT c.id, c.title, c.description, c.duration, c.image_url AS image, c.category, c.level, c.course_code FROM courses c JOIN course_modules m ON m.course_id=c.id JOIN module_tutor_assignments a ON a.module_id=m.id WHERE c.status='active' AND a.tutor_user_id=? ORDER BY c.title").bind(user.id).all();
  } else {
    courses = await env.DB.prepare("SELECT id, title, description, duration, image_url AS image, category, level, course_code FROM courses WHERE (? IN ('admin','principal') OR status = 'active') ORDER BY title").bind(user.role).all();
  }
  const courseRows = courses.results ?? [];
  const marksPolicy=await getPublishedMarksPolicy(env.DB);
  const courseIds = courseRows.map((course) => course.id);
  if (!courseIds.length) return json({ courses: [], role: user.role, message: user.role === 'student' ? 'No accepted course enrolments are linked to this account yet.' : 'No active courses are available.' });

  const moduleRows = await env.DB.prepare(`
    SELECT m.id, m.course_id, m.title, m.description, m.sort_order, m.status
    FROM course_modules m
    WHERE m.course_id IN (${courseIds.map(() => '?').join(',')}) ${user.role === 'student' ? "AND m.status = 'published'" : user.role === 'tutor' ? "AND m.status = 'published' AND EXISTS (SELECT 1 FROM module_tutor_assignments a WHERE a.module_id=m.id AND a.tutor_user_id=?)" : "AND m.status != 'archived'"}
    ORDER BY m.course_id, m.sort_order, m.created_at
  `).bind(...(user.role==='tutor'?[...courseIds,user.id]:courseIds)).all();
  const modules = moduleRows.results ?? [];
  const moduleIds = modules.map((module) => module.id);
  let lessons = [];
  if (moduleIds.length) {
    const result = await env.DB.prepare(`
      SELECT l.id, l.module_id, l.title, l.content, l.video_url, l.resource_url, l.sort_order, l.estimated_minutes, l.status
      FROM course_lessons l
      WHERE l.module_id IN (${moduleIds.map(() => '?').join(',')}) ${['student', 'tutor'].includes(user.role) ? "AND l.status = 'published'" : "AND l.status != 'archived'"}
      ORDER BY l.module_id, l.sort_order, l.created_at
    `).bind(...moduleIds).all();
    lessons = result.results ?? [];
  }
  const assignmentsResult = await env.DB.prepare(`
    SELECT a.id, a.course_id, a.module_id, a.assignment_type, a.marks_category, a.title, a.instructions, a.due_at, a.max_points, a.category_out_of, a.status
    FROM course_assignments a
    WHERE a.course_id IN (${courseIds.map(() => '?').join(',')}) ${user.role === 'student' ? "AND a.status = 'published'" : user.role === 'tutor' ? "AND a.status = 'published' AND a.module_id IS NOT NULL AND EXISTS (SELECT 1 FROM module_tutor_assignments mt WHERE mt.module_id=a.module_id AND mt.tutor_user_id=?)" : "AND a.status != 'archived'"}
    ORDER BY a.due_at IS NULL, a.due_at, a.created_at DESC
  `).bind(...(user.role==='tutor'?[...courseIds,user.id]:courseIds)).all();
  const assignments = assignmentsResult.results ?? [];

  const progressResult = user.role === 'student'
    ? await env.DB.prepare('SELECT lesson_id, completed, completed_at FROM course_lesson_progress WHERE user_id = ?').bind(user.id).all()
    : { results: [] };
  const submissionSql = `
    SELECT s.id, s.assignment_id, s.user_id, u.name AS learner_name,
      (SELECT e.admission_number FROM enrollments e WHERE lower(e.email)=lower(u.email) AND e.course_id=a.course_id AND e.status='accepted' ORDER BY e.created_at DESC LIMIT 1) AS admission_number,
      s.response_text, s.attachment_url, s.status, s.points_awarded, s.feedback, s.submitted_at, s.graded_at, s.graded_by, s.approval_status, s.approved_by, s.approved_at, a.max_points, a.category_out_of
    FROM course_assignment_submissions s
    JOIN course_assignments a ON a.id = s.assignment_id
    JOIN users u ON u.id = s.user_id
    WHERE ${user.role === 'student' ? 's.user_id = ? AND ' : ''}a.course_id IN (${courseIds.map(() => '?').join(',')}) ${user.role==='tutor' ? 'AND a.module_id IN (SELECT module_id FROM module_tutor_assignments WHERE tutor_user_id = ?)' : ''}
    ORDER BY s.submitted_at DESC
  `;
  const submissionResult = user.role === 'student'
    ? await env.DB.prepare(submissionSql).bind(user.id, ...courseIds).all()
    : staffRoles.includes(user.role)
      ? await env.DB.prepare(submissionSql).bind(...(user.role==='tutor'?[...courseIds,user.id]:courseIds)).all()
      : { results: [] };

  const progressByLesson = new Map((progressResult.results ?? []).map((item) => [item.lesson_id, item]));
  const submissionsByAssignment = new Map();
  for (const submission of submissionResult.results ?? []) {
    const raw=Number(submission.points_awarded),rawMax=Number(submission.max_points)||100;
    const percentage=submission.points_awarded===null||submission.points_awarded===undefined?null:Math.round(raw/rawMax*10000)/100;
    const grade=percentage===null?null:marksPolicy.bands.find(b=>percentage>=b.min&&percentage<=b.max)?.grade||'—';
    const visibleToStudent=user.role!=='student'||submission.approval_status==='approved';
    const categoryMaximum=Number(submission.category_out_of)>0?Number(submission.category_out_of):20;
    const categoryPoints=submission.points_awarded===null||submission.points_awarded===undefined?null:Math.round((raw/rawMax*categoryMaximum)*100)/100;
    const enriched={...submission,status:submission.approval_status==='pending'&&submission.points_awarded!==null?'pending_approval':submission.status,raw_points_awarded:submission.points_awarded,points_awarded:visibleToStudent?categoryPoints:null,feedback:visibleToStudent?submission.feedback:null,percentage:visibleToStudent?percentage:null,published_maximum:categoryMaximum,published_points_awarded:visibleToStudent?categoryPoints:null,grade:visibleToStudent?grade:null};
    const current = submissionsByAssignment.get(submission.assignment_id) ?? [];
    current.push(enriched);
    submissionsByAssignment.set(submission.assignment_id, current);
  }
  const resultCourses = courseRows.map((course) => ({
    ...course,
    modules: modules.filter((module) => module.course_id === course.id).map((module) => ({
      ...module,
      lessons: lessons.filter((lesson) => lesson.module_id === module.id).map((lesson) => ({
        ...lesson,
        completed: Boolean(progressByLesson.get(lesson.id)?.completed),
        completedAt: progressByLesson.get(lesson.id)?.completed_at ?? null,
      })),
    })),
    assignments: assignments.filter((assignment) => assignment.course_id === course.id).map((assignment) => ({
      ...assignment,
      ...(user.role === 'student'
        ? { submission: submissionsByAssignment.get(assignment.id)?.[0] ?? null }
        : { submissions: submissionsByAssignment.get(assignment.id) ?? [] }),
    })),
  }));
  const tutors = user.role === 'admin'
    ? ((await env.DB.prepare("SELECT u.id, u.name, u.email FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id WHERE COALESCE(p.portal_role, u.role) = 'tutor' AND u.status = 'active' ORDER BY u.name").all()).results ?? [])
    : [];
  const moduleTutorAssignments = user.role === 'admin' ? ((await env.DB.prepare('SELECT a.module_id,a.tutor_user_id,u.name AS tutor_name,u.email AS tutor_email FROM module_tutor_assignments a JOIN users u ON u.id=a.tutor_user_id ORDER BY u.name').all()).results ?? []) : [];
  return json({ courses: resultCourses, role: user.role, tutors, moduleTutorAssignments });
}

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Learning database is not configured.', 503);
  const user = await getSession(request, env);
  if (!user) return error('Sign in required.', 401);
  if (user.mustChangePassword) return error('Change your temporary password before using this portal.', 403);
  await ensureModuleTutorAssignments(env.DB);
  let body;
  try { body = await readJson(request, 262144); } catch { return error('Invalid request body.'); }
  const action = safeString(body.action, 40);

  if (['create_module','bulk_create_modules','bulk_create_modules_multi'].includes(action)) {
    const access=await requireRole(request,env,['admin','principal']);
    if(access.response)return access.response;
  }
  if (['update_module','create_lesson','create_assignment','grade_submission','bulk_grade_submissions'].includes(action)) {
    const access = await requireRole(request, env, ['admin','principal','tutor']);
    if (access.response) return access.response;
  }
  if (action === 'approve_assignment_mark') { const access=await requireRole(request,env,['admin','principal']); if(access.response)return access.response; }
  if (['assign_tutor','remove_tutor','assign_module_tutor','remove_module_tutor'].includes(action)) {
    const access = await requireRole(request, env, ['admin','principal']);
    if (access.response) return access.response;
  }

  if (action === 'assign_module_tutor' || action === 'remove_module_tutor') {
    const moduleId=safeString(body.moduleId,80), tutorUserId=safeString(body.tutorUserId,80);
    const module=await env.DB.prepare("SELECT id FROM course_modules WHERE id=? AND status!='archived'").bind(moduleId).first();
    const tutor=await env.DB.prepare("SELECT u.id FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id WHERE u.id=? AND u.status='active' AND COALESCE(p.portal_role,u.role)='tutor'").bind(tutorUserId).first();
    if(!module||!tutor)return error('Choose a valid module and active tutor account.');
    if(action==='assign_module_tutor'){
      await env.DB.prepare('INSERT OR IGNORE INTO module_tutor_assignments(id,module_id,tutor_user_id,assigned_by) VALUES(?,?,?,?)').bind(uuid(),moduleId,tutorUserId,user.id).run();
      await writeAudit(env.DB,user.id,'lms_module_tutor_assigned','course_module',moduleId);
      return json({moduleId,tutorUserId,assigned:true},201);
    }
    await env.DB.prepare('DELETE FROM module_tutor_assignments WHERE module_id=? AND tutor_user_id=?').bind(moduleId,tutorUserId).run();
    await writeAudit(env.DB,user.id,'lms_module_tutor_unassigned','course_module',moduleId);
    return json({moduleId,tutorUserId,assigned:false});
  }

  if (action === 'assign_tutor' || action === 'remove_tutor') {
    const courseId = safeString(body.courseId, 80);
    const tutorUserId = safeString(body.tutorUserId, 80);
    const course = await env.DB.prepare("SELECT id FROM courses WHERE id = ? AND status = 'active'").bind(courseId).first();
    const tutor = await env.DB.prepare("SELECT u.id FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id WHERE u.id = ? AND u.status = 'active' AND COALESCE(p.portal_role, u.role) = 'tutor'").bind(tutorUserId).first();
    if (!course || !tutor) return error('Choose an active course and a valid tutor account.');
    if (action === 'assign_tutor') {
      await env.DB.prepare('INSERT OR IGNORE INTO course_tutor_assignments (id, course_id, tutor_user_id, assigned_by) VALUES (?, ?, ?, ?)').bind(uuid(), courseId, tutorUserId, user.id).run();
      await writeAudit(env.DB, user.id, 'lms_tutor_assigned', 'course', courseId);
      return json({ courseId, tutorUserId, assigned: true }, 201);
    }
    await env.DB.prepare('DELETE FROM course_tutor_assignments WHERE course_id = ? AND tutor_user_id = ?').bind(courseId, tutorUserId).run();
    await writeAudit(env.DB, user.id, 'lms_tutor_unassigned', 'course', courseId);
    return json({ courseId, tutorUserId, assigned: false });
  }

  if (action === 'bulk_create_modules_multi') {
    const rows=Array.isArray(body.rows)?body.rows:[];
    if(rows.length<1||rows.length>100)return error('Upload between 1 and 100 module rows.');
    const normalized=[];
    const courseCache=new Map();
    for(let index=0;index<rows.length;index++){
      const row=rows[index]||{},courseId=safeString(row.courseId,80),title=safeString(row.title,160);
      if(!courseId||title.length<2)return error(`Module row ${index+1} needs a valid course and module title. Nothing was imported.`);
      if(!courseCache.has(courseId)){
        const course=await env.DB.prepare('SELECT id,status FROM courses WHERE id=?').bind(courseId).first();
        courseCache.set(courseId,Boolean(course&&(course.status==='active'||fullCourseRoles.includes(user.role))&&await hasCourseAccess(env.DB,user,courseId)));
      }
      if(!courseCache.get(courseId))return error(`Module row ${index+1} is assigned to a course that is inactive or not assigned to your account. Nothing was imported.`,403);
      normalized.push({courseId,title,description:safeString(row.description,4000),status:row.status==='published'?'published':'draft',sortOrder:Number.isSafeInteger(Number(row.sortOrder))?Math.max(0,Math.min(10000,Number(row.sortOrder))):index+1});
    }
    const statements=normalized.flatMap(row=>{
      const id=uuid();
      return [
        env.DB.prepare('INSERT INTO course_modules(id,course_id,title,description,sort_order,status,created_by) VALUES(?,?,?,?,?,?,?)').bind(id,row.courseId,row.title,row.description,row.sortOrder,row.status,user.id),
        env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),user.id,'lms_module_created','course_module',id)
      ];
    });
    try{await env.DB.batch(statements);}catch(cause){console.error('Navstar multi-course module import failed:',String(cause?.stack||cause));return error('The CSV could not be imported. No modules were changed. Check course mappings and duplicate rows, then try again.',500);}
    return json({imported:normalized.length,message:`${normalized.length} modules imported into their selected courses.`},201);
  }

  if (action === 'bulk_create_modules') {
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length < 1 || rows.length > 100) return error('Upload between 1 and 100 module rows.');
    const normalized = rows.map((row, index) => ({
      courseId: safeString(row?.courseId || body.courseId, 80),
      title: safeString(row?.title, 160),
      description: safeString(row?.description, 4000),
      status: row?.status === 'published' ? 'published' : 'draft',
      sortOrder: Number.isSafeInteger(Number(row?.sortOrder)) ? Math.max(0, Math.min(10000, Number(row.sortOrder))) : index + 1,
    }));
    const invalid = normalized.findIndex(row => !row.courseId || row.title.length < 2);
    if (invalid >= 0) return error(`Module row ${invalid + 1} needs a valid active course association and a title of at least 2 characters. Nothing was imported.`);
    const courseIds = [...new Set(normalized.map(row => row.courseId))];
    const activeCourses = await env.DB.prepare(`SELECT id FROM courses WHERE (? IN ('admin','principal') OR status='active') AND id IN (${courseIds.map(() => '?').join(',')})`).bind(user.role,...courseIds).all();
    const activeIds = new Set((activeCourses.results || []).map(course => course.id));
    for (const courseId of courseIds) {
      if (!activeIds.has(courseId) || !(await hasCourseAccess(env.DB, user, courseId))) {
        return error('One or more CSV rows refer to a course that is inactive or not assigned to your tutor account. Nothing was imported.', 403);
      }
    }
    const ids = normalized.map(() => uuid());
    const statements = normalized.flatMap((row, index) => [
      env.DB.prepare('INSERT INTO course_modules (id, course_id, title, description, sort_order, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(ids[index], row.courseId, row.title, row.description, row.sortOrder, row.status, user.id),
      env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)')
        .bind(uuid(), user.id, 'lms_module_created', 'course_module', ids[index]),
    ]);
    try {
      await env.DB.batch(statements);
    } catch (cause) {
      console.error('Navstar bulk module import failed:', String(cause?.stack || cause));
      return error('The module import could not be saved. Existing modules were not changed. Check the CSV and try again.', 500);
    }
    return json({ imported: ids.length, ids, courses: courseIds.length, message: `${ids.length} modules saved across ${courseIds.length} course(s).` }, 201);
  }

  if (action === 'update_module') {
    const moduleId=safeString(body.moduleId,80), title=safeString(body.title,160), description=safeString(body.description,4000), status=['draft','published','archived'].includes(body.status)?body.status:'draft';
    const module=await env.DB.prepare('SELECT id,course_id FROM course_modules WHERE id=?').bind(moduleId).first();
    if(!module||!(await hasModuleAccess(env.DB,user,moduleId,module.course_id))||title.length<2)return error('Choose a module assigned to your account and enter a valid title.');
    if(user.role==='tutor'&&!(await hasModuleAccess(env.DB,user,moduleId,module.course_id)))return error('You can edit only modules assigned to your tutor account.',403);
    await env.DB.prepare('UPDATE course_modules SET title=?,description=?,status=? WHERE id=?').bind(title,description,status,moduleId).run();
    await writeAudit(env.DB,user.id,'lms_module_updated','course_module',moduleId);
    return json({moduleId,saved:true});
  }

  if (action === 'create_module') {
    const courseId = safeString(body.courseId, 80);
    const title = safeString(body.title, 160);
    const description = safeString(body.description, 4000);
    const course = await env.DB.prepare('SELECT id,status FROM courses WHERE id = ?').bind(courseId).first();
    if (!course || (course.status !== 'active' && !fullCourseRoles.includes(user.role)) || !(await hasCourseAccess(env.DB,user,courseId)) || title.length < 2) return error('Choose a course available to your account and enter a module title. Administrators may prepare modules before publishing a course.');
    const status = body.status === 'published' ? 'published' : 'draft';
    const id = uuid();
    const order = Number.isSafeInteger(Number(body.sortOrder)) ? Math.max(0, Math.min(10000, Number(body.sortOrder))) : 0;
    await env.DB.prepare('INSERT INTO course_modules (id, course_id, title, description, sort_order, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, courseId, title, description, order, status, user.id).run();
    await writeAudit(env.DB, user.id, 'lms_module_created', 'course_module', id);
    return json({ id, status }, 201);
  }

  if (action === 'create_lesson') {
    const moduleId = safeString(body.moduleId, 80);
    const title = safeString(body.title, 160);
    const content = safeString(body.content, 12000);
    const videoUrl = safeString(body.videoUrl, 500);
    const resourceUrl = safeString(body.resourceUrl, 500);
    const module = await env.DB.prepare("SELECT id,course_id FROM course_modules WHERE id = ? AND status != 'archived'").bind(moduleId).first();
    if (!module || !(await hasModuleAccess(env.DB,user,moduleId,module.course_id)) || title.length < 2) return error('Choose a module assigned to your account and enter a lesson title.');
    for (const value of [videoUrl, resourceUrl]) if (value && !/^https:\/\//i.test(value) && !/^\/api\/(?:download|media)\/[a-zA-Z0-9-]+$/.test(value)) return error('Lesson resources must use HTTPS or a saved Navstar document link.');
    const status = body.status === 'published' ? 'published' : 'draft';
    const minutes = Number.isSafeInteger(Number(body.estimatedMinutes)) ? Math.max(1, Math.min(1440, Number(body.estimatedMinutes))) : 15;
    const id = uuid();
    await env.DB.prepare('INSERT INTO course_lessons (id, module_id, title, content, video_url, resource_url, sort_order, estimated_minutes, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, moduleId, title, content, videoUrl || null, resourceUrl || null, Math.max(0, Number(body.sortOrder) || 0), minutes, status, user.id).run();
    await writeAudit(env.DB, user.id, 'lms_lesson_created', 'course_lesson', id);
    return json({ id, status }, 201);
  }

  if (action === 'create_assignment') {
    const courseId = safeString(body.courseId, 80);
    const moduleId = safeString(body.moduleId, 80) || null;
    const title = safeString(body.title, 160);
    const instructions = safeString(body.instructions, 6000);
    const dueAt = safeString(body.dueAt, 40) || null;
    const maxPoints = Number(body.maxPoints);
    const course = await env.DB.prepare("SELECT id FROM courses WHERE id = ? AND status = 'active'").bind(courseId).first();
    if (!course || !(await hasCourseAccess(env.DB,user,courseId)) || title.length < 2 || !Number.isSafeInteger(maxPoints) || maxPoints < 1 || maxPoints > 10000) return error('Enter a valid course, assignment title and maximum score.');
    if(user.role==='tutor'&&(!moduleId||!(await hasModuleAccess(env.DB,user,moduleId,courseId))))return error('Tutors must attach assignments to a module allocated to them.',403);
    if (moduleId) {
      const module = await env.DB.prepare('SELECT id FROM course_modules WHERE id = ? AND course_id = ?').bind(moduleId, courseId).first();
      if (!module || !(await hasModuleAccess(env.DB,user,moduleId,courseId))) return error('The selected module does not belong to this course or is not allocated to your account.');
    }
    if (dueAt && Number.isNaN(Date.parse(dueAt))) return error('Enter a valid assignment deadline.');
    const status = body.status === 'published' ? 'published' : 'draft';
    const assignmentType = body.assignmentType === 'project' ? 'project' : 'assignment';
    const marksCategory = ['CAT','Practical','Final'].includes(String(body.marksCategory)) ? String(body.marksCategory) : 'CAT';
    const categoryOutOf=Number(body.categoryOutOf??20);if(!Number.isFinite(categoryOutOf)||categoryOutOf<=0||categoryOutOf>10000)return error('Enter a valid category maximum greater than zero.');
    const id = uuid();
    await env.DB.prepare('INSERT INTO course_assignments (id, course_id, module_id, assignment_type, marks_category, title, instructions, due_at, max_points, category_out_of, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, courseId, moduleId, assignmentType, marksCategory, title, instructions, dueAt, maxPoints, categoryOutOf, status, user.id).run();
    await writeAudit(env.DB, user.id, assignmentType === 'project' ? 'lms_project_created' : 'lms_assignment_created', 'course_assignment', id);
    return json({ id, status }, 201);
  }

  if (action === 'mark_lesson') {
    if (user.role !== 'student') return error('Only learner accounts can update lesson progress.', 403);
    const lessonId = safeString(body.lessonId, 80);
    const completed = body.completed === true;
    const lesson = await env.DB.prepare(`
      SELECT l.id, m.course_id
      FROM course_lessons l JOIN course_modules m ON m.id = l.module_id
      WHERE l.id = ? AND l.status = 'published' AND m.status = 'published'
    `).bind(lessonId).first();
    if (!lesson || !(await hasCourseAccess(env.DB, user, lesson.course_id))) return error('This lesson is not available to your account.', 403);
    await env.DB.prepare(`
      INSERT INTO course_lesson_progress (id, lesson_id, user_id, completed, completed_at, updated_at)
      VALUES (?, ?, ?, ?, CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END, CURRENT_TIMESTAMP)
      ON CONFLICT(lesson_id,user_id) DO UPDATE SET
        completed = excluded.completed,
        completed_at = excluded.completed_at,
        updated_at = CURRENT_TIMESTAMP
    `).bind(uuid(), lessonId, user.id, completed ? 1 : 0, completed ? 1 : 0).run();
    return json({ lessonId, completed });
  }

  if (action === 'submit_assignment') {
    if (user.role !== 'student') return error('Only learner accounts can submit assignments.', 403);
    const assignmentId = safeString(body.assignmentId, 80);
    const responseText = safeString(body.responseText, 12000);
    const attachmentUrl = safeString(body.attachmentUrl, 500);
    if (!responseText && !attachmentUrl) return error('Write your answer or provide a resource link before submitting.');
    if (attachmentUrl && !/^https:\/\//i.test(attachmentUrl)) return error('Attachment links must use HTTPS.');
    const assignment = await env.DB.prepare("SELECT id, course_id FROM course_assignments WHERE id = ? AND status = 'published'").bind(assignmentId).first();
    if (!assignment || !(await hasCourseAccess(env.DB, user, assignment.course_id))) return error('This assignment is not available to your account.', 403);
    await env.DB.prepare(`
      INSERT INTO course_assignment_submissions (id, assignment_id, user_id, response_text, attachment_url, status, approval_status, submitted_at)
      VALUES (?, ?, ?, ?, ?, 'submitted', 'pending', CURRENT_TIMESTAMP)
      ON CONFLICT(assignment_id,user_id) DO UPDATE SET
        response_text = excluded.response_text,
        attachment_url = excluded.attachment_url,
        status = 'submitted',
        points_awarded = NULL,
        feedback = NULL,
        graded_by = NULL,
        graded_at = NULL,
        approval_status = 'pending', approved_by = NULL, approved_at = NULL,
        submitted_at = CURRENT_TIMESTAMP
    `).bind(uuid(), assignmentId, user.id, responseText, attachmentUrl || null).run();
    return json({ assignmentId, status: 'submitted' }, 201);
  }

  if (action === 'bulk_grade_submissions') {
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length < 1 || rows.length > 100) return error('Upload between 1 and 100 marks rows.');
    const prepared = [];
    for (let index = 0; index < rows.length; index += 1) {
      const submissionId = safeString(rows[index]?.submissionId, 80);
      const points = Number(rows[index]?.pointsAwarded);
      const feedback = safeString(rows[index]?.feedback, 4000);
      const submission = await env.DB.prepare(`
        SELECT s.id,s.approval_status,a.max_points,a.course_id,a.module_id
        FROM course_assignment_submissions s JOIN course_assignments a ON a.id=s.assignment_id WHERE s.id=?
      `).bind(submissionId).first();
      if (!submission || !(await hasCourseAccess(env.DB,user,submission.course_id)) || (user.role==='tutor'&&(!submission.module_id||!(await hasModuleAccess(env.DB,user,submission.module_id,submission.course_id))||submission.approval_status==='approved')) || !Number.isSafeInteger(points) || points < 0 || points > submission.max_points) {
        return error(`Marks row ${index + 1} has an unknown submission, an approved mark, or a score outside the allowed range. Nothing was imported.`);
      }
      prepared.push({ submissionId, points, feedback });
    }
    const approvalStatus=user.role==='tutor'?'pending':'approved';
    const statements = prepared.flatMap(row => [
      env.DB.prepare("UPDATE course_assignment_submissions SET status='graded',points_awarded=?,feedback=?,graded_by=?,graded_at=CURRENT_TIMESTAMP,approval_status=?,approved_by=?,approved_at=CASE WHEN ?='approved' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id=?")
        .bind(row.points,row.feedback,user.id,approvalStatus,approvalStatus==='approved'?user.id:null,approvalStatus,row.submissionId),
      env.DB.prepare('INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)')
        .bind(uuid(), user.id, 'lms_submission_graded', 'course_assignment_submission', row.submissionId),
    ]);
    try { await env.DB.batch(statements); }
    catch (cause) {
      console.error('Navstar bulk marks import failed:', String(cause?.stack || cause));
      return error('The marks import could not be saved. Existing marks were not changed. Check the template and try again.', 500);
    }
    if(approvalStatus==='approved')for(const row of prepared){const link=await env.DB.prepare(`SELECT s.user_id,a.module_id FROM course_assignment_submissions s JOIN course_assignments a ON a.id=s.assignment_id WHERE s.id=?`).bind(row.submissionId).first();if(link?.module_id)await syncModuleResult(env.DB,link.user_id,link.module_id,user.id);}
    return json({ imported: prepared.length, approvalStatus, message: approvalStatus==='approved'?`${prepared.length} marks saved and published successfully.`:`${prepared.length} tutor marks saved for administrator approval.` }, 200);
  }

  if(action==='approve_assignment_mark'){
    const submissionId=safeString(body.submissionId,80);
    const submission=await env.DB.prepare(`SELECT s.id,s.user_id,a.module_id,a.course_id FROM course_assignment_submissions s JOIN course_assignments a ON a.id=s.assignment_id WHERE s.id=? AND s.points_awarded IS NOT NULL`).bind(submissionId).first();
    if(!submission)return error('A tutor-marked assignment submission is required.',404);
    await env.DB.prepare("UPDATE course_assignment_submissions SET status='graded',approval_status='approved',approved_by=?,approved_at=CURRENT_TIMESTAMP WHERE id=?").bind(user.id,submissionId).run();
    await writeAudit(env.DB,user.id,'lms_submission_mark_approved','course_assignment_submission',submissionId);
    if(submission.module_id)await syncModuleResult(env.DB,submission.user_id,submission.module_id,user.id);
    return json({id:submissionId,approvalStatus:'approved',published:true});
  }

  if (action === 'grade_submission') {
    const submissionId = safeString(body.submissionId, 80);
    const points = Number(body.pointsAwarded);
    const feedback = safeString(body.feedback, 4000);
    const submission = await env.DB.prepare(`
      SELECT s.id,s.approval_status,a.max_points,a.course_id,a.module_id
      FROM course_assignment_submissions s JOIN course_assignments a ON a.id=s.assignment_id WHERE s.id=?
    `).bind(submissionId).first();
    if (!submission || !(await hasCourseAccess(env.DB,user,submission.course_id)) || (user.role==='tutor'&&(!submission.module_id||!(await hasModuleAccess(env.DB,user,submission.module_id,submission.course_id))||submission.approval_status==='approved')) || !Number.isSafeInteger(points) || points < 0 || points > submission.max_points) return error('Enter a valid score for an assigned module. Tutors cannot overwrite an administrator-approved mark.');
    const approvalStatus=user.role==='tutor'?'pending':'approved';
    await env.DB.prepare("UPDATE course_assignment_submissions SET status='graded',points_awarded=?,feedback=?,graded_by=?,graded_at=CURRENT_TIMESTAMP,approval_status=?,approved_by=?,approved_at=CASE WHEN ?='approved' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id=?")
      .bind(points,feedback,user.id,approvalStatus,approvalStatus==='approved'?user.id:null,approvalStatus,submissionId).run();
    await writeAudit(env.DB,user.id,'lms_submission_graded','course_assignment_submission',submissionId);
    if(approvalStatus==='approved'&&submission.module_id)await syncModuleResult(env.DB,(await env.DB.prepare('SELECT user_id FROM course_assignment_submissions WHERE id=?').bind(submissionId).first())?.user_id,submission.module_id,user.id);
    return json({id:submissionId,status:approvalStatus==='approved'?'graded':'pending_approval',approvalStatus,pointsAwarded:points});
  }

  return error('Unknown learning action.');
}
