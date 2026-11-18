import { requireRole } from '../../_shared/auth.js';
import { error, json } from '../../_shared/http.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('Payment receipt service is not configured.', 503);
  const access = await requireRole(request, env, ['admin','principal','admissions','student']);
  if (access.response) return access.response;
  const url = new URL(request.url);
  const id = url.searchParams.get('id') || '';
  if (!id || id.length > 100) return error('A valid payment ID is required.');
  const payment = await env.DB.prepare(`
    SELECT p.id,p.purpose,p.reference_id,p.display_reference,p.phone,p.amount,p.status,
      p.receipt_number AS mpesa_receipt,p.internal_receipt_number AS receipt_number,
      p.transaction_date,p.created_at,p.updated_at,
      e.full_name AS learner_name,e.email AS learner_email,e.display_ref AS learner_reference,
      c.title AS course_title,sr.customer_name AS service_customer,
      sr.email AS service_email,sr.notes AS service_notes,d.phone AS donor_phone
    FROM payments p
    LEFT JOIN enrollments e ON p.purpose='enrollment' AND e.id=p.reference_id
    LEFT JOIN courses c ON c.id=e.course_id
    LEFT JOIN service_requests sr ON p.purpose='service' AND sr.id=p.reference_id
    LEFT JOIN donations d ON p.purpose='donation' AND d.id=p.reference_id
    WHERE p.id=? AND p.status='paid'
  `).bind(id).first();
  if (!payment) return error('Confirmed payment receipt was not found.',404);
  if (access.user.role === 'student' && (payment.purpose !== 'enrollment' || payment.learner_email?.toLowerCase() !== access.user.email.toLowerCase())) {
    return error('You are not allowed to view this receipt.',403);
  }
  let serviceDescription = '';
  if (payment.service_notes) {
    try { const notes = JSON.parse(payment.service_notes); serviceDescription = notes.manualDescription || (Array.isArray(notes.items) ? notes.items.map(item => item.name).filter(Boolean).join(', ') : ''); } catch { serviceDescription = String(payment.service_notes).slice(0, 180); }
  }
  return json({
    receipt: {
      businessName:'NAVSTAR DIGITAL HUB',
      motto:'HOME OF TECHNOCRATS',
      businessAddress:'P.O. Box 546-50200, Bungoma, Kenya',
      businessPhones:'+254 797 688 576 / +254 706 637 485',
      businessEmail:'navstardigitalhub@gmail.com',
      receiptNumber:payment.receipt_number,
      paymentReference:payment.display_reference || payment.reference_id,
      paymentPurpose:payment.purpose,
      payerName:payment.learner_name || payment.service_customer || 'Customer',
      payerReference:payment.learner_reference || '',
      description:payment.course_title || (payment.purpose === 'donation' ? 'Donation' : serviceDescription || 'Service payment'),
      phone:payment.phone,
      amount:Number(payment.amount),
      currency:'KES',
      paymentMethod:'M-Pesa',
      mpesaReceipt:payment.mpesa_receipt,
      transactionDate:payment.transaction_date || payment.updated_at,
      issuedAt:new Date().toISOString(),
      status:'PAID'
    }
  });
}
