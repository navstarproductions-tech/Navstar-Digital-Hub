import { requireRole } from '../../_shared/auth.js';
import { error, json } from '../../_shared/http.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('Payment records are not configured.', 503);
  const access = await requireRole(request, env, ['admin', 'principal', 'admissions', 'finance']);
  if (access.response) return access.response;

  const requested = new URL(request.url).searchParams.get('ledger');
  const ledger = ['fees', 'business', 'all'].includes(requested) ? requested : 'business';
  const where = ledger === 'fees'
    ? "WHERE p.purpose='enrollment' AND p.status='paid'"
    : ledger === 'business'
      ? "WHERE p.purpose IN ('service','donation') AND p.status='paid'"
      : "WHERE p.status='paid'";
  try {
    const [rows, totals, balance] = await Promise.all([
      env.DB.prepare(`
        SELECT p.id, p.purpose, p.display_reference, p.internal_receipt_number AS receipt_number,
          p.receipt_number AS mpesa_receipt, p.amount, p.phone, p.status, p.admin_status,
          p.admin_review_note, p.admin_reviewed_at, p.updated_at, p.created_at,
          COALESCE(e.full_name, s.customer_name, d.payer_name, 'Customer') AS payer_name,
          COALESCE(c.title,
            CASE WHEN p.purpose = 'donation' THEN
              CASE d.contribution_type WHEN 'debt_payment' THEN 'Debt / deficit repayment'
                WHEN 'contribution' THEN 'Agreed contribution' ELSE 'Voluntary donation' END
            ELSE 'Service payment' END) AS description,
          d.contribution_type, d.debt_reference, d.debt_description
        FROM payments p
        LEFT JOIN enrollments e ON p.purpose = 'enrollment' AND e.id = p.reference_id
        LEFT JOIN courses c ON c.id = e.course_id
        LEFT JOIN service_requests s ON p.purpose = 'service' AND s.id = p.reference_id
        LEFT JOIN donations d ON p.purpose = 'donation' AND d.id = p.reference_id
        ${where} ORDER BY p.created_at DESC LIMIT 500
      `).all(),
      env.DB.prepare(`
        SELECT COUNT(*) AS transaction_count,
          COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS mpesa_received,
          COALESCE(SUM(CASE WHEN status = 'paid' AND admin_status = 'confirmed' THEN amount ELSE 0 END), 0) AS admin_confirmed,
          COALESCE(SUM(CASE WHEN status IN ('pending','initiating') THEN amount ELSE 0 END), 0) AS awaiting_mpesa,
          COALESCE(SUM(CASE WHEN status = 'paid' AND admin_status IN ('pending_review','flagged') THEN 1 ELSE 0 END), 0) AS awaiting_admin_review
        FROM payments p ${where}
      `).first(),
      env.DB.prepare('SELECT balance_text, balance_amount, currency, received_at, result_description FROM mpesa_balance_snapshots ORDER BY created_at DESC LIMIT 1').first()
    ]);
    return json({ ledger, payments: rows.results || [], totals: totals || {}, mpesaBalance: ledger !== 'fees' ? (balance || null) : null });
  } catch (cause) {
    console.error('Admin payment register failed:', String(cause?.message || cause));
    return error('The payment register is not ready. Confirm that the latest database migrations have been applied.', 503);
  }
}
