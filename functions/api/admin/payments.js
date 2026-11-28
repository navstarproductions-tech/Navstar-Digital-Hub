import { requireRole } from '../../_shared/auth.js';
import { error, json } from '../../_shared/http.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('Payment records are not configured.', 503);
  const access = await requireRole(request, env, ['admin', 'principal', 'admissions', 'finance']);
  if (access.response) return access.response;

  const ledger=new URL(request.url).searchParams.get('ledger')==='fees'?'fees':'business';
  const where=ledger==='fees'?"WHERE p.purpose='enrollment'":"WHERE p.purpose IN ('service','donation')";
  try {
    const [rows, totals, balance, c2bRows, c2bTotals] = await Promise.all([
      env.DB.prepare(`
        SELECT p.id, p.purpose, p.display_reference, p.internal_receipt_number AS receipt_number,
          p.receipt_number AS mpesa_receipt, p.amount, p.phone, p.status, p.admin_status,
          p.admin_review_note, p.admin_reviewed_at, p.updated_at, p.created_at,
          COALESCE(e.full_name, s.customer_name, d.payer_name, 'Supporter') AS payer_name,
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
          COALESCE(SUM(CASE WHEN status IN ('pending','initiating','processing') THEN amount ELSE 0 END), 0) AS awaiting_mpesa,
          COALESCE(SUM(CASE WHEN status = 'failed' THEN amount ELSE 0 END), 0) AS failed_amount,
          SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS successful_count,
          SUM(CASE WHEN status IN ('pending','initiating','processing') THEN 1 ELSE 0 END) AS pending_count,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
          COALESCE(SUM(CASE WHEN status = 'paid' AND admin_status IN ('pending_review','flagged') THEN amount ELSE 0 END), 0) AS awaiting_admin_review
        FROM payments p ${where}
      `).first(),
      env.DB.prepare(`SELECT balance_text, balance_amount, currency, received_at, result_description, created_at,
        (SELECT created_at FROM mpesa_balance_snapshots ORDER BY created_at DESC LIMIT 1) AS latest_request_at
      FROM mpesa_balance_snapshots
      WHERE result_code = 0 AND received_at IS NOT NULL
      ORDER BY received_at DESC LIMIT 1`).first(),
      env.DB.prepare(`SELECT t.id, t.transaction_id, t.business_shortcode, t.bill_reference, t.amount, t.msisdn, t.payer_name, t.transaction_time, t.received_at, e.id AS enrollment_id, e.display_ref AS enrollment_reference, e.full_name AS matched_student
        FROM mpesa_c2b_transactions t LEFT JOIN enrollments e ON e.display_ref = t.bill_reference ORDER BY t.received_at DESC LIMIT 500`).all(),
      env.DB.prepare(`SELECT COUNT(*) AS transaction_count, COALESCE(SUM(amount),0) AS mpesa_received FROM mpesa_c2b_transactions`).first()
    ]);
    const directPaybill = (c2bRows.results || []).filter(row => ledger === 'business' || Boolean(row.enrollment_id)).map(row => ({ ...row, id: 'c2b:' + row.id, purpose: ledger === 'fees' ? 'enrollment' : 'paybill', source: 'paybill', payer_name: row.payer_name || row.matched_student || 'M-Pesa payer', phone: row.msisdn, display_reference: row.enrollment_reference || row.bill_reference, receipt_number: row.transaction_id, mpesa_receipt: row.transaction_id, created_at: row.received_at, updated_at: row.received_at, status: 'paid', admin_status: 'confirmed', description: ledger === 'fees' ? 'Direct PayBill · student fee' : 'Direct PayBill · ' + (row.bill_reference || 'No account reference') }));
    const combined = [...(rows.results || []), ...directPaybill].sort((a,b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0, 500);
        const mergedTotals = { ...(totals || {}), transaction_count: Number(totals?.transaction_count || 0) + (ledger === 'business' ? Number(c2bTotals?.transaction_count || 0) : directPaybill.length), mpesa_received: Number(totals?.mpesa_received || 0) + (ledger === 'business' ? Number(c2bTotals?.mpesa_received || 0) : directPaybill.reduce((sum, item) => sum + Number(item.amount || 0), 0)) };
    return json({ ledger, payments: combined, totals: mergedTotals, directPaybillCount: ledger === 'business' ? Number(c2bTotals?.transaction_count || 0) : 0, mpesaBalance: ledger==='business'?(balance || null):null });
  } catch (cause) {
    console.error('Admin payment register failed:', String(cause?.message || cause));
    return error('The payment register is not ready. Confirm that the latest database migrations have been applied.', 503);
  }
}
