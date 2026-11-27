import { hashPassword, requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, uuid } from '../../_shared/http.js';
import { queueCustomerNotice } from '../../_shared/notifications.js';
import { assignAdmissionNumber } from '../../_shared/admissions.js';

const digest = async value => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
};
const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const strongRandomPassword = () => randomToken() + 'A9!';
async function createStudentId(DB) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const number = String(crypto.getRandomValues(new Uint32Array(1))[0] % 100000).padStart(5, '0');
    const staffId = `ST${number}`;
    const exists = await DB.prepare('SELECT user_id FROM user_profiles WHERE staff_id = ?').bind(staffId).first();
    if (!exists) return staffId;
  }
  throw new Error('Could not allocate a unique Student ID. Please retry the admission action.');
}

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
  if (!enrollmentId || !['accept','activate','reject','withdraw','defer-payment','reduced-deposit'].includes(action)) return error('Choose a valid admissions action.');
  if (['reject','withdraw','defer-payment','reduced-deposit'].includes(action) && reason.length < 8) return error('Enter a clear reason or approval note (at least 8 characters).');
  const enrollment = await env.DB.prepare(`SELECT e.*, c.title AS course_title, c.price AS course_fee
    FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE e.id = ?`).bind(enrollmentId).first();
  if (!enrollment) return error('Application not found.', 404);
  const now = new Date().toISOString();
  if (action === 'activate' && enrollment.status !== 'accepted') return error('Only an already accepted admission can be activated from Student Status Management.',409);
  if (action === 'defer-payment' || action === 'reduced-deposit') {
    if (['accepted','rejected','withdrawn'].includes(String(enrollment.status))) return error('Payment exceptions can only be approved for an application that has not received a final decision.', 409);
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
    if (action === 'reject' && enrollment.status === 'accepted') return error('An accepted student cannot be rejected through this action. Use the approved withdrawal process.', 409);
    if (['rejected','withdrawn'].includes(String(enrollment.status))) return error('This application already has a final rejection or withdrawal decision.', 409);
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

  if (!env.RESEND_API_KEY || !env.MAIL_FROM) return error('Admissions email is not configured. Configure RESEND_API_KEY and MAIL_FROM before accepting or activating student accounts.', 503);
  if (enrollment.status === 'accepted' && action !== 'activate') return error('This application has already been accepted.', 409);
  if (['rejected','withdrawn'].includes(String(enrollment.status))) return error('A rejected or withdrawn application cannot be accepted. Review the record before making a new application.', 409);
  if (enrollment.payment_exception === 'reduced-initial-payment') {
    const paidRow = await env.DB.prepare("SELECT COALESCE(SUM(amount),0) AS paid_total FROM payments WHERE purpose='enrollment' AND reference_id=? AND status='paid'").bind(enrollmentId).first();
    if (Number(paidRow?.paid_total || 0) < Number(enrollment.approved_initial_payment || 0)) {
      return error('The Admin-approved reduced initial payment must be confirmed by M-Pesa before this application can be accepted.', 409);
    }
  }
  if (action !== 'activate' && !['paid','deferred'].includes(String(enrollment.payment_status)) && !Number(enrollment.special_enrollment)) {
    return error('The application must have its required payment confirmed or an authorised payment exception recorded before acceptance.', 409);
  }
  let admissionNumber = enrollment.admission_number || '';
  try {
    const assigned = await assignAdmissionNumber(context, enrollmentId, access.user.id);
    admissionNumber = assigned.admissionNumber;
  } catch (cause) {
    return error(cause instanceof Error ? cause.message : 'Admission number could not be generated. Check the selected intake and course code.', Number(cause?.status) || 409);
  }
  let user = await env.DB.prepare(`SELECT id, name, email, role, status, must_change_password FROM users WHERE lower(email) = lower(?) LIMIT 1`).bind(enrollment.email).first();
  if (user && user.role !== 'student') return error('This email is already assigned to a non-student Navstar account. Admissions must resolve the account ownership before admission.', 409);
  const userWasCreated = !user;
  const needsPasswordSetup = !user || user.status !== 'active' || Number(user.must_change_password) === 1;
  if (!user) {
    const id = uuid();
    const generated = await hashPassword(strongRandomPassword());
    await env.DB.prepare(`INSERT INTO users (id,name,email,password_hash,password_salt,role,status,must_change_password)
      VALUES (?,?,?,?,?,'student','active',1)`).bind(id, enrollment.full_name, enrollment.email, generated.hash, generated.salt).run();
    user = { id, name: enrollment.full_name, email: enrollment.email, role: 'student', status: 'active' };
  } else if (user.status !== 'active') {
    const generated = await hashPassword(strongRandomPassword());
    await env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ?, status = 'active', must_change_password = 1 WHERE id = ?")
      .bind(generated.hash, generated.salt, user.id).run();
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run();
  }

  const profile = await env.DB.prepare('SELECT user_id FROM user_profiles WHERE user_id = ?').bind(user.id).first();
  if (!profile) {
    const studentId = await createStudentId(env.DB);
    await env.DB.prepare(`INSERT INTO user_profiles (
      user_id,staff_id,portal_role,national_id,phone,date_of_birth,gender,citizenship,country,
      county,sub_county,ward,location,sub_location,address
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      user.id, studentId, 'student', enrollment.identity_number || null, enrollment.phone || null,
      enrollment.date_of_birth || null, enrollment.gender || null, enrollment.nationality || null,
      'Kenya', enrollment.county || null, enrollment.sub_county || null, enrollment.ward || null,
      enrollment.location || null, enrollment.sub_location || null, enrollment.address || null
    ).run();
  }
  let setupUrl = new URL('/login?role=student', new URL(request.url).origin).toString();
  let passwordSetupSent = false;
  if (needsPasswordSetup) {
    await env.DB.prepare("UPDATE student_password_setup_tokens SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL").bind(user.id).run();
    const token = randomToken();
    await env.DB.prepare('INSERT INTO student_password_setup_tokens (id,user_id,token_hash,expires_at) VALUES (?,?,?,?)')
      .bind(uuid(), user.id, await digest(token), new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()).run();
    setupUrl = new URL('/set-password', new URL(request.url).origin).toString() + '#token=' + encodeURIComponent(token);
    passwordSetupSent = true;
  }
  await env.DB.batch([
    env.DB.prepare("UPDATE enrollments SET status = 'accepted', admitted_user_id = ?, admissions_decision_reason = ? WHERE id = ?")
      .bind(user.id, reason || 'Accepted by Admissions.', enrollmentId),
    env.DB.prepare('INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id) VALUES (?,?,?,?,?)')
      .bind(uuid(), access.user.id, 'enrollment_accepted', 'enrollment', enrollmentId)
  ]);

  const configRow = await env.DB.prepare("SELECT value FROM system_state WHERE key = 'admin-configuration'").first();
  let configuration = {}; try { configuration = JSON.parse(configRow?.value || '{}'); } catch {}
  const installmentLines = String(configuration['enrollment-settings']?.installmentPlans || '').split(/\r?\n/).map(line => line.split('|').map(part => part.trim())).filter(parts => parts.length >= 3 && (parts[0] === enrollment.course_id || parts[0].toLowerCase() === String(enrollment.course_title).toLowerCase()));
  const schedule = installmentLines.length
    ? installmentLines.map((parts,index) => `${index+1}. ${parts[1]} — KSh ${Number(parts[2]).toLocaleString('en-KE')}${parts[3] ? ' · Due '+parts[3] : ''}`).join('\n')
    : 'Contact Admissions / Finance for the approved instalment dates.';
  const accessInstructions = passwordSetupSent
    ? `Set your own private password using this one-time link (valid for 24 hours):\n${setupUrl}`
    : `You already have an active Navstar Student Portal account. Sign in using your existing credentials: ${setupUrl}`;
  queueCustomerNotice(context, env, {
    email: enrollment.email, phone: '',
    subject: 'Admission confirmed — Navstar Digital Hub',
    message: `NAVSTAR DIGITAL HUB — HOME OF TECHNOCRATS\n\nDear ${enrollment.full_name},\n\nCongratulations. Your application has been accepted by Navstar Digital Hub.\n\nAPPLICATION AND ADMISSION DETAILS\nApplication reference: ${enrollment.display_ref}\nApplicant: ${enrollment.full_name}\nCourse: ${enrollment.course_title}\nIntake: ${enrollment.preferred_intake || 'As confirmed by Admissions'}\nAdmission status: ACCEPTED\nAdmission number: ${admissionNumber}\nPublished course fee: KSh ${Number(enrollment.course_fee).toLocaleString('en-KE')}\nPayment status at admission: ${enrollment.payment_status}\nPayment exception: ${enrollment.payment_exception || 'None'}\nPayment due date: ${enrollment.payment_due_date || 'As shown in your fee statement'}\nAdmissions decision: ${reason || 'Accepted by Admissions.'}\n\nCOURSE FEE INSTALMENT PLAN\n${schedule}\n\nSTUDENT PORTAL ACCESS\n${accessInstructions}\n\nFor security, Navstar does not send passwords by email or SMS. Never forward a password setup link or share your password.\n\nYOUR NEXT STEPS\n1. Complete password setup if a one-time setup link was issued.\n2. Sign in to the Student Portal and confirm your personal details.\n3. Review your course information, admission letter and fee statement.\n4. Follow the approved instalment plan or contact Finance before a due date if you need assistance.\n5. Keep your application reference for all enquiries.\n\nAdmissions Office\nNAVSTAR DIGITAL HUB\nHOME OF TECHNOCRATS\nnavstardigitalhub@gmail.com | 0797688576`
  });
  queueCustomerNotice(context, env, { email: '', phone: enrollment.phone, subject: 'Navstar admission confirmed', message: `Navstar Digital Hub: your application ${enrollment.display_ref} for ${enrollment.course_title} has been accepted. Published course fee: KSh ${Number(enrollment.course_fee).toLocaleString('en-KE')}. Check your email for the detailed admission notice and secure Student Portal instructions. HOME OF TECHNOCRATS.` });
  return json({ saved: true, action, status: 'accepted', admissionNumber, userCreated: userWasCreated, passwordSetupSent });
}
