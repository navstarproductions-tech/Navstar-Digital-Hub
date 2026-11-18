import { FormEvent, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Download, HeartHandshake, LoaderCircle, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatEATDateTime } from '@/lib/datetime';
import { downloadNavstarReceipt } from '@/lib/receipt-pdf';
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

export function DonationPopup({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [amount, setAmount] = useState(500);
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<DonationReceipt | null>(null);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!receipt) return;
    setFading(false);
    const fadeTimer = window.setTimeout(() => setFading(true), 28000);
    const closeTimer = window.setTimeout(onClose, 29000);
    return () => { window.clearTimeout(fadeTimer); window.clearTimeout(closeTimer); };
  }, [receipt, onClose]);

  useEffect(() => {
    if (!open) { setReceipt(null); setMessage(''); setFading(false); }
  }, [open]);

  const donate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedPhone = phone.replace(/[\s-]/g, '');
    if (!/^(?:\+?254|0)?[17]\d{8}$/.test(normalizedPhone)) { setMessage('Please enter a valid Kenyan M-Pesa number.'); return; }
    if (!Number.isInteger(amount) || amount < 1 || amount > 150000) { setMessage('Enter an amount between KSh 1 and KSh 150,000.'); return; }
    setLoading(true); setMessage('Registering your donation securely…'); setReceipt(null);
    try {
      const donationResponse = await fetch('/api/donations', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ phone: normalizedPhone, amount }) });
      const donation = await apiJson<ApiResult>(donationResponse, 'Donation service');
      if (!donationResponse.ok || !donation.id) throw new Error(donation.error || 'Your donation could not be registered.');
      setMessage('Donation reference ' + (donation.reference || donation.id) + ' created. Preparing your M-Pesa prompt…');
      const pushResponse = await fetch('/api/payments/stk-push', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ phone: normalizedPhone, amount, purpose: 'donation', reference: donation.id }) });
      const payment = await apiJson<ApiResult>(pushResponse, 'M-Pesa service');
      if (!pushResponse.ok || !payment.id) throw new Error(payment.error || 'The M-Pesa prompt could not be started.');
      setMessage('Processing… Please check your phone and enter your M-Pesa PIN on the official Safaricom prompt.');
      for (let attempt = 0; attempt < 36; attempt += 1) {
        await new Promise(resolve => window.setTimeout(resolve, 5000));
        const statusResponse = await fetch('/api/payments/stk-push?reference=' + encodeURIComponent(payment.id), { headers: { Accept: 'application/json' } });
        if (!statusResponse.ok) continue;
        const statusData = await apiJson<PaymentStatus>(statusResponse, 'Payment status');
        const current = statusData.payment;
        if (current?.status === 'paid' && current.receipt_number) {
          setReceipt({
            reference: current.reference || payment.reference || donation.reference || donation.id,
            navstarReceipt: current.internal_receipt_number || current.reference || payment.reference || donation.reference || donation.id,
            mpesaCode: current.receipt_number,
            amount: Number(current.amount || amount),
            phone: current.callback_phone || normalizedPhone,
            date: current.transaction_date || new Date().toISOString(),
          });
          setMessage('Received. Your donation has been confirmed by Safaricom.');
          return;
        }
        if (current?.status === 'failed') throw new Error(current.result_description || 'M-Pesa did not complete this payment. You may try again.');
      }
      setMessage('Your payment is still awaiting Safaricom confirmation. Please keep reference ' + (payment.reference || donation.reference || donation.id) + ' and check again shortly.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'We could not complete the donation. Please try again.');
    } finally { setLoading(false); }
  };

  const downloadDocuments = () => {
    if (!receipt) return;
    downloadNavstarReceipt({title:'DONATION RECEIPT',serial:receipt.navstarReceipt,reference:receipt.reference,payer:'Valued Supporter',phone:receipt.phone,amount:receipt.amount,description:'Confirmed donation',method:'Safaricom M-Pesa',mpesaCode:receipt.mpesaCode,receivedAt:formatEATDateTime(receipt.date),status:'SAFARICOM CONFIRMED'});
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
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="donation-popup-amount">Amount (KSh)</Label><Input id="donation-popup-amount" className="!h-12 !w-full !border-2 !border-slate-400 !bg-white !px-4 !text-base !font-bold !text-slate-950 placeholder:!text-slate-500 shadow-sm focus-visible:!border-blue-700 focus-visible:!bg-white focus-visible:!text-slate-950 focus-visible:!ring-2 focus-visible:!ring-blue-200" type="number" min="1" max="150000" value={amount} onChange={event => setAmount(event.target.value === "" ? 0 : Number(event.target.value))} required/></div><div className="space-y-2"><Label htmlFor="donation-popup-phone">M-Pesa phone number</Label><Input id="donation-popup-phone" className="!h-12 !w-full !border-2 !border-slate-400 !bg-white !px-4 !text-base !font-bold !text-slate-950 placeholder:!font-normal placeholder:!text-slate-500 shadow-sm focus-visible:!border-blue-700 focus-visible:!bg-white focus-visible:!text-slate-950 focus-visible:!ring-2 focus-visible:!ring-blue-200" autoComplete="tel" inputMode="tel" placeholder="07xx xxx xxx" value={phone} onChange={event => setPhone(event.target.value)} required/></div></div>
          <Button type="submit" disabled={loading || amount < 1} className="h-12 w-full rounded-xl bg-blue-800 text-base font-extrabold text-white hover:bg-blue-950">{loading ? <><LoaderCircle className="mr-2 h-5 w-5 animate-spin"/>Processing donation…</> : 'Donate KSh '+amount.toLocaleString()+' with M-Pesa'}</Button>
          {message && <div role="status" aria-live="polite" className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-950">{loading && <LoaderCircle className="mt-1 h-4 w-4 shrink-0 animate-spin"/>}<span>{message}</span></div>}
          <p className="flex items-start gap-2 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-700"/>Your donation is marked received only after Safaricom confirms it. Enter your PIN only on the official M-Pesa prompt on your phone.</p>
        </form> : <div className="p-6 sm:p-8">
          <div className="text-center"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-700"><CheckCircle2 className="h-9 w-9"/></span><p className="mt-4 text-xs font-black tracking-[.2em] text-green-700">PAYMENT CONFIRMED</p><h3 className="mt-2 text-2xl font-black text-blue-950">Donation received. Thank you!</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600">Safaricom has confirmed your contribution. Your generosity helps make digital opportunity more accessible.</p></div>
          <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-4"><div className="flex items-center justify-between gap-3"><span className="text-sm font-bold text-green-900">Amount received</span><strong className="text-xl font-black text-green-900">{money(receipt.amount)}</strong></div><dl className="mt-3 grid grid-cols-2 gap-2 border-t border-green-200 pt-3 text-xs"><dt className="text-slate-600">Donation reference</dt><dd className="text-right font-bold text-slate-900">{receipt.reference}</dd><dt className="text-slate-600">Navstar receipt</dt><dd className="text-right font-bold text-slate-900">{receipt.navstarReceipt}</dd><dt className="text-slate-600">M-Pesa transaction code</dt><dd className="text-right font-bold tracking-wide text-slate-900">{receipt.mpesaCode}</dd><dt className="text-slate-600">Phone</dt><dd className="text-right font-semibold text-slate-900">{receipt.phone}</dd><dt className="text-slate-600">Date received</dt><dd className="text-right font-semibold text-slate-900">{formatEATDateTime(receipt.date)}</dd><dt className="text-slate-600">Status</dt><dd className="text-right font-black text-green-800">RECEIVED</dd></dl></div>
          <blockquote className="mt-5 rounded-xl border-l-4 border-amber-400 bg-amber-50 p-4 text-center text-sm italic leading-6 text-amber-950">“No act of kindness, no matter how small, is ever wasted.”</blockquote>
          <Button onClick={downloadDocuments} className="mt-5 h-12 w-full rounded-xl bg-blue-900 font-bold hover:bg-blue-950"><Download className="mr-2 h-4 w-4"/>Download official PDF receipt</Button>
          <p className="mt-3 text-center text-xs text-slate-500">Your official Navstar receipt downloads directly as a clear, selectable-text PDF.</p>
          <button type="button" onClick={onClose} className="mt-3 w-full rounded-xl border border-green-300 px-4 py-3 text-sm font-bold text-green-900 hover:bg-green-50">Close</button>
        </div>}
      </motion.section>
      <style>{'@media print { @page { size: A4; margin: 16mm; } body * { visibility: hidden !important; } .donation-print, .donation-print * { visibility: visible !important; } .donation-print { display: block !important; position: absolute; inset: 0; width: 100%; } .donation-print .break-before-page { break-before: page; page-break-before: always; } }'}</style>
    </motion.div>}
  </AnimatePresence>;
}
