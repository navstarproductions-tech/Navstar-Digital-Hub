import { useState } from 'react';
import { ArrowLeft, Copy, Database, KeyRound, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Base44MigrationPage() {
  const [token, setToken] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function createToken() {
    setBusy(true); setError(''); setToken(''); setCopied(false);
    try {
      const response = await fetch('/api/admin/base44-migration/token', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}'
      });
      const result = await response.json();
      if (!response.ok || !result.token) throw new Error(result.error || 'Could not create a migration token.');
      setToken(result.token); setExpiresAt(result.expiresAt || '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create a migration token.');
    } finally { setBusy(false); }
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(true);
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link to="/admin" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-800 hover:underline"><ArrowLeft className="h-4 w-4"/>Back to Admin Portal</Link>
        <header className="rounded-2xl bg-gradient-to-r from-[#09224b] to-[#075b9c] p-6 text-white shadow-lg">
          <div className="flex items-center gap-3"><Database className="h-7 w-7 text-amber-300"/><div><p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-200">Navstar Digital Hub</p><h1 className="text-2xl font-black">Base44 Data Migration</h1></div></div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/80">Create a short-lived, one-time transfer token for moving all Base44 records into the official Navstar site. Source passwords are hashed during transfer; they are never written to the public GitHub repository.</p>
        </header>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3"><ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-emerald-600"/><div><h2 className="font-bold">Secure transfer setup</h2><p className="mt-1 text-sm text-slate-600">Open this page while signed in as a Navstar administrator. Generate a token, then copy the official site address and token into the Migration Centre inside the Base44 app.</p></div></div>
          <div className="mt-5 rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Official site address</p><div className="mt-2 flex flex-wrap items-center gap-2"><code className="min-w-0 flex-1 break-all text-sm font-semibold">{window.location.origin}</code><button onClick={()=>copy(window.location.origin)} className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-xs font-bold"><Copy className="h-3.5 w-3.5"/>Copy</button></div></div>
          <button onClick={createToken} disabled={busy} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-800 px-5 py-3 text-sm font-bold text-white hover:bg-blue-900 disabled:opacity-50"><KeyRound className="h-4 w-4"/>{busy?'Creating secure token…':'Generate one-time migration token'}</button>
          {error&&<p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          {token&&<div className="mt-5 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><div><p className="text-sm font-bold text-emerald-900">Token created</p><p className="mt-1 text-xs text-emerald-800">Expires {expiresAt ? new Date(expiresAt).toLocaleString() : 'in one hour'}. It can be used for one migration run only.</p></div><div className="flex flex-col gap-2 sm:flex-row"><code className="min-w-0 flex-1 break-all rounded-lg border border-emerald-200 bg-white p-3 text-xs text-slate-800">{token}</code><button onClick={()=>copy(token)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-3 text-xs font-bold text-white"><Copy className="h-4 w-4"/>{copied?'Copied':'Copy token'}</button></div><p className="text-xs text-emerald-900">Keep this token private. Do not send it in a public message or commit it to GitHub.</p></div>}
        </section>
        <p className="text-xs leading-5 text-slate-500">The migration runs from the authenticated Base44 admin app. The official site stores the incoming records in its private database archive first, including credential hashes, so records can be reconciled into their live modules without exposing personal data in source control.</p>
      </div>
    </main>
  );
}
