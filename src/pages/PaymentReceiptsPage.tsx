import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, FileText, Printer, ReceiptText } from 'lucide-react';
import { formatEATDateTime } from '@/lib/datetime';

type PaymentRow={id:string;purpose:string;display_reference:string|null;receipt_number:string|null;mpesa_receipt:string|null;amount:number;phone:string;status:string;updated_at:string;payer_name:string;description:string};
type Receipt={businessName:string;motto:string;receiptNumber:string;paymentReference:string;paymentPurpose:string;payerName:string;payerReference:string;description:string;phone:string;amount:number;currency:string;paymentMethod:string;mpesaReceipt:string;transactionDate:string;issuedAt:string;status:string};

function money(value:number){return new Intl.NumberFormat('en-KE',{style:'currency',currency:'KES',maximumFractionDigits:0}).format(value)}
function ReceiptDocument({receipt}:{receipt:Receipt}){
 return <div className="mx-auto max-w-3xl bg-white p-6 shadow-sm sm:p-10 print:max-w-none print:p-0 print:shadow-none">
  <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-900 pb-6">
   <div><p className="text-xs font-black tracking-[.25em] text-blue-800">OFFICIAL PAYMENT RECEIPT</p><h1 className="mt-2 text-2xl font-black text-slate-950">{receipt.businessName}</h1><p className="mt-1 text-xs font-bold tracking-widest text-slate-500">{receipt.motto}</p></div>
   <div className="text-right"><p className="text-xs uppercase text-slate-500">Receipt number</p><p className="mt-1 text-xl font-black text-blue-900">{receipt.receiptNumber}</p><span className="mt-2 inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">{receipt.status}</span></div>
  </div>
  <div className="mt-7 grid gap-5 sm:grid-cols-2">
   <div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Received from</p><p className="mt-2 font-bold text-slate-950">{receipt.payerName}</p>{receipt.payerReference&&<p className="mt-1 text-sm text-slate-600">Learner ref: {receipt.payerReference}</p>}<p className="mt-1 text-sm text-slate-600">{receipt.phone}</p></div>
   <div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Payment details</p><p className="mt-2 text-sm text-slate-700">Date: {formatEATDateTime(receipt.transactionDate)}</p><p className="mt-1 text-sm text-slate-700">Method: {receipt.paymentMethod}</p><p className="mt-1 text-sm text-slate-700">Reference: {receipt.paymentReference}</p></div>
  </div>
  <div className="mt-8 overflow-hidden rounded-xl border border-slate-200">
   <div className="grid grid-cols-[1fr_auto] gap-4 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500"><span>Description</span><span>Amount</span></div>
   <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-5"><div><p className="font-semibold text-slate-900">{receipt.description}</p><p className="mt-1 text-xs text-slate-500 capitalize">{receipt.paymentPurpose} payment</p></div><p className="font-bold tabular-nums text-slate-950">{money(receipt.amount)}</p></div>
   <div className="flex items-center justify-between border-t bg-blue-50 px-4 py-4"><p className="font-black text-slate-900">TOTAL PAID</p><p className="text-xl font-black tabular-nums text-blue-950">{money(receipt.amount)}</p></div>
  </div>
  <div className="mt-6 rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Payment confirmation</p><p className="mt-2 text-sm text-slate-700">M-Pesa transaction code: <strong className="tracking-wide text-slate-950">{receipt.mpesaReceipt||'Not supplied'}</strong></p><p className="mt-1 text-xs text-slate-500">This receipt is issued for a payment confirmed by the payment service provider.</p></div>
  <div className="mt-10 flex flex-wrap items-end justify-between gap-5 border-t pt-5"><div><p className="text-sm font-bold text-slate-900">Thank you for your payment.</p><p className="mt-1 text-xs text-slate-500">Generated electronically by Navstar Digital Hub.</p></div><div className="text-right text-xs text-slate-500"><p>Issued: {formatEATDateTime(receipt.issuedAt)}</p><p className="mt-1">Keep this receipt for your records.</p></div></div>
 </div>
}

export function PaymentReceiptsPage(){
 const {id}=useParams();
 const [payments,setPayments]=useState<PaymentRow[]>([]);
 const [receipt,setReceipt]=useState<Receipt|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 useEffect(()=>{let active=true;setLoading(true);setError('');
  const url=id?'/api/payments/receipt?id='+encodeURIComponent(id):'/api/admin/payments';
  fetch(url,{credentials:'same-origin'}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load payment records.');if(!active)return;if(id)setReceipt(data.receipt);else setPayments(data.payments||[]);}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'Could not load records.');}).finally(()=>{if(active)setLoading(false);});
  return ()=>{active=false};
 },[id]);
 const print=()=>window.print();
 if(loading)return <main className="min-h-[60vh] bg-slate-50 p-8 text-center text-sm text-slate-600">Loading payment records…</main>;
 if(error)return <main className="min-h-[60vh] bg-slate-50 px-4 py-12"><div className="mx-auto max-w-xl rounded-2xl border bg-white p-7"><h1 className="text-xl font-black text-slate-950">Payment records</h1><p role="alert" className="mt-3 text-sm text-rose-700">{error}</p><Link to="/admin" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-blue-700"><ArrowLeft className="h-4 w-4"/>Return to admin</Link></div></main>;
 if(id&&receipt)return <main className="min-h-[70vh] bg-slate-100 px-3 py-8 sm:px-6 print:bg-white print:p-0"><div className="mx-auto mb-5 flex max-w-3xl flex-wrap items-center justify-between gap-3 print:hidden"><Link to="/admin/receipts" className="inline-flex items-center gap-2 text-sm font-bold text-slate-700"><ArrowLeft className="h-4 w-4"/>All payment receipts</Link><button onClick={print} className="inline-flex items-center gap-2 rounded-xl bg-blue-800 px-4 py-2.5 text-sm font-bold text-white"><Download className="h-4 w-4"/>Print / Save as PDF</button></div><ReceiptDocument receipt={receipt}/><style>{'@media print { body { background: white !important; } @page { size: A4; margin: 14mm; } }'}</style></main>;
 return <main className="min-h-[70vh] bg-slate-50 px-4 py-10 sm:py-14"><div className="mx-auto max-w-6xl"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-black tracking-[.2em] text-blue-700">FINANCE MANAGEMENT</p><h1 className="mt-2 text-3xl font-black text-slate-950">Confirmed payment receipts</h1><p className="mt-2 text-sm text-slate-600">View confirmed transactions and print official Navstar receipts.</p></div><Link to="/admin" className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-bold text-slate-700"><ArrowLeft className="h-4 w-4"/>Admin dashboard</Link></div>
 <div className="mt-7 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center gap-3 border-b p-5"><ReceiptText className="h-5 w-5 text-blue-800"/><div><h2 className="font-bold text-slate-950">Payment history</h2><p className="text-xs text-slate-500">{payments.length} latest confirmed payments</p></div></div><div className="divide-y">{payments.map(payment=><article key={payment.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center"><div className="min-w-0"><p className="font-bold text-slate-950">{payment.payer_name}</p><p className="mt-1 text-sm text-slate-600">{payment.description} · {payment.phone}</p><p className="mt-1 text-xs text-slate-500">Navstar receipt: {payment.receipt_number||'Pending number'} · M-Pesa: {payment.mpesa_receipt||'—'} · {formatEATDateTime(payment.updated_at)}</p></div><div className="flex items-center justify-between gap-4 sm:justify-end"><p className="font-black tabular-nums text-slate-950">{money(payment.amount)}</p><Link to={'/payment-receipt/'+payment.id} className="inline-flex items-center gap-2 rounded-lg bg-blue-800 px-3 py-2 text-xs font-bold text-white"><FileText className="h-4 w-4"/>Receipt PDF</Link></div></article>)}{payments.length===0&&<p className="p-7 text-center text-sm text-slate-500">No confirmed payments are available yet.</p>}</div></div>
 </div></main>
}
