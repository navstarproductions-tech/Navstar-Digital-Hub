import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, LockKeyhole, ShieldCheck, Eye, EyeOff, GraduationCap, UserRoundCheck, Fingerprint, LoaderCircle, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { readApiResponse } from '@/lib/api';

const staffRoles = ['admin', 'tutor', 'admissions', 'principal', 'finance'];
const allowedRoles = ['student', ...staffRoles];
type StaffPreview = { name: string; staffId: string; role: string; department: string; jobTitle: string };

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const requestedRole = searchParams.get('role') ?? 'student';
  const role = allowedRoles.includes(requestedRole) ? requestedRole : 'student';
  const isStaff = staffRoles.includes(role);
  const roleLabel = role === 'admin' ? 'Admin' : role.charAt(0).toUpperCase() + role.slice(1);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [staffId, setStaffId] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [staffPreview, setStaffPreview] = useState<StaffPreview | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/me').then(async response => {
      if (!response.ok) return;
      const result = await response.json() as { user?: { role?: string; mustChangePassword?: boolean } };
      const signedInRole = result.user?.role;
      if (!active || !signedInRole || !allowedRoles.includes(signedInRole)) return;
      const destination = result.user?.mustChangePassword ? '/change-password' : signedInRole === 'admin' ? '/admin' : `/portals/${signedInRole}`;
      navigate(destination, { replace: true });
    }).catch(() => undefined);
    return () => { active = false; };
  }, [navigate]);

  const signInStudent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setLoading(true); setStatus('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'student', email: formData.get('email'), password: formData.get('password') }),
      });
      const result = await readApiResponse<{ error?: string; user?: { role: string; mustChangePassword: boolean } }>(response);
      if (!response.ok || !result.user) throw new Error(result.error ?? 'Sign-in could not be completed. Check your details or contact Navstar.');
      navigate(result.user.mustChangePassword ? '/change-password' : '/portals/student', { replace: true });
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Sign-in could not be completed.'); }
    finally { setLoading(false); }
  };

  const lookupStaff = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true); setStatus(''); setStaffPreview(null);
    try {
      const response = await fetch('/api/auth/staff-login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'lookup', role, staffId }),
      });
      const result = await readApiResponse<{ error?: string; matched?: boolean; staff?: StaffPreview }>(response);
      if (!response.ok || !result.staff) throw new Error(result.error ?? 'Staff record could not be verified.');
      setStaffPreview(result.staff);
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Staff record could not be verified.'); }
    finally { setLoading(false); }
  };

  const verifyStaff = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!staffPreview) return;
    setLoading(true); setStatus('');
    try {
      const response = await fetch('/api/auth/staff-login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', role, staffId, nationalId }),
      });
      const result = await readApiResponse<{ error?: string; user?: { role: string; mustChangePassword: boolean } }>(response);
      if (!response.ok || !result.user) throw new Error(result.error ?? 'Identity confirmation failed.');
      navigate(result.user.mustChangePassword ? '/change-password' : result.user.role === 'admin' ? '/admin' : `/portals/${result.user.role}`, { replace: true });
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Identity confirmation failed.'); }
    finally { setLoading(false); }
  };

  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[#070d1b] px-4 py-8 sm:py-12">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_8%_15%,rgba(20,91,210,.36),transparent_40%),radial-gradient(ellipse_at_95%_85%,rgba(4,174,202,.16),transparent_38%)]" />
      <div className="absolute inset-0 -z-10 opacity-[.07] [background-image:linear-gradient(rgba(255,255,255,.4)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.4)_1px,transparent_1px)] [background-size:38px_38px]" />
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-[1.7rem] border border-white/10 bg-[#111a2b] shadow-2xl shadow-black/40 lg:grid-cols-[.92fr_1.08fr]">
        <aside className="relative hidden min-h-[650px] flex-col justify-between overflow-hidden bg-[#071b40] p-9 text-white lg:flex">
          <img src="/gebeya.webp" alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-br from-[#061127]/95 via-[#0a2a55]/75 to-[#061127]/95" />
          <div className="relative">
            <img src="/Navstar_Official_Logo.jpg" alt="Official Navstar Digital Hub logo" className="mb-7 h-24 w-40 object-contain object-left" />
            <p className="text-xs font-extrabold uppercase tracking-[.3em] text-amber-300">HOME OF TECHNOCRATS</p>
            <h2 className="mt-4 text-4xl font-black leading-tight">Your digital hub.<br /><span className="text-cyan-300">Your workspace.</span></h2>
            <p className="mt-5 max-w-sm text-sm leading-7 text-slate-200">Secure access to learning, administration, finance and digital services.</p>
          </div>
          <div className="relative space-y-3">
            <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur"><GraduationCap className="h-5 w-5 text-cyan-200" /><span className="text-sm font-semibold">Learning and student support</span></div>
            <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur"><Building2 className="h-5 w-5 text-amber-200" /><span className="text-sm font-semibold">Administration and finance</span></div>
            <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur"><ShieldCheck className="h-5 w-5 text-emerald-200" /><span className="text-sm font-semibold">Protected role-based access</span></div>
          </div>
        </aside>
        <section className="p-6 sm:p-9 lg:p-11">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-400 transition hover:text-cyan-300"><ArrowLeft className="h-4 w-4" /> Back to Navstar</Link>
          <div className="mt-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/15 text-cyan-300"><LockKeyhole className="h-6 w-6" /></div>
          <p className="mt-6 text-xs font-extrabold uppercase tracking-[.25em] text-cyan-300">NAVSTAR DIGITAL HUB</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white">Welcome back.</h1>
          <p className="mt-2 text-sm leading-6 text-slate-300">Access your selected workspace securely.</p>
          <div className="mt-6 rounded-xl border border-blue-300/20 bg-blue-500/10 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">Selected portal</p>
            <p className="mt-1 font-bold text-white">{roleLabel} Portal</p>
          </div>

          {!isStaff ? (
            <form onSubmit={signInStudent} className="mt-6 space-y-5">
              <div className="space-y-2"><Label htmlFor="email" className="font-bold text-slate-200">Student email address</Label><Input id="email" name="email" type="email" autoComplete="username" placeholder="you@example.com" required className="h-12 rounded-xl border-slate-600 bg-[#0b1425] text-white placeholder:text-slate-500" /></div>
              <div className="space-y-2"><Label htmlFor="password" className="font-bold text-slate-200">Password</Label><div className="relative"><Input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" required className="h-12 rounded-xl border-slate-600 bg-[#0b1425] pr-12 text-white placeholder:text-slate-500" /><button type="button" onClick={() => setShowPassword(value => !value)} className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-cyan-300" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
              <Button type="submit" disabled={loading} className="h-12 w-full rounded-xl bg-gradient-to-r from-blue-700 to-cyan-600 font-bold">{loading ? <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Signing in…</> : 'Sign in to Student Gateway'}</Button>
            </form>
          ) : !staffPreview ? (
            <form onSubmit={lookupStaff} className="mt-6 space-y-5">
              <div className="rounded-xl border border-cyan-300/15 bg-cyan-400/5 p-4 text-sm leading-6 text-slate-300">Enter your official Staff ID. Navstar will check the staff register and show the matching account details before asking you to confirm your identity.</div>
              <div className="space-y-2"><Label htmlFor="staffId" className="font-bold text-slate-200">Staff ID</Label><Input id="staffId" value={staffId} onChange={event => setStaffId(event.target.value.toUpperCase())} autoComplete="off" placeholder={role === 'admin' ? 'AD12345' : role === 'finance' ? 'FN12345' : role === 'principal' ? 'PR12345' : role === 'tutor' ? 'TU12345' : 'AM12345'} required className="h-12 rounded-xl border-slate-600 bg-[#0b1425] text-white placeholder:text-slate-500" /></div>
              <Button type="submit" disabled={loading || !staffId.trim()} className="h-12 w-full rounded-xl bg-gradient-to-r from-blue-700 to-cyan-600 font-bold">{loading ? <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Searching staff register…</> : 'Validate Staff ID'}</Button>
            </form>
          ) : (
            <form onSubmit={verifyStaff} className="mt-6 space-y-5">
              <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4">
                <div className="flex items-center gap-2 text-emerald-300"><UserRoundCheck className="h-5 w-5" /><span className="text-sm font-bold">Staff record found</span></div>
                <p className="mt-3 text-lg font-extrabold text-white">{staffPreview.name}</p>
                <p className="mt-1 text-sm text-slate-300">{staffPreview.staffId} · {roleLabel}</p>
                {staffPreview.jobTitle && <p className="mt-1 text-xs text-slate-400">{staffPreview.jobTitle}{staffPreview.department ? ` · ${staffPreview.department}` : ''}</p>}
                <p className="mt-3 text-xs text-slate-400">National ID is not displayed. Confirm it below to complete sign-in.</p>
              </div>
              <div className="space-y-2"><Label htmlFor="nationalId" className="font-bold text-slate-200">National ID confirmation</Label><Input id="nationalId" type="password" inputMode="numeric" autoComplete="off" value={nationalId} onChange={event => setNationalId(event.target.value)} placeholder="Enter your National ID" required className="h-12 rounded-xl border-slate-600 bg-[#0b1425] text-white placeholder:text-slate-500" /></div>
              <Button type="submit" disabled={loading || !nationalId.trim()} className="h-12 w-full rounded-xl bg-gradient-to-r from-blue-700 to-cyan-600 font-bold">{loading ? <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Confirming identity…</> : <><Fingerprint className="mr-2 h-4 w-4" />Confirm and open {roleLabel} Dashboard</>}</Button>
              <button type="button" onClick={() => { setStaffPreview(null); setNationalId(''); setStatus(''); }} className="w-full text-sm font-semibold text-cyan-300 hover:text-white">Use a different Staff ID</button>
            </form>
          )}
          {status && <p role="alert" className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm leading-6 text-rose-200">{status}</p>}
          <p className="mt-6 flex items-start gap-2 rounded-xl bg-white/5 p-3 text-xs leading-5 text-slate-400"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />{isStaff ? 'Your National ID is used only to confirm your identity and is never displayed on this screen.' : 'Student accounts use email and password. Never share your password or M-Pesa PIN.'}</p>
          {role === 'admin' && <Link to="/admin-reset" className="mt-4 inline-flex text-sm font-semibold text-cyan-300 hover:text-white">Forgot Admin details? Recover using email OTP</Link>}
          <p className="mt-7 text-center text-xs text-slate-500">© Navstar Digital Hub · HOME OF TECHNOCRATS</p>
        </section>
      </div>
    </main>
  );
}
