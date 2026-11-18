import { requireRole } from '../../../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, uuid } from '../../../_shared/http.js';
export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Payment records are not configured.', 503);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;
  let body; try { body = await readJson(request, 4096); } catch { return error('Invalid request body.'); }
  const paymentId = safeString(body.paymentId, 80), decision = safeString(body.decision, 20), note = safeString(body.note, 500);
  if (!paymentId || !['confirmed','flagged'].includes(decision)) return error('Choose a valid payment review action.');
  const payment = await env.DB.prepare('SELECT id, purpose, reference_id, status FROM payments WHERE id=?').bind(paymentId).first();
  if (!payment) return error('Payment not found.', 404);
  if (payment.status !== 'paid') return error('Only Safaricom-confirmed payments can be reviewed.', 409);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('UPDATE payments SET admin_status=?,admin_reviewed_by=?,admin_reviewed_at=?,admin_review_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(decision,access.user.id,now,note||null,paymentId),
    env.DB.prepare("INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id) VALUES (?,? ,?,'payment',?)").bind(uuid(),access.user.id,'payment_'+decision,paymentId)
  ]);
  return json({success:true,adminStatus:decision,reviewedAt:now});
}