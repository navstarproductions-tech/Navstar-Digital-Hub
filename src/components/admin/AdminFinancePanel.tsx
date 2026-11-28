import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatEATDateTime } from '@/lib/datetime';
import { exportBrandedData } from '@/lib/navstar-data-tools';

type Ledger = 'all' | 'business' | 'fees';
type FinancePayment = {
  id: string; purpose: string; display_reference?: string; receipt_number?: string; mpesa_receipt?: string;
  amount: number; phone?: string; status: string; admin_status?: string; admin_review_note?: string;
  payer_name?: string; description?: string; contribution_type?: string; debt_reference?: string;
  debt_description?: string; created_at?: string; updated_at?: string;
};
type FinanceTotals = { transaction_count?: number; mpesa_received?: number; admin_confirmed?: number; awaiting_mpesa?: number; awaiting_admin_review?: number };
type Balance = { balance_text?: string; balance_amount?: number | null; currency?: string; received_at?: string; result_description?: string };
type FinanceResponse = { payments?: FinancePayment[]; totals?: FinanceTotals; mpesaBalance?: Balance | null; error?: string };

export function AdminFinancePanel({ role, ledger = 'business' }: { role: string; ledger?: 'business' | 'fees' }) {
  const [activeLedger, setActiveLedger] = useState<Ledger>(ledger);
  const [payments, setPayments] = useState<FinancePayment[]>([]);
  const [totals, setTotals] = useState<FinanceTotals>({});
  const [balance, setBalance] = useState<Balance | null>(null);
  const [loading, setLoading] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<'all'|'today'|'7days'|'30days'>('all');
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/payments?ledger=' + activeLedger, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      const data = await response.json() as FinanceResponse;
      if (!response.ok) throw new Error(data.error || 'Could not load the payment register.');
      setPayments(data.payments || []);
      setTotals(data.totals || {});
      setBalance(data.mpesaBalance || null);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Could not load the payment register.');
    } finally { setLoading(false); }
  }, [activeLedger]);
  useEffect(() => { if (role) void refresh(); }, [role, refresh]);
  useEffect(() => {
    if (!role) return;
    const timer = window.setInterval(() => { void refresh(); }, 20000);
    return () => window.clearInterval(timer);
  }, [role, refresh]);
  const review = async (paymentId: string, decision: 'confirmed' | 'flagged') => {
    try {
      const response = await fetch('/api/admin/payments/review', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ paymentId, decision }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Payment review failed.');
      setNotice(decision === 'confirmed' ? 'Verified payment confirmed in the register.' : 'Payment flagged for follow-up.');
      await refresh();
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Payment review failed.'); }
  };
  const requestBalance = async () => {
    setBalanceLoading(true); setNotice('');
    try {
      const response = await fetch('/api/admin/mpesa-balance', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{}',
      });
      const data = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(data.error || 'Balance enquiry failed.');
      setNotice(data.message || 'Safaricom accepted the balance enquiry. Waiting for its confirmed callback…');
      window.setTimeout(() => { void refresh(); }, 5000);
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Balance enquiry failed.'); }
    finally { setBalanceLoading(false); }
  };
  const money = (value: unknown) => Number(value || 0).toLocaleString('en-KE');
  const visiblePayments = useMemo(() => payments.filter(item => {
    const haystack = [item.payer_name,item.phone,item.display_reference,item.receipt_number,item.mpesa_receipt,item.description,item.purpose].join(' ').toLowerCase();
    if (search.trim() && !haystack.includes(search.trim().toLowerCase())) return false;
    if (period !== 'all' && item.created_at) {
      const date = new Date(item.created_at).getTime();
      const age = Date.now() - date;
      if (period === 'today' && new Date(item.created_at).toDateString() !== new Date().toDateString()) return false;
      if (period === '7days' && age > 7 * 86400000) return false;
      if (period === '30days' && age > 30 * 86400000) return false;
    }
    return true;
  }), [payments, search, period]);
  const title = activeLedger === 'all' ? 'All verified incoming payments' : activeLedger === 'fees' ? 'Student fee collection' : 'Business collections';
  return <div className="space-y-6">
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="bg-gradient-to-r from-slate-950 via-blue-950 to-emerald-950 p-5 text-white sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-300">NAVSTAR · LIVE FINANCIAL CONTROL</p><h2 className="mt-2 text-2xl font-black sm:text-3xl">M-PESA account balance</h2><p className="mt-2 max-w-2xl text-sm text-blue-100">Safaricom-reported float balance for PayBill 4343873. This is the provider balance, not the sum of unpaid invoices or a manually calculated figure.</p></div>
          <span className="rounded-full border border-emerald-300/40 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-200">Callback verified balance</span>
        </div>
        <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-blue-200">Last confirmed balance</p><p className="mt-1 text-4xl font-black tracking-tight sm:text-5xl">{balance?.balance_amount !== null && balance?.balance_amount !== undefined ? 'KSh ' + money(balance.balance_amount) : balance?.balance_text || 'Awaiting Safaricom'}</p><p className="mt-2 text-xs text-blue-200">{balance?.received_at ? 'Updated ' + formatEATDateTime(balance.received_at) : balance?.result_description || 'Request a balance enquiry to fetch the latest confirmed figure.'}</p></div>
          <Button type="button" className="bg-emerald-400 font-bold text-slate-950 hover:bg-emerald-300" onClick={() => void requestBalance()} disabled={balanceLoading || role !== 'admin'}>{balanceLoading ? 'Contacting Safaricom…' : '↻ Get live balance'}</Button>
        </div>
      </div>
      <div className="grid gap-3 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-white p-4"><p className="text-xs font-bold uppercase text-slate-500">Successful payments</p><p className="mt-2 text-2xl font-black text-slate-950">{money(totals.transaction_count)}</p><p className="text-xs text-slate-500">Number of transactions</p></div>
        <div className="rounded-xl border bg-white p-4"><p className="text-xs font-bold uppercase text-slate-500">M-PESA received</p><p className="mt-2 text-2xl font-black text-emerald-700">KSh {money(totals.mpesa_received)}</p></div>
        <div className="rounded-xl border bg-white p-4"><p className="text-xs font-bold uppercase text-slate-500">Admin verified</p><p className="mt-2 text-2xl font-black text-blue-800">KSh {money(totals.admin_confirmed)}</p></div>
        <div className="rounded-xl border bg-white p-4"><p className="text-xs font-bold uppercase text-slate-500">Needs review</p><p className="mt-2 text-2xl font-black text-amber-700">{money(totals.awaiting_admin_review)}</p><p className="text-xs text-slate-500">Successful payments pending review</p></div>
      </div>
    </section>
    <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-black text-slate-950">Payment register</h3><p className="text-sm text-slate-500">Recent transactions refresh automatically every 20 seconds.</p></div><Button type="button" variant="outline" onClick={() => void refresh()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh now'}</Button></div>
      <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Payment account views">
        {([{id:'all',label:'All payments'},{id:'business',label:'Business / services'},{id:'fees',label:'Student fees'}] as const).map(tab=><button key={tab.id} type="button" role="tab" aria-selected={activeLedger===tab.id} onClick={()=>setActiveLedger(tab.id)} className={`rounded-full px-4 py-2 text-sm font-bold transition ${activeLedger===tab.id?'bg-blue-900 text-white':'border bg-white text-slate-700 hover:bg-slate-50'}`}>{tab.label}</button>)}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]"><Input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search payer, phone, account reference or M-PESA receipt…"/><select value={period} onChange={event=>setPeriod(event.target.value as typeof period)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="all">All dates</option><option value="today">Today</option><option value="7days">Last 7 days</option><option value="30days">Last 30 days</option></select></div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2"><div><h4 className="font-bold text-slate-900">{title}</h4><p className="text-xs text-slate-500">Showing {visiblePayments.length} of {payments.length} recorded payments · Up to 500 latest records</p></div><Button type="button" size="sm" variant="outline" onClick={() => { try { exportBrandedData('pdf', activeLedger==='fees'?'Student Fee Statement Ledger':activeLedger==='all'?'All Navstar Payment Transactions':'Navstar Business Account Statement', ['Payer','Phone','Purpose','Reference','Amount (KSh)','M-PESA receipt','Status','Date'], visiblePayments.map(item=>({Payer:item.payer_name||'Customer',Phone:item.phone||'—',Purpose:item.description||item.purpose,Reference:item.display_reference||item.receipt_number||'—','Amount (KSh)':item.amount,'M-PESA receipt':item.mpesa_receipt||'—',Status:item.status,Date:item.created_at?formatEATDateTime(item.created_at):'—'}))); } catch(cause){setNotice(cause instanceof Error?cause.message:'Could not generate statement.');} }}>Export PDF statement</Button></div>
      <div className="mt-3 overflow-x-auto rounded-xl border"><table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-3">Payer / details</th><th className="p-3">Account reference</th><th className="p-3">Amount</th><th className="p-3">M-PESA receipt</th><th className="p-3">Received</th><th className="p-3">Admin review</th><th className="p-3">Actions</th></tr></thead><tbody>{visiblePayments.map(item=><tr key={item.id} className="border-t hover:bg-slate-50"><td className="p-3"><p className="font-bold text-slate-900">{item.payer_name||'Customer'}</p><p className="text-xs text-slate-500">{item.phone||'Phone unavailable'} · {item.description||item.purpose}</p></td><td className="p-3 font-mono text-xs">{item.display_reference||'—'}<p className="text-slate-500">{item.receipt_number||''}</p></td><td className="p-3 font-black">KSh {money(item.amount)}</td><td className="p-3 font-mono text-xs">{item.mpesa_receipt||'—'}</td><td className="p-3 text-xs">{item.created_at?formatEATDateTime(item.created_at):'—'}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${item.admin_status==='confirmed'?'bg-emerald-100 text-emerald-800':item.admin_status==='flagged'?'bg-rose-100 text-rose-800':'bg-amber-100 text-amber-800'}`}>{item.admin_status||'pending review'}</span>{item.admin_review_note&&<p className="mt-1 text-xs text-slate-500">{item.admin_review_note}</p>}</td><td className="p-3">{item.status==='paid'&&item.admin_status!=='confirmed'&&role==='admin'?<div className="flex gap-1"><Button size="sm" type="button" onClick={()=>void review(item.id,'confirmed')}>Verify</Button><Button size="sm" type="button" variant="outline" onClick={()=>void review(item.id,'flagged')}>Flag</Button></div>:<span className="text-xs text-slate-400">—</span>}</td></tr>)}</tbody></table>{visiblePayments.length===0&&<p className="p-6 text-center text-sm text-slate-500">No payments match this search or date filter.</p>}</div>
      <p className="mt-3 text-xs leading-5 text-slate-500">Payment records are confirmed from Safaricom callbacks. The live PayBill balance is a separate Safaricom account enquiry; it is not calculated by adding the records shown here.</p>
    </section>
    {notice&&<p role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{notice}</p>}
  </div>;
}
