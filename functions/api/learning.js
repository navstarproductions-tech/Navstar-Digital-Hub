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
    SELECT m.id, m.course_id, m.title, m.module_code, m.description, m.sort_order, m.status
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
    WHERE a.course_id IN (${courseIds.map(() => '?').join(',')}) ${user.role === 'student' ? "AND (a.status = 'published' OR EXISTS (SELECT 1 FROM course_assignment_submissions old_s WHERE old_s.assignment_id=a.id AND old_s.user_id=?))" : user.role === 'tutor' ? "AND a.status = 'published' AND a.module_id IS NOT NULL AND EXISTS (SELECT 1 FROM module_tutor_assignments mt WHERE mt.module_id=a.module_id AND mt.tutor_user_id=?)" : "AND a.status != 'archived'"}
    ORDER BY a.due_at IS NULL, a.due_at, a.created_at DESC
  `).bind(...(['tutor','student'].includes(user.role)?[...courseIds,user.id]:courseIds)).all();
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
    const enriched={...submission,status:submission.approval_status==='pending'&&submission.points_awarded!==null?'pending_approval':submission.status,raw_points_awarded:submission.points_awarded,points_awarded:user.role==='student'?(visibleToStudent?categoryPoints:null):submission.points_awarded,feedback:visibleToStudent?submission.feedback:null,percentage:visibleToStudent?percentage:null,published_maximum:categoryMaximum,published_points_awarded:visibleToStudent?categoryPoints:null,grade:visibleToStudent?grade:null};
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
  if (action === 'update_assignment') {
    const assignmentId=safeString(body.assignmentId,80);
    const title=safeString(body.title,160);
    const instructions=safeString(body.instructions,6000);
    const dueAt=safeString(body.dueAt,40)||null;
    const maxPoints=Number(body.maxPoints);
    const categoryOutOf=Number(body.categoryOutOf??20);
    const marksCategory=['CAT','Practical','Final'].includes(String(body.marksCategory))?String(body.marksCategory):'CAT';
    const status=['draft','published','archived'].includes(body.status)?body.status:'draft';
    const existing=await env.DB.prepare('SELECT id,course_id,module_id FROM course_assignments WHERE id=?').bind(assignmentId).first();
    if(!existing||title.length<2||!Number.isSafeInteger(maxPoints)||maxPoints<1||maxPoints>10000||!Number.isFinite(categoryOutOf)||categoryOutOf<=0||categoryOutOf>10000)return error('Enter valid assignment details and score limits.');
    const courseId=safeString(body.courseId,80),moduleId=safeString(body.moduleId,80)||null;
    const course=await env.DB.prepare('SELECT id FROM courses WHERE id=?').bind(courseId).first();
    if(!course||!moduleId)return error('Choose a valid course and module for this assignment.');
    const module=await env.DB.prepare('SELECT id FROM course_modules WHERE id=? AND course_id=?').bind(moduleId,courseId).first();
    if(!module)return error('The selected module does not belong to the selected course.');
    if(user.role==='tutor'){
      if(!existing.module_id||!(await hasModuleAccess(env.DB,user,existing.module_id,existing.course_id))||!(await hasModuleAccess(env.DB,user,moduleId,courseId)))return error('Tutors can edit assignments only within modules allocated to them.',403);
    }
    if(dueAt&&Number.isNaN(Date.parse(dueAt)))return error('Enter a valid assignment deadline.');
    await env.DB.prepare(`UPDATE course_assignments SET course_id=?,module_id=?,title=?,instructions=?,due_at=?,max_points=?,category_out_of=?,marks_category=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(courseId,moduleId,title,instructions,dueAt,maxPoints,categoryOutOf,marksCategory,status,assignmentId).run();
    await writeAudit(env.DB,user.id,'lms_assignment_updated','course_assignment',assignmentId);
    return json({id:assignmentId,status,saved:true});
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
    const assignment = await env.DB.prepare("SELECT id, course_id, module_id FROM course_assignments WHERE id = ? AND status = 'published'").bind(assignmentId).first();
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
    if(assignment.module_id)await syncModuleResult(env.DB,user.id,assignment.module_id,user.id);
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
