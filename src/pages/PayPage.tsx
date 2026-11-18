import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, LoaderCircle, Smartphone, Wallet } from 'lucide-react';

type Service = { id:string; name:string; category:string; price:string; priceAmount?:number|null; status:string };
type PaymentState = { id:string; reference:string; status:string };

export function PayPage() {
  const [services,setServices]=useState<Service[]>([]);
  const [customerName,setCustomerName]=useState('');
  const [phone,setPhone]=useState('');
  const [serviceId,setServiceId]=useState('');
  const [amount,setAmount]=useState('');
  const [description,setDescription]=useState('');
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState('');
  const [payment,setPayment]=useState<PaymentState|null>(null);
  const [servicesLoading,setServicesLoading]=useState(true);
  const selected=useMemo(()=>services.find(item=>item.id===serviceId),[services,serviceId]);

  useEffect(()=>{
    let active=true;
    fetch('/api/services').then(async response=>{if(!response.ok)throw new Error('Services are not available right now.');const data=await response.json() as {services?:Service[]};if(active)setServices((data.services||[]).filter(item=>item.status==='active'||item.status==='Active'));})
      .catch(error=>{if(active)setMessage(error instanceof Error?error.message:'Could not load services.');})
      .finally(()=>{if(active)setServicesLoading(false)});
    return()=>{active=false};
  },[]);

  const chooseService=(id:string)=>{
    setServiceId(id);
    const item=services.find(service=>service.id===id);
    if(item){setDescription(item.name);if(item.priceAmount)setAmount(String(item.priceAmount));}
  };

  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    const value=Number(amount);
    if(!customerName.trim()||!phone.trim()||!description.trim()||!Number.isSafeInteger(value)||value<1||value>150000){setMessage('Enter your name, valid M-Pesa phone, description and amount (KSh 1–150,000).');return;}
    setLoading(true);setPayment(null);setMessage('Registering your payment request…');
    try{
      const requestResponse=await fetch('/api/service-requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({manualPayment:true,customerName,phone,amount:value,description})});
      const requestData=await requestResponse.json() as {id?:string;reference?:string;error?:string};
      if(!requestResponse.ok||!requestData.id)throw new Error(requestData.error||'Could not register your payment.');
      setMessage('Sending secure M-Pesa prompt to your phone…');
      const promptResponse=await fetch('/api/payments/stk-push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({purpose:'service',reference:requestData.id,phone})});
      const prompt=await promptResponse.json() as {id?:string;error?:string;message?:string};
      if(!promptResponse.ok||!prompt.id)throw new Error(prompt.error||'Could not send the M-Pesa prompt.');
      setPayment({id:prompt.id,reference:requestData.reference||'',status:'pending'});
      setMessage(prompt.message||'Prompt sent. Enter your M-Pesa PIN on your phone to complete payment.');
      const check=async(attempt:number):Promise<void>=>{
        const response=await fetch('/api/payments/stk-push?reference='+encodeURIComponent(prompt.id!),{credentials:'same-origin'});
        const result=await response.json() as {payment?:{status:string};error?:string};
        if(!response.ok)throw new Error(result.error||'Could not verify payment status.');
        const status=result.payment?.status||'pending';
        setPayment({id:prompt.id!,reference:requestData.reference||'',status});
        if(status==='paid'){setMessage('Payment confirmed by M-Pesa. Your official Navstar receipt is ready.');return;}
        if(status==='failed'){setMessage('Payment was not completed. Please check your phone or try again.');return;}
        if(attempt<40){await new Promise(resolve=>window.setTimeout(resolve,3000));return check(attempt+1);}
        setMessage('Payment is still pending. You can leave this page and check again later.');
      };
      await check(1);
    }catch(error){setMessage(error instanceof Error?error.message:'Payment could not be started.');}
    finally{setLoading(false);}
  };

  return <main className="min-h-[70vh] bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 px-4 py-12 text-white sm:py-16">
    <div className="mx-auto max-w-3xl">
      <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-200 hover:text-white"><ArrowLeft className="h-4 w-4"/>Back to Navstar</Link>
      <div className="mt-6 grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
        <section className="rounded-3xl border border-white/10 bg-white/[.06] p-6 shadow-xl backdrop-blur">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-200"><Wallet className="h-6 w-6"/></span>
          <p className="mt-6 text-xs font-extrabold uppercase tracking-[.25em] text-cyan-300">NAVSTAR DIGITAL HUB</p>
          <h1 className="mt-2 text-3xl font-black">Pay for a service</h1>
          <p className="mt-3 text-sm leading-6 text-blue-100">Pay for services, clear an outstanding balance or settle a service deficit using a secure M-Pesa prompt.</p>
          <p className="mt-5 text-xs font-bold uppercase tracking-wider text-amber-300">HOME OF TECHNOCRATS</p>
          <div className="mt-8 rounded-2xl border border-white/10 bg-slate-950/40 p-4"><p className="text-xs text-slate-400">Payment protection</p><p className="mt-1 text-sm leading-6 text-slate-200">Your receipt is issued only after Safaricom confirms the payment. Do not share your M-Pesa PIN with anyone.</p></div>
        </section>
        <section className="rounded-3xl bg-white p-6 text-slate-900 shadow-2xl sm:p-7">
          <h2 className="text-xl font-extrabold">Payment details</h2>
          <p className="mt-1 text-sm text-slate-500">Complete the details below to receive an M-Pesa prompt.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div><label className="mb-1.5 block text-xs font-bold text-slate-700" htmlFor="pay-name">Full name</label><input id="pay-name" value={customerName} onChange={event=>setCustomerName(event.target.value)} required className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" placeholder="Your full name"/></div>
            <div><label className="mb-1.5 block text-xs font-bold text-slate-700" htmlFor="pay-phone">M-Pesa phone number</label><input id="pay-phone" value={phone} onChange={event=>setPhone(event.target.value)} required inputMode="tel" className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" placeholder="07XXXXXXXX"/></div>
            <div><label className="mb-1.5 block text-xs font-bold text-slate-700" htmlFor="pay-service">Choose a service (optional)</label><select id="pay-service" value={serviceId} onChange={event=>chooseService(event.target.value)} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-600">{servicesLoading?<option>Loading services…</option>:<option value="">Other / outstanding balance</option>}{services.map(item=><option key={item.id} value={item.id}>{item.name}{item.priceAmount? ' — KSh '+Number(item.priceAmount).toLocaleString():''}</option>)}</select></div>
            <div><label className="mb-1.5 block text-xs font-bold text-slate-700" htmlFor="pay-description">Description / account reference</label><input id="pay-description" value={description} onChange={event=>setDescription(event.target.value)} required className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-600" placeholder="e.g. Printing balance, application fee"/></div>
            <div><label className="mb-1.5 block text-xs font-bold text-slate-700" htmlFor="pay-amount">Amount (KSh)</label><input id="pay-amount" type="number" min="1" max="150000" step="1" value={amount} onChange={event=>setAmount(event.target.value)} required className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-lg font-extrabold text-slate-900 outline-none focus:border-blue-600" placeholder="Enter amount"/></div>
            <button disabled={loading} type="submit" className="flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-r from-blue-700 to-cyan-600 px-4 text-sm font-extrabold text-white shadow-lg shadow-blue-900/20 transition hover:brightness-110 disabled:opacity-60">{loading?<><LoaderCircle className="mr-2 h-4 w-4 animate-spin"/>Processing payment…</>:<><Smartphone className="mr-2 h-4 w-4"/>Send M-Pesa prompt</>}</button>
          </form>
          {message&&<div role="status" className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">{message}</div>}
          {payment?.status==='paid'&&<div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><div className="flex items-center gap-2 font-bold text-emerald-800"><CheckCircle2 className="h-5 w-5"/>Payment verified</div><p className="mt-1 text-xs text-emerald-700">Reference: {payment.reference}</p><Link to={`/payment-receipt/${payment.id}`} className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-emerald-700 px-4 py-3 text-sm font-bold text-white">View / download receipt</Link></div>}
        </section>
      </div>
    </div>
  </main>;
}
