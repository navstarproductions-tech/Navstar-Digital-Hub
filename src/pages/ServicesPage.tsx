import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Search, ShoppingBag, ShoppingCart, Trash2, Plus, Minus, Sparkles, Camera, Printer, FileText, MonitorCog } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Service = { id: string; reference?: string; name: string; category: string; price: string; priceAmount?: number | null };
type CartLine = { service: Service; quantity: number; instructions: string };
type Receipt = { reference: string; code: string; amount: number; phone: string; date?: string };

function downloadReceiptPdf(receipt: Receipt) {
  const safe = (value: string) => value.replace(/[\x00-\x1F\x7F-\uFFFF]/g, '?').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const lines: [string, number][] = [['NAVSTAR DIGITAL HUB',18],['HOME OF TECHNOCRATS',11],['M-PESA PAYMENT RECEIPT',14],['Order: '+receipt.reference,11],['M-Pesa code: '+receipt.code,11],['Amount paid: KES '+receipt.amount.toLocaleString('en-KE'),11],['Phone: '+receipt.phone,11],['Date: '+(receipt.date || 'As confirmed by Safaricom'),11],['Thank you for choosing Navstar Digital Hub.',11],['+254 797 688 576 | navstardigitalhub@gmail.com',9]];
  let commands=''; let y=780;
  for (const [line,size] of lines) { commands += 'BT /F1 '+size+' Tf 50 '+y+' Td ('+safe(line)+') Tj ET\n'; y -= size===18?38:27; }
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Length '+new TextEncoder().encode(commands).length+' >>\nstream\n'+commands+'endstream'];
  let pdf='%PDF-1.4\n'; const offsets=[0];
  for(let i=0;i<objects.length;i++){offsets.push(new TextEncoder().encode(pdf).length);pdf+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';}
  const xref=new TextEncoder().encode(pdf).length; pdf+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n';
  for(const offset of offsets.slice(1))pdf+=String(offset).padStart(10,'0')+' 00000 n \n';
  pdf+='trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
  const url=URL.createObjectURL(new Blob([pdf],{type:'application/pdf'})); const a=document.createElement('a');a.href=url;a.download='Navstar-Receipt-'+receipt.reference+'.pdf';a.click();URL.revokeObjectURL(url);
}

const specialized = ['IT Consulting','Data Recovery','Network Setup','Marketing','Photography'];
const money = (amount?: number | null, label?: string) => amount && amount > 0 ? 'KES '+amount.toLocaleString('en-KE') : label || 'Request a quotation';

export function ServicesPage() {
  const [services,setServices]=useState<Service[]>([]);
  const [loadingServices,setLoadingServices]=useState(true);
  const [query,setQuery]=useState('');
  const [category,setCategory]=useState('All Services');
  const [cart,setCart]=useState<CartLine[]>([]);
  const [name,setName]=useState('');
  const [email,setEmail]=useState('');
  const [phone,setPhone]=useState('');
  const [customerNotes,setCustomerNotes]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [receipt,setReceipt]=useState<Receipt|null>(null);
  const [orderRef,setOrderRef]=useState('');

  useEffect(()=>{let active=true;fetch('/api/services').then(async r=>r.ok?r.json() as Promise<{services?:Service[]}>:null).then(data=>{if(active)setServices(data?.services||[]);}).catch(()=>{if(active)setMessage('Service catalogue could not be loaded. Please refresh or contact Navstar.');}).finally(()=>{if(active)setLoadingServices(false);});return()=>{active=false;};},[]);
  const categories=useMemo(()=>['All Services',...Array.from(new Set(services.map(s=>s.category))).sort()], [services]);
  const visible=useMemo(()=>services.filter(s=>(category==='All Services'||s.category===category)&&[s.name,s.category,s.reference].some(v=>(v||'').toLowerCase().includes(query.toLowerCase()))),[services,category,query]);
  const total=cart.reduce((sum,line)=>sum+(Number(line.service.priceAmount)||0)*line.quantity,0);
  const count=cart.reduce((sum,line)=>sum+line.quantity,0);
  const add=(service:Service)=>{setCart(current=>{const found=current.find(x=>x.service.id===service.id);return found?current.map(x=>x.service.id===service.id?{...x,quantity:x.quantity+1}:x):[...current,{service,quantity:1,instructions:''}];});setMessage('');};
  const update=(id:string,patch:Partial<CartLine>)=>setCart(current=>current.map(line=>line.service.id===id?{...line,...patch}:line));
  const remove=(id:string)=>setCart(current=>current.filter(line=>line.service.id!==id));

  const checkout=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(!cart.length){setMessage('Add at least one service to your cart.');return;}
    if(cart.some(x=>!Number.isSafeInteger(x.service.priceAmount)||Number(x.service.priceAmount)<1)){setMessage('Your cart contains a quotation-only service. Please contact us first so we can confirm its price.');return;}
    const normalized=phone.replace(/[\s-]/g,'');
    if(!/^(?:\+?254|0)?[17]\d{8}$/.test(normalized)){setMessage('Enter a valid Kenyan M-Pesa number.');return;}
    setBusy(true);setMessage('Registering your order…');setReceipt(null);
    try{
      const response=await fetch('/api/service-requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({customerName:name,phone:normalized,email,customerNotes,items:cart.map(line=>({serviceId:line.service.id,code:line.service.reference,quantity:line.quantity,instructions:line.instructions})),notes:customerNotes})});
      const order=await response.json() as {id?:string;reference?:string;amount?:number;error?:string};
      if(!response.ok||!order.id)throw new Error(order.error||'Could not register your order.');
      setOrderRef(order.reference||'');setMessage('Order '+order.reference+' registered. Sending your M-Pesa prompt…');
      const pay=await fetch('/api/payments/stk-push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({purpose:'service',reference:order.id,phone:normalized})});
      const payment=await pay.json() as {id?:string;reference?:string;message?:string;error?:string};
      if(!pay.ok||!payment.id)throw new Error(payment.error||'Order registered, but the payment prompt could not start. Keep your order reference and contact us.');
      setMessage('Processing payment for '+(payment.reference||order.reference)+'. '+(payment.message||'Check your phone for the official M-Pesa prompt.'));
      for(let attempt=0;attempt<24;attempt++){
        await new Promise(resolve=>window.setTimeout(resolve,5000));
        const check=await fetch('/api/payments/stk-push?reference='+encodeURIComponent(payment.id));
        if(!check.ok)continue;
        const data=await check.json() as {payment?:{status?:string;receipt_number?:string;result_description?:string;amount?:number;callback_phone?:string;transaction_date?:string;display_reference?:string;reference?:string}};
        if(data.payment?.status==='paid'&&data.payment.receipt_number){setReceipt({reference:data.payment.display_reference||data.payment.reference||order.reference||'',code:data.payment.receipt_number,amount:data.payment.amount||order.amount||0,phone:data.payment.callback_phone||normalized,date:data.payment.transaction_date});setMessage('Payment confirmed by M-Pesa. Your order is now recorded and your receipt is ready.');setCart([]);break;}
        if(data.payment?.status==='failed'){setMessage('Payment not completed: '+(data.payment.result_description||'Safaricom did not confirm this payment.'));break;}
        if(attempt===23)setMessage('Payment is awaiting confirmation. Keep order reference '+order.reference+' and check again shortly.');
      }
    }catch(error){setMessage(error instanceof Error?error.message:'Checkout could not be completed.');}
    finally{setBusy(false);}
  };

  return <main className="min-h-screen bg-slate-50">
    <section className="overflow-hidden bg-gradient-to-br from-[#061127] via-[#0b2e63] to-[#087caa] text-white">
      <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <p className="text-xs font-black uppercase tracking-[.25em] text-cyan-200">NAVSTAR DIGITAL HUB · HOME OF TECHNOCRATS</p>
        <div className="mt-4 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl"><h1 className="text-4xl font-black sm:text-5xl">Cyber Services</h1><p className="mt-3 text-lg text-blue-100">Professional cyber services at affordable prices.</p><p className="mt-5 text-sm text-cyan-100">Printing · Design · Government e-Services · Academic Support · ICT · Photography</p></div>
          <div className="flex flex-wrap gap-3"><a href="tel:+254797688576" className="rounded-xl border border-white/25 px-4 py-3 text-sm font-bold hover:bg-white/10">Call +254 797 688 576</a><a href="https://wa.me/254797688576" target="_blank" rel="noreferrer" className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-600">WhatsApp Us</a></div>
        </div>
      </div>
    </section>
    <section className="container mx-auto grid gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_390px] lg:px-8">
      <div className="min-w-0">
        <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-widest text-blue-700">Customer order desk</p><h2 className="mt-1 text-xl font-black text-slate-950">Browse and add services</h2><p className="mt-1 text-sm text-slate-500">New customers can order without a student or staff account.</p></div><div className="rounded-xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-900"><ShoppingCart className="mr-2 inline h-4 w-4"/>{count} item(s) · KSh {total.toLocaleString('en-KE')}</div></div>
          <div className="relative mt-5"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search services by name or code…" className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"/></div>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-2">{categories.map(item=><button key={item} onClick={()=>setCategory(item)} className={'shrink-0 rounded-full px-4 py-2 text-xs font-bold '+(category===item?'bg-blue-800 text-white':'bg-slate-100 text-slate-600 hover:bg-blue-50')}>{item}</button>)}</div>
        </div>
        <div className="mt-6 flex items-center justify-between"><h2 className="text-lg font-black text-slate-900">All Services <span className="ml-1 text-sm font-semibold text-slate-400">({visible.length})</span></h2><span className="text-xs text-slate-500">Prices in Kenyan Shillings</span></div>
        {loadingServices?<div className="mt-5 rounded-2xl bg-white p-10 text-center text-sm text-slate-500">Loading Navstar service catalogue…</div>:visible.length===0?<div className="mt-5 rounded-2xl border bg-white p-10 text-center text-sm text-slate-500">No services match your search.</div>:<div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visible.map(service=>{const inCart=cart.some(x=>x.service.id===service.id);return <article key={service.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-start justify-between gap-2"><span className="rounded-lg bg-blue-50 p-2 text-blue-800"><FileText className="h-4 w-4"/></span><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{service.category}</span></div><p className="mt-3 text-[10px] font-bold tracking-wider text-blue-700">{service.reference||'NAVSTAR SERVICE'}</p><h3 className="mt-1 min-h-10 text-sm font-bold leading-5 text-slate-900">{service.name}</h3><div className="mt-auto flex items-center justify-between gap-2 pt-4"><p className="text-sm font-black text-slate-950">{money(service.priceAmount,service.price)}</p><Button size="sm" onClick={()=>add(service)} className="bg-blue-800 hover:bg-blue-900"><Plus className="mr-1 h-4 w-4"/>{inCart?'Add more':'Add'}</Button></div></article>;})}</div>}
        <div className="mt-8 rounded-2xl border border-cyan-100 bg-cyan-50 p-5"><div className="flex items-center gap-2 text-sm font-black text-cyan-950"><Sparkles className="h-4 w-4"/>Specialized Services</div><p className="mt-1 text-xs text-cyan-900">These services are arranged by consultation. Contact us for assessment and a quotation.</p><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">{specialized.map((item,i)=><div key={item} className="rounded-xl border border-cyan-100 bg-white p-3 text-center text-xs font-bold text-slate-700">{i===4?<Camera className="mx-auto mb-2 h-5 w-5 text-cyan-700"/>:<MonitorCog className="mx-auto mb-2 h-5 w-5 text-cyan-700"/>}{item}<p className="mt-1 text-[10px] font-medium text-slate-400">Quotation</p></div>)}</div></div>
      </div>
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <form onSubmit={checkout} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/60">
          <div className="flex items-center justify-between"><div><p className="text-xs font-extrabold uppercase tracking-widest text-blue-700">Your basket</p><h2 className="mt-1 text-xl font-black text-slate-950">Order summary</h2></div><ShoppingBag className="h-6 w-6 text-blue-700"/></div>
          {!cart.length?<div className="my-5 rounded-xl border border-dashed border-slate-300 p-6 text-center"><ShoppingCart className="mx-auto h-7 w-7 text-slate-300"/><p className="mt-2 text-sm font-semibold text-slate-600">Your cart is empty</p><p className="mt-1 text-xs text-slate-400">Add services from the catalogue.</p></div>:<div className="mt-4 max-h-[390px] space-y-4 overflow-y-auto pr-1">{cart.map(line=><div key={line.service.id} className="border-b border-slate-100 pb-4 last:border-0"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-bold text-slate-900">{line.service.name}</p><p className="mt-1 text-xs text-slate-500">{money(line.service.priceAmount,line.service.price)} each</p></div><button type="button" onClick={()=>remove(line.service.id)} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50" aria-label="Remove service"><Trash2 className="h-4 w-4"/></button></div><div className="mt-2 flex items-center justify-between"><div className="flex items-center gap-2"><button type="button" onClick={()=>update(line.service.id,{quantity:Math.max(1,line.quantity-1)})} className="rounded-md border p-1"><Minus className="h-3 w-3"/></button><span className="min-w-5 text-center text-sm font-bold">{line.quantity}</span><button type="button" onClick={()=>update(line.service.id,{quantity:Math.min(1000,line.quantity+1)})} className="rounded-md border p-1"><Plus className="h-3 w-3"/></button></div><span className="text-sm font-black">KSh {((line.service.priceAmount||0)*line.quantity).toLocaleString('en-KE')}</span></div><textarea value={line.instructions} onChange={e=>update(line.service.id,{instructions:e.target.value})} placeholder="Job details: size, colour, pages, copies, deadline, instructions…" rows={2} className="mt-2 w-full rounded-lg border border-slate-200 p-2 text-xs outline-none focus:border-blue-500"/></div>)}</div>}
          <div className="mt-4 border-t border-dashed pt-4"><div className="flex justify-between text-sm text-slate-500"><span>Items</span><span>{count}</span></div><div className="mt-2 flex justify-between text-lg font-black text-slate-950"><span>Total</span><span>KSh {total.toLocaleString('en-KE')}</span></div></div>
          <div className="mt-5 space-y-3"><p className="text-xs font-extrabold uppercase tracking-widest text-slate-500">Customer details</p><input value={name} onChange={e=>setName(e.target.value)} required minLength={2} placeholder="Full name" className="h-11 w-full rounded-lg border px-3 text-sm"/><input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="Email address (for updates)" className="h-11 w-full rounded-lg border px-3 text-sm"/><input value={phone} onChange={e=>setPhone(e.target.value)} required inputMode="tel" placeholder="M-Pesa phone (+254…)" className="h-11 w-full rounded-lg border px-3 text-sm"/><textarea value={customerNotes} onChange={e=>setCustomerNotes(e.target.value)} placeholder="Additional order instructions (optional)" rows={2} className="w-full rounded-lg border p-3 text-sm"/></div>
          <Button type="submit" disabled={busy||!cart.length} className="mt-5 h-12 w-full bg-emerald-600 font-bold hover:bg-emerald-700">{busy?'Processing your order…':'Continue to M-Pesa checkout'}</Button>
          {message&&<p role="status" aria-live="polite" className="mt-3 rounded-lg border bg-slate-50 p-3 text-xs leading-5 text-slate-700">{message}</p>}
          {orderRef&&!receipt&&<p className="mt-2 text-xs font-bold text-blue-800">Keep your order reference: {orderRef}</p>}
          {receipt&&<div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><p className="font-bold">M-Pesa payment confirmed</p><p className="mt-2">Order: <strong>{receipt.reference}</strong></p><p>M-Pesa code: <strong>{receipt.code}</strong></p><p>Amount: KSh {receipt.amount.toLocaleString('en-KE')}</p><p>Phone: {receipt.phone}</p>{receipt.date&&<p>{receipt.date}</p>}<button type="button" onClick={()=>downloadReceiptPdf(receipt)} className="mt-3 rounded-lg border border-emerald-700 px-3 py-2 text-xs font-bold">Download PDF receipt</button></div>}
          <p className="mt-3 text-[11px] leading-5 text-slate-500">Your M-Pesa PIN is entered only on the official Safaricom prompt. Service prices exclude any third-party government fees unless stated otherwise.</p>
        </form>
        <div className="mt-4 rounded-xl bg-[#071a38] p-4 text-white"><p className="text-sm font-bold">Need help before ordering?</p><p className="mt-1 text-xs text-blue-100">Call or WhatsApp +254 797 688 576.</p><p className="mt-2 text-xs text-blue-100">P.O. BOX 546-50200 Bungoma, Kenya</p></div>
      </aside>
    </section>
    <section className="border-t bg-white"><div className="container mx-auto flex flex-col gap-4 px-4 py-9 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8"><div><h2 className="text-xl font-bold text-slate-950">Looking for professional training?</h2><p className="mt-1 text-sm text-slate-600">Explore practical computer and digital skills courses at Navstar.</p></div><Button asChild variant="outline"><Link to="/courses">Browse courses <ArrowRight className="ml-2 h-4 w-4"/></Link></Button></div></section>
  </main>;
}
