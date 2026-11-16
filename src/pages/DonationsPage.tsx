import { FormEvent, useRef, useState } from 'react';
import { HeartHandshake, ShieldCheck, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const amounts = [200, 500, 1000, 2500];

type DonationResponse = { id?: string; reference?: string; error?: string };
type PaymentResponse = { id?: string; reference?: string; message?: string; error?: string };
type Receipt = { reference: string; code: string; amount: number; phone: string; date?: string };

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

export function DonationsPage() {
  const [amount, setAmount] = useState(500);
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [pendingPayment, setPendingPayment] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [donationReference, setDonationReference] = useState('');
  const paymentCheckId = useRef(0);

  const startDonation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedPhone = phone.replace(/[\s-]/g, '');
    if (!/^(?:\+?254|0)?[17]\d{8}$/.test(normalizedPhone)) { setMessage('Enter a valid Kenyan mobile number.'); return; }
    if (!Number.isInteger(amount) || amount < 1 || amount > 150000) { setMessage('Enter a valid donation amount between KSh 1 and KSh 150,000.'); return; }

    const checkId = ++paymentCheckId.current;
    setPendingPayment(false);
    setProcessingStage('Registering donation…');
    setLoading(true);
    setMessage('Registering donation…');
    setReceipt(null);
    try {
      const donationResponse = await fetch('/api/donations', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ phone: normalizedPhone, amount }),
      });
      const donation = await readApiResponse<DonationResponse>(donationResponse, 'Donation service');
      if (!donationResponse.ok || !donation.id) throw new Error(donation.error || 'Donation could not be registered.');

      setDonationReference(donation.reference || donation.id);
      setProcessingStage('Sending M-Pesa prompt…');
      setMessage(`Donation registered as ${donation.reference || donation.id}. Preparing your M-Pesa prompt…`);
      const response = await fetch('/api/payments/stk-push', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ phone: normalizedPhone, amount, purpose: 'donation', reference: donation.id }),
      });
      const payment = await readApiResponse<PaymentResponse>(response, 'M-Pesa payment service');
      if (!response.ok || !payment.id) throw new Error(payment.error || 'Payment prompt could not be started.');

      setPendingPayment(true);
      setProcessingStage('Waiting for M-Pesa confirmation…');
      setMessage(`M-Pesa prompt sent to ${normalizedPhone}. ${payment.message || 'Check your phone for the official M-Pesa prompt.'} Donation reference: ${donation.reference || donation.id}.`);
      setLoading(false);
      void (async () => {
      for (let attempt = 0; attempt < 24; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 5000));
        if (paymentCheckId.current !== checkId) return;
        const statusResponse = await fetch(`/api/payments/stk-push?reference=${encodeURIComponent(payment.id)}`, { headers: { Accept: 'application/json' } });
        if (!statusResponse.ok) continue;
        if (paymentCheckId.current !== checkId) return;
        const data = await statusResponse.json() as { payment?: { status?: string; receipt_number?: string; result_description?: string; amount?: number; callback_phone?: string; transaction_date?: string; display_reference?: string } };
        const current = data.payment;
        if (current?.status === 'paid' && current.receipt_number) {
          if (paymentCheckId.current !== checkId) return;
          setPendingPayment(false); setProcessingStage('');
          setReceipt({ reference: current.display_reference || payment.reference || donation.reference || donation.id, code: current.receipt_number, amount: current.amount || amount, phone: current.callback_phone || normalizedPhone, date: current.transaction_date });
          setMessage('Payment confirmed successfully by M-Pesa. Your receipt is shown below.');
          break;
        }
        if (current?.status === 'failed') { if (paymentCheckId.current !== checkId) return; setPendingPayment(false); setProcessingStage(''); setMessage(`Payment not completed: ${current.result_description || 'M-Pesa did not confirm this payment.'} You may try again when ready.`); break; }
        if (attempt === 23) setMessage(`Payment is still awaiting Safaricom confirmation. Keep reference ${payment.reference || donation.reference} and check again shortly.`);
      }
      })();
    } catch (error) {
      setPendingPayment(false); setProcessingStage('');
      setMessage(error instanceof Error ? error.message : 'Payment prompt could not be started. Please try again.');
    } finally { setLoading(false); }
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <section className="border-b bg-white">
        <div className="container mx-auto grid gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1fr_390px] md:items-center lg:px-8">
          <div>
            <p className="text-sm font-bold uppercase text-blue-800">NAVSTAR DIGITAL HUB / COMMUNITY</p>
            <h1 className="mt-3 max-w-xl text-3xl font-black text-slate-950 sm:text-4xl">Help more people get connected to digital skills</h1>
            <p className="mt-4 max-w-xl leading-7 text-slate-600">Your contribution can support learning materials, supervised computer access, and practical technology training.</p>
            <div className="mt-8 flex items-start gap-3 border-l-2 border-blue-700 pl-4 text-sm text-slate-600"><HeartHandshake className="mt-0.5 h-5 w-5 shrink-0 text-blue-800" /><p>Donations are voluntary. A payment is recorded as received only after Safaricom confirms it.</p></div>
          </div>
          <form onSubmit={startDonation} className="rounded-2xl border bg-white p-6 shadow-xl shadow-slate-200/70 sm:p-7">
            <h2 className="text-lg font-bold text-slate-950">Make a contribution</h2>
            <p className="mt-1 text-sm text-slate-600">Choose an amount and the phone to receive the prompt.</p>
            <fieldset className="mt-6">
              <legend className="text-sm font-medium text-slate-800">Amount (KSh)</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {amounts.map((option) => <button key={option} type="button" onClick={() => setAmount(option)} aria-pressed={amount === option} className={`min-h-11 rounded-lg border px-3 text-sm font-semibold transition ${amount === option ? 'border-blue-800 bg-blue-50 text-blue-900 ring-1 ring-blue-700' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>{option.toLocaleString()}</button>)}
              </div>
            </fieldset>
            <div className="mt-4 space-y-2"><Label htmlFor="donation-amount">Other amount</Label><Input id="donation-amount" type="number" min="1" max="150000" value={amount} onChange={(event) => setAmount(Number(event.target.value))} required /></div>
            <div className="mt-4 space-y-2"><Label htmlFor="donation-phone">M-Pesa phone number</Label><Input id="donation-phone" autoComplete="tel" inputMode="tel" placeholder="07xx xxx xxx" value={phone} onChange={(event) => setPhone(event.target.value)} required /></div>
            <Button className="mt-6 w-full bg-blue-800 hover:bg-blue-900" type="submit" disabled={loading || amount < 1}>{loading ? <><LoaderCircle className="mr-2 h-4 w-4 animate-spin"/>Processing donation…</> : `Continue with KSh ${amount.toLocaleString()}`}</Button>
            {(loading || pendingPayment) && <div role="status" aria-live="polite" className="mt-4 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3"><LoaderCircle className="h-7 w-7 shrink-0 animate-spin text-blue-700"/><div><p className="text-xs font-extrabold text-blue-900">{loading ? 'PLEASE WAIT' : 'DONATION PAYMENT PROCESSING'}</p><p className="text-xs text-blue-800">{processingStage || 'Waiting for Safaricom confirmation…'}</p></div></div>}
            {message && <p role="status" aria-live="polite" className="mt-4 rounded-lg border bg-slate-50 p-3 text-sm text-slate-700">{message}</p>}
            {pendingPayment && <button type="button" onClick={() => { paymentCheckId.current++; setPendingPayment(false); setProcessingStage(''); setMessage('Pending donation status cleared from this screen. Any M-Pesa prompt already sent may still arrive or complete. You can now make another donation.'); }} className="mt-2 w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs font-bold text-amber-900 hover:bg-amber-100">Clear pending status &amp; make another donation</button>}
            {donationReference && !receipt && <p className="mt-2 text-xs font-bold text-blue-800">Keep donation reference: {donationReference}</p>}
            {receipt && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><div className="flex items-center gap-2 font-bold"><ShieldCheck className="h-4 w-4" />M-Pesa payment receipt</div><dl className="mt-3 grid grid-cols-2 gap-2"><dt>Account reference</dt><dd className="text-right font-bold">{receipt.reference}</dd><dt>M-Pesa code</dt><dd className="text-right font-bold tracking-wide">{receipt.code}</dd><dt>Amount</dt><dd className="text-right font-semibold">KSh {receipt.amount.toLocaleString()}</dd><dt>Phone</dt><dd className="text-right">{receipt.phone}</dd>{receipt.date && <><dt>Transaction date</dt><dd className="text-right">{receipt.date}</dd></>}</dl></div>}
            <p className="mt-5 flex items-start gap-2 border-t pt-4 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />Enter your M-Pesa PIN only on the official prompt on your phone. NAVSTAR will never ask for your PIN on this website.</p>
          </form>
        </div>
      </section>
    </main>
  );
}
