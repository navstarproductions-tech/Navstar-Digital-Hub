import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, KeyRound, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { readApiResponse } from '@/lib/api';

export function BootstrapPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const passwordsMatch = password.length > 0 && password === confirmPassword;

  const createAdmin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.length < 6) {
      setStatus('Your password must contain at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setStatus('The passwords do not match. Please enter the same password twice.');
      return;
    }

    const form = event.currentTarget;
    const data = new FormData(form);
    setLoading(true);
    setStatus('');
    try {
      const response = await fetch('/api/admin/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.get('name'),
          email: data.get('email'),
          password,
          confirmPassword,
        }),
      });
      const result = await readApiResponse<{ error?: string }>(response);
      if (!response.ok) throw new Error(result.error ?? 'Admin account creation failed.');
      form.reset();
      setPassword('');
      setConfirmPassword('');
      navigate('/login?role=admin', { replace: true, state: { notice: 'Admin account created. Sign in with your new email and password.' } });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Admin account creation failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-slate-50 px-4 py-12">
      <section className="w-full max-w-lg border bg-white p-6 shadow-sm sm:p-8">
        <Link to="/login" className="inline-flex items-center gap-2 text-sm text-slate-600"><ArrowLeft className="h-4 w-4" /> Sign in</Link>
        <ShieldCheck className="mt-7 h-6 w-6 text-emerald-800" />
        <p className="mt-4 text-xs font-bold uppercase text-emerald-800">NAVSTAR DIGITAL HUB / FIRST-TIME SETUP</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">Create the first Admin account</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Enter your details and create a password. This form is available only until the first Admin account is created.</p>
        <form onSubmit={createAdmin} className="mt-6 space-y-4">
          <div className="space-y-2"><Label htmlFor="admin-name">Full name</Label><Input id="admin-name" name="name" autoComplete="name" required minLength={2} /></div>
          <div className="space-y-2"><Label htmlFor="admin-email">Email address</Label><Input id="admin-email" name="email" type="email" autoComplete="email" required /></div>
          <div className="space-y-2"><Label htmlFor="admin-password">Create password</Label><Input id="admin-password" name="password" type="password" autoComplete="new-password" minLength={6} required value={password} onChange={(event) => { setPassword(event.target.value); setStatus(''); }} /><p className="text-xs text-slate-500">Use at least 6 characters.</p></div>
          <div className="space-y-2"><Label htmlFor="confirm-password">Confirm password</Label><Input id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength={6} required value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setStatus(''); }} />{confirmPassword.length > 0 && <p className={`text-xs ${passwordsMatch ? 'text-emerald-700' : 'text-red-700'}`}>{passwordsMatch ? 'Passwords match.' : 'Passwords do not match.'}</p>}</div>
          <Button type="submit" disabled={loading || !passwordsMatch || password.length < 6} className="w-full bg-emerald-800 hover:bg-emerald-900"><KeyRound className="mr-2 h-4 w-4" />{loading ? 'Creating account…' : 'Create Admin account'}</Button>
          {status && <p role="alert" className="text-sm text-red-700">{status}</p>}
        </form>
      </section>
    </main>
  );
}
