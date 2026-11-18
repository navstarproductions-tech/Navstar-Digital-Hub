import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Stage = 'email' | 'otp' | 'password' | 'complete';

export function AdminResetPage() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const requestCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true); setStatus('');
    try {
      const response = await fetch('/api/admin/recovery/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error || 'The recovery email could not be sent.');
      setStatus(result.message || 'Check your email inbox and spam folder for the verification code.');
      setStage('otp');
    } catch (cause) { setStatus(cause instanceof Error ? cause.message : 'The recovery request failed.'); }
    finally { setLoading(false); }
  };

  const verifyCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true); setStatus('');
    try {
      const response = await fetch('/api/admin/recovery/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      const result = await response.json() as { error?: string; resetToken?: string; message?: string };
      if (!response.ok || !result.resetToken) throw new Error(result.error || 'Email verification failed.');
      setResetToken(result.resetToken);
      setStatus(result.message || 'Email verified. Choose a new password.');
      setStage('password');
    } catch (cause) { setStatus(cause instanceof Error ? cause.message : 'Email verification failed.'); }
    finally { setLoading(false); }
  };

  const savePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true); setStatus('');
    try {
      const response = await fetch('/api/admin/recovery/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + resetToken },
        body: JSON.stringify({ password, confirmPassword }),
      });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error || 'Password reset failed.');
      setResetToken(''); setPassword(''); setConfirmPassword('');
      setStatus(result.message || 'Admin account recovered successfully.');
      setStage('complete');
    } catch (cause) { setStatus(cause instanceof Error ? cause.message : 'Password reset failed.'); }
    finally { setLoading(false); }
  };

  const resend = async () => {
    setStage('email');
    setOtp('');
    setStatus('Request a fresh verification code. Previous codes will no longer work.');
  };

  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-[#061127] px-4 py-12">
      <section className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl">
        <div className="bg-gradient-to-r from-[#071a38] via-blue-900 to-cyan-800 px-7 py-7 text-white sm:px-9">
          <div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10"><ShieldCheck className="h-7 w-7 text-amber-300" /></div><div><p className="text-xs font-extrabold uppercase tracking-[.2em] text-amber-300">HOME OF TECHNOCRATS</p><p className="mt-1 text-sm text-blue-100">NAVSTAR DIGITAL HUB</p></div></div>
          <h1 className="mt-6 text-2xl font-black sm:text-3xl">{stage === 'complete' ? 'Account recovered' : 'Recover Admin account'}</h1>
          <p className="mt-2 text-sm leading-6 text-blue-100">Verify your registered email, restore your login and securely return to the Admin Portal.</p>
        </div>
        <div className="p-6 sm:p-9">
          <div className="mb-7 grid grid-cols-3 gap-2">
            {['Email', 'Verify OTP', 'New password'].map((label, index) => {
              const activeIndex = stage === 'email' ? 0 : stage === 'otp' ? 1 : 2;
              const done = stage === 'complete' || index < activeIndex;
              return <div key={label} className="space-y-2"><div className={`h-1.5 rounded-full ${done ? 'bg-emerald-500' : index === activeIndex ? 'bg-blue-700' : 'bg-slate-200'}`} /><p className={`text-center text-[11px] font-bold ${done || index === activeIndex ? 'text-slate-800' : 'text-slate-400'}`}>{label}</p></div>;
            })}
          </div>

          {stage === 'email' && <form onSubmit={requestCode} className="space-y-5">
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-950">Enter the email address registered to the original Navstar Admin account. We will send the login details and a one-time verification code to that mailbox.</div>
            <div className="space-y-2"><Label htmlFor="admin-recovery-email">Registered Admin email</Label><Input id="admin-recovery-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@example.com" required className="h-12" /></div>
            <Button type="submit" disabled={loading} className="h-12 w-full bg-blue-800 hover:bg-blue-900">{loading ? 'Sending verification email…' : <><Mail className="mr-2 h-4 w-4" /> Send OTP to my email</>}</Button>
          </form>}

          {stage === 'otp' && <form onSubmit={verifyCode} className="space-y-5">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">If the address belongs to an active Admin account, a six-digit code has been sent. Check your inbox and spam folder. The code expires after 10 minutes.</div>
            <div className="space-y-2"><Label htmlFor="admin-recovery-otp">Six-digit verification code</Label><Input id="admin-recovery-otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" required className="h-14 text-center text-2xl font-bold tracking-[.45em]" /></div>
            <Button type="submit" disabled={loading || otp.length !== 6} className="h-12 w-full bg-blue-800 hover:bg-blue-900">{loading ? 'Verifying code…' : 'Verify email address'}</Button>
            <button type="button" onClick={resend} className="w-full text-sm font-semibold text-blue-700 hover:text-blue-900">Didn't receive a code? Try again</button>
          </form>}

          {stage === 'password' && <form onSubmit={savePassword} className="space-y-5">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 className="mr-2 inline h-5 w-5" /> Email verified. Your Admin account has been identified.</div>
            <div className="space-y-2"><Label htmlFor="new-admin-password">New Admin password</Label><Input id="new-admin-password" type="password" autoComplete="new-password" minLength={14} value={password} onChange={(event) => setPassword(event.target.value)} required className="h-12" /><p className="text-xs text-slate-500">At least 14 characters, using at least three character types.</p></div>
            <div className="space-y-2"><Label htmlFor="confirm-admin-password">Confirm new password</Label><Input id="confirm-admin-password" type="password" autoComplete="new-password" minLength={14} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required className="h-12" /></div>
            <Button type="submit" disabled={loading} className="h-12 w-full bg-blue-800 hover:bg-blue-900"><KeyRound className="mr-2 h-4 w-4" />{loading ? 'Securing your account…' : 'Save new password'}</Button>
          </form>}

          {stage === 'complete' && <div className="space-y-5 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100"><CheckCircle2 className="h-12 w-12 text-emerald-600" /></div>
            <h2 className="text-xl font-black text-slate-950">Your Admin login has been recovered.</h2>
            <p className="text-sm leading-6 text-slate-600">Use your registered email address and the new password to sign in. Your existing Admin account and linked records have been preserved.</p>
            <Button onClick={() => navigate('/login?role=admin', { replace: true })} className="h-12 w-full bg-blue-800 hover:bg-blue-900">Continue to Admin Login</Button>
          </div>}

          {status && <p role="status" className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">{status}</p>}
          <Link to="/login?role=admin" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-900"><ArrowLeft className="h-4 w-4" /> Back to Admin Login</Link>
        </div>
      </section>
    </main>
  );
}
