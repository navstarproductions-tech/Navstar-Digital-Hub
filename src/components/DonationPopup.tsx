import { FormEvent, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Download, HeartHandshake, LoaderCircle, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const amounts = [200, 500, 1000, 2500];
type ApiResult = { id?: string; reference?: string; error?: string; message?: string };
type PaymentStatus = { payment?: { status?: string; receipt_number?: string; internal_receipt_number?: string; result_description?: string; amount?: number; callback_phone?: string; transaction_date?: string; reference?: string } };
type DonationReceipt = { reference: string; navstarReceipt: string; mpesaCode: string; amount: number; phone: string; date: string };

async function apiJson<T>(response: Response, label: string): Promise<T> {
  const type = response.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new Error(label + ' returned an unexpected response. Please contact Navstar support.');
  return await response.json() as T;
}

function pdfEscape(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, ' ').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}
function createDonationPdf(receipt: DonationReceipt, money: (value: number) => string): Blob {
  const date = new Date(receipt.date).toLocaleString('en-KE');
  const dateOnly = new Date(receipt.date).toLocaleDateString('en-KE');
  const pages = [
    [
      'NAVSTAR DIGITAL HUB', 'HOME OF TECHNOCRATS', 'OFFICIAL DONATION RECEIPT', '',
      'PAYMENT STATUS: RECEIVED - SAFARICOM CONFIRMED', '',
      'DONOR / CONTRIBUTOR', 'Valued Supporter', 'M-Pesa phone: ' + receipt.phone, '',
      'DONATION INFORMATION', 'Donation reference: ' + receipt.reference,
      'Navstar receipt number: ' + receipt.navstarReceipt,
      'M-Pesa transaction code: ' + receipt.mpesaCode,
      'Payment method: Safaricom M-Pesa', 'Date and time received: ' + date, '',
      'AMOUNT RECEIVED', money(receipt.amount), '',
      'This document confirms that the contribution above was received',
      'after payment confirmation from Safaricom M-Pesa.', '',
      'Thank you for supporting digital learning and community access.',
      'NAVSTAR DIGITAL HUB | HOME OF TECHNOCRATS',
      'navstardigitalhub@gmail.com', '+254 797 688 576  |  +254 706 637 485'
    ],
    [
      'NAVSTAR DIGITAL HUB', 'HOME OF TECHNOCRATS', 'LETTER OF APPRECIATION', '',
      'Date: ' + dateOnly, '', 'Dear Valued Supporter,', '',
      'On behalf of Navstar Digital Hub, we sincerely thank you for your',
      'generous contribution of ' + money(receipt.amount) + ', received on ' + dateOnly + '.',
      'Your donation reference is ' + receipt.reference + '.', '',
      'Your support strengthens our mission to widen access to digital',
      'knowledge and practical technology. Contributions help us work',
      'towards learning resources, supervised computer access, skills',
      'development, innovation activities and digital assistance for',
      'people who need an opportunity to learn, create and participate',
      'in the digital world.', '',
      'We value every contribution, regardless of its size. Your kindness',
      'encourages us to keep building a community where technology is a',
      'tool for opportunity, creativity and positive change. We undertake',
      'to handle support responsibly and direct it towards the stated',
      'community and learning objectives of Navstar Digital Hub.', '',
      'Please keep this letter and the attached receipt as your record of',
      'appreciation and payment confirmation. We are grateful that you',
      'chose to be part of this journey.', '', 'With sincere gratitude,',
      '', 'MANAGEMENT', 'NAVSTAR DIGITAL HUB', 'HOME OF TECHNOCRATS', '',
      'Email: navstardigitalhub@gmail.com',
      'Tel: +254 797 688 576 / +254 706 637 485', '',
      '"No act of kindness, no matter how small, is ever wasted."'
    ]
  ];
  const enc = new TextEncoder();
  const streams = pages.map((lines, pageIndex) => {
    let s = '0.035 0.16 0.34 rg 0 760 595 82 re f\n';
    s += '1 1 1 rg BT /F2 19 Tf 48 808 Td (' + pdfEscape(lines[0]) + ') Tj ET\n';
    s += '0.98 0.76 0.24 rg BT /F2 9 Tf 48 790 Td (' + pdfEscape(lines[1]) + ') Tj ET\n';
    s += '0.08 0.22 0.42 rg BT /F2 17 Tf 48 720 Td (' + pdfEscape(lines[2]) + ') Tj ET\n';
    let y = 687;
    for (const line of lines.slice(3)) {
      if (!line) { y -= 10; continue; }
      const heading = ['PAYMENT STATUS: RECEIVED - SAFARICOM CONFIRMED','DONOR / CONTRIBUTOR','DONATION INFORMATION','AMOUNT RECEIVED'].includes(line);
      if (heading) s += '0.02 0.43 0.34 rg BT /F2 10 Tf 48 ' + y + ' Td (' + pdfEscape(line) + ') Tj ET\n';
      else if (pageIndex === 0 && line === money(receipt.amount)) s += '0.02 0.43 0.34 rg BT /F2 22 Tf 48 ' + y + ' Td (' + pdfEscape(line) + ') Tj ET\n';
      else s += '0.12 0.16 0.22 rg BT /F1 10 Tf 48 ' + y + ' Td (' + pdfEscape(line) + ') Tj ET\n';
      y -= 18;
    }
    s += '0.08 0.22 0.42 RG 1.2 w 48 42 m 547 42 l S\n';
    s += '0.35 0.39 0.44 rg BT /F1 8 Tf 48 27 Td (Navstar Digital Hub | Official donor document | Page ' + (pageIndex + 1) + ' of 2) Tj ET\n';
    return s;
  });
  const objects: string[] = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = '<< /Type /Pages /Kids [5 0 R 7 0 R] /Count 2 >>';
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
  for (let i = 0; i < 2; i++) {
    const pageObj = 5 + i * 2, contentObj = pageObj + 1, stream = streams[i];
    objects[pageObj] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + contentObj + ' 0 R >>';
    objects[contentObj] = '<< /Length ' + enc.encode(stream).length + ' >>\nstream\n' + stream + 'endstream';
  }
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = enc.encode(pdf).length;
    pdf += i + ' 0 obj\n' + objects[i] + '\nendobj\n';
  }
  const xref = enc.encode(pdf).length;
  pdf += 'xref\n0 ' + objects.length + '\n0000000000 65535 f \n';
  for (let i = 1; i < objects.length; i++) pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  pdf += 'trailer\n<< /Size ' + objects.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
  return new Blob([enc.encode(pdf)], { type: 'application/pdf' });
}

export function DonationPopup({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [amount, setAmount] = useState(500);
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<DonationReceipt | null>(null);
  const [fading, setFading] = useState(false);
  const [pendingPayment, setPendingPayment] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const paymentCheckId = useRef(0);

  useEffect(() => {
    if (!receipt) return;
    setFading(false);
    const fadeTimer = window.setTimeout(() => setFading(true), 28000);
    const closeTimer = window.setTimeout(onClose, 29000);
    return () => { window.clearTimeout(fadeTimer); window.clearTimeout(closeTimer); };
  }, [receipt, onClose]);

  useEffect(() => {
    if (!open) { paymentCheckId.current++; setReceipt(null); setMessage(''); setFading(false); setPendingPayment(false); setProcessingStage(''); }
  }, [open]);

  const donate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedPhone = phone.replace(/[\s-]/g, '');
    if (!/^(?:\+?254|0)?[17]\d{8}$/.test(normalizedPhone)) { setMessage('Please enter a valid Kenyan M-Pesa number.'); return; }
    if (!Number.isInteger(amount) || amount < 1 || amount > 150000) { setMessage('Enter an amount between KSh 1 and KSh 150,000.'); return; }
    const checkId = ++paymentCheckId.current;
    setPendingPayment(false); setProcessingStage('Registering donation…');
    setLoading(true); setMessage('Registering your donation securely…'); setReceipt(null);
    try {
      const donationResponse = await fetch('/api/donations', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ phone: normalizedPhone, amount }) });
      const donation = await apiJson<ApiResult>(donationResponse, 'Donation service');
      if (!donationResponse.ok || !donation.id) throw new Error(donation.error || 'Your donation could not be registered.');
      setProcessingStage('Sending M-Pesa prompt…');
      setMessage('Donation reference ' + (donation.reference || donation.id) + ' created. Preparing your M-Pesa prompt…');
      const pushResponse = await fetch('/api/payments/stk-push', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ phone: normalizedPhone, amount, purpose: 'donation', reference: donation.id }) });
      const payment = await apiJson<ApiResult>(pushResponse, 'M-Pesa service');
      if (!pushResponse.ok || !payment.id) throw new Error(payment.error || 'The M-Pesa prompt could not be started.');
      setPendingPayment(true); setProcessingStage('Waiting for M-Pesa confirmation…');
      setMessage('M-Pesa prompt sent. Check your phone and enter your PIN only on the official Safaricom prompt. Donation reference: ' + (donation.reference || donation.id) + '.');
      setLoading(false);
      void (async () => {
      for (let attempt = 0; attempt < 36; attempt += 1) {
        await new Promise(resolve => window.setTimeout(resolve, 5000));
        if (paymentCheckId.current !== checkId) return;
        try {
        const statusResponse = await fetch('/api/payments/stk-push?reference=' + encodeURIComponent(payment.id!), { headers: { Accept: 'application/json' } });
        if (!statusResponse.ok) continue;
        if (paymentCheckId.current !== checkId) return;
        const statusData = await apiJson<PaymentStatus>(statusResponse, 'Payment status');
        const current = statusData.payment;
        if (current?.status === 'paid' && current.receipt_number) {
          if (paymentCheckId.current !== checkId) return;
          setPendingPayment(false); setProcessingStage('');
          setReceipt({ reference: current.reference || payment.reference || donation.reference || donation.id, navstarReceipt: current.internal_receipt_number || current.reference || payment.reference || donation.reference || donation.id, mpesaCode: current.receipt_number, amount: Number(current.amount || amount), phone: current.callback_phone || normalizedPhone, date: current.transaction_date || new Date().toISOString() });
          setMessage('Received. Your donation has been confirmed by Safaricom.');
          return;
        }
        if (current?.status === 'failed') { if (paymentCheckId.current !== checkId) return; setPendingPayment(false); setProcessingStage(''); setMessage(current.result_description || 'M-Pesa did not complete this payment. You may try again.'); return; }
        } catch { /* Retry while the payment service is temporarily unavailable. */ }
      }
      if (paymentCheckId.current === checkId) setMessage('Your payment is still awaiting Safaricom confirmation. Please keep reference ' + (payment.reference || donation.reference || donation.id) + ' and check again shortly.');
      })();
    } catch (error) {
      setPendingPayment(false); setProcessingStage('');
      setMessage(error instanceof Error ? error.message : 'We could not complete the donation. Please try again.');
    } finally { setLoading(false); }
  };

  const downloadDocuments = () => {
    if (!receipt) return;
    const file = createDonationPdf(receipt, money);
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Navstar-Donation-Receipt-' + receipt.navstarReceipt.replace(/[^a-zA-Z0-9-]/g, '-') + '.pdf';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  };
  const money = (value: number) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(value);

  return <AnimatePresence>
    {open && <motion.div className="donation-overlay fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-blue-950/75 p-3 backdrop-blur-sm sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: fading ? 0 : 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.8 }} onMouseDown={event => { if (event.target === event.currentTarget && !loading) onClose(); }}>
      <motion.section role="dialog" aria-modal="true" aria-labelledby="donation-title" className="donation-screen relative my-auto w-full max-w-xl overflow-hidden rounded-3xl border border-green-300/50 bg-white shadow-2xl" initial={{ y: 24, scale: .97 }} animate={{ y: 0, scale: fading ? .98 : 1 }} exit={{ y: 18, opacity: 0 }} transition={{ duration: .35 }}>
        <div className="relative overflow-hidden bg-gradient-to-br from-blue-950 via-blue-800 to-green-800 px-6 py-7 text-white sm:px-8">
          <div className="absolute -right-12 -top-16 h-44 w-44 rounded-full bg-amber-300/15 blur-2xl"/>
          <button type="button" onClick={onClose} disabled={loading} aria-label="Close donation window" className="absolute right-4 top-4 rounded-full border border-white/20 bg-white/10 p-2 text-white hover:bg-white/20 disabled:opacity-40"><X className="h-4 w-4"/></button>
          <div className="flex items-center gap-3"><span className="rounded-2xl border border-amber-300/40 bg-amber-300/15 p-3 text-amber-200"><HeartHandshake className="h-7 w-7"/></span><div><p className="text-[10px] font-black tracking-[.25em] text-amber-200">HOME OF TECHNOCRATS</p><h2 id="donation-title" className="mt-1 text-2xl font-black sm:text-3xl">Support Navstar</h2></div></div>
          <p className="mt-4 max-w-md text-sm leading-6 text-blue-100">Your generosity helps widen access to digital skills, learning resources and practical technology support in our community.</p>
        </div>
        {!receipt ? <form onSubmit={donate} className="space-y-5 p-6 sm:p-8">
          <div><p className="text-sm font-bold text-slate-900">Choose your contribution</p><div className="mt-3 grid grid-cols-4 gap-2">{amounts.map(value => <button key={value} type="button" onClick={() => setAmount(value)} aria-pressed={amount === value} className={'rounded-xl border px-2 py-3 text-sm font-extrabold transition '+(amount === value ? 'border-amber-400 bg-amber-50 text-blue-950 ring-2 ring-amber-300' : 'border-slate-200 text-slate-700 hover:border-green-400')}>{value.toLocaleString()}</button>)}</div></div>
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="donation-popup-amount">Amount (KSh)</Label><Input id="donation-popup-amount" type="number" min="1" max="150000" value={amount} onChange={event => setAmount(Number(event.target.value))} required/></div><div className="space-y-2"><Label htmlFor="donation-popup-phone">M-Pesa phone number</Label><Input id="donation-popup-phone" autoComplete="tel" inputMode="tel" placeholder="07xx xxx xxx" value={phone} onChange={event => setPhone(event.target.value)} required/></div></div>
          <Button type="submit" disabled={loading || amount < 1} className="h-12 w-full rounded-xl bg-blue-800 text-base font-extrabold text-white hover:bg-blue-950">{loading ? <><LoaderCircle className="mr-2 h-5 w-5 animate-spin"/>Processing donation…</> : 'Donate KSh '+amount.toLocaleString()+' with M-Pesa'}</Button>
          {(loading || pendingPayment) && <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4"><LoaderCircle className="h-7 w-7 shrink-0 animate-spin text-blue-700"/><div><p className="text-xs font-extrabold text-blue-900">{loading ? 'PLEASE WAIT' : 'DONATION PAYMENT PROCESSING'}</p><p className="text-xs text-blue-800">{processingStage || 'Waiting for Safaricom confirmation…'}</p></div></div>}
          {message && <div role="status" aria-live="polite" className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-950">{message}</div>}
          {pendingPayment && <button type="button" onClick={() => { paymentCheckId.current++; setPendingPayment(false); setProcessingStage(''); setMessage('Pending donation status cleared from this screen. Any M-Pesa prompt already sent may still arrive or complete. You can make another donation.'); }} className="w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-900 hover:bg-amber-100">Clear pending status &amp; make another donation</button>}
          <p className="flex items-start gap-2 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-700"/>Your donation is marked received only after Safaricom confirms it. Enter your PIN only on the official M-Pesa prompt on your phone.</p>
        </form> : <div className="p-6 sm:p-8">
          <div className="text-center"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-700"><CheckCircle2 className="h-9 w-9"/></span><p className="mt-4 text-xs font-black tracking-[.2em] text-green-700">PAYMENT CONFIRMED</p><h3 className="mt-2 text-2xl font-black text-blue-950">Donation received. Thank you!</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600">Safaricom has confirmed your contribution. Your generosity helps make digital opportunity more accessible.</p></div>
          <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-4"><div className="flex items-center justify-between gap-3"><span className="text-sm font-bold text-green-900">Amount received</span><strong className="text-xl font-black text-green-900">{money(receipt.amount)}</strong></div><dl className="mt-3 grid grid-cols-2 gap-2 border-t border-green-200 pt-3 text-xs"><dt className="text-slate-600">Donation reference</dt><dd className="text-right font-bold text-slate-900">{receipt.reference}</dd><dt className="text-slate-600">Navstar receipt</dt><dd className="text-right font-bold text-slate-900">{receipt.navstarReceipt}</dd><dt className="text-slate-600">M-Pesa transaction code</dt><dd className="text-right font-bold tracking-wide text-slate-900">{receipt.mpesaCode}</dd><dt className="text-slate-600">Phone</dt><dd className="text-right font-semibold text-slate-900">{receipt.phone}</dd><dt className="text-slate-600">Date received</dt><dd className="text-right font-semibold text-slate-900">{new Date(receipt.date).toLocaleString('en-KE')}</dd><dt className="text-slate-600">Status</dt><dd className="text-right font-black text-green-800">RECEIVED</dd></dl></div>
          <blockquote className="mt-5 rounded-xl border-l-4 border-amber-400 bg-amber-50 p-4 text-center text-sm italic leading-6 text-amber-950">“No act of kindness, no matter how small, is ever wasted.”</blockquote>
          <Button onClick={downloadDocuments} className="mt-5 h-12 w-full rounded-xl bg-blue-900 font-bold hover:bg-blue-950"><Download className="mr-2 h-4 w-4"/>Download PDF receipt & thank-you letter</Button>
          <p className="mt-3 text-center text-xs text-slate-500">A two-page PDF downloads directly to this phone or device. Page 1 shows the confirmed payment details; page 2 contains your formal thank-you letter.</p>
          <button type="button" onClick={onClose} className="mt-3 w-full rounded-xl border border-green-300 px-4 py-3 text-sm font-bold text-green-900 hover:bg-green-50">Close</button>
        </div>}
      </motion.section>
      <style>{'@media print { @page { size: A4; margin: 16mm; } body * { visibility: hidden !important; } .donation-print, .donation-print * { visibility: visible !important; } .donation-print { display: block !important; position: absolute; inset: 0; width: 100%; } .donation-print .break-before-page { break-before: page; page-break-before: always; } }'}</style>
    </motion.div>}
  </AnimatePresence>;
}
