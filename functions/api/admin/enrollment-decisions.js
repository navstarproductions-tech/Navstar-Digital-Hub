import { hashPassword, requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, uuid } from '../../_shared/http.js';
import { queueCustomerNotice } from '../../_shared/notifications.js';

const digest = async value => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
};
const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const strongRandomPassword = () => randomToken() + 'A9!';
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Admissions service is not configured.', 503);
  const access = await requireRole(request, env, ['admin', 'admissions', 'principal']);
  if (access.response) return access.response;
  let body;
  try { body = await readJson(request, 4096); } catch { return error('Invalid admissions decision.'); }
  const enrollmentId = safeString(body.enrollmentId, 80);
  const action = safeString(body.action, 30);
  const reason = safeString(body.reason, 1000).trim();
  if (!enrollmentId || !['accept','reject','withdraw','defer-payment','reduced-deposit'].includes(action)) return error('Choose a valid admissions action.');
  if (['reject','withdraw','defer-payment','reduced-deposit'].includes(action) && reason.length < 8) return error('Enter a clear reason or approval note (at least 8 characters).');
  const enrollment = await env.DB.prepare(`SELECT e.*, c.title AS course_title, c.price AS course_fee
    FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE e.id = ?`).bind(enrollmentId).first();
  if (!enrollment) return error('Application not found.', 404);
  const now = new Date().toISOString();
  if (action === 'defer-payment' || action === 'reduced-deposit') {
    const approvedAmount = action === 'defer-payment' ? 0 : Number(body.approvedInitialPayment);
    if (action === 'reduced-deposit' && (!Number.isSafeInteger(approvedAmount) || approvedAmount < 1 || approvedAmount >= Number(enrollment.course_fee))) return error('The approved initial payment must be at least KSh 1 and less than the published course fee.');
    const dueDate = safeString(body.paymentDueDate, 10);
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return error('Enter the payment due date in YYYY-MM-DD format.');
    const exceptionType = action === 'defer-payment' ? 'deferred-payment' : 'reduced-initial-payment';
    await env.DB.batch([
      env.DB.prepare(`UPDATE enrollments SET special_enrollment = 1, payment_exception = ?, approved_initial_payment = ?,
        payment_due_date = ?, admissions_decision_reason = ?, payment_status = ?, status = CASE WHEN ? = 'deferred-payment' THEN 'submitted' ELSE status END
        WHERE id = ?`).bind(exceptionType, approvedAmount, dueDate || null, reason, action === 'defer-payment' ? 'deferred' : enrollment.payment_status, exceptionType, enrollmentId),
      env.DB.prepare(`INSERT INTO enrollment_special_approvals (id,enrollment_id,approved_by,exception_type,reason,approved_initial_payment,payment_due_date)
        VALUES (?,?,?,?,?,?,?)`).bind(uuid(), enrollmentId, access.user.id, exceptionType, reason, approvedAmount, dueDate || null),
      env.DB.prepare('INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id) VALUES (?,?,?,?,?)')
        .bind(uuid(), access.user.id, 'enrollment_' + exceptionType, 'enrollment', enrollmentId)
    ]);
    queueCustomerNotice(context, env, {
      email: enrollment.email, phone: enrollment.phone,
      subject: 'Navstar admission payment arrangement approved',
      message: `Hello ${enrollment.full_name}, Navstar Digital Hub Admissions has approved a special payment arrangement for your ${enrollment.course_title} application (${enrollment.display_ref}). Arrangement: ${exceptionType}. Approved amount due now: KSh ${approvedAmount.toLocaleString('en-KE')}. Payment due date: ${dueDate || 'To be agreed with Admissions'}. Reason / note: ${reason}. Your published course fee remains KSh ${Number(enrollment.course_fee).toLocaleString('en-KE')}. Contact Admissions if you need clarification.`
    });
    return json({ saved: true, action, enrollmentId, approvedInitialPayment: approvedAmount, paymentDueDate: dueDate || null });
  }

  if (action === 'reject' || action === 'withdraw') {
    const status = action === 'reject' ? 'rejected' : 'withdrawn';
    await env.DB.batch([
      env.DB.prepare('UPDATE enrollments SET status = ?, admissions_decision_reason = ? WHERE id = ?').bind(status, reason, enrollmentId),
      env.DB.prepare('INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id) VALUES (?,?,?,?,?)').bind(uuid(), access.user.id, 'enrollment_' + action, 'enrollment', enrollmentId)
    ]);
    queueCustomerNotice(context, env, {
      email: enrollment.email, phone: enrollment.phone,
      subject: action === 'reject' ? 'Navstar application decision' : 'Navstar course withdrawal recorded',
      message: `Hello ${enrollment.full_name}, this is an official update from Navstar Digital Hub Admissions regarding application ${enrollment.display_ref} for ${enrollment.course_title}. Decision: ${status.toUpperCase()}. Reason: ${reason}. If you believe this decision needs clarification, contact Navstar Admissions and quote reference ${enrollment.display_ref}.`
    });
    return json({ saved: true, action, status });
  }

  if (!['paid','deferred'].includes(String(enrollment.payment_status)) && !Number(enrollment.special_enrollment)) {
    return error('The application must have its required payment confirmed or an authorised payment exception recorded before acceptance.', 409);
  }
  let user = await env.DB.prepare(`SELECT id, name, email, role, status FROM users WHERE lower(email) = lower(?) LIMIT 1`).bind(enrollment.email).first();
  let setupUrl = '';
  if (user && user.role !== 'student') return error('This email is already assigned to a non-student Navstar account. Admissions must resolve the account ownership before admission.', 409);
  if (!user) {
    const id = uuid();
    const generated = await hashPassword(strongRandomPassword());
    await env.DB.prepare(`INSERT INTO users (id,name,email,password_hash,password_salt,role,status,must_change_password)
      VALUES (?,?,?,?,?,'student','active',1)`).bind(id, enrollment.full_name, enrollment.email, generated.hash, generated.salt).run();
    user = { id, name: enrollment.full_name, email: enrollment.email, role: 'student', status: 'active' };
  } else if (user.status !== 'active') {
    await env.DB.prepare("UPDATE users SET status = 'active', must_change_password = 1 WHERE id = ?").bind(user.id).run();
  }
  const token = randomToken();
  await env.DB.prepare('INSERT INTO student_password_setup_tokens (id,user_id,token_hash,expires_at) VALUES (?,?,?,?)')
    .bind(uuid(), user.id, await digest(token), new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()).run();
  setupUrl = new URL('/set-password?token=' + encodeURIComponent(token), new URL(request.url).origin).toString();
  await env.DB.batch([
    env.DB.prepare("UPDATE enrollments SET status = 'accepted', admitted_user_id = ?, admissions_decision_reason = ? WHERE id = ?")
      .bind(user.id, reason || 'Accepted by Admissions.', enrollmentId),
    env.DB.prepare('INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id) VALUES (?,?,?,?,?)')
      .bind(uuid(), access.user.id, 'enrollment_accepted', 'enrollment', enrollmentId)
  ]);
  const schedule = 'Contact Admissions for your confirmed installment dates and account statement.';
  queueCustomerNotice(context, env, {
    email: enrollment.email, phone: enrollment.phone,
    subject: 'Admission confirmed — Navstar Digital Hub',
    message: `NAVSTAR DIGITAL HUB — HOME OF TECHNOCRATS\n\nDear ${enrollment.full_name},\n\nCongratulations. Your application has been accepted.\n\nAPPLICATION DETAILS\nReference: ${enrollment.display_ref}\nCourse: ${enrollment.course_title}\nIntake: ${enrollment.preferred_intake || 'As confirmed by Admissions'}\nAdmission status: ACCEPTED\nPublished course fee: KSh ${Number(enrollment.course_fee).toLocaleString('en-KE')}\nPayment status: ${enrollment.payment_status}\n\nSTUDENT PORTAL ACCESS\nYour student account has been created. Set your own private password using this one-time link (valid for 24 hours):\n${setupUrl}\n\nFor security, no password is included in this email or SMS. Do not forward the setup link.\n\nNEXT STEPS\n1. Open the secure password setup link.\n2. Create a strong password and sign in to the Student Portal.\n3. Review your admission letter, fee statement and course information.\n4. Follow the approved payment schedule or contact Finance if you have an authorised arrangement.\n\nAdmissions decision note: ${reason || 'Accepted by Admissions.'}\n\nNavstar Digital Hub\nHOME OF TECHNOCRATS\nnavstardigitalhub@gmail.com | 0797688576`
  });
  return json({ saved: true, action, status: 'accepted', userCreated: true, passwordSetupSent: true });
}
