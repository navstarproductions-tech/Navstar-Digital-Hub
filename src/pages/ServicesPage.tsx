import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BadgeCheck, BriefcaseBusiness, Cloud, FileText, MonitorCog, Printer, ShieldCheck, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Service = { id?: string; reference?: string; icon: typeof MonitorCog; name: string; detail: string; category: string; priceAmount?: number | null };
type Receipt = { reference: string; code: string; amount: number; phone: string; date?: string };

const defaults: Service[] = [
  { icon: MonitorCog, name: 'Computer access', detail: 'Reliable workstations and internet access for study, work, applications, and everyday digital tasks.', category: 'Cyber cafe' },
  { icon: FileText, name: 'Online applications', detail: 'Assistance with online forms, account setup, document preparation, and digital submissions.', category: 'Digital support' },
  { icon: Printer, name: 'Print and document services', detail: 'Printing, scanning, photocopying, typing, formatting, and document conversion.', category: 'Document desk' },
  { icon: ShieldCheck, name: 'Digital safety support', detail: 'Practical guidance on safer accounts, device hygiene, privacy, and recognizing common scams.', category: 'Cyber safety' },
  { icon: Cloud, name: 'Digital skills coaching', detail: 'One-to-one help with email, cloud tools, office software, and online collaboration.', category: 'Learning support' },
  { icon: Wifi, name: 'Connectivity and setup', detail: 'Help connecting devices, configuring software, and resolving common connectivity issues.', category: 'Technical help' },
];

export function ServicesPage() {
  const [serviceList, setServiceList] = useState<Service[]>(defaults);
  const [selected, setSelected] = useState<Service | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/services')
      .then(async (response) => response.ok ? response.json() as Promise<{ services?: { id: string; reference?: string; name: string; category: string; price: string; priceAmount?: number | null }[] }> : null)
      .then((result) => {
        if (active && result?.services?.length) setServiceList(result.services.map((service) => ({ id: service.id, reference: service.reference, icon: MonitorCog, name: service.name, detail: service.price, category: service.category, priceAmount: service.priceAmount })));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const payForService = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected?.id) return;
    const normalizedPhone = phone.replace(/[\s-]/g, '');
    if (!/^(?:\+?254|0)?[17]\d{8}$/.test(normalizedPhone)) { setMessage('Enter a valid Kenyan M-Pesa number.'); return; }
    setLoading(true); setMessage('Registering your service request…'); setReceipt(null);
    try {
      const orderResponse = await fetch('/api/service-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serviceId: selected.id, customerName, phone: normalizedPhone, email: customerEmail }) });
      const order = await orderResponse.json() as { id?: string; reference?: string; amount?: number; error?: string };
      if (!orderResponse.ok || !order.id) throw new Error(order.error || 'Could not register this service request.');
      setMessage(`Request ${order.reference} registered. Sending M-Pesa prompt…`);
      const paymentResponse = await fetch('/api/payments/stk-push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purpose: 'service', reference: order.id, phone: normalizedPhone }) });
      const payment = await paymentResponse.json() as { id?: string; reference?: string; message?: string; error?: string };
      if (!paymentResponse.ok || !payment.id) throw new Error(payment.error || 'Could not start M-Pesa payment.');
      setMessage(`Processing M-Pesa payment for ${payment.reference || order.reference}. ${payment.message || 'Check your phone for the official prompt.'}`);
      for (let attempt = 0; attempt < 24; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 5000));
        const check = await fetch(`/api/payments/stk-push?reference=${encodeURIComponent(payment.id)}`);
        if (!check.ok) continue;
        const data = await check.json() as { payment?: { status?: string; receipt_number?: string; result_description?: string; amount?: number; callback_phone?: string; transaction_date?: string; reference?: string; display_reference?: string } };
        if (data.payment?.status === 'paid' && data.payment.receipt_number) {
          setReceipt({ reference: data.payment.display_reference || order.reference || '', code: data.payment.receipt_number, amount: data.payment.amount || order.amount || 0, phone: data.payment.callback_phone || normalizedPhone, date: data.payment.transaction_date });
          setMessage('Payment confirmed by M-Pesa. Your receipt is ready below.'); break;
        }
        if (data.payment?.status === 'failed') { setMessage(`Payment not completed: ${data.payment.result_description || 'Safaricom did not confirm this payment.'}`); break; }
        if (attempt === 23) setMessage(`Payment is awaiting confirmation. Keep reference ${order.reference} and check again shortly.`);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Service payment could not be completed.'); }
    finally { setLoading(false); }
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <section className="border-b bg-white">
        <div className="container mx-auto px-4 py-14 sm:px-6 lg:px-8">
          <p className="text-sm font-bold uppercase text-blue-800">NAVSTAR DIGITAL HUB / SERVICES</p>
          <div className="mt-3 flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div className="max-w-2xl"><h1 className="text-3xl font-black text-slate-950 sm:text-4xl">Your neighborhood cyber and digital service desk</h1><p className="mt-4 text-slate-600">Practical computer access, document services, online support, and guided digital learning in one place.</p></div>
            <Button asChild className="w-fit bg-blue-800 hover:bg-blue-900"><Link to="/portals/admissions">Ask admissions <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
          </div>
        </div>
      </section>
      <section className="container mx-auto grid gap-4 px-4 py-10 sm:px-6 md:grid-cols-2 lg:grid-cols-3 lg:px-8">
        {serviceList.map(({ icon: Icon, id, name, detail, category, priceAmount }) => (
          <article key={id || name} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg sm:p-8">
            <div className="flex items-center justify-between"><span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-800"><Icon className="h-5 w-5" /></span><span className="text-xs font-semibold uppercase text-slate-500">{category}</span></div>
            <h2 className="mt-6 text-lg font-bold text-slate-950">{name}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
            {id && Number.isSafeInteger(priceAmount) && Number(priceAmount) > 0 ? <Button className="mt-5 w-full bg-blue-800 hover:bg-blue-900" onClick={() => { setSelected({ id, icon: Icon, name, detail, category, priceAmount }); setMessage(''); setReceipt(null); }}>Request & pay online · KSh {Number(priceAmount).toLocaleString()}</Button> : <p className="mt-5 text-xs font-medium text-slate-500">Contact us for a quotation or assistance.</p>}
          </article>
        ))}
      </section>

      {selected && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-labelledby="service-payment-title">
        <form onSubmit={payForService} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-700">Secure M-Pesa checkout</p><h2 id="service-payment-title" className="mt-2 text-xl font-black text-slate-950">{selected.name}</h2><p className="mt-1 text-sm text-slate-600">Amount: KSh {Number(selected.priceAmount).toLocaleString()}</p></div><button type="button" onClick={() => setSelected(null)} className="rounded-lg px-3 py-1 text-slate-500 hover:bg-slate-100" aria-label="Close">✕</button></div>
          <label className="mt-5 block text-sm font-semibold text-slate-700">Your name<input className="mt-1 h-11 w-full rounded-lg border px-3" value={customerName} onChange={(event) => setCustomerName(event.target.value)} required /></label>
          <label className="mt-4 block text-sm font-semibold text-slate-700">Email address (for updates)<input className="mt-1 h-11 w-full rounded-lg border px-3" type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} placeholder="you@example.com" /></label>
          <label className="mt-4 block text-sm font-semibold text-slate-700">M-Pesa phone<input className="mt-1 h-11 w-full rounded-lg border px-3" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="07xx xxx xxx" inputMode="tel" required /></label>
          <Button type="submit" disabled={loading} className="mt-5 w-full bg-blue-800 hover:bg-blue-900">{loading ? 'Processing M-Pesa payment…' : 'Request payment prompt'}</Button>
          {message && <p role="status" aria-live="polite" className="mt-4 rounded-lg border bg-slate-50 p-3 text-sm text-slate-700">{message}</p>}
          {receipt && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><p className="font-bold">Payment receipt confirmed</p><p className="mt-2">Reference: <strong>{receipt.reference}</strong></p><p>M-Pesa code: <strong>{receipt.code}</strong></p><p>Amount: KSh {receipt.amount.toLocaleString()}</p><p>Phone: {receipt.phone}</p>{receipt.date && <p>Transaction date: {receipt.date}</p>}<button type="button" onClick={() => window.print()} className="mt-3 rounded-lg border border-emerald-700 px-3 py-2 text-xs font-bold text-emerald-900">Print / Save receipt as PDF</button></div>}
          <p className="mt-4 text-xs text-slate-500">Enter your PIN only on the official M-Pesa prompt on your phone.</p>
        </form>
      </div>}

      <section className="border-t bg-white"><div className="container mx-auto flex flex-col gap-5 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8"><div><h2 className="text-xl font-bold text-slate-950">Looking for a course?</h2><p className="mt-1 text-sm text-slate-600">Explore practical programs from the training team.</p></div><Button asChild variant="outline"><Link to="/courses">Browse courses <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></div></section>
      <div className="sr-only"><BadgeCheck /><BriefcaseBusiness /></div>
    </main>
  );
}
