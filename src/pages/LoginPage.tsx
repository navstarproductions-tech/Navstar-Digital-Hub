import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, LockKeyhole, ShieldCheck, Eye, EyeOff, GraduationCap, UserRoundCheck, Fingerprint, LoaderCircle, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { readApiResponse } from '@/lib/api';

const staffRoles = ['admin', 'tutor', 'admissions', 'principal', 'finance'];
const allowedRoles = ['student', ...staffRoles];
type StaffPreview = { name: string; staffId: string; role: string; department: string; jobTitle: string; profilePicture?: string; photoUrl?: string; avatarUrl?: string };
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
  const requestedReturnTo = searchParams.get('returnTo') || '';
  const safeReturnTo = requestedReturnTo.startsWith('/') && !requestedReturnTo.startsWith('//') ? requestedReturnTo : '';
  const destination = (fallback: string) => safeReturnTo || fallback;
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [staffId, setStaffId] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [staffPreview, setStaffPreview] = useState<StaffPreview | null>(null);
  const [useEmailLogin, setUseEmailLogin] = useState(false);
  const [scanState, setScanState] = useState<'idle' | 'scanning' | 'found' | 'notFound'>('idle');
  const [celebrating, setCelebrating] = useState(false);
  const [brandingSettings, setBrandingSettings] = useState<Record<string,string>>({});
  useEffect(() => { let live=true; fetch('/api/public-branding',{cache:'no-store'}).then(async response=>{if(!response.ok)return;const data=await response.json();if(live)setBrandingSettings(data.branding||{});}).catch(()=>{});return()=>{live=false}; },[]);
  const gateBackground = role==='admin' ? (brandingSettings.adminGateBackgroundUrl||brandingSettings.loginBackgroundUrl) : role==='student' ? (brandingSettings.studentGateBackgroundUrl||brandingSettings.loginBackgroundUrl) : role==='tutor' ? (brandingSettings.tutorGateBackgroundUrl||brandingSettings.staffGateBackgroundUrl||brandingSettings.loginBackgroundUrl) : (brandingSettings.staffGateBackgroundUrl||brandingSettings.loginBackgroundUrl);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/me').then(async response => {
      if (!response.ok) return;
      const result = await response.json() as { user?: { role?: string; mustChangePassword?: boolean } };
      const signedInRole = result.user?.role;
      if (signedInRole) { try { localStorage.setItem('navstar:lastRole', signedInRole); } catch { /* Optional routing preference only. */ } }
      if (!active || !signedInRole || !allowedRoles.includes(signedInRole)) return;
      const fallback = result.user?.mustChangePassword ? '/change-password' : signedInRole === 'admin' ? '/admin' : signedInRole === 'student' ? '/student-portal' : `/portals/${signedInRole}`;
      navigate(result.user?.mustChangePassword ? fallback : destination(fallback), { replace: true });
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
      try { localStorage.setItem('navstar:lastRole', result.user.role); } catch { /* Optional routing preference only. */ }
      navigate(result.user.mustChangePassword ? '/change-password' : destination('/student-portal'), { replace: true });
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
      try { localStorage.setItem('navstar:lastRole', result.user.role); } catch { /* Optional routing preference only. */ }
      const fallback = result.user.role === 'admin' ? '/admin' : result.user.role === 'student' ? '/student-portal' : `/portals/${result.user.role}`;
      navigate(result.user.mustChangePassword ? '/change-password' : destination(fallback), { replace: true });
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
      const fallback = result.user.role === 'admin' ? '/admin' : `/portals/${result.user.role}`;
      navigate(result.user.mustChangePassword ? '/change-password' : destination(fallback), { replace: true });
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Identity confirmation failed.'); }
    finally { setLoading(false); }
  };

  if (role === 'admin') {
    return (
      <main className="relative isolate min-h-screen overflow-hidden bg-[#031331] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_12%_12%,rgba(18,116,235,.25),transparent_45%),radial-gradient(ellipse_at_92%_82%,rgba(0,255,120,.18),transparent_40%)]" />
        <div className="absolute inset-0 opacity-100" style={{backgroundImage:gateBackground?`url(${gateBackground})`:'url("/navstar-admin-hero.webp")',backgroundSize:'cover',backgroundPosition:'center'}} />
        <div className="absolute inset-0 bg-[#03112b]/[0.03]" />
        {celebrating && <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-[#04142b]/35"><div className="animate-bounce rounded-2xl border border-yellow-300/60 bg-white px-5 py-4 text-center text-blue-950 shadow-2xl"><div className="text-3xl">🌸 💐 🌼 🌺</div><p className="mt-1 text-lg font-black">Welcome back, {staffPreview?.name?.split(' ')[0] || 'Administrator'}!</p><p className="text-xs font-semibold text-green-700">Identity verified • Opening dashboard</p></div></div>}
        <div className="relative z-10 mx-auto flex min-h-screen max-w-[1180px] flex-col">
          <div className="flex flex-1 flex-col items-center justify-center px-3 py-6 sm:px-6 sm:py-10">

            <section className="flex w-full max-w-2xl items-center justify-center">
              <div className="relative w-full max-w-[560px] overflow-hidden rounded-[1.75rem] border border-cyan-400/80 bg-gradient-to-br from-[#061a3c]/58 via-[#04142e]/62 to-[#03102a]/66 p-4 text-white shadow-[0_24px_70px_rgba(0,0,0,.55),0_0_0_4px_rgba(0,170,255,.14)] backdrop-blur-xl sm:p-7">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-cyan-400 via-blue-500 to-yellow-400"/>
                <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-cyan-400/20 blur-2xl"/>
                <div className="pointer-events-none absolute -bottom-10 -left-8 h-36 w-36 rounded-full bg-blue-500/20 blur-2xl"/>
                <div className="relative z-10 mb-3 flex justify-center"><img src="/Navstar_Official_Logo.jpg" alt="Navstar Digital Hub official logo" className="h-16 w-48 object-contain drop-shadow-lg sm:h-20 sm:w-56" /></div>
                <div className="relative z-10 text-center"><div className="mb-2 flex justify-center"><ShieldCheck className="h-12 w-12 text-yellow-300 drop-shadow-lg"/></div><h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Admin Login</h1><p className="mt-1 text-sm text-blue-100">Enter your credentials to access the dashboard</p></div>
                <div className="relative z-10 mt-3 flex items-center justify-center gap-2 text-[10px] font-bold text-cyan-200"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-green-500"/><span>SYSTEM ONLINE</span><span className="text-blue-900/50">•</span><span>AUTHORIZED ACCESS ONLY</span></div>
                {useEmailLogin ? (
                  <form onSubmit={signInWithEmail} className="relative z-10 mt-3 space-y-3">
                    <div className="rounded-lg border border-cyan-400/30 bg-blue-950/60 p-2.5 text-xs text-blue-100">Use the registered administrator email and password if Staff ID verification is unavailable.</div>
                    <div className="space-y-1.5"><Label htmlFor="admin-email" className="font-bold text-blue-100">Registered email</Label><Input id="admin-email" name="email" type="email" autoComplete="username" required placeholder="admin@example.com" className="h-12 rounded-lg border-blue-400/50 bg-[#061a3a] text-white placeholder:text-blue-200/50"/></div>
                    <div className="space-y-1.5"><Label htmlFor="admin-password" className="font-bold text-blue-950">Password</Label><Input id="admin-password" name="password" type="password" autoComplete="current-password" required placeholder="Enter your password" className="h-10 rounded-lg border-blue-200 bg-slate-50 text-blue-950"/></div>
                    <Button type="submit" disabled={loading} className="h-12 w-full rounded-xl bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-base font-extrabold text-[#06142c] shadow-lg shadow-yellow-500/20">{loading?'Signing in…':'Sign in to Admin Portal'}</Button>
                    <button type="button" onClick={()=>{setUseEmailLogin(false);setStatus('');}} className="w-full text-xs font-semibold text-cyan-200 hover:text-yellow-300">Return to Staff ID verification</button>
                  </form>
                ) : !staffPreview ? (
                  <form onSubmit={lookupStaff} className="relative z-10 mt-3 space-y-3">
                    <div className="rounded-lg border border-cyan-400/30 bg-blue-950/60 p-2.5 text-xs leading-4 text-blue-100">Enter your Staff ID. The scanner checks it against the staff register.</div>
                    <div className="space-y-1.5"><Label htmlFor="staffId" className="font-bold text-blue-950">Staff ID</Label><Input id="staffId" value={staffId} onChange={event=>{setStaffId(event.target.value.toUpperCase());setScanState('idle');setStatus('');}} autoComplete="username" placeholder="Enter Staff ID" required className="h-10 rounded-lg border-blue-200 bg-slate-50 text-blue-950 placeholder:text-slate-400 focus-visible:ring-blue-500"/></div>
                    {scanState !== 'idle' && <div className={`relative overflow-hidden rounded-lg border p-2.5 text-xs ${scanState==='found'?'border-green-300 bg-green-50 text-green-800':scanState==='notFound'?'border-red-300 bg-red-50 text-red-800':'border-blue-200 bg-blue-50 text-blue-800'}`} role="status"><div className="flex items-center gap-2">{scanState==='scanning'?<><Fingerprint className="h-5 w-5 animate-pulse"/><span className="font-semibold">Scanning staff register…</span></>:scanState==='found'?<><ShieldCheck className="h-5 w-5 text-green-600"/><span className="font-bold">STAFF ID FOUND ✓</span></>:<><span className="text-lg font-black text-red-600">✕</span><span className="font-bold">STAFF ID NOT FOUND</span></>}</div>{scanState==='scanning'&&<div className="mt-2 h-1 overflow-hidden rounded-full bg-blue-200"><div className="h-full w-1/3 animate-pulse rounded-full bg-blue-600"/></div>}</div>}
                    <Button type="submit" disabled={loading||!staffId.trim()} className="h-12 w-full rounded-xl bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-base font-extrabold text-[#06142c] shadow-lg shadow-yellow-500/20 hover:brightness-110">{loading?<><LoaderCircle className="mr-2 h-4 w-4 animate-spin"/>Scanning & validating…</>:'Scan & Validate Staff ID'}</Button>
                  </form>
                ) : (
                  <form onSubmit={verifyStaff} className="relative z-10 mt-5 space-y-4">
                    <div className="rounded-2xl border border-green-200 bg-green-50 p-3"><div className="flex items-center gap-2 text-green-700"><UserRoundCheck className="h-5 w-5"/><span className="font-bold">Staff record found ✓</span></div><div className="mt-2 flex items-center gap-3">{(staffPreview.profilePicture||staffPreview.photoUrl||staffPreview.avatarUrl)?<img src={staffPreview.profilePicture||staffPreview.photoUrl||staffPreview.avatarUrl} alt="Staff profile" className="h-14 w-14 rounded-full border-2 border-green-300 object-cover"/>:<div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-green-300 bg-white text-lg font-black text-blue-900">{staffPreview.name.split(' ').map(part=>part[0]).slice(0,2).join('').toUpperCase()}</div>}<div><p className="text-base font-black text-blue-950">{staffPreview.name}</p><p className="text-xs text-blue-800">{staffPreview.staffId} · {roleLabel}</p></div></div>{staffPreview.jobTitle&&<p className="mt-1 text-xs text-blue-700">{staffPreview.jobTitle}{staffPreview.department?' · '+staffPreview.department:''}</p>}<p className="mt-2 text-xs text-blue-800">Confirm your National ID to complete secure access.</p></div>
                    <div className="space-y-2"><Label htmlFor="nationalId" className="font-bold text-blue-950">National ID confirmation</Label><Input id="nationalId" type="password" inputMode="numeric" autoComplete="off" value={nationalId} onChange={event=>setNationalId(event.target.value)} placeholder="Enter your National ID" required className="h-14 rounded-xl border-blue-200 bg-slate-50 text-blue-950 placeholder:text-slate-400"/></div>
                    <Button type="submit" disabled={loading||!nationalId.trim()} className="h-14 w-full rounded-full bg-gradient-to-r from-green-600 via-green-500 to-blue-700 text-base font-extrabold text-white shadow-lg">{loading?<><LoaderCircle className="mr-2 h-4 w-4 animate-spin"/>Verifying identity…</>:<><Fingerprint className="mr-2 h-5 w-5"/>Confirm & Open Admin Dashboard</>}</Button>
                    <button type="button" onClick={()=>{setStaffPreview(null);setNationalId('');setStatus('');setScanState('idle');setCelebrating(false);}} className="w-full text-sm font-semibold text-blue-700 hover:text-green-700">Back · Use a different Staff ID</button>
                  </form>
                )}
                {status&&<div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{status}</div>}
                <div className="relative z-10 mt-3 flex items-center justify-center gap-2 border-t border-cyan-400/25 pt-3 text-[10px] text-blue-100"><ShieldCheck className="h-4 w-4 text-blue-700"/><span>Secure Login</span><span>|</span><span>Authorized Access Only</span></div>
                <div className="relative z-10 mt-3 rounded-xl border border-cyan-400/25 bg-blue-950/50 px-3 py-2 text-center"><div className="flex items-center justify-center gap-2 font-bold text-cyan-100"><ShieldCheck className="h-5 w-5"/>Your security is our priority</div><p className="mt-1 text-[10px] text-blue-200">Protected by Navstar Digital Hub</p></div>
              </div>
            </section>
          </div>
          <div className="relative z-10 mt-6 w-full max-w-5xl"><div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-cyan-400/70 bg-[#03122c]/90 shadow-[0_12px_40px_rgba(0,0,0,.45)] backdrop-blur-md sm:grid-cols-5">{[{icon:"🎓",label:"E-Learning Management"},{icon:"♟",label:"Student & Tutor Portals"},{icon:"▥",label:"Analytics & Reports"},{icon:"☁",label:"Cloud Services"},{icon:"⛨",label:"Secure & Reliable"}].map((item,i)=><div key={item.label} className={`flex min-h-[92px] flex-col items-center justify-center gap-1 px-2 py-3 text-center ${i>0?"border-l border-cyan-300/30":""} ${i>=2?"border-t border-cyan-300/20 sm:border-t-0":""}`}><span className="text-2xl text-yellow-300 drop-shadow">{item.icon}</span><span className="text-[11px] font-bold leading-tight text-white sm:text-xs">{item.label}</span></div>)}</div></div>
          <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-green-500/30 bg-[#02102b]/90 px-4 py-3 text-[10px] text-white sm:text-xs">
            <span className="font-semibold text-yellow-300">NAVSTAR DIGITAL HUB</span>
            <span className="text-blue-100">Admin Control Centre · System Management · Secure Access</span>
            <a href="https://navstardigitalhub.co.ke" target="_blank" rel="noreferrer" className="text-cyan-200 hover:text-yellow-300">navstardigitalhub.co.ke</a>
            <span className="text-blue-100">Home of Technocrats</span>
          </footer>
        </div>
      </main>
    );
  }

  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[#071326] px-3 py-5 sm:px-5">
      <img src={gateBackground || loginBackgrounds[role] || loginBackgrounds.student} alt="" aria-hidden="true" className="absolute inset-0 -z-20 h-full w-full object-cover opacity-65" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[#061329]/65 via-[#071b38]/55 to-[#041024]/75" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_12%_12%,rgba(20,120,230,.28),transparent_42%),radial-gradient(ellipse_at_90%_90%,rgba(4,190,210,.2),transparent_40%)]" />
      <div className="navstar-login-orbit relative mx-auto w-full max-w-5xl"><span className="navstar-login-bubble navstar-bubble-one" aria-hidden="true" /><span className="navstar-login-bubble navstar-bubble-two" aria-hidden="true" /><span className="navstar-login-bubble navstar-bubble-three" aria-hidden="true" /><span className="navstar-login-star navstar-star-one" aria-hidden="true">✦</span><span className="navstar-login-star navstar-star-two" aria-hidden="true">✧</span><span className="navstar-login-star navstar-star-three" aria-hidden="true">✦</span><span className="navstar-login-triangle navstar-triangle-one" aria-hidden="true" /><span className="navstar-login-triangle navstar-triangle-two" aria-hidden="true" /><div className="navstar-login-card relative z-10 grid w-full grid-cols-1 overflow-hidden rounded-2xl border border-white/25 bg-[#101d31]/95 shadow-2xl shadow-black/50 backdrop-blur-md sm:grid-cols-2">
        <aside className={`relative order-1 flex min-h-[210px] flex-col justify-between overflow-hidden bg-[#071b40] p-5 text-white sm:min-h-[360px] sm:p-6 ${staffPreview ? 'sm:order-2' : 'sm:order-1'}`}>
          <img src={gateBackground || loginBackgrounds[role] || loginBackgrounds.student} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover opacity-75" />
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
