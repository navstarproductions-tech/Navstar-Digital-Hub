import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, LockKeyhole, ShieldCheck, Eye, EyeOff, GraduationCap, UserRoundCheck, Fingerprint, LoaderCircle, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { readApiResponse } from '@/lib/api';

const staffRoles = ['admin', 'tutor', 'admissions', 'principal', 'finance'];
const allowedRoles = ['student', ...staffRoles];
type StaffPreview = { name: string; role: string; department: string; jobTitle: string; emailMasked?: string; phoneMasked?: string; hasEmail?: boolean; hasPhone?: boolean; profilePicture?: string; photoUrl?: string; avatarUrl?: string };
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
  const [staffOtp, setStaffOtp] = useState('');
  const [staffChannel, setStaffChannel] = useState<'email'|'sms'>('email');
  const [staffCodeSent, setStaffCodeSent] = useState(false);
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
      const response = await fetch('/api/auth/staff-login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:staffCodeSent?'verify':'send',role,staffId,channel:staffChannel,otp:staffOtp}) });
      const result = await readApiResponse<{error?:string;sent?:boolean;message?:string;user?:{role:string;mustChangePassword:boolean}}>(response);
      if (!response.ok) throw new Error(result.error || 'Staff verification could not be completed.');
      if (result.sent) { setStaffCodeSent(true); setStatus(result.message || 'Verification code sent.'); return; }
      if (!result.user) throw new Error(result.error || 'The verification code could not be confirmed.');
      const fallback=result.user.role==='admin'?'/admin':`/portals/${result.user.role}`;
      navigate(result.user.mustChangePassword?'/change-password':destination(fallback),{replace:true});
    } catch(error) { setStatus(error instanceof Error?error.message:'Staff verification failed.'); }
    finally { setLoading(false); }
  };

  if (role === 'admin') {
    return (
      <main className="relative isolate min-h-screen overflow-hidden bg-[#031331] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_12%_12%,rgba(18,116,235,.25),transparent_45%),radial-gradient(ellipse_at_92%_82%,rgba(0,255,120,.18),transparent_40%)]" />
        <div className="absolute inset-0" style={{backgroundImage:gateBackground ? 'url(' + gateBackground + ')' : 'url(/navstar-admin-hero.webp)',backgroundSize:'cover',backgroundPosition:'center'}} />
        <div className="absolute inset-0 bg-[#03112b]/[0.12]" />
        <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 h-[34rem] w-[34rem] opacity-80" style={{background:'repeating-conic-gradient(from 205deg at 0% 0%, transparent 0deg 8deg, rgba(30,144,255,.18) 8deg 10deg, transparent 10deg 17deg)',maskImage:'radial-gradient(circle at 0% 0%,black,transparent 72%)'}}/>
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -right-24 h-[34rem] w-[34rem] opacity-70" style={{background:'repeating-conic-gradient(from 25deg at 100% 100%, transparent 0deg 8deg, rgba(0,195,255,.2) 8deg 10deg, transparent 10deg 17deg)',maskImage:'radial-gradient(circle at 100% 100%,black,transparent 72%)'}}/>
        {celebrating && <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-[#04142b]/35"><div className="animate-bounce rounded-2xl border border-yellow-300/60 bg-white px-5 py-4 text-center text-blue-950 shadow-2xl"><div className="text-3xl">🌸 💐 🌼 🌺</div><p className="mt-1 text-lg font-black">Welcome back, {staffPreview?.name?.split(' ')[0] || 'Administrator'}!</p><p className="text-xs font-semibold text-green-700">Identity verified • Opening dashboard</p></div></div>}
        <div className="relative z-10 mx-auto flex min-h-screen max-w-[1240px] flex-col">
          <div className="flex flex-1 flex-col justify-center px-3 pb-5 pt-32 sm:px-7 sm:pb-8 sm:pt-40">
            <header className="pointer-events-none fixed left-0 right-0 top-0 z-30 flex items-start justify-between gap-4 px-3 pt-3 drop-shadow-[0_5px_22px_rgba(0,0,0,.9)] sm:px-7 sm:pt-5 lg:px-10">
              <div className="relative max-w-[66%] pb-3 text-left">
                <div className="flex items-baseline whitespace-nowrap">
                  <span className="text-lg font-black uppercase tracking-[.08em] text-cyan-100 [text-shadow:0_2px_14px_rgba(34,211,238,.45)] sm:text-3xl sm:tracking-[.13em] lg:text-4xl">NAVSTA</span>
                  <span className="relative -mx-0.5 inline-block -skew-x-6 font-serif text-2xl font-black italic leading-none text-yellow-300 [text-shadow:0_2px_16px_rgba(250,204,21,.65)] sm:text-5xl lg:text-6xl">R</span>
                  <span className="ml-1 text-sm font-black uppercase tracking-[.04em] text-white sm:text-2xl sm:tracking-[.08em] lg:text-3xl">DIGITAL HUB</span>
                </div>
                <h2 className="relative z-10 mt-1 whitespace-nowrap text-[10px] font-extrabold tracking-[.16em] text-white [text-shadow:0_2px_10px_rgba(0,0,0,.8)] sm:text-base sm:tracking-[.28em] lg:text-lg">HOME OF TECHNOCRATS</h2>
                <svg aria-hidden="true" viewBox="0 0 520 28" preserveAspectRatio="none" className="pointer-events-none absolute bottom-0 left-0 h-5 w-full overflow-visible sm:h-6">
                  <defs><linearGradient id="navstar-r-tail" x1="0" x2="1"><stop offset="0%" stopColor="#facc15"/><stop offset="48%" stopColor="#22d3ee"/><stop offset="100%" stopColor="#facc15"/></linearGradient></defs>
                  <path d="M 112 3 C 145 24, 188 24, 230 18 S 365 9, 505 15" fill="none" stroke="url(#navstar-r-tail)" strokeWidth="3.2" strokeLinecap="round"/>
                  <path d="M 493 9 L 508 15 L 493 20" fill="none" stroke="#facc15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="max-w-[38%] text-right text-xs font-bold leading-relaxed text-white sm:text-base lg:text-lg">
                <p className="text-cyan-100">Build with purpose.</p><p>Lead with knowledge.</p><p className="text-yellow-200">Create the future.</p>
              </div>
            </header>
            <section className="mx-auto grid w-full max-w-4xl overflow-hidden rounded-[1.6rem] border border-cyan-200/80 bg-gradient-to-br from-[#061d3b]/95 via-[#04152f]/95 to-[#020d22]/95 shadow-[0_32px_100px_rgba(0,0,0,.72),0_0_0_1px_rgba(255,255,255,.16),0_0_45px_rgba(0,190,255,.22)] backdrop-blur-2xl md:grid-cols-[.88fr_1.12fr]">
              <aside className="relative flex min-h-0 flex-col justify-between overflow-hidden border-b border-cyan-200/40 bg-[radial-gradient(circle_at_15%_10%,rgba(34,211,238,.24),transparent_38%),linear-gradient(145deg,rgba(7,67,119,.98),rgba(4,31,65,.98)_58%,rgba(2,17,40,.99))] p-6 sm:p-9 md:border-b-0 md:border-r md:border-cyan-200/40">
                <div className="pointer-events-none absolute -right-16 top-10 h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl"/>
                <div className="relative z-10">
                  <img src="/Navstar_Official_Logo.jpg" alt="Navstar Digital Hub official logo" className="mb-5 h-16 w-48 object-contain object-left drop-shadow-xl sm:h-20 sm:w-56"/>
                  <p className="text-xs font-black uppercase tracking-[.3em] text-cyan-200">ADMIN CONTROL CENTRE</p>
                  <h1 className="mt-2 text-2xl font-black leading-tight text-white sm:text-3xl">Manage.<br/>Lead.<br/><span className="text-yellow-300">Innovate.</span></h1>
                  <p className="mt-3 max-w-sm text-xs leading-5 text-blue-100 sm:text-sm">One secure workspace to oversee operations, people, learning and digital services across Navstar.</p>
                </div>
                {staffPreview ? (
                  <div className="relative z-10 mt-5 rounded-2xl border border-green-300/50 bg-green-950/40 p-3">
                    <p className="mb-3 text-[11px] font-black uppercase tracking-[.2em] text-green-200">Staff identity located</p>
                    <div className="flex items-center gap-3">
                      {(staffPreview.profilePicture||staffPreview.photoUrl||staffPreview.avatarUrl)?<img src={staffPreview.profilePicture||staffPreview.photoUrl||staffPreview.avatarUrl} alt="Staff profile" className="h-14 w-14 shrink-0 rounded-full border-2 border-green-300 object-cover shadow-lg shadow-green-950/40"/>:<div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-green-300 bg-white text-xl font-black text-blue-950">{staffPreview.name.split(' ').map(part=>part[0]).slice(0,2).join('').toUpperCase()}</div>}
                      <div className="min-w-0"><p className="truncate text-lg font-black text-white">{staffPreview.name}</p><p className="text-xs font-semibold tracking-wider text-green-100" title="Staff ID partially masked">Staff account matched</p><p className="text-xs text-blue-100">{staffPreview.jobTitle||roleLabel}</p></div>
                    </div>
                    {staffPreview.department&&<p className="mt-2 text-xs text-blue-100">{staffPreview.department}</p>}
                  </div>
                ) : (
                  <div className="relative z-10 mt-7 grid grid-cols-2 gap-2 text-xs font-bold text-blue-100">
                    <div className="rounded-xl border border-cyan-200/25 bg-white/5 p-3"><ShieldCheck className="mb-1 h-5 w-5 text-yellow-300"/>Protected access</div>
                    <div className="rounded-xl border border-cyan-200/25 bg-white/5 p-3"><Fingerprint className="mb-1 h-5 w-5 text-yellow-300"/>Staff verification</div>
                  </div>
                )}
              </aside>
              <section className="relative bg-[radial-gradient(circle_at_100%_0%,rgba(14,165,233,.13),transparent_34%)] p-4 sm:p-7">
                <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-cyan-400 via-blue-500 to-yellow-400"/>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div><p className="text-[11px] font-black uppercase tracking-[.24em] text-cyan-300">SECURE SIGN IN</p><h2 className="mt-1 text-xl font-black text-white sm:text-2xl">Admin Login</h2><p className="mt-1 text-sm text-blue-100">Verify your staff identity to continue.</p></div>
                  <div className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 p-3"><ShieldCheck className="h-8 w-8 text-yellow-300"/></div>
                </div>
                <div className="mb-4 flex items-center gap-2 text-[10px] font-extrabold tracking-[.16em] text-green-200"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-green-400"/><span>SYSTEM ONLINE</span><span className="text-white/30">•</span><span>AUTHORIZED ACCESS ONLY</span></div>
                {useEmailLogin ? (
                  <form onSubmit={signInWithEmail} className="space-y-3">
                    <div className="rounded-xl border border-cyan-400/30 bg-blue-950/60 p-3 text-xs text-blue-100">Use the registered administrator email and password if Staff ID verification is unavailable.</div>
                    <div className="space-y-1.5"><Label htmlFor="admin-email" className="font-bold text-blue-100">Registered email</Label><Input id="admin-email" name="email" type="email" autoComplete="username" required placeholder="admin@example.com" className="h-12 rounded-lg border-blue-400/50 bg-[#061a3a] text-white placeholder:text-blue-200/50"/></div>
                    <div className="space-y-1.5"><Label htmlFor="admin-password" className="font-bold text-blue-100">Password</Label><Input id="admin-password" name="password" type="password" autoComplete="current-password" required placeholder="Enter your password" className="h-12 rounded-lg border-blue-400/50 bg-[#061a3a] text-white placeholder:text-blue-200/50"/></div>
                    <Button type="submit" disabled={loading} className="h-12 w-full rounded-xl bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-base font-extrabold text-[#06142c] shadow-lg">{loading?'Signing in…':'Sign in to Admin Portal'}</Button>
                    <button type="button" onClick={()=>{setUseEmailLogin(false);setStatus('');}} className="w-full text-xs font-semibold text-cyan-200 hover:text-yellow-300">Return to Staff ID verification</button>
                  </form>
                ) : !staffPreview ? (
                  <form onSubmit={lookupStaff} className="space-y-4">
                    <div className="rounded-xl border border-cyan-400/30 bg-blue-950/60 p-3 text-sm leading-5 text-blue-100">Enter your Staff ID. The system checks it against the authorized staff register.</div>
                    <div className="space-y-2"><Label htmlFor="staffId" className="font-bold text-blue-100">Staff ID</Label><Input id="staffId" value={staffId} onChange={event=>{setStaffId(event.target.value.toUpperCase());setScanState('idle');setStatus('');}} autoComplete="username" placeholder="Enter Staff ID" required className="h-12 rounded-xl border-blue-300/50 bg-white text-base font-semibold text-blue-950 placeholder:text-slate-400 focus-visible:ring-blue-500"/></div>
                    {scanState !== 'idle' && <div className={`rounded-xl border p-3 text-sm ${scanState==='found'?'border-green-300 bg-green-50 text-green-800':scanState==='notFound'?'border-red-300 bg-red-50 text-red-800':'border-blue-200 bg-blue-50 text-blue-800'}`} role="status"><div className="flex items-center gap-2">{scanState==='scanning'?<><Fingerprint className="h-5 w-5 animate-pulse"/><span className="font-semibold">Scanning staff register…</span></>:scanState==='found'?<><ShieldCheck className="h-5 w-5 text-green-600"/><span className="font-bold">STAFF ID FOUND ✓</span></>:<><span className="text-lg font-black text-red-600">✕</span><span className="font-bold">STAFF ID NOT FOUND</span></>}</div>{scanState==='scanning'&&<div className="mt-2 h-1 overflow-hidden rounded-full bg-blue-200"><div className="h-full w-1/3 animate-pulse rounded-full bg-blue-600"/></div>}</div>}
                    <Button type="submit" disabled={loading||!staffId.trim()} className="h-12 w-full rounded-xl bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-base font-extrabold text-[#06142c] shadow-lg shadow-yellow-500/20 hover:brightness-110">{loading?<><LoaderCircle className="mr-2 h-4 w-4 animate-spin"/>Scanning & validating…</>:'Scan & Validate Staff ID'}</Button>
                  </form>
                ) : (
                  <form onSubmit={verifyStaff} className="space-y-4">
                    <div className="rounded-xl border border-green-300/50 bg-green-950/40 p-3 text-sm text-green-50"><div className="flex items-center gap-2 font-bold text-green-200"><UserRoundCheck className="h-5 w-5"/>Staff account matched</div><p className="mt-2 text-xs leading-5 text-green-50">Choose a registered contact method. Contact details are masked for privacy.</p></div>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" disabled={!staffPreview.hasEmail} onClick={()=>{setStaffChannel('email');setStaffCodeSent(false);setStaffOtp('');setStatus('');}} className={staffChannel==='email'?'rounded-xl border border-cyan-300 bg-cyan-400/15 p-3 text-left text-xs':'rounded-xl border border-white/15 bg-white/5 p-3 text-left text-xs'}><b className="block text-white">Email</b><span className="mt-1 block text-blue-100">{staffPreview.emailMasked||'Not registered'}</span></button>
                      <button type="button" disabled={!staffPreview.hasPhone} onClick={()=>{setStaffChannel('sms');setStaffCodeSent(false);setStaffOtp('');setStatus('');}} className={staffChannel==='sms'?'rounded-xl border border-cyan-300 bg-cyan-400/15 p-3 text-left text-xs':'rounded-xl border border-white/15 bg-white/5 p-3 text-left text-xs'}><b className="block text-white">SMS</b><span className="mt-1 block text-blue-100">{staffPreview.phoneMasked||'Not registered'}</span></button>
                    </div>
                    {staffCodeSent&&<div className="space-y-2"><Label htmlFor="staff-otp" className="font-bold text-blue-100">Six-digit verification code</Label><Input id="staff-otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={staffOtp} onChange={event=>setStaffOtp(event.target.value.replace(/\D/g,'').slice(0,6))} placeholder="Enter code sent to you" className="h-12 rounded-xl border-blue-300/50 bg-white text-center text-xl tracking-[.35em] text-blue-950"/></div>}
                    <Button type="submit" disabled={loading||(staffCodeSent&&staffOtp.length!==6)||(!staffCodeSent&&((staffChannel==='email'&&!staffPreview.hasEmail)||(staffChannel==='sms'&&!staffPreview.hasPhone)))} className="h-12 w-full rounded-xl bg-gradient-to-r from-green-600 via-green-500 to-blue-700 text-sm font-extrabold text-white shadow-lg">{loading?'Please wait…':staffCodeSent?'Verify code & Open Admin Dashboard':'Send secure verification code'}</Button>
                    <button type="button" onClick={()=>{setStaffPreview(null);setStaffCodeSent(false);setStaffOtp('');setStatus('');setScanState('idle');setCelebrating(false);}} className="w-full text-sm font-semibold text-cyan-200 hover:text-yellow-300">Back · Use a different Staff ID</button>
                  </form>
                )}
                {status&&<div role="alert" className="mt-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">{status}</div>}
                <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-cyan-300/25 pt-3 text-[11px] font-semibold text-blue-100"><span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-green-300"/>Encrypted access</span><span>•</span><span>Staff register validation</span><span>•</span><span>Identity confirmation</span></div>
              </section>
              <div className="col-span-full grid grid-cols-2 border-t border-cyan-300/30 bg-[#03122c]/80 text-center sm:grid-cols-5">
                { [{icon:"🎓",label:"E-Learning"},{icon:"♟",label:"Student & Tutor Portals"},{icon:"▥",label:"Analytics"},{icon:"☁",label:"Cloud Services"},{icon:"⛨",label:"Secure & Reliable"}].map((item,i)=><div key={item.label} className={`flex items-center justify-center gap-2 px-2 py-2.5 text-[10px] font-bold text-blue-100 ${i>0?"border-l border-cyan-300/20":""} ${i>=2?"border-t border-cyan-300/20 sm:border-t-0":""}`}><span className="text-sm text-yellow-300">{item.icon}</span><span>{item.label}</span></div>)}
              </div>
            </section>
          </div>
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
              <button type="button" onClick={() => { setUseEmailLogin(false); setStatus(''); }} className="w-full text-xs font-semibold text-cyan-300 hover:text-white">Use Staff ID and email/SMS verification instead</button>
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
              <div className="rounded-xl border border-green-300/50 bg-green-950/40 p-3 text-sm text-green-50"><div className="flex items-center gap-2 font-bold text-green-200"><UserRoundCheck className="h-5 w-5"/>Staff account matched</div><p className="mt-2 text-xs leading-5 text-green-50">Choose a registered contact method. Contact details are masked for privacy.</p></div>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" disabled={!staffPreview.hasEmail} onClick={()=>{setStaffChannel('email');setStaffCodeSent(false);setStaffOtp('');setStatus('');}} className={staffChannel==='email'?'rounded-xl border border-cyan-300 bg-cyan-400/15 p-3 text-left text-xs':'rounded-xl border border-white/15 bg-white/5 p-3 text-left text-xs'}><b className="block text-white">Email</b><span className="mt-1 block text-slate-300">{staffPreview.emailMasked||'Not registered'}</span></button>
                      <button type="button" disabled={!staffPreview.hasPhone} onClick={()=>{setStaffChannel('sms');setStaffCodeSent(false);setStaffOtp('');setStatus('');}} className={staffChannel==='sms'?'rounded-xl border border-cyan-300 bg-cyan-400/15 p-3 text-left text-xs':'rounded-xl border border-white/15 bg-white/5 p-3 text-left text-xs'}><b className="block text-white">SMS</b><span className="mt-1 block text-slate-300">{staffPreview.phoneMasked||'Not registered'}</span></button>
                    </div>
                    {staffCodeSent&&<div className="space-y-2"><Label htmlFor="staff-otp" className="font-bold text-slate-300">Six-digit verification code</Label><Input id="staff-otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={staffOtp} onChange={event=>setStaffOtp(event.target.value.replace(/\D/g,'').slice(0,6))} placeholder="Enter code sent to you" className="h-12 rounded-xl border-slate-600 bg-[#0b1425] text-center text-xl tracking-[.35em] text-white"/></div>}
                    <Button type="submit" disabled={loading||(staffCodeSent&&staffOtp.length!==6)||(!staffCodeSent&&((staffChannel==='email'&&!staffPreview.hasEmail)||(staffChannel==='sms'&&!staffPreview.hasPhone)))} className="h-12 w-full rounded-xl bg-gradient-to-r from-green-600 via-green-500 to-blue-700 text-sm font-extrabold text-white shadow-lg">{loading?'Please wait…':staffCodeSent?'Verify code & Open Staff Dashboard':'Send secure verification code'}</Button>
                    <button type="button" onClick={()=>{setStaffPreview(null);setStaffCodeSent(false);setStaffOtp('');setStatus('');setScanState('idle');setCelebrating(false);}} className="w-full text-sm font-semibold text-cyan-200 hover:text-yellow-300">Back · Use a different Staff ID</button>
            </form>
          )}
          {status && <div role="alert" className="mt-3 rounded-lg border border-rose-400/40 bg-rose-500/15 p-2.5 text-xs leading-5 text-rose-50">{status}</div>}
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-white/5 p-2.5 text-[11px] leading-4 text-slate-300"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />{isStaff ? 'Your sign-in code is sent only to your registered email or mobile number. Never share it.' : 'Student accounts use email and password. Never share your password or M-Pesa PIN.'}</p>
          <Link to="/student-recovery" className="mt-4 inline-flex text-sm font-semibold text-cyan-300 hover:text-white">Forgot password? Recover using email or SMS OTP</Link>
          <p className="mt-4 text-center text-[10px] text-slate-400">© Navstar Digital Hub · HOME OF TECHNOCRATS</p>
        </section>
        </div>
      </div>
    </main>
  );
}
