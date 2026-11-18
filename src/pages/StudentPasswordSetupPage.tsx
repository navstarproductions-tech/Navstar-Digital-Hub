import { FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, KeyRound, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function StudentPasswordSetupPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password,setPassword] = useState('');
  const [confirmPassword,setConfirmPassword] = useState('');
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');
  const [complete,setComplete] = useState(false);

  const submit = async (event:FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) { setError('This password setup link is incomplete. Ask Navstar Admissions to issue a new link.'); return; }
    if (password !== confirmPassword) { setError('The passwords do not match.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/student/password-setup', {
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
        body:JSON.stringify({password,confirmPassword})
      });
      const data = await response.json() as {saved?:boolean;message?:string;error?:string};
      if (!response.ok || !data.saved) throw new Error(data.error || 'Your password could not be saved.');
      setComplete(true);
      setMessage(data.message || 'Your password is ready. You can now sign in.');
      setPassword(''); setConfirmPassword('');
    } catch(cause) { setError(cause instanceof Error?cause.message:'Password setup failed.'); }
    finally { setBusy(false); }
  };

  return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
    <section className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
      <header className="bg-gradient-to-r from-[#071a38] to-[#123c70] p-6 text-white">
        <p className="text-xs font-black tracking-[.22em] text-amber-300">HOME OF TECHNOCRATS</p>
        <h1 className="mt-3 text-2xl font-extrabold">Set your Student Portal password</h1>
        <p className="mt-2 text-sm text-blue-100">NAVSTAR DIGITAL HUB · Secure account activation</p>
      </header>
      <div className="p-6 sm:p-8">
        {complete?<div className="space-y-4 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-8 w-8"/></div><h2 className="text-xl font-bold text-slate-950">Password set successfully</h2><p className="text-sm leading-6 text-slate-600">{message}</p><Link to="/login?role=student" className="inline-flex rounded-lg bg-blue-800 px-5 py-3 text-sm font-bold text-white">Go to Student Portal login</Link></div>:<>
          <div className="mb-5 flex items-start gap-3 rounded-xl bg-blue-50 p-4 text-sm leading-6 text-blue-950"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0"/><p>This private, one-time link expires after 24 hours. Create your own password. Navstar staff will never ask you to send them your password.</p></div>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={event=>setPassword(event.target.value)} minLength={14} required/><p className="text-xs text-slate-500">At least 14 characters, using at least three character types.</p></div>
            <div className="space-y-2"><Label htmlFor="confirm-password">Confirm password</Label><Input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)} minLength={14} required/></div>
            {error&&<p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
            <Button type="submit" disabled={busy||!token} className="w-full bg-blue-800 hover:bg-blue-900"><KeyRound className="mr-2 h-4 w-4"/>{busy?'Saving securely…':'Set my password'}</Button>
          </form>
        </>}
      </div>
    </section>
  </main>;
}
