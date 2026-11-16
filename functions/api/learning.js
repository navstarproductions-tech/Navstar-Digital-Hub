import { getSession, requireRole } from '../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, uuid } from '../_shared/http.js';

const learnerRoles = ['student'];
const staffRoles = ['admin', 'tutor', 'principal'];

async function hasCourseAccess(db, user, courseId) {
  if (staffRoles.includes(user.role)) return true;
  if (!learnerRoles.includes(user.role)) return false;
  const enrollment = await db.prepare(
    "SELECT id FROM enrollments WHERE course_id = ? AND email = ? COLLATE NOCASE AND status = 'accepted' LIMIT 1"
  ).bind(courseId, user.email).first();
  return Boolean(enrollment);
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
  if (![...learnerRoles, ...staffRoles].includes(user.role)) return error('This account cannot access the learning workspace.', 403);

  let courses;
  if (user.role === 'student') {
    courses = await env.DB.prepare(`
      SELECT DISTINCT c.id, c.title, c.description, c.duration, c.image_url AS image, c.category, c.level
      FROM courses c JOIN enrollments e ON e.course_id = c.id
      WHERE c.status = 'active' AND e.email = ? COLLATE NOCASE AND e.status = 'accepted'
      ORDER BY c.title
    `).bind(user.email).all();
  } else {
    courses = await env.DB.prepare("SELECT id, title, description, duration, image_url AS image, category, level FROM courses WHERE status = 'active' ORDER BY title").all();
  }
  const courseRows = courses.results ?? [];
  const courseIds = courseRows.map((course) => course.id);
  if (!courseIds.length) return json({ courses: [], role: user.role, message: user.role === 'student' ? 'No accepted course enrolments are linked to this account yet.' : 'No active courses are available.' });

  const moduleRows = await env.DB.prepare(`
    SELECT m.id, m.course_id, m.title, m.description, m.sort_order, m.status
    FROM course_modules m
    WHERE m.course_id IN (${courseIds.map(() => '?').join(',')}) ${user.role === 'student' ? "AND m.status = 'published'" : "AND m.status != 'archived'"}
    ORDER BY m.course_id, m.sort_order, m.created_at
  `).bind(...courseIds).all();
  const modules = moduleRows.results ?? [];
  const moduleIds = modules.map((module) => module.id);
  let lessons = [];
  if (moduleIds.length) {
    const result = await env.DB.prepare(`
      SELECT l.id, l.module_id, l.title, l.content, l.video_url, l.resource_url, l.sort_order, l.estimated_minutes, l.status
      FROM course_lessons l
      WHERE l.module_id IN (${moduleIds.map(() => '?').join(',')}) ${user.role === 'student' ? "AND l.status = 'published'" : "AND l.status != 'archived'"}
      ORDER BY l.module_id, l.sort_order, l.created_at
    `).bind(...moduleIds).all();
    lessons = result.results ?? [];
  }
  const assignmentsResult = await env.DB.prepare(`
    SELECT a.id, a.course_id, a.module_id, a.title, a.instructions, a.due_at, a.max_points, a.status
    FROM course_assignments a
    WHERE a.course_id IN (${courseIds.map(() => '?').join(',')}) ${user.role === 'student' ? "AND a.status = 'published'" : "AND a.status != 'archived'"}
    ORDER BY a.due_at IS NULL, a.due_at, a.created_at DESC
  `).bind(...courseIds).all();
  const assignments = assignmentsResult.results ?? [];

  const progressResult = user.role === 'student'
    ? await env.DB.prepare('SELECT lesson_id, completed, completed_at FROM course_lesson_progress WHERE user_id = ?').bind(user.id).all()
    : { results: [] };
  const submissionResult = await env.DB.prepare(`
    SELECT s.id, s.assignment_id, s.status, s.points_awarded, s.feedback, s.submitted_at
    FROM course_assignment_submissions s
    JOIN course_assignments a ON a.id = s.assignment_id
    WHERE s.user_id = ? AND a.course_id IN (${courseIds.map(() => '?').join(',')})
  `).bind(user.id, ...courseIds).all();

  const progressByLesson = new Map((progressResult.results ?? []).map((item) => [item.lesson_id, item]));
  const submissionsByAssignment = new Map((submissionResult.results ?? []).map((item) => [item.assignment_id, item]));
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
      submission: submissionsByAssignment.get(assignment.id) ?? null,
    })),
  }));
  return json({ courses: resultCourses, role: user.role });
}

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Learning database is not configured.', 503);
  const user = await getSession(request, env);
  if (!user) return error('Sign in required.', 401);
  if (user.mustChangePassword) return error('Change your temporary password before using this portal.', 403);
  let body;
  try { body = await readJson(request, 16384); } catch { return error('Invalid request body.'); }
  const action = safeString(body.action, 40);

  if (['create_module', 'create_lesson', 'create_assignment', 'grade_submission'].includes(action)) {
    const access = await requireRole(request, env, ['admin']);
    if (access.response) return access.response;
  }

  if (action === 'create_module') {
    const courseId = safeString(body.courseId, 80);
    const title = safeString(body.title, 160);
    const description = safeString(body.description, 4000);
    const course = await env.DB.prepare("SELECT id FROM courses WHERE id = ? AND status = 'active'").bind(courseId).first();
    if (!course || title.length < 2) return error('Choose an active course and enter a module title.');
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
    const module = await env.DB.prepare("SELECT id FROM course_modules WHERE id = ? AND status != 'archived'").bind(moduleId).first();
    if (!module || title.length < 2) return error('Choose an available module and enter a lesson title.');
    for (const value of [videoUrl, resourceUrl]) if (value && !/^https:\/\//i.test(value)) return error('Lesson video and resource links must use HTTPS.');
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
    if (!course || title.length < 2 || !Number.isSafeInteger(maxPoints) || maxPoints < 1 || maxPoints > 10000) return error('Enter a valid course, assignment title and maximum score.');
    if (moduleId) {
      const module = await env.DB.prepare('SELECT id FROM course_modules WHERE id = ? AND course_id = ?').bind(moduleId, courseId).first();
      if (!module) return error('The selected module does not belong to this course.');
    }
    if (dueAt && Number.isNaN(Date.parse(dueAt))) return error('Enter a valid assignment deadline.');
    const status = body.status === 'published' ? 'published' : 'draft';
    const id = uuid();
    await env.DB.prepare('INSERT INTO course_assignments (id, course_id, module_id, title, instructions, due_at, max_points, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, courseId, moduleId, title, instructions, dueAt, maxPoints, status, user.id).run();
    await writeAudit(env.DB, user.id, 'lms_assignment_created', 'course_assignment', id);
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
      INSERT INTO course_assignment_submissions (id, assignment_id, user_id, response_text, attachment_url, status, submitted_at)
      VALUES (?, ?, ?, ?, ?, 'submitted', CURRENT_TIMESTAMP)
      ON CONFLICT(assignment_id,user_id) DO UPDATE SET
        response_text = excluded.response_text,
        attachment_url = excluded.attachment_url,
        status = 'submitted',
        points_awarded = NULL,
        feedback = NULL,
        graded_by = NULL,
        graded_at = NULL,
        submitted_at = CURRENT_TIMESTAMP
    `).bind(uuid(), assignmentId, user.id, responseText, attachmentUrl || null).run();
    return json({ assignmentId, status: 'submitted' }, 201);
  }

  if (action === 'grade_submission') {
    const submissionId = safeString(body.submissionId, 80);
    const points = Number(body.pointsAwarded);
    const feedback = safeString(body.feedback, 4000);
    const submission = await env.DB.prepare(`
      SELECT s.id, a.max_points FROM course_assignment_submissions s
      JOIN course_assignments a ON a.id = s.assignment_id WHERE s.id = ?
    `).bind(submissionId).first();
    if (!submission || !Number.isSafeInteger(points) || points < 0 || points > submission.max_points) return error('Enter a valid score within the assignment maximum.');
    await env.DB.prepare("UPDATE course_assignment_submissions SET status = 'graded', points_awarded = ?, feedback = ?, graded_by = ?, graded_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(points, feedback, user.id, submissionId).run();
    await writeAudit(env.DB, user.id, 'lms_submission_graded', 'course_assignment_submission', submissionId);
    return json({ id: submissionId, status: 'graded', pointsAwarded: points });
  }

  return error('Unknown learning action.');
}
