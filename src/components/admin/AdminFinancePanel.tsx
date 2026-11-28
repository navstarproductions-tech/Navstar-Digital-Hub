import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatEATDateTime } from '@/lib/datetime';
import { exportBrandedData } from '@/lib/navstar-data-tools';

type FinancePayment = {
  id: string; purpose: string; display_reference?: string; receipt_number?: string; mpesa_receipt?: string;
  amount: number; phone?: string; status: string; admin_status?: string; admin_review_note?: string;
  payer_name?: string; description?: string; contribution_type?: string; debt_reference?: string;
  debt_description?: string; created_at?: string; updated_at?: string; source?: string; bill_reference?: string; transaction_time?: string;
};
type FinanceTotals = { transaction_count?: number; mpesa_received?: number; admin_confirmed?: number; awaiting_mpesa?: number; awaiting_admin_review?: number; failed_amount?: number; successful_count?: number; pending_count?: number; failed_count?: number };
type Balance = { balance_text?: string; balance_amount?: number | null; currency?: string; received_at?: string; created_at?: string; latest_request_at?: string; result_description?: string };
type Cashout = { id: string; reference?: string; amount: number; status: string; recipient_phone?: string; requested_by?: string; payout_status?: string; payout_description?: string; transaction_id?: string; submitted_at?: string; received_at?: string };
type FinanceResponse = { payments?: FinancePayment[]; totals?: FinanceTotals; mpesaBalance?: Balance | null; error?: string };
type CashoutResponse = { requests?: Cashout[]; error?: string };

export function AdminFinancePanel({ role, ledger = 'business' }: { role: string; ledger?: 'business' | 'fees' }) {
  const [payments, setPayments] = useState<FinancePayment[]>([]);
  const [totals, setTotals] = useState<FinanceTotals>({});
  const [balance, setBalance] = useState<Balance | null>(null);
  const [cashouts, setCashouts] = useState<Cashout[]>([]);
  const [loading, setLoading] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [lastRefresh, setLastRefresh] = useState('');
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [balanceRequestedAt, setBalanceRequestedAt] = useState('');
  const [c2bRegistering, setC2bRegistering] = useState(false);

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const requests: Promise<Response>[] = [
        fetch('/api/admin/payments?ledger=' + ledger, { headers: { Accept: 'application/json' }, cache: 'no-store' }),
      ];
      if (ledger === 'business') requests.push(fetch('/api/admin/cashouts', { headers: { Accept: 'application/json' }, cache: 'no-store' }));
      const responses = await Promise.all(requests);
      const data = await responses[0].json() as FinanceResponse;
      if (!responses[0].ok) throw new Error(data.error || 'Could not load the payment register.');
      setPayments(data.payments || []);
      setTotals(data.totals || {});
      setBalance(data.mpesaBalance || null);
      if (responses[1]) {
        const payoutData = await responses[1].json() as CashoutResponse;
        if (!responses[1].ok) throw new Error(payoutData.error || 'Could not refresh payout statuses.');
        setCashouts(payoutData.requests || []);
      }
      setLastRefresh(new Date().toISOString());
    } catch (cause) {
      if (!quiet) setNotice(cause instanceof Error ? cause.message : 'Could not load the payment register.');
    } finally { if (!quiet) setLoading(false); }
  }, [ledger]);

  useEffect(() => {
    const clock = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    if (!role) return;
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh(true);
    }, 15000);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(true); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [role, refresh]);

  useEffect(() => {
    if (!balanceRequestedAt) return;
    const started = Date.parse(balanceRequestedAt);
    if (balance?.received_at && Date.parse(balance.received_at) >= started) {
      setBalanceRequestedAt('');
      return;
    }
    const poll = window.setInterval(() => {
      void refresh(true);
      if (Date.now() - started >= 120000) {
        window.clearInterval(poll);
        setBalanceRequestedAt('');
      }
    }, 3000);
    return () => window.clearInterval(poll);
  }, [balanceRequestedAt, balance?.received_at, refresh]);

  const review = async (paymentId: string, decision: 'confirmed' | 'flagged') => {
    try {
      const response = await fetch('/api/admin/payments/review', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ paymentId, decision }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Payment review failed.');
      setNotice(decision === 'confirmed' ? 'Payment confirmed in the administrative register.' : 'Payment flagged for follow-up.');
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
      const requestedAt = new Date().toISOString();
      setBalanceRequestedAt(requestedAt);
      setNotice(data.message || 'Safaricom accepted the enquiry. Waiting for its callback; the last confirmed balance remains visible until a new result arrives.');
      void refresh(true);
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Balance enquiry failed.'); }
    finally { setBalanceLoading(false); }
  };

  const registerPaybillCallbacks = async () => {
    setC2bRegistering(true); setNotice('');
    try {
      const response = await fetch('/api/admin/mpesa-c2b-register', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{}' });
      const data = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(data.error || 'PayBill callback registration failed.');
      setNotice(data.message || 'Safaricom accepted the PayBill callback registration.');
      await refresh(true);
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'PayBill callback registration failed.'); }
    finally { setC2bRegistering(false); }
  };

  const money = (value: unknown) => Number(value || 0).toLocaleString('en-KE', { maximumFractionDigits: 2 });
  const balanceAgeMs = balance?.received_at ? Math.max(0, clockNow - Date.parse(balance.received_at)) : null;
  const balanceAgeMinutes = balanceAgeMs === null ? null : Math.floor(balanceAgeMs / 60000);
  const balanceFreshness = balanceAgeMs === null ? 'No confirmed balance yet' : balanceAgeMs < 120000 ? 'Fresh · just received' : balanceAgeMs < 900000 ? 'Delayed · awaiting next update' : 'Stale · request a new Safaricom enquiry';
  const balanceAgeLabel = balanceAgeMs === null ? 'Not available' : balanceAgeMinutes < 1 ? 'less than a minute ago' : balanceAgeMinutes < 60 ? `${balanceAgeMinutes} minutes ago` : `${Math.floor(balanceAgeMinutes / 60)}h ${balanceAgeMinutes % 60}m ago`;
  const filteredPayments = useMemo(() => statusFilter === 'all' ? payments : payments.filter(item => {
    if (statusFilter === 'pending') return ['pending', 'initiating', 'processing'].includes(item.status);
    return item.status === statusFilter;
  }), [payments, statusFilter]);

  return <div className="space-y-5">
    {ledger === 'business' && <section className="overflow-hidden rounded-2xl border border-blue-900 bg-gradient-to-br from-[#06152f] via-[#0b3470] to-[#087d79] p-5 text-white shadow-lg sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-black uppercase tracking-[.22em] text-cyan-200">NAVSTAR · LIVE SAFARICOM ACCOUNT</p>
          <h2 className="mt-2 text-sm font-semibold text-blue-100">Available M-PESA balance</h2>
          <p className="mt-1 text-4xl font-black tracking-tight sm:text-5xl">{balance?.balance_amount !== null && balance?.balance_amount !== undefined ? 'KSh ' + money(balance.balance_amount) : (balance?.balance_text || 'Awaiting live balance')}</p>
          <p className="mt-3 text-xs text-blue-100">{balance?.received_at ? 'Last confirmed by Safaricom: ' + formatEATDateTime(balance.received_at) : 'No successful Safaricom balance callback has been received yet.'}</p>
          <p className="mt-1 text-xs font-semibold text-cyan-100">Current EAT time: {formatEATDateTime(new Date(clockNow).toISOString())}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs"><span className="rounded-full bg-white/15 px-2.5 py-1 font-bold">{balanceFreshness}</span><span className="text-cyan-100">Balance last received {balanceAgeLabel}</span></div>
          {balanceRequestedAt && <p className="mt-2 text-xs text-amber-100">New enquiry sent {formatEATDateTime(balanceRequestedAt)} · checking for Safaricom callback…</p>}
          <p className="mt-2 text-[11px] text-cyan-100">Payment register refreshes every 15 seconds. Balance amount changes only after Safaricom confirms a new callback.</p>
        </div>
        <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => void requestBalance()} disabled={balanceLoading || role !== 'admin'}>{balanceLoading ? 'Requesting…' : 'Refresh Safaricom balance'}</Button><Button type="button" variant="secondary" onClick={() => void registerPaybillCallbacks()} disabled={c2bRegistering || role !== 'admin'}>{c2bRegistering ? 'Registering…' : 'Connect PayBill receipts'}</Button></div>
      </div>
    </section>}
    {ledger === 'business' && <section className="overflow-hidden rounded-xl border bg-white">
      <div className="border-b p-4"><h3 className="font-bold text-slate-950">M-PESA phone payouts</h3><p className="text-xs text-slate-500">Safaricom callback status is refreshed automatically. Accepted or submitting does not mean paid.</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-slate-50 uppercase text-slate-500"><tr><th className="p-3">Reference / recipient</th><th className="p-3">Amount</th><th className="p-3">Request status</th><th className="p-3">Safaricom result</th><th className="p-3">Receipt</th><th className="p-3">Updated</th></tr></thead>
        <tbody>{cashouts.map(item => <tr key={item.id} className="border-t"><td className="p-3 font-semibold">{item.reference || item.id}<p className="font-normal text-slate-500">{item.recipient_phone || '—'} · {item.requested_by || '—'}</p></td><td className="p-3 font-bold">KSh {money(item.amount)}</td><td className="p-3">{item.status}</td><td className="p-3">{item.payout_status || 'Not submitted'}<p className="text-slate-500">{item.payout_description || ''}</p></td><td className="p-3">{item.transaction_id || 'Pending callback'}</td><td className="p-3">{item.received_at ? formatEATDateTime(item.received_at) : item.submitted_at ? formatEATDateTime(item.submitted_at) : '—'}</td></tr>)}</tbody>
      </table></div>
      {cashouts.length === 0 && <p className="p-4 text-sm text-slate-500">No payout requests recorded.</p>}
    </section>}
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ['Successful received', 'KSh ' + money(totals.mpesa_received)],
        ['Pending amount', 'KSh ' + money(totals.awaiting_mpesa)],
        ['Failed amount', 'KSh ' + money(totals.failed_amount)],
        ['Transactions', String(totals.transaction_count ?? payments.length)],
      ].map(([label, value]) => <div key={label} className="rounded-xl border bg-white p-4 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-xl font-black text-slate-950">{value}</p>
      </div>)}
    </section>
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4">
      <div><h3 className="font-bold text-slate-950">{ledger === 'fees' ? 'Student fee collection' : 'Business payment activity'}</h3>
        <p className="mt-1 text-sm text-slate-600">{ledger === 'fees' ? 'Student enrolment transactions and their current payment states.' : 'Service payments, donations, direct PayBill receipts and payout requests. PayBill confirmations are imported automatically; pending and failed prompt payments remain visible for reconciliation.'}</p>
        {lastRefresh && <p className="mt-1 text-xs text-slate-500">Screen refreshed: {formatEATDateTime(lastRefresh)}</p>}
      </div>
      <Button type="button" variant="outline" onClick={() => void refresh()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh now'}</Button>
    </section>
    <section className="overflow-hidden rounded-xl border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div><h3 className="font-bold text-slate-950">Payment register</h3><p className="text-xs text-slate-500">Most recent 500 transactions · automatically refreshed</p></div>
        <div className="flex flex-wrap gap-2">{['all','paid','pending','failed'].map(value => <Button key={value} size="sm" type="button" variant={statusFilter === value ? 'default' : 'outline'} onClick={() => setStatusFilter(value)}>{value === 'all' ? 'All' : value[0].toUpperCase()+value.slice(1)}</Button>)}</div>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs">
        <thead className="bg-slate-50 uppercase text-slate-500"><tr><th className="p-3">Payer / purpose</th><th className="p-3">Reference</th><th className="p-3">Amount</th><th className="p-3">Payment status</th><th className="p-3">M-PESA receipt</th><th className="p-3">Admin review</th><th className="p-3">Action</th></tr></thead>
        <tbody>{filteredPayments.map(item => <tr key={item.id} className="border-t">
          <td className="p-3"><strong>{item.payer_name || 'Payer'}</strong><p className="mt-1 text-slate-500">{item.source === 'paybill' ? 'DIRECT PAYBILL' : (item.description || item.purpose)}{item.phone ? ' · '+item.phone : ''}{item.debt_reference ? ' · '+item.debt_reference : ''}</p></td>
          <td className="p-3">{item.display_reference || item.bill_reference || '—'}<p className="text-slate-500">{item.receipt_number || ''}</p></td>
          <td className="p-3 font-bold">KSh {money(item.amount)}</td>
          <td className="p-3"><span className={'rounded-full px-2 py-1 font-bold '+(item.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : item.status === 'failed' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800')}>{item.status}</span></td>
          <td className="p-3">{item.mpesa_receipt || '—'}</td><td className="p-3">{item.admin_status || '—'}{item.admin_review_note ? <p className="text-slate-500">{item.admin_review_note}</p> : null}</td>
          <td className="p-3">{item.source !== 'paybill' && item.status === 'paid' && item.admin_status !== 'confirmed' && role === 'admin' ? <div className="flex gap-2"><Button size="sm" type="button" onClick={() => void review(item.id, 'confirmed')}>Confirm</Button><Button size="sm" type="button" variant="outline" onClick={() => void review(item.id, 'flagged')}>Flag</Button></div> : '—'}</td>
        </tr>)}</tbody>
      </table></div>
      {filteredPayments.length === 0 && <p className="p-5 text-sm text-slate-500">No transactions match this filter.</p>}
      <div className="border-t p-4"><Button type="button" variant="outline" size="sm" onClick={() => { try { exportBrandedData('pdf', ledger === 'fees' ? 'Student Fee Statement Ledger' : 'Navstar Business Account Statement', ['Payer','Purpose','Reference','Amount (KSh)','Status','Date'], filteredPayments.map(item => ({Payer:item.payer_name||'—',Purpose:item.description||item.purpose,Reference:item.display_reference||item.receipt_number||'—','Amount (KSh)':item.amount,Status:item.status,Date:item.created_at?formatEATDateTime(item.created_at):'—'}))); } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Statement PDF could not be generated.'); } }}>Generate filtered PDF statement</Button></div>
    </section>

    {notice && <p role="status" className="rounded-lg border bg-slate-50 p-3 text-sm text-slate-700">{notice}</p>}
  </div>;
}
