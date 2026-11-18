import { useState } from 'react';
type EnrollmentRow = Record<string, unknown>;

export function EnrollmentAdminActions({ enrollment, onUpdated }: { enrollment: EnrollmentRow; onUpdated?: () => void }) {
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const id = String(enrollment.id || '');

  const decide = async (action:string) => {
    if (!id) { setMessage('Missing application reference.'); return; }
    const payload:Record<string,unknown> = { enrollmentId:id, action };
    if (['reject','withdraw','defer-payment','reduced-deposit'].includes(action)) {
      const reason = window.prompt(action==='reject'?'Reason for rejection:':action==='withdraw'?'Reason for withdrawal:':'Reason for this special payment approval:') || '';
      if (reason.trim().length < 8) { setMessage('Enter a reason of at least 8 characters. No change was made.'); return; }
      payload.reason = reason.trim();
    }
    if (action==='defer-payment') payload.paymentDueDate = window.prompt('Payment due date (YYYY-MM-DD), or leave blank:') || '';
    if (action==='reduced-deposit') {
      const amount = Number(window.prompt('Approved initial payment in KSh (whole amount, less than the published course fee):') || '0');
      if (!Number.isSafeInteger(amount) || amount < 1) { setMessage('Enter a valid positive amount. No change was made.'); return; }
      payload.approvedInitialPayment = amount;
      payload.paymentDueDate = window.prompt('Payment due date (YYYY-MM-DD), or leave blank:') || '';
    }
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/admin/enrollment-decisions',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const result = await response.json();
      if (!response.ok || !result.saved) throw new Error(result.error || 'Admissions action could not be saved.');
      onUpdated?.();
      setMessage(action==='accept'?'Admission approved. Secure password setup instructions have been sent.':action==='defer-payment'||action==='reduced-deposit'?'Special payment exception saved and audited.':'Admissions decision saved and applicant notified.');
    } catch (cause) { setMessage(cause instanceof Error?cause.message:'Admissions action failed.'); }
    finally { setBusy(false); }
  };

  const letter = async (letterType:string) => {
    if (!id) return;
    const printWindow = window.open('about:blank','_blank');
    if (!printWindow) { setMessage('Allow pop-ups for Navstar to open and print official letters.'); return; }
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/admin/enrollment-letters',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({enrollmentId:id,letterType})});
      const result = await response.json();
      if (!response.ok || !result.body) throw new Error(result.error || 'Letter could not be generated.');
      const entities:Record<string,string> = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'};
      const escapeHtml = (value:string) => value.replace(/[&<>"]/g, char => entities[char] || char);
      const html = '<!doctype html><html><head><meta charset="utf-8"><title>'+escapeHtml(String(result.subject||'Navstar letter'))+'</title><style>body{font-family:Arial,sans-serif;color:#10213b;margin:42px;line-height:1.6}header{border-bottom:5px solid #0d3970;padding-bottom:18px;margin-bottom:28px}h1{font-size:22px;margin:0;color:#0b2345}small{letter-spacing:3px;color:#b8860b;font-weight:bold}pre{font-family:Arial,sans-serif;white-space:pre-wrap;font-size:14px;line-height:1.7}footer{margin-top:38px;border-top:1px solid #cbd5e1;padding-top:12px;color:#64748b;font-size:11px}@media print{body{margin:18mm}}</style></head><body><header><small>HOME OF TECHNOCRATS</small><h1>NAVSTAR DIGITAL HUB</h1></header><pre>'+escapeHtml(String(result.body))+'</pre><footer>NAVSTAR DIGITAL HUB · HOME OF TECHNOCRATS</footer></body></html>';
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      onUpdated?.();
      window.setTimeout(()=>printWindow.print(),500);
      setMessage('Letter generated and saved. Use the print dialog to save it as PDF.');
    } catch (cause) { printWindow.close(); setMessage(cause instanceof Error?cause.message:'Letter generation failed.'); }
    finally { setBusy(false); }
  };

  return <div className="min-w-[250px] space-y-2">
    <div className="flex flex-wrap gap-1.5">
      <button type="button" disabled={busy} onClick={()=>void decide('accept')} className="rounded bg-emerald-700 px-2 py-1 text-xs font-bold text-white disabled:opacity-50">Accept</button>
      <button type="button" disabled={busy} onClick={()=>void decide('reject')} className="rounded bg-rose-700 px-2 py-1 text-xs font-bold text-white disabled:opacity-50">Reject</button>
      <button type="button" disabled={busy} onClick={()=>void decide('defer-payment')} className="rounded bg-amber-600 px-2 py-1 text-xs font-bold text-white disabled:opacity-50">Defer fee</button>
      <button type="button" disabled={busy} onClick={()=>void decide('reduced-deposit')} className="rounded bg-blue-700 px-2 py-1 text-xs font-bold text-white disabled:opacity-50">Reduced deposit</button>
      <button type="button" disabled={busy} onClick={()=>void decide('withdraw')} className="rounded border px-2 py-1 text-xs font-bold text-slate-700 disabled:opacity-50">Withdraw</button>
    </div>
    <div className="flex flex-wrap gap-1.5">
      <button type="button" disabled={busy} onClick={()=>void letter('admission')} className="rounded border border-blue-200 px-2 py-1 text-xs font-bold text-blue-800 disabled:opacity-50">Admission letter</button>
      {String(enrollment.status)==='accepted'&&<button type="button" disabled={busy} onClick={()=>void letter('acceptance')} className="rounded border border-emerald-200 px-2 py-1 text-xs font-bold text-emerald-800 disabled:opacity-50">Acceptance letter</button>}
      {String(enrollment.status)==='rejected'&&<button type="button" disabled={busy} onClick={()=>void letter('rejection')} className="rounded border border-rose-200 px-2 py-1 text-xs font-bold text-rose-800 disabled:opacity-50">Rejection letter</button>}
      {String(enrollment.status)==='withdrawn'&&<button type="button" disabled={busy} onClick={()=>void letter('withdrawal')} className="rounded border px-2 py-1 text-xs font-bold text-slate-700 disabled:opacity-50">Withdrawal letter</button>}
    </div>
    {busy&&<p className="text-xs text-blue-700">Processing…</p>}
    {message&&<p role="status" className="text-xs leading-5 text-slate-700">{message}</p>}
  </div>;
}
