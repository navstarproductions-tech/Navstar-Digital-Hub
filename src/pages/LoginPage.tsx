import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, LockKeyhole, ShieldCheck, Sparkles, Eye, EyeOff, GraduationCap, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { readApiResponse } from '@/lib/api';

const allowedRoles = ['student', 'tutor', 'admissions', 'principal', 'admin'];
export function LoginPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const requestedRole = searchParams.get('role') ?? 'student';
  const role = allowedRoles.includes(requestedRole) ? requestedRole : 'student';
  const roleLabel = role === 'admin' ? 'Administrator' : role.charAt(0).toUpperCase() + role.slice(1);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setLoading(true);
    setStatus('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, email: formData.get('email'), password: formData.get('password') }),
      });
      const result = await readApiResponse<{ error?: string; user?: { role: string; mustChangePassword: boolean } }>(response);
      if (!response.ok || !result.user) throw new Error(result.error ?? 'Sign-in could not be completed. Check your details or contact the school.');
      navigate(result.user.mustChangePassword ? '/change-password' : result.user.role === 'admin' ? '/admin' : `/portals/${result.user.role}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Sign-in could not be completed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative isolate flex min-h-[82vh] items-center justify-center overflow-hidden bg-[#061127] px-4 py-12 sm:py-16">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_10%_15%,rgba(37,99,235,.4),transparent_38%),radial-gradient(ellipse_at_90%_85%,rgba(6,182,212,.22),transparent_38%)]" />
      <div className="absolute inset-0 -z-10 opacity-[.08] [background-image:linear-gradient(rgba(255,255,255,.4)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.4)_1px,transparent_1px)] [background-size:38px_38px]" />
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/15 bg-white shadow-2xl shadow-black/30 lg:grid-cols-[.9fr_1.1fr]">
        <aside className="relative hidden min-h-[610px] flex-col justify-between overflow-hidden bg-[#071a38] p-9 text-white lg:flex">
          <div className="absolute inset-0 opacity-35"><img src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=85" alt="" className="h-full w-full object-cover" /></div>
          <div className="absolute inset-0 bg-gradient-to-br from-[#061127]/95 via-[#0a2a55]/80 to-[#061127]/95" />
          <div className="relative">
            <img src="/Navstar_Official_Logo.jpg" alt="Official Navstar Digital Hub logo" className="mb-7 h-24 w-40 object-contain object-left" />
            <p className="text-xs font-extrabold uppercase tracking-[.3em] text-amber-300">HOME OF TECHNOCRATS</p>
            <h2 className="mt-4 text-4xl font-black leading-tight">One hub.<br /><span className="text-cyan-300">Many possibilities.</span></h2>
            <p className="mt-5 max-w-sm text-sm leading-7 text-slate-200">Sign in to your Navstar workspace to continue learning, supporting learners or managing digital services.</p>
          </div>
          <div className="relative space-y-3">
            <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur"><GraduationCap className="h-5 w-5 text-cyan-200" /><span className="text-sm font-semibold">Learning and student support</span></div>
            <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur"><UsersRound className="h-5 w-5 text-amber-200" /><span className="text-sm font-semibold">Staff and administration tools</span></div>
            <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur"><ShieldCheck className="h-5 w-5 text-emerald-200" /><span className="text-sm font-semibold">Protected role-based access</span></div>
          </div>
        </aside>
        <section className="p-6 sm:p-9 lg:p-11">
          <Link to={role === 'admin' ? '/portals/admin' : '/portals'} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-blue-700"><ArrowLeft className="h-4 w-4" /> {role === 'admin' ? 'Admin Portal' : 'All portals'}</Link>
          <div className="mt-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><LockKeyhole className="h-6 w-6" /></div>
          <p className="mt-6 text-xs font-extrabold uppercase tracking-[.25em] text-blue-700">NAVSTAR DIGITAL HUB</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Welcome back.</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Sign in to the <strong>{roleLabel} Portal</strong> with the account details provided by Navstar.</p>
          <form onSubmit={signIn} className="mt-7 space-y-5">
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3"><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Selected secure portal</p><p className="mt-1 font-bold text-slate-900">{roleLabel} Portal</p></div>
            <div className="space-y-2"><Label htmlFor="email" className="font-bold text-slate-700">Email address</Label><Input id="email" name="email" type="email" autoComplete="username" placeholder="you@example.com" required className="h-12 rounded-xl" /></div>
            <div className="space-y-2"><Label htmlFor="password" className="font-bold text-slate-700">Password</Label><div className="relative"><Input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" required className="h-12 rounded-xl pr-12" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-blue-700" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
            <Button type="submit" disabled={loading} className="h-12 w-full rounded-xl bg-gradient-to-r from-blue-700 to-cyan-600 text-sm font-bold shadow-md shadow-blue-900/15 hover:from-blue-600 hover:to-cyan-500">{loading ? 'Verifying your account…' : 'Sign in securely'}</Button>
            {status && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-800">{status}</p>}
            <p className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />Your account is protected by role-based access. Never share your password or M-Pesa PIN with anyone.</p>
          </form>
          <div className="mt-6 rounded-xl border border-slate-200 p-4"><p className="text-sm font-semibold text-slate-900">Looking to order goods or request a service?</p><p className="mt-1 text-xs leading-5 text-slate-500">Customers do not need a student or staff portal account to make a public service request.</p><Link to="/services" className="mt-2 inline-flex items-center gap-2 text-sm font-bold text-blue-700 hover:text-blue-900">Continue to Customer Services <ArrowLeft className="h-4 w-4 rotate-180" /></Link></div>
          {role === 'admin' && <Link to="/admin-reset" className="mt-4 inline-flex text-sm font-semibold text-blue-700 hover:text-blue-900">Forgot Admin details? Recover using email OTP</Link>}
          <p className="mt-7 text-center text-xs text-slate-400">© Navstar Digital Hub · HOME OF TECHNOCRATS</p>
        </section>
      </div>
    </main>
  );
}
