import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatEATDateTime } from '@/lib/datetime';
import { exportBrandedData } from '@/lib/navstar-data-tools';

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
  const [payments, setPayments] = useState<FinancePayment[]>([]);
  const [totals, setTotals] = useState<FinanceTotals>({});
  const [balance, setBalance] = useState<Balance | null>(null);
  const [loading, setLoading] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/payments?ledger=' + ledger, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      const data = await response.json() as FinanceResponse;
      if (!response.ok) throw new Error(data.error || 'Could not load the payment register.');
      setPayments(data.payments || []);
      setTotals(data.totals || {});
      setBalance(data.mpesaBalance || null);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Could not load the payment register.');
    } finally { setLoading(false); }
  }, [ledger]);
  useEffect(() => { if (role) void refresh(); }, [role, refresh]);
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
      setNotice(data.message || 'Balance enquiry submitted.');
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Balance enquiry failed.'); }
    finally { setBalanceLoading(false); }
  };
  const money = (value: unknown) => Number(value || 0).toLocaleString('en-KE');
  return <div className="space-y-5">
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ['Successful M-Pesa received', totals.mpesa_received], ['Admin confirmed', totals.admin_confirmed],
        ['Successful transactions', totals.transaction_count], ['Awaiting admin review', totals.awaiting_admin_review],
      ].map(([label, value]) => <div key={String(label)} className="rounded-xl border bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-2 text-xl font-black text-slate-950">KSh {money(value)}</p>
      </div>)}
    </section>
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-white p-5">
      <div><h3 className="font-bold text-slate-950">{ledger === 'fees' ? 'Student fee collection' : 'Business M-Pesa account balance'}</h3>
        <p className="mt-1 text-sm text-slate-600">{ledger === 'fees' ? 'Student course and enrolment payments only. Business services, parcels and cyber sales are excluded completely.' : 'Business services and contributions are shown separately from student fee collections.'}</p>
        {ledger === 'business' && balance?.received_at ? <p className="mt-2 text-sm font-bold text-emerald-800">
          {balance.balance_amount !== null && balance.balance_amount !== undefined ? 'KSh ' + money(balance.balance_amount) : (balance.balance_text || balance.result_description || 'Balance response received')}
          {' · '}{formatEATDateTime(balance.received_at)}
        </p>  : ledger === 'business' ? <p className="mt-2 text-sm text-amber-700">No live balance response received yet.</p> : null}
      </div>
      <div className="flex gap-2"><Button type="button" variant="outline" onClick={() => void refresh()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh register'}</Button>
        {ledger === 'business' && <Button type="button" onClick={() => void requestBalance()} disabled={balanceLoading || role !== 'admin'}>{balanceLoading ? 'Requesting…' : 'Request live balance'}</Button>}</div>
    </section>
    <section className="overflow-hidden rounded-xl border bg-white">
      <div className="border-b p-5"><h3 className="font-bold text-slate-950">{ledger === 'fees' ? 'Student fee payment ledger' : 'Business sales and contribution ledger'}</h3>
        <p className="mt-1 text-sm text-slate-600">{ledger === 'fees' ? 'Only student enrolment fee payments appear here. Business sales do not appear in this ledger.' : 'Business service sales and contributions only. Student course fees are kept in the separate Collect Fees account.'}</p><Button type="button" variant="outline" size="sm" onClick={() => { try { exportBrandedData('pdf', ledger === 'fees' ? 'Student Fee Statement Ledger' : 'Navstar Business Account Statement', ['Payer','Purpose','Reference','Amount (KSh)','Status','Date'], payments.map(item => ({Payer:item.payer_name||'—',Purpose:item.description||item.purpose,Reference:item.display_reference||item.receipt_number||'—','Amount (KSh)':item.amount,Status:item.admin_status||item.status,Date:item.created_at?formatEATDateTime(item.created_at):'—'}))); } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Statement PDF could not be generated.'); } }}>Generate PDF statement</Button></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-xs">
        <thead className="bg-slate-50 uppercase text-slate-500"><tr><th className="p-3">Payer / purpose</th><th className="p-3">Reference</th><th className="p-3">Amount</th><th className="p-3">M-Pesa</th><th className="p-3">Admin review</th><th className="p-3">Action</th></tr></thead>
        <tbody>{payments.map(item => <tr key={item.id} className="border-t">
          <td className="p-3"><strong>{item.payer_name || 'Supporter'}</strong><p className="mt-1 text-slate-500">{item.description || item.purpose}{item.debt_reference ? ' · Debt: ' + item.debt_reference : ''}{item.debt_description ? ' · ' + item.debt_description : ''}</p></td>
          <td className="p-3">{item.display_reference || '—'}<p className="text-slate-500">{item.receipt_number || ''}</p></td>
          <td className="p-3 font-bold">KSh {money(item.amount)}</td>
          <td className="p-3">{item.status || '—'}{item.mpesa_receipt ? <p className="text-slate-500">{item.mpesa_receipt}</p> : null}</td>
          <td className="p-3">{item.admin_status || 'not_received'}{item.admin_review_note ? <p className="text-slate-500">{item.admin_review_note}</p> : null}</td>
          <td className="p-3">{item.status === 'paid' && item.admin_status !== 'confirmed' && role === 'admin' ? <div className="flex gap-2">
            <Button size="sm" type="button" onClick={() => void review(item.id, 'confirmed')}>Confirm</Button>
            <Button size="sm" type="button" variant="outline" onClick={() => void review(item.id, 'flagged')}>Flag</Button>
          </div> : '—'}</td>
        </tr>)}</tbody>
      </table></div>
      {payments.length === 0 && <p className="p-5 text-sm text-slate-500">No successful payment transactions are recorded in this account yet.</p>}
    </section>
    {notice && <p role="status" className="rounded-lg border bg-slate-50 p-3 text-sm text-slate-700">{notice}</p>}
  </div>;
}
