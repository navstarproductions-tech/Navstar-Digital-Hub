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
const loginBackgrounds: Record<string, string> = {
  student: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=1400&q=85',
  admin: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1400&q=85',
  tutor: 'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1400&q=85',
  admissions: 'https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1400&q=85',
  principal: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1400&q=85',
  finance: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1400&q=85',
};


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
  const [useEmailLogin, setUseEmailLogin] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/me').then(async response => {
      if (!response.ok) return;
      const result = await response.json() as { user?: { role?: string; mustChangePassword?: boolean } };
      const signedInRole = result.user?.role;
      if (!active || !signedInRole || !allowedRoles.includes(signedInRole)) return;
      const destination = result.user?.mustChangePassword ? '/change-password' : signedInRole === 'admin' ? '/admin' : signedInRole === 'student' ? '/student-portal' : `/portals/${signedInRole}`;
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
      navigate(result.user.mustChangePassword ? '/change-password' : '/student-portal', { replace: true });
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Sign-in could not be completed.'); }
    finally { setLoading(false); }
  };

  const signInWithEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setLoading(true); setStatus('');
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role, email: formData.get('email'), password: formData.get('password') }) });
      const result = await readApiResponse<{ error?: string; user?: { role: string; mustChangePassword: boolean } }>(response);
      if (!result.user) throw new Error(result.error || 'Sign-in could not be completed.');
      navigate(result.user.mustChangePassword ? '/change-password' : result.user.role === 'admin' ? '/admin' : result.user.role === 'student' ? '/student-portal' : `/portals/${result.user.role}`, { replace: true });
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
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[#071326] px-3 py-5 sm:px-5">
      <img src={loginBackgrounds[role] || loginBackgrounds.student} alt="" aria-hidden="true" className="absolute inset-0 -z-20 h-full w-full object-cover opacity-45" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[#061329]/65 via-[#071b38]/55 to-[#041024]/75" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_12%_12%,rgba(20,120,230,.28),transparent_42%),radial-gradient(ellipse_at_90%_90%,rgba(4,190,210,.2),transparent_40%)]" />
      <div className="navstar-login-orbit relative mx-auto w-full max-w-5xl"><span className="navstar-login-bubble navstar-bubble-one" aria-hidden="true" /><span className="navstar-login-bubble navstar-bubble-two" aria-hidden="true" /><span className="navstar-login-bubble navstar-bubble-three" aria-hidden="true" /><span className="navstar-login-star navstar-star-one" aria-hidden="true">✦</span><span className="navstar-login-star navstar-star-two" aria-hidden="true">✧</span><span className="navstar-login-star navstar-star-three" aria-hidden="true">✦</span><span className="navstar-login-triangle navstar-triangle-one" aria-hidden="true" /><span className="navstar-login-triangle navstar-triangle-two" aria-hidden="true" /><div className="navstar-login-card relative z-10 grid w-full grid-cols-1 overflow-hidden rounded-2xl border border-white/25 bg-[#101d31]/95 shadow-2xl shadow-black/50 backdrop-blur-md sm:grid-cols-2">
        <aside className={`relative order-1 flex min-h-[210px] flex-col justify-between overflow-hidden bg-[#071b40] p-5 text-white sm:min-h-[360px] sm:p-6 ${staffPreview ? 'sm:order-2' : 'sm:order-1'}`}>
          <img src={loginBackgrounds[role] || loginBackgrounds.student} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover opacity-75" />
          <div className="absolute inset-0 bg-gradient-to-br from-[#061127]/55 via-[#0a2a55]/45 to-[#061127]/65" />
          <div className="relative z-10">
            <img src="/Navstar_Official_Logo.jpg" alt="Official Navstar Digital Hub logo" className="mb-3 h-14 w-28 object-contain object-left drop-shadow-lg" />
            <p className="text-[10px] font-extrabold uppercase tracking-[.22em] text-amber-300 drop-shadow">HOME OF TECHNOCRATS</p>
            <h2 className="mt-2 text-2xl font-black leading-tight drop-shadow-md sm:text-3xl">{roleLabel} Portal</h2>
            <p className="mt-2 max-w-sm text-xs leading-5 text-white drop-shadow-md sm:text-sm">Secure access to your Navstar {roleLabel.toLowerCase()} workspace.</p>
          </div>
          <div className="relative z-10 mt-4 flex flex-wrap gap-2">
            <span className="rounded-lg border border-white/25 bg-slate-950/45 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow">Protected access</span>
            <span className="rounded-lg border border-white/25 bg-slate-950/45 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow">Navstar Digital Hub</span>
          </div>
        </aside>
        <section className={`order-2 min-w-0 bg-[#101d31] p-4 text-white sm:min-h-[360px] sm:p-5 ${staffPreview ? 'sm:order-1' : 'sm:order-2'}`}>
          <Link to="/" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-300 transition hover:text-cyan-200"><ArrowLeft className="h-3.5 w-3.5" /> Back to Navstar</Link>
          <div className="mt-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20 text-cyan-200"><LockKeyhole className="h-4 w-4" /></div>
            <div><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-cyan-200">Secure sign in</p><h1 className="text-lg font-extrabold tracking-tight text-white">Welcome back to {roleLabel} Portal</h1></div>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-300">Enter your details to access the selected portal.</p>
          {!isStaff ? (
            <form onSubmit={signInStudent} className="mt-4 space-y-3">
              <div className="space-y-2"><Label htmlFor="email" className="font-bold text-slate-200">Student email address</Label><Input id="email" name="email" type="email" autoComplete="username" placeholder="you@example.com" required className="h-12 rounded-xl border-slate-600 bg-[#0b1425] text-white placeholder:text-slate-500" /></div>
              <div className="space-y-2"><Label htmlFor="password" className="font-bold text-slate-200">Password</Label><div className="relative"><Input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" required className="h-12 rounded-xl border-slate-600 bg-[#0b1425] pr-12 text-white placeholder:text-slate-500" /><button type="button" onClick={() => setShowPassword(value => !value)} className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-cyan-300" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
              <Button type="submit" disabled={loading} className="h-12 w-full rounded-xl bg-gradient-to-r from-blue-700 to-cyan-600 font-bold">{loading ? <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Signing in…</> : 'Sign in to Student Portal'}</Button>
            </form>
          ) : useEmailLogin ? (
            <form onSubmit={signInWithEmail} className="mt-3 space-y-3">
              <div className="space-y-2"><Label htmlFor="staff-email" className="font-bold text-slate-200">Registered email address</Label><Input id="staff-email" name="email" type="email" autoComplete="username" required placeholder="staff@example.com" className="h-10 rounded-xl border-slate-600 bg-[#0b1425] text-white placeholder:text-slate-500" /></div>
              <div className="space-y-2"><Label htmlFor="staff-password" className="font-bold text-slate-200">Password</Label><Input id="staff-password" name="password" type="password" autoComplete="current-password" required placeholder="Enter your password" className="h-10 rounded-xl border-slate-600 bg-[#0b1425] text-white placeholder:text-slate-500" /></div>
              <Button type="submit" disabled={loading} className="h-10 w-full rounded-xl bg-gradient-to-r from-blue-700 to-cyan-600 font-bold">{loading ? 'Signing in…' : `Sign in to ${roleLabel} Portal`}</Button>
              <button type="button" onClick={() => { setUseEmailLogin(false); setStatus(''); }} className="w-full text-xs font-semibold text-cyan-300 hover:text-white">Use Staff ID and National ID instead</button>
            </form>
          ) : !staffPreview ? (
            <form onSubmit={lookupStaff} className="mt-4 space-y-3">
              <div className="rounded-xl border border-cyan-300/15 bg-cyan-400/5 p-4 text-sm leading-6 text-slate-300">Enter your official Staff ID. Navstar will check the staff register and show the matching account details before asking you to confirm your identity.</div>
              <div className="space-y-2"><Label htmlFor="staffId" className="font-bold text-slate-200">Staff ID</Label><Input id="staffId" value={staffId} onChange={event => setStaffId(event.target.value.toUpperCase())} autoComplete="off" placeholder={role === 'admin' ? 'AD12345' : role === 'finance' ? 'FN12345' : role === 'principal' ? 'PR12345' : role === 'tutor' ? 'TU12345' : 'AM12345'} required className="h-12 rounded-xl border-slate-600 bg-[#0b1425] text-white placeholder:text-slate-500" /></div>
              <Button type="submit" disabled={loading || !staffId.trim()} className="h-10 w-full rounded-xl bg-gradient-to-r from-blue-700 to-cyan-600 font-bold">{loading ? <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Searching staff register…</> : 'Validate Staff ID'}</Button>
              <button type="button" onClick={() => { setUseEmailLogin(true); setStatus(''); }} className="w-full text-xs font-semibold text-cyan-300 hover:text-white">Forgot Staff ID? Sign in using email and password</button>
            </form>
          ) : (
            <form onSubmit={verifyStaff} className="mt-4 space-y-3">
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
          {status && <div role="alert" className="mt-3 rounded-lg border border-rose-400/40 bg-rose-500/15 p-2.5 text-xs leading-5 text-rose-50"><p>{status}</p>{/no national id is saved/i.test(status) && isStaff && <div className="mt-3 rounded-lg border border-cyan-300/20 bg-cyan-400/5 p-3"><p className="text-xs text-cyan-100">The administrator can add the missing National ID under Admin Portal → System Users → Edit account. You can use your registered email and password while that is being updated.</p><button type="button" onClick={() => { setUseEmailLogin(true); setStatus(''); setStaffPreview(null); setNationalId(''); }} className="mt-3 inline-flex min-h-9 items-center justify-center rounded-lg bg-cyan-500 px-4 py-2 text-xs font-extrabold text-slate-950 hover:bg-cyan-300">Continue with email and password</button></div>}</div>}
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-white/5 p-2.5 text-[11px] leading-4 text-slate-300"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />{isStaff ? 'Your National ID is used only to confirm your identity and is never displayed on this screen.' : 'Student accounts use email and password. Never share your password or M-Pesa PIN.'}</p>
          <Link to="/student-recovery" className="mt-4 inline-flex text-sm font-semibold text-cyan-300 hover:text-white">Forgot password? Recover using email or SMS OTP</Link>
          <p className="mt-4 text-center text-[10px] text-slate-400">© Navstar Digital Hub · HOME OF TECHNOCRATS</p>
        </section>
        </div>
      </div>
    </main>
  );
}
