import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, RefreshCw, ReceiptText, ShoppingBag, Store, TrendingUp } from 'lucide-react';
import { exportBrandedData } from '@/lib/navstar-data-tools';
import { AdminReceiptPreview } from '@/pages/PaymentReceiptsPage';
import { formatEATDateTime } from '@/lib/datetime';

type ProductSale = { id:string; receipt_number:string; customer_name?:string|null; customer_phone?:string|null; total_amount:number; payment_method:string; payment_status:string; created_at:string };
type SiteOrder = { id:string; reference:string; customerName:string; phone:string; amount:number; status:string; createdAt:string; serviceName:string; notes?:string|null };
type Payment = { id:string; purpose:string; display_reference:string|null; receipt_number:string|null; amount:number; status:string; payer_name:string; description:string; updated_at:string; admin_status?:string };
const money=(value:number)=>'KSh '+Number(value||0).toLocaleString('en-KE',{maximumFractionDigits:0});

export function PointOfSaleDashboard(){
 const [productSales,setProductSales]=useState<ProductSale[]>([]);
 const [orders,setOrders]=useState<SiteOrder[]>([]);
 const [payments,setPayments]=useState<Payment[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [lastUpdated,setLastUpdated]=useState('');
 const [selectedReceiptId,setSelectedReceiptId]=useState<string|null>(null);
 const [selectedProductReceipt,setSelectedProductReceipt]=useState<ProductSale|null>(null);
 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const responses=await Promise.all([
    fetch('/api/admin/operations?view=sales',{credentials:'same-origin'}),
    fetch('/api/admin/service-requests',{credentials:'same-origin'}),
    fetch('/api/admin/payments?ledger=business',{credentials:'same-origin'})
   ]);
   const payloads=await Promise.all(responses.map(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'Sales records could not be loaded.');return data;}));
   setProductSales(payloads[0].sales||[]);setOrders(payloads[1].orders||[]);setPayments((payloads[2].payments||[]).filter((item:Payment)=>item.purpose==='service'));
   setLastUpdated(new Date().toISOString());
  }catch(reason){setError(reason instanceof Error?reason.message:'Could not load POS sales.');}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 const verifiedSitePayments=useMemo(()=>payments.filter(item=>item.status==='paid'),[payments]);
 const paidProductSales=useMemo(()=>productSales.filter(item=>item.payment_status==='paid'),[productSales]);
 const siteRevenue=verifiedSitePayments.reduce((sum,item)=>sum+Number(item.amount||0),0);
 const productRevenue=paidProductSales.reduce((sum,item)=>sum+Number(item.total_amount||0),0);
 const verifiedTotal=siteRevenue+productRevenue;
 const openOrders=orders.filter(order=>!['completed','delivered','cancelled'].includes(String(order.status).toLowerCase()));
 const paymentByReference=new Map(payments.map(item=>[item.display_reference||'',item]));
 const history=[
  ...verifiedSitePayments.map(item=>({key:'site-'+item.id,source:'Website order',reference:item.display_reference||item.id,receiptNumber:item.receipt_number||'Pending number',customer:item.payer_name,detail:item.description,amount:Number(item.amount),date:item.updated_at,receiptId:item.id,productSale:null as ProductSale|null})),
  ...paidProductSales.map(item=>({key:'pos-'+item.id,source:'Counter sale',reference:item.receipt_number,receiptNumber:item.receipt_number,customer:item.customer_name||'Walk-in customer',detail:'Product / inventory sale · '+item.payment_method,amount:Number(item.total_amount),date:item.created_at,receiptId:'',productSale:item}))
 ].sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime()).slice(0,100);
 const downloadProductReceipt=(sale:ProductSale)=>{
  if(sale.payment_status!=='paid')return;
  exportBrandedData('pdf','Official POS Receipt · '+sale.receipt_number,
   ['Receipt number','Customer','Phone','Payment method','Payment status','Date','Amount (KSh)'],
   [{'Receipt number':sale.receipt_number,'Customer':sale.customer_name||'Walk-in customer','Phone':sale.customer_phone||'—','Payment method':sale.payment_method,'Payment status':'PAID','Date':formatEATDateTime(sale.created_at),'Amount (KSh)':Number(sale.total_amount)}]);
 };
 return <div className="space-y-6">
  <section className="relative overflow-hidden rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-[#06172f] via-[#0b3158] to-[#075b68] p-6 text-white shadow-xl sm:p-8">
   <div className="absolute -right-12 -top-16 h-56 w-56 rounded-full border-[28px] border-white/5"/>
   <div className="relative flex flex-wrap items-end justify-between gap-4">
    <div><p className="text-[10px] font-black uppercase tracking-[.28em] text-cyan-200">NAVSTAR DIGITAL HUB · SALES CENTRE</p><h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Point of Sale</h2><p className="mt-2 max-w-2xl text-sm text-blue-100">One view of verified website service orders and counter sales. Only confirmed payments count as revenue and qualify for official receipts.</p></div>
    <button type="button" onClick={()=>void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/15 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading?'animate-spin':''}`}/>Refresh sales</button>
   </div>
   <div className="relative mt-6 flex flex-wrap items-center gap-2 text-[11px] text-cyan-100"><span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">Verified sales only</span><span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">Website orders + counter sales</span>{lastUpdated&&<span className="px-2">Updated {formatEATDateTime(lastUpdated)}</span>}</div>
  </section>
  {error&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
  <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
   {[
    {label:'Verified sales total',value:money(verifiedTotal),note:'Website + counter sales',icon:TrendingUp},
    {label:'Website order revenue',value:money(siteRevenue),note:verifiedSitePayments.length+' confirmed service payments',icon:ShoppingBag},
    {label:'Counter sales revenue',value:money(productRevenue),note:paidProductSales.length+' paid POS product sales',icon:Store},
    {label:'Open website orders',value:String(openOrders.length),note:'Awaiting fulfilment or completion',icon:ReceiptText}
   ].map(card=><article key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-slate-500">{card.label}</p><p className="mt-2 text-2xl font-black tracking-tight text-slate-950">{loading?'—':card.value}</p><p className="mt-2 text-[11px] text-slate-500">{card.note}</p></div><span className="rounded-xl bg-cyan-50 p-3 text-cyan-800"><card.icon className="h-5 w-5"/></span></div></article>)}
  </section>
  <section className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
   <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div><h3 className="font-extrabold text-slate-950">Recent verified sales</h3><p className="mt-1 text-xs text-slate-500">Confirmed transactions eligible for official receipts</p></div></div>
    <div className="divide-y">{history.map(item=><div key={item.key} className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-bold text-slate-950">{item.customer}</p><span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black uppercase text-emerald-800">Paid</span><span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-600">{item.source}</span></div><p className="mt-1 text-xs font-bold text-blue-800">Receipt No: {item.receiptNumber}</p><p className="mt-1 text-xs text-slate-500">{item.detail} · Ref: {item.reference}</p><p className="mt-1 text-[11px] text-slate-400">{formatEATDateTime(item.date)}</p></div><div className="flex items-center gap-3"><strong className="text-sm tabular-nums text-slate-950">{money(item.amount)}</strong>{item.receiptId?<button type="button" onClick={()=>setSelectedReceiptId(item.receiptId)} className="inline-flex items-center gap-1 rounded-lg bg-blue-800 px-3 py-2 text-[11px] font-bold text-white"><ReceiptText className="h-3.5 w-3.5"/>Receipt</button>:item.productSale&&<button type="button" onClick={()=>setSelectedProductReceipt(item.productSale!)} className="inline-flex items-center gap-1 rounded-lg bg-blue-800 px-3 py-2 text-[11px] font-bold text-white"><ReceiptText className="h-3.5 w-3.5"/>Receipt</button>}</div></div>)}{!loading&&history.length===0&&<p className="p-8 text-center text-sm text-slate-500">No confirmed sales have been recorded yet.</p>}</div>
   </article>
   <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="border-b p-5"><h3 className="font-extrabold text-slate-950">Website service orders</h3><p className="mt-1 text-xs text-slate-500">Orders submitted from the public Navstar website</p></div>
    <div className="max-h-[520px] divide-y overflow-y-auto">{orders.slice(0,30).map(order=>{const payment=paymentByReference.get(order.reference);const paid=payment?.status==='paid';return <div key={order.id} className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-950">{order.serviceName}</p><p className="mt-1 text-xs text-slate-600">{order.customerName} · {order.reference}</p><p className="mt-1 text-[11px] text-slate-400">{formatEATDateTime(order.createdAt)}</p></div><div className="text-right"><p className="text-sm font-black text-slate-950">{money(order.amount)}</p><span className={`mt-1 inline-block rounded-full px-2 py-1 text-[9px] font-black uppercase ${paid?'bg-emerald-50 text-emerald-800':'bg-amber-50 text-amber-800'}`}>{paid?'Paid':'Not verified'}</span></div></div>{paid&&payment&&<button type="button" onClick={()=>setSelectedReceiptId(payment.id)} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-800 hover:underline"><ReceiptText className="h-3.5 w-3.5"/>Receipt No: {payment.receipt_number||'View receipt'}</button>}</div>})}{!loading&&orders.length===0&&<p className="p-8 text-center text-sm text-slate-500">No website service orders yet.</p>}</div>
   </article>
  </section>
  <p className="text-[11px] leading-5 text-slate-500">Revenue is calculated from verified paid website service payments and paid counter sales only. Donations, student tuition fees and pending payment prompts are excluded from POS sales totals. Payment receipts are available only for confirmed transactions.</p>
 {selectedReceiptId&&<AdminReceiptPreview id={selectedReceiptId} onClose={()=>setSelectedReceiptId(null)}/>}
  {selectedProductReceipt&&<div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/75 p-3" role="dialog" aria-modal="true" aria-label="POS sale receipt"><div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b p-4"><div><p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Navstar Digital Hub · Admin Portal</p><h3 className="font-black text-slate-950">Receipt preview</h3></div><button type="button" onClick={()=>setSelectedProductReceipt(null)} className="rounded-lg border px-3 py-2 text-xs font-bold">Close</button></div><div className="space-y-4 p-5"><div className="rounded-xl bg-gradient-to-r from-blue-950 to-teal-800 p-5 text-white"><p className="text-xs font-black tracking-widest">OFFICIAL POS RECEIPT</p><p className="mt-2 text-2xl font-black">{selectedProductReceipt.receipt_number}</p><p className="mt-1 text-xs text-blue-100">HOME OF TECHNOCRATS</p></div><div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-slate-500">Customer</p><p className="font-bold">{selectedProductReceipt.customer_name||'Walk-in customer'}</p></div><div><p className="text-xs text-slate-500">Phone</p><p className="font-bold">{selectedProductReceipt.customer_phone||'—'}</p></div><div><p className="text-xs text-slate-500">Payment method</p><p className="font-bold">{selectedProductReceipt.payment_method}</p></div><div><p className="text-xs text-slate-500">Date</p><p className="font-bold">{formatEATDateTime(selectedProductReceipt.created_at)}</p></div></div><div className="flex items-center justify-between rounded-xl bg-emerald-50 p-4"><span className="text-sm font-bold text-emerald-900">PAID · Total received</span><strong className="text-xl text-emerald-900">{money(selectedProductReceipt.total_amount)}</strong></div><button type="button" onClick={()=>downloadProductReceipt(selectedProductReceipt)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-800 px-4 py-3 text-sm font-bold text-white"><ArrowDownToLine className="h-4 w-4"/>Download PDF receipt</button></div></div></div>} 
 </div>;
}
