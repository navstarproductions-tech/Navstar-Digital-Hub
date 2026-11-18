import { FormEvent, useState } from 'react';
import { Check, HeartHandshake, ShieldCheck, Sparkles, X, XCircle, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatEATDateTime } from '@/lib/datetime';
import { downloadReceiptHtmlPdf } from '@/lib/receipt-pdf';

const amounts = [1, 10, 20, 30, 40, 50, 100, 200, 500, 1000];

type DonationResponse = { id?: string; reference?: string; error?: string };
type PaymentResponse = { id?: string; reference?: string; message?: string; error?: string };
type PaymentStatus = { payment?: { status?: string; receipt_number?: string; internal_receipt_number?: string; result_description?: string; amount?: number; callback_phone?: string; transaction_date?: string; display_reference?: string } };
type Receipt = { reference: string; serial: string; code: string; amount: number; phone: string; date?: string };

async function readApiResponse<T>(response: Response, serviceName: string): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    const responseText = await response.text();
    const isHtml = responseText.trimStart().startsWith('<!DOCTYPE') || responseText.trimStart().startsWith('<html');
    throw new Error(`${serviceName} returned ${isHtml ? 'an HTML page' : 'an unexpected response'} instead of JSON (HTTP ${response.status}). Please contact the website administrator.`);
  }
  try { return await response.json() as T; }
  catch { throw new Error(`${serviceName} returned an invalid JSON response (HTTP ${response.status}).`); }
}

function printDonationPageReceipt(receipt: Receipt, money: (value: number) => string) {
  const escape = (value: string) => value.replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character] || character));
  const serial=escape(receipt.serial), code=escape(receipt.code), ref=escape(receipt.reference), phone=escape(receipt.phone), amount=escape(money(receipt.amount));
  const received=escape(formatEATDateTime(receipt.date || new Date().toISOString()));
  const generated=escape(formatEATDateTime(new Date().toISOString()));
  const qr='https://api.qrserver.com/v1/create-qr-code/?size=190x190&margin=8&data='+encodeURIComponent(['NAVSTAR DIGITAL HUB','DONATION RECEIPT','Serial: '+receipt.serial,'M-Pesa: '+receipt.code,'Amount: KES '+receipt.amount,'Status: PAID'].join(' | '));
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Navstar-Donation-Receipt-${serial}</title><style>
  *{box-sizing:border-box}body{margin:0;padding:25px;background:#eef3fa;font-family:Arial,sans-serif;color:#152a43;-webkit-print-color-adjust:exact;print-color-adjust:exact}.paper{max-width:780px;margin:auto;background:white;box-shadow:0 10px 35px #10294b22}.head{display:flex;justify-content:space-between;gap:20px;align-items:center;padding:25px;background:linear-gradient(120deg,#061b3b,#0b4387 65%,#087b83);border-bottom:5px solid #e5b84b;color:white}.brand{display:flex;gap:15px;align-items:center}.logo{width:100px;height:80px;background:white;border-radius:10px;padding:6px;object-fit:contain}.head h1{font-size:20px;margin:0}.motto{font-size:10px;color:#ffdf83;font-weight:bold;letter-spacing:3px;margin:7px 0}.contacts{font-size:10px;line-height:1.7;color:#e5efff}.serial{text-align:right;color:#b91c1c;background:#fff1f2;border:2px solid #fecaca;padding:8px;border-radius:8px;font-weight:900;font-size:14px}.gen{font-size:10px;color:#e0edff;margin-top:9px}.body{padding:28px}.status{background:#dcfce7;color:#166534;padding:8px 12px;border-radius:30px;font-weight:bold;font-size:10px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-top:22px}.box{border:1px solid #dbe5ef;border-radius:12px;padding:16px;font-size:12px;line-height:1.7}.label{font-size:10px;letter-spacing:2px;color:#60758e;font-weight:bold}.amount{margin-top:22px;padding:22px;background:linear-gradient(100deg,#eaf3ff,#e9fbf5);border:1px solid #b9d7f5;border-radius:14px;display:flex;justify-content:space-between;align-items:center}.amount strong{font-size:30px;color:#075b49}.qr{display:flex;justify-content:space-between;align-items:center;border-top:1px solid #dbe5ef;margin-top:22px;padding-top:18px;font-size:11px;line-height:1.7;color:#536a83}.qr img{width:115px;height:115px}.foot{border-top:2px solid #0b4387;margin-top:20px;padding-top:14px;font-size:10px;color:#60758e;display:flex;justify-content:space-between}@page{size:A4;margin:12mm}@media print{body{padding:0;background:white}.paper{box-shadow:none}}@media(max-width:620px){.head{display:block}.serial{display:inline-block;margin-top:12px}.grid{grid-template-columns:1fr}.amount{display:block}.amount strong{display:block;margin-top:10px}}
  </style></head><body><main class="paper"><header class="head"><div class="brand"><img class="logo" src="/Navstar_Official_Logo.jpg" alt="Navstar logo"><div><h1>NAVSTAR DIGITAL HUB</h1><p class="motto">HOME OF TECHNOCRATS</p><div class="contacts">0797 688 576 · 0706 637 485<br>navstardigitalhub@gmail.com · P.O. Box 546-50200, Bungoma, Kenya</div></div></div><div><div class="serial">SERIAL: ${serial}</div><p class="gen">Generated: ${generated}</p></div></header><div class="body"><span class="status">✓ PAYMENT RECEIVED · SAFARICOM CONFIRMED</span><div class="grid"><div class="box"><div class="label">RECEIVED FROM</div><strong>Valued Supporter</strong><br>M-Pesa phone: ${phone}</div><div class="box"><div class="label">PAYMENT DETAILS</div>Safaricom M-Pesa<br>Received: ${received}<br>Donation reference: ${ref}<br>M-Pesa code: <strong>${code}</strong></div></div><div class="amount"><div><div class="label">AMOUNT RECEIVED</div><small>Confirmed donation · Kenya Shillings</small></div><strong>${amount}</strong></div><div class="qr"><div><strong>Digital receipt QR code</strong><br>Scan to read the serial, transaction code, amount and confirmed status.<br><strong>NAVSTAR DIGITAL HUB · HOME OF TECHNOCRATS</strong></div><img src="${qr}" alt="Receipt QR code"></div><div class="foot"><div><strong>Thank you for your support.</strong><br>Electronically generated by Navstar Digital Hub.</div><div style="text-align:right">Official receipt · No signature required<br>East Africa Time (EAT)</div></div></div></main></body></html>`;
  void downloadReceiptHtmlPdf(html, `Navstar-Donation-Receipt-${serial}.pdf`);
}


export function DonationsPage() {
  const money = (value: number) => `KSh ${value.toLocaleString('en-KE')}`;
  const [amount, setAmount] = useState(500);
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [paymentStage, setPaymentStage] = useState<'idle' | 'processing' | 'success' | 'error' | 'pending'>('idle');

  const startDonation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedPhone = phone.replace(/[\s-]/g, '');
    if (!/^(?:\+?254|0)?[17]\d{8}$/.test(normalizedPhone)) { setMessage('Enter a valid Kenyan mobile number.'); return; }
    if (!Number.isInteger(amount) || amount < 1 || amount > 150000) { setMessage('Enter a valid donation amount between KSh 1 and KSh 150,000.'); return; }

    setLoading(true);
    setPaymentStage('processing');
    setMessage('Registering donation…');
    setReceipt(null);
    try {
      const donationResponse = await fetch('/api/donations', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ phone: normalizedPhone, amount }),
      });
      const donation = await readApiResponse<DonationResponse>(donationResponse, 'Donation service');
      if (!donationResponse.ok || !donation.id) throw new Error(donation.error || 'Donation could not be registered.');

      setMessage(`Donation registered as ${donation.reference || donation.id}. Preparing your M-Pesa prompt…`);
      const response = await fetch('/api/payments/stk-push', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ phone: normalizedPhone, amount, purpose: 'donation', reference: donation.id }),
      });
      const payment = await readApiResponse<PaymentResponse>(response, 'M-Pesa payment service');
      if (!response.ok || !payment.id) throw new Error(payment.error || 'Payment prompt could not be started.');

      setMessage(`Processing M-Pesa payment for ${payment.reference || donation.reference || donation.id}. ${payment.message || 'Check your phone for the official M-Pesa prompt.'}`);
      for (let attempt = 0; attempt < 24; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 5000));
        const statusResponse = await fetch(`/api/payments/stk-push?reference=${encodeURIComponent(payment.id)}`, { headers: { Accept: 'application/json' } });
        if (!statusResponse.ok) continue;
        const data = await statusResponse.json() as PaymentStatus;
        const current = data.payment;
        if (current?.status === 'paid' && current.receipt_number) {
          setReceipt({ reference: current.display_reference || payment.reference || donation.reference || donation.id, serial: current.internal_receipt_number || current.display_reference || payment.reference || donation.reference || donation.id, code: current.receipt_number, amount: current.amount || amount, phone: current.callback_phone || normalizedPhone, date: current.transaction_date });
          setMessage('Payment confirmed successfully by M-Pesa. Your receipt is shown below.');
          setPaymentStage('success');
          break;
        }
        if (current?.status === 'failed') { setMessage(`Payment not completed: ${current.result_description || 'M-Pesa did not confirm this payment.'} You may try again when ready.`); setPaymentStage('error'); break; }
        if (attempt === 23) { setMessage(`Payment is still awaiting Safaricom confirmation. Keep reference ${payment.reference || donation.reference} and check again shortly.`); setPaymentStage('pending'); }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Payment prompt could not be started. Please try again.');
      setPaymentStage('error');
    } finally { setLoading(false); }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <section className="relative isolate overflow-hidden bg-gradient-to-br from-blue-950 via-blue-900 to-emerald-900 text-white">
        <div className="absolute -right-24 -top-24 -z-10 h-80 w-80 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-20 -z-10 h-96 w-96 rounded-full bg-blue-400/20 blur-3xl" />
        <div className="container mx-auto grid gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1fr_410px] md:items-center md:py-20 lg:px-8">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[.2em] text-amber-200"><Sparkles className="h-4 w-4" /> Welcome to Navstar Digital Hub</p>
            <h1 className="mt-6 text-4xl font-black leading-tight tracking-tight sm:text-5xl">Together, we can make digital opportunity reachable.</h1>
            <p className="mt-5 max-w-xl text-base leading-8 text-blue-100 sm:text-lg">Your kindness helps learners access digital skills, practical computer training and the tools they need to build a brighter future.</p>
            <div className="mt-8 flex items-start gap-3 rounded-2xl border border-white/15 bg-white/10 p-4 text-sm leading-6 text-blue-50 backdrop-blur-sm"><HeartHandshake className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" /><p>Every contribution matters. Thank you for standing with our learning and technology community. <span className="font-bold text-white">HOME OF TECHNOCRATS.</span></p></div>
            <p className="mt-6 text-xs font-semibold uppercase tracking-[.22em] text-emerald-200">Learn • Create • Innovate • Empower</p>
          </div>
          <form onSubmit={startDonation} className="overflow-hidden rounded-3xl border border-white/30 bg-white p-0 text-slate-900 shadow-2xl shadow-black/25">
            <div className="bg-gradient-to-r from-blue-950 via-blue-800 to-emerald-800 px-6 py-5 text-white sm:px-7">
              <div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 bg-white/10"><HeartHandshake className="h-6 w-6 text-amber-300" /></span><div><p className="text-[11px] font-bold uppercase tracking-[.2em] text-emerald-200">Navstar community</p><h2 className="mt-0.5 text-xl font-extrabold">Make a contribution</h2></div></div>
              <p className="mt-3 text-sm leading-6 text-blue-100">Choose a quick amount or enter the amount you wish to give.</p>
            </div>
            <div className="space-y-5 px-6 py-6 sm:px-7 sm:py-7">
              <fieldset>
                <legend className="text-sm font-bold text-slate-800">Choose amount (KSh)</legend>
                <div className="mt-3 grid grid-cols-5 gap-2">
                  {amounts.map((option) => <button key={option} type="button" onClick={() => setAmount(option)} aria-pressed={amount === option} className={(amount === option ? 'border-blue-800 bg-blue-800 text-white shadow-md shadow-blue-900/20' : 'border-slate-300 bg-slate-50 text-slate-800 hover:border-emerald-600 hover:bg-emerald-50') + ' min-h-11 rounded-xl border-2 px-2 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2'}>{option.toLocaleString()}</button>)}
                </div>
              </fieldset>
              <div className="space-y-2">
                <Label htmlFor="donation-amount" className="font-bold text-slate-800">Or enter your own amount (KSh)</Label>
                <Input id="donation-amount" className="!h-13 !border-2 !border-slate-400 !bg-white !px-4 !text-lg !font-bold !text-slate-950 placeholder:!text-slate-500 shadow-sm focus-visible:!border-blue-700 focus-visible:!bg-white focus-visible:!ring-2 focus-visible:!ring-blue-200" type="number" min="1" max="150000" value={amount} onChange={(event) => setAmount(event.target.value === '' ? 0 : Number(event.target.value))} required />
                <p className="text-xs text-slate-500">Minimum KSh 1 • Maximum KSh 150,000</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="donation-phone" className="font-bold text-slate-800">M-Pesa phone number</Label>
                <Input id="donation-phone" className="!h-13 !border-2 !border-slate-400 !bg-white !px-4 !text-lg !font-bold !text-slate-950 placeholder:!font-normal placeholder:!text-slate-500 shadow-sm focus-visible:!border-blue-700 focus-visible:!bg-white focus-visible:!ring-2 focus-visible:!ring-blue-200" autoComplete="tel" inputMode="tel" placeholder="07xx xxx xxx" value={phone} onChange={(event) => setPhone(event.target.value)} required />
              </div>
              <Button className="h-13 w-full rounded-xl bg-gradient-to-r from-blue-800 to-emerald-700 text-base font-extrabold text-white shadow-lg shadow-blue-900/20 transition hover:from-blue-900 hover:to-emerald-800" type="submit" disabled={loading || amount < 1 || amount > 150000}>{loading ? 'Processing M-Pesa payment…' : 'Continue with KSh ' + amount.toLocaleString()}</Button>
              <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /><p>Your payment is recorded as received only after Safaricom confirms it. Enter your PIN only on the official M-Pesa prompt. Navstar will never ask for your PIN.</p></div>
            </div>
          </form>
        </div>
      </section>
      <section className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl rounded-3xl border border-blue-100 bg-white p-6 text-center shadow-sm sm:p-9">
          <p className="text-xs font-extrabold uppercase tracking-[.24em] text-blue-800">Thank you for being part of the journey</p>
          <h2 className="mt-3 text-2xl font-black text-slate-950">Small acts of support can create lasting impact.</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-600">Navstar Digital Hub appreciates every supporter, learner, parent and partner helping us grow access to useful digital knowledge and opportunity.</p>
          <p className="mt-5 text-sm font-extrabold text-emerald-800">NAVSTAR DIGITAL HUB — HOME OF TECHNOCRATS</p>
        </div>
      </section>
      {paymentStage !== 'idle' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="donation-status-title" className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/30 bg-white text-center shadow-2xl">
            <div className={'px-6 pb-7 pt-8 text-white ' + (paymentStage === 'success' ? 'bg-gradient-to-br from-emerald-700 to-emerald-500' : paymentStage === 'error' ? 'bg-gradient-to-br from-rose-800 to-rose-600' : 'bg-gradient-to-br from-blue-950 via-blue-800 to-emerald-800')}>
              {paymentStage === 'success' ? <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-white text-emerald-600 shadow-xl"><Check className="h-14 w-14" strokeWidth={3.5} /></div> : paymentStage === 'error' ? <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 border-white/70 bg-white/10"><XCircle className="h-12 w-12" /></div> : <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 border-white/40 bg-white/10"><LoaderCircle className="h-12 w-12 animate-spin text-amber-300" /></div>}
              <h2 id="donation-status-title" className="mt-5 text-2xl font-black">{paymentStage === 'success' ? 'Donation successful!' : paymentStage === 'error' ? 'Payment not completed' : paymentStage === 'pending' ? 'Confirmation pending' : 'Processing your donation'}</h2>
              <p className="mt-2 text-sm leading-6 text-white/90">{paymentStage === 'success' ? 'Thank you for making a difference. Safaricom has confirmed your M-Pesa payment.' : paymentStage === 'error' ? 'We could not confirm this payment. Please review the message below.' : paymentStage === 'pending' ? 'Your request is still awaiting Safaricom confirmation. Please do not pay again until you check the status.' : 'Please check your phone and enter your PIN only on the official M-Pesa prompt.'}</p>
            </div>
            <div className="space-y-4 p-6">
              {paymentStage === 'success' && receipt ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left text-sm text-emerald-950"><div className="mb-3 flex items-center gap-2 font-extrabold"><ShieldCheck className="h-5 w-5 text-emerald-700" />Payment confirmed and recorded</div><dl className="grid grid-cols-2 gap-2"><dt>Navstar receipt serial</dt><dd className="break-all text-right font-extrabold text-rose-700">{receipt.serial}</dd><dt>Reference</dt><dd className="break-all text-right font-bold">{receipt.reference}</dd><dt>M-Pesa receipt</dt><dd className="text-right font-extrabold tracking-wide">{receipt.code}</dd><dt>Amount</dt><dd className="text-right font-bold">KSh {receipt.amount.toLocaleString()}</dd><dt>Phone</dt><dd className="text-right font-semibold">{receipt.phone}</dd>{receipt.date && <><dt>Date</dt><dd className="text-right">{formatEATDateTime(receipt.date)}</dd></>}</dl></div> : <p className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">{message}</p>}
              {paymentStage === 'success' ? <p className="text-sm leading-6 text-slate-600">Thank you for supporting learners and digital access through <strong>Navstar Digital Hub</strong>. We are glad to have you with us.</p> : null}
              {paymentStage === 'success' && receipt ? <Button type="button" onClick={() => printDonationPageReceipt(receipt, money)} className="h-12 w-full rounded-xl bg-blue-900 font-bold text-white hover:bg-blue-950">Download official PDF receipt</Button> : null}
              <div className="flex flex-col gap-2">
                {paymentStage === 'success' ? <Button type="button" onClick={() => { setPaymentStage('idle'); setMessage(''); setPhone(''); }} className="h-12 w-full rounded-xl bg-emerald-700 font-bold text-white hover:bg-emerald-800">Done</Button> : <Button type="button" onClick={() => setPaymentStage('idle')} variant="outline" className="h-11 w-full rounded-xl border-slate-300 font-semibold text-slate-800">{paymentStage === 'processing' ? 'Continue in background' : 'Close'}</Button>}
                {paymentStage === 'success' && <p className="text-[11px] font-bold uppercase tracking-[.18em] text-emerald-800">Navstar Digital Hub • Home of Technocrats</p>}
              </div>
            </div>
            {paymentStage !== 'processing' && <button type="button" aria-label="Close donation status" onClick={() => setPaymentStage('idle')} className="absolute right-3 top-3 rounded-full bg-white/15 p-2 text-white transition hover:bg-white/25"><X className="h-4 w-4" /></button>}
          </section>
        </div>
      )}
    </main>
  );
}
