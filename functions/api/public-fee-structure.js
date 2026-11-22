import { error, json, safeString } from '../_shared/http.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('Fee structure service is temporarily unavailable.', 503);

  const courseId = safeString(new URL(request.url).searchParams.get('courseId'), 80);
  if (!courseId) return error('Select a course to view its fee structure.');

  try {
    const course = await env.DB.prepare(
      "SELECT id, title, course_code, duration, price FROM courses WHERE id = ? AND status = 'active'"
    ).bind(courseId).first();

    if (!course) return error('The selected course is unavailable.', 404);

    const result = await env.DB.prepare(
      'SELECT item_name AS itemName, amount, due_stage AS dueStage, required, sort_order AS sortOrder FROM course_fee_items WHERE course_id = ? AND active = 1 ORDER BY sort_order ASC, item_name ASC'
    ).bind(courseId).all();

    const items = (result.results || []).map((item) => ({
      itemName: String(item.itemName || ''),
      amount: Math.max(0, Number(item.amount) || 0),
      dueStage: String(item.dueStage || 'anytime'),
      required: Number(item.required) === 1,
      sortOrder: Number(item.sortOrder) || 0,
    }));

    if (!items.length) return error('A fee structure has not yet been published for this course.', 404);

    const total = items.reduce((sum, item) => sum + item.amount, 0);
    if (Math.round(total) !== Math.round(Number(course.price) || 0)) {
      return error('This course fee structure is being updated. Please try again shortly.', 409);
    }

    return json({
      course: {
        id: course.id,
        title: course.title,
        course_code: course.course_code || null,
        duration: course.duration || null,
        price: Number(course.price) || 0,
      },
      items,
      total,
      currency: 'KES',
      published: true,
    });
  } catch {
    return error('Unable to retrieve the fee structure right now.', 500);
  }
}
