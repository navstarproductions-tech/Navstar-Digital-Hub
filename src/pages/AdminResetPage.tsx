import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function AdminResetPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const reset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true); setStatus('');
    try {
      const response = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + String(form.get('resetToken') ?? '') },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Password reset failed.');
      navigate('/login?role=admin', { replace: true, state: { notice: 'Password reset. Sign in using your new password.' } });
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Password reset failed.'); }
    finally { setLoading(false); }
  };
  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-slate-950 px-4 py-12">
      <section className="w-full max-w-lg rounded-2xl border border-white/10 bg-white p-7 shadow-2xl sm:p-9">
        <ShieldCheck className="h-8 w-8 text-blue-700" />
        <p className="mt-5 text-xs font-extrabold uppercase tracking-[.2em] text-blue-700">Navstar secure account recovery</p>
        <h1 className="mt-2 text-2xl font-black text-slate-950">Reset Admin Password</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Use the private reset token configured in Cloudflare Pages secrets. Never share that token in chat or with anyone.</p>
        <form onSubmit={reset} className="mt-6 space-y-4">
          <div className="space-y-2"><Label htmlFor="reset-token">Admin reset token</Label><Input id="reset-token" name="resetToken" type="password" autoComplete="off" minLength={32} required /></div>
          <div className="space-y-2"><Label htmlFor="admin-email">Administrator email</Label><Input id="admin-email" name="email" type="email" autoComplete="username" required /></div>
          <div className="space-y-2"><Label htmlFor="new-admin-password">New password</Label><Input id="new-admin-password" name="password" type="password" autoComplete="new-password" minLength={14} required /><p className="text-xs text-slate-500">At least 14 characters. Existing admin sessions will be signed out.</p></div>
          <Button type="submit" disabled={loading} className="w-full bg-blue-800 hover:bg-blue-900"><KeyRound className="mr-2 h-4 w-4" />{loading ? 'Resetting password…' : 'Reset Admin Password'}</Button>
          {status && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{status}</p>}
        </form>
        <Link to="/login?role=admin" className="mt-5 inline-block text-sm font-semibold text-blue-700">Back to Admin Login</Link>
      </section>
    </main>
  );
}
