import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Bell, BookOpen, BriefcaseBusiness, CircleDollarSign, GraduationCap, LogOut, LockKeyhole, ShieldCheck, Sparkles, UserRound, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PortalWorkspaceTabs } from '@/components/PortalWorkspaceTabs';

const portals = [
  { id: 'student', title: 'Student Portal', icon: GraduationCap, summary: 'One secure student account for your profile, applications, courses, learning materials, assignments, fees, receipts and updates.', accent: 'from-blue-600 to-cyan-500', tint: 'bg-blue-500/10 text-blue-700' },
  { id: 'tutor', title: 'Tutor portal', icon: BookOpen, summary: 'Manage class lists, learning resources, attendance and student progress.', accent: 'from-blue-700 to-cyan-500', tint: 'bg-blue-500/10 text-blue-700' },
  { id: 'admissions', title: 'Admissions portal', icon: UserRound, summary: 'Review applications, applicant documents, enquiries and admission follow-up.', accent: 'from-blue-700 to-cyan-500', tint: 'bg-blue-500/10 text-blue-700' },
  { id: 'principal', title: 'Principal portal', icon: BriefcaseBusiness, summary: 'View academic activity, approvals, staff operations and institutional reports.', accent: 'from-blue-700 to-cyan-500', tint: 'bg-blue-500/10 text-blue-700' },
  { id: 'finance', title: 'Finance portal', icon: CircleDollarSign, summary: 'Manage authorised fee collections, payments, refunds, scholarships and financial reports.', accent: 'from-blue-700 to-cyan-500', tint: 'bg-blue-500/10 text-blue-700' },
  { id: 'admin', title: 'Administrator portal', icon: ShieldCheck, summary: 'Manage courses, services, users, payments, notifications, downloadable documents and website settings.', accent: 'from-blue-700 to-cyan-500', tint: 'bg-blue-500/10 text-blue-700' },
  { id: 'customer', title: 'Customer service desk', icon: BriefcaseBusiness, summary: 'Browse Navstar services, request assistance, place service orders and pay securely. No student or staff account is required.', accent: 'from-emerald-600 to-teal-500', tint: 'bg-emerald-500/10 text-emerald-700' },

];

const portalEntryUrls: Record<string, string> = {
  admin: 'https://admin.navstardigitalhub.co.ke/',
  student: 'https://student.navstardigitalhub.co.ke/',
  tutor: 'https://tutor.navstardigitalhub.co.ke/',
};

const portalStyles: Record<string, { page: string; hero: string; eyebrow: string }> = {
  student: { page: 'bg-[#f3f7fc]', hero: 'bg-gradient-to-r from-[#061631] via-[#0b3470] to-[#087eaa]', eyebrow: 'text-amber-300' },
  tutor: { page: 'bg-violet-50', hero: 'bg-gradient-to-r from-violet-950 via-indigo-900 to-slate-900', eyebrow: 'text-violet-200' },
  admissions: { page: 'bg-teal-50', hero: 'bg-gradient-to-r from-teal-950 via-cyan-900 to-slate-900', eyebrow: 'text-teal-200' },
  principal: { page: 'bg-amber-50', hero: 'bg-gradient-to-r from-amber-950 via-orange-900 to-slate-950', eyebrow: 'text-amber-200' },
  finance: { page: 'bg-emerald-50', hero: 'bg-gradient-to-r from-emerald-950 via-teal-900 to-slate-950', eyebrow: 'text-emerald-200' },
  admin: { page: 'bg-slate-100', hero: 'bg-gradient-to-r from-slate-950 via-blue-950 to-slate-900', eyebrow: 'text-blue-200' },
  customer: { page: 'bg-emerald-50', hero: 'bg-gradient-to-r from-emerald-950 via-teal-900 to-slate-900', eyebrow: 'text-emerald-200' },
};

type SessionUser = { id: string; name: string; email: string; role: string; profilePhotoUrl?: string | null; mustChangePassword?: boolean };
type Enrollment = { id: string; full_name: string; course_id: string; course_title?:string; phone?: string; status: string; payment_status: string; created_at: string; admission_fee?:number; amount_paid?:number; course_fee?:number };
type Overview = { students: number; applications: number; verifiedPayments: number; verifiedDonations: number; courses: number; services: number };
type FinancePayment = { id: string; purpose: string; receipt_number?: string; mpesa_receipt?: string; amount: number; payer_name: string; description: string; status: string; updated_at: string };
type CashoutRequest = { id: string; reference: string; amount: number; status: string; created_at: string; requested_by: string };

export function PortalsPage() {
  const { role } = useParams();
  const navigate = useNavigate();
  const selectedPortal = portals.find((portal) => portal.id === role);
  const selectedStyle = selectedPortal ? portalStyles[selectedPortal.id] : null;
  const [user, setUser] = useState<SessionUser | null>(null);
  const [logoUrl, setLogoUrl] = useState('/Navstar_Official_Logo.jpg');
  useEffect(() => { let live = true; fetch('/api/public-branding', { cache: 'no-store' }).then(r => r.json()).then(data => { if (live && typeof data?.branding?.logoAssetUrl === 'string' && data.branding.logoAssetUrl) setLogoUrl(data.branding.logoAssetUrl); }).catch(() => undefined); return () => { live = false; }; }, []);
  const [maintenance, setMaintenance] = useState<{active:boolean;portals:string[];message:string;startsAt:string;returnAt:string;backgroundUrl:string}|null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [financePayments, setFinancePayments] = useState<FinancePayment[]>([]);
  const [financeCashouts, setFinanceCashouts] = useState<CashoutRequest[]>([]);
  const [paymentBusyId, setPaymentBusyId] = useState('');
  const [paymentNotice, setPaymentNotice] = useState('');
  const autoPaymentSent = useRef(new Set<string>());
  const [status, setStatus] = useState('Checking your secure session…');
  const signOut = async () => { await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined); setUser(null); navigate('/login', { replace: true }); };
  useEffect(() => {
    if (!selectedPortal) return;
    let live = true;
    const check = () => fetch('/api/maintenance-status', { cache: 'no-store' }).then(async response => {
      const result = await response.json() as {active?:boolean;portals?:string[];message?:string;startsAt?:string;returnAt?:string;backgroundUrl?:string};
      if (live && response.ok && result.active && (result.portals||[]).includes(selectedPortal.id)) setMaintenance({active:true,portals:result.portals||[],message:result.message||'Navstar Digital Hub is undergoing scheduled maintenance.',startsAt:result.startsAt||'',returnAt:result.returnAt||'',backgroundUrl:result.backgroundUrl||''});
      else if (live) setMaintenance(null);
    }).catch(()=>{if(live)setMaintenance(null);});
    void check();
    const interval = window.setInterval(check, 30000);
    return () => { live = false; window.clearInterval(interval); };
  }, [selectedPortal]);
  const refreshStudentFees = async () => {
    const response=await fetch('/api/enrollments',{cache:'no-store'});
    const result=await response.json() as {enrollments?:Enrollment[]};
    if(response.ok)setEnrollments(result.enrollments||[]);
  };
  const watchStudentPayment = async (paymentId:string) => {
    for(let attempt=0;attempt<24;attempt++){
      await new Promise(resolve=>window.setTimeout(resolve,5000));
      try{
        const response=await fetch('/api/payments/stk-push?reference='+encodeURIComponent(paymentId),{cache:'no-store'});
        const result=await response.json();
        if(response.ok&&result.payment?.status==='paid'){
          setPaymentNotice('Payment verified by M-Pesa. Your student fee balance has been updated.');
          await refreshStudentFees();return;
        }
        if(response.ok&&result.payment?.status==='failed'){
          setPaymentNotice('M-Pesa did not confirm the payment. Your balance has not been reduced. You can retry from Fees & Payments.');
          await refreshStudentFees();return;
        }
      }catch{}
    }
    setPaymentNotice('The M-Pesa prompt was sent. Confirmation is still pending. Refresh the portal shortly to see your verified balance.');
    await refreshStudentFees();
  };
  const requestStudentPayment = async (item: Enrollment) => {
    if (!item.phone) { setPaymentNotice('No registered payment phone is available. Please update your phone number in My Account or contact Finance.'); return; }
    setPaymentBusyId(item.id); setPaymentNotice('');
    try {
      const response = await fetch('/api/payments/stk-push', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purpose: 'enrollment', reference: item.id, phone: item.phone }) });
      const result = await response.json() as { id?: string; message?: string; error?: string };
      if (!response.ok || !result.id) throw new Error(result.error || 'The M-Pesa prompt could not be sent.');
      setPaymentNotice(result.message || 'M-Pesa prompt sent. Check your registered phone and complete the request using your Safaricom PIN.');
      setEnrollments(current => current.map(row => row.id === item.id ? { ...row, payment_status: 'pending' } : row));
      void watchStudentPayment(result.id);
    } catch (error) {
      setPaymentNotice(error instanceof Error ? error.message : 'Payment request could not be completed.');
    } finally { setPaymentBusyId(''); }
  };

  useEffect(() => {
    if (!selectedPortal) return;
    let active = true;
    const loadPortal = async () => {
      try {
        const sessionResponse = await fetch('/api/auth/me');
        const session = await sessionResponse.json() as { user?: SessionUser; error?: string };
        if (!sessionResponse.ok || !session.user) {
          if (active) setStatus(session.error ?? 'Sign in to open this portal.');
          return;
        }
        if (session.user.mustChangePassword) {
          navigate('/change-password', { replace: true });
          return;
        }
        if (session.user.role !== selectedPortal.id) {
          if (active) setStatus('This account does not have access to the selected portal. Sign in with an authorized account.');
          return;
        }
        if (active) { setUser(session.user); setStatus(''); }
        if (['student', 'admissions', 'principal'].includes(session.user.role)) {
          const response = await fetch('/api/enrollments');
          const result = await response.json() as { enrollments?: Enrollment[] };
          if (response.ok && active) setEnrollments(result.enrollments ?? []);
        }
        if (['admin', 'principal', 'finance'].includes(session.user.role)) {
          const response = await fetch('/api/admin/overview');
          const result = await response.json() as Overview;
          if (response.ok && active) setOverview(result);
        }
        if (session.user.role === 'finance') {
          const [paymentsResponse, cashoutsResponse] = await Promise.all([
            fetch('/api/admin/payments'),
            fetch('/api/admin/cashouts'),
          ]);
          const [paymentsResult, cashoutsResult] = await Promise.all([
            paymentsResponse.json() as Promise<{ payments?: FinancePayment[] }>,
            cashoutsResponse.json() as Promise<{ requests?: CashoutRequest[] }>,
          ]);
          if (active && paymentsResponse.ok) setFinancePayments(paymentsResult.payments ?? []);
          if (active && cashoutsResponse.ok) setFinanceCashouts(cashoutsResult.requests ?? []);
        }
      } catch {
        if (active) setStatus('The portal service could not be reached. Try again after the backend is connected.');
      }
    };
    void loadPortal();
    return () => { active = false; };
  }, [navigate, selectedPortal]);

  useEffect(() => {
    if(user?.role!=='student'||!enrollments.length)return;
    const due=enrollments.find(item=>['submitted','under_review'].includes(item.status)&&item.payment_status!=='paid'&&Number(item.amount_paid||0)===0&&Number(item.admission_fee||0)>=100&&Boolean(item.phone));
    if(!due||autoPaymentSent.current.has(due.id))return;
    autoPaymentSent.current.add(due.id);
    void requestStudentPayment(due);
  },[user,enrollments]);

  if (!selectedPortal) {
    return (
      <main className="navstar-portal min-h-screen bg-slate-50">
        <section className="relative isolate overflow-hidden bg-[#061127] text-white">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_15%_20%,rgba(37,99,235,.45),transparent_40%),radial-gradient(ellipse_at_90%_80%,rgba(6,182,212,.25),transparent_38%)]" />
          <div className="container mx-auto px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <div className="max-w-3xl">
              <img src={logoUrl} alt="Official Navstar Digital Hub logo" className="mb-7 h-24 w-48 object-contain object-left sm:h-28 sm:w-56" />
              <p className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-bold uppercase tracking-[.25em] text-cyan-200"><LockKeyhole className="h-4 w-4" /> Secure access gateway</p>
              <p className="mt-6 text-xs font-extrabold uppercase tracking-[.3em] text-amber-300">HOME OF TECHNOCRATS</p>
              <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">Welcome to your <span className="bg-gradient-to-r from-sky-300 to-amber-300 bg-clip-text text-transparent">digital workspace.</span></h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">Choose the secure portal assigned to your role. Each gateway opens the tools and information relevant to your work or learning.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild className="rounded-full bg-blue-600 px-6 hover:bg-blue-500"><Link to="/login">Sign in <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
                <Button asChild variant="outline" className="rounded-full border-white/25 bg-white/5 px-6 text-white hover:bg-white/10 hover:text-white"><Link to="/">Back to homepage</Link></Button>
              </div>
            </div>
          </div>
        </section>
        <section className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
          <div className="mb-7 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div><p className="text-xs font-extrabold uppercase tracking-[.25em] text-blue-700">Choose your access</p><h2 className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">Select your portal</h2><p className="mt-2 text-sm text-slate-600">Only accounts assigned to a role can enter that workspace.</p></div>
            <div className="inline-flex items-center gap-2 self-start rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800"><ShieldCheck className="h-4 w-4" /> Role-based protected access</div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {portals.map(({ id, title, icon: Icon, summary, accent, tint }) => (
              <article key={id} className="group flex min-h-[270px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl">
                <div className={`h-1.5 bg-gradient-to-r ${accent}`} />
                <div className="flex flex-1 flex-col p-6 sm:p-7">
                  <div className="flex items-start justify-between"><span className={`flex h-14 w-14 items-center justify-center rounded-2xl ${tint}`}><Icon className="h-7 w-7" /></span><span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Secure gate</span></div>
                  <h3 className="mt-6 text-xl font-black text-slate-950">{title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-7 text-slate-600">{summary}</p>
                  <div className="mt-6 flex items-center gap-3">
                    <Button asChild className={`flex-1 rounded-xl bg-gradient-to-r ${accent} text-white shadow-sm hover:opacity-90`}>{id === 'customer' ? <Link to="/services">Browse & order <ArrowRight className="ml-2 h-4 w-4" /></Link> : <a href={portalEntryUrls[id] || `/login?role=${id}`}>Sign in <ArrowRight className="ml-2 h-4 w-4" /></a>}</Button>

                  </div>
                </div>
              </article>
            ))}
          </div>
          <section className="mt-10 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-extrabold uppercase tracking-[.22em] text-cyan-700">Public Navstar destinations</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">Explore the public website</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">These pages are open to visitors. You do not need a portal account to browse courses, learn about Navstar, request digital services or support our work.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[{to:'/',title:'Public listing & Home',detail:'Discover Navstar Digital Hub, announcements and featured information.'},{to:'/courses',title:'Courses & Training',detail:'Browse available ICT and professional training programmes.'},{to:'/services',title:'Digital Services',detail:'Explore cyber, design, technology and online service support.'},{to:'/donations',title:'Donations & Support',detail:'View ways to support Navstar initiatives and community projects.'},{to:'/learning',title:'Learning Resources',detail:'Explore public learning information and available resources.'},{to:'/forum',title:'Community Forum',detail:'Visit community discussions and support channels.'}].map(item=><Link key={item.to} to={item.to} className="rounded-2xl border border-slate-200 p-4 transition hover:border-cyan-400 hover:bg-cyan-50/50"><span className="font-bold text-slate-900">{item.title}</span><span className="mt-1 block text-xs leading-5 text-slate-600">{item.detail}</span><span className="mt-3 inline-flex items-center text-xs font-bold text-blue-700">Open page <ArrowRight className="ml-1 h-3.5 w-3.5"/></span></Link>)}
            </div>
          </section>
          <div className="mt-8 flex flex-col items-start gap-3 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-cyan-50 p-5 sm:flex-row sm:items-center">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm"><UsersRound className="h-5 w-5" /></span>
            <div className="flex-1"><p className="font-bold text-slate-900">Need help accessing your account?</p><p className="mt-1 text-sm text-slate-600">Contact the Navstar Digital Hub team for account assistance. Never share your password with anyone.</p></div>
            <Sparkles className="hidden h-5 w-5 text-amber-500 sm:block" />
          </div>
        </section>
      </main>
    );
  }

  if (maintenance?.active && selectedPortal) {
    return <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[#061127] px-4 py-12 text-white">
      {maintenance.backgroundUrl && <div className="absolute inset-0 -z-20 bg-cover bg-center opacity-35" style={{backgroundImage:`url("${maintenance.backgroundUrl}")`}}/>}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[#041126]/95 via-blue-950/90 to-[#071329]/95"/>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[.07]"><img src={logoUrl} alt="" className="w-[min(75vw,620px)] object-contain"/></div>
      <section className="w-full max-w-2xl rounded-3xl border border-white/15 bg-white/[.08] p-7 text-center shadow-2xl backdrop-blur-xl sm:p-10">
        <img src={logoUrl} alt="Navstar Digital Hub" className="mx-auto mb-7 h-20 w-40 object-contain"/>
        <p className="text-xs font-black uppercase tracking-[.28em] text-amber-300">HOME OF TECHNOCRATS</p>
        <div className="mx-auto mt-7 grid h-16 w-16 place-items-center rounded-2xl border border-cyan-200/30 bg-cyan-300/10 text-3xl">⚙</div>
        <h1 className="mt-6 text-3xl font-black sm:text-4xl">Portal under maintenance</h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-blue-100">{maintenance.message}</p>
        <div className="mt-7 grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-left sm:grid-cols-2">
          <div><p className="text-[10px] font-bold uppercase tracking-wider text-cyan-200">Maintenance starts</p><p className="mt-1 font-bold">{maintenance.startsAt} EAT</p></div>
          <div><p className="text-[10px] font-bold uppercase tracking-wider text-cyan-200">Expected return</p><p className="mt-1 font-bold">{maintenance.returnAt} EAT</p></div>
        </div>
        <p className="mt-6 text-xs text-slate-300">We are improving your {selectedPortal.title}. Please return after the scheduled time.</p>
        <p className="mt-5 text-[10px] font-bold uppercase tracking-[.2em] text-slate-400">NAVSTAR DIGITAL HUB · navstardigitalhub.co.ke</p>
      </section>
    </main>;
  }

  return (
    <main className={"navstar-portal min-h-screen " + (selectedStyle?.page || "bg-slate-50")}> 
      <section className={(selectedStyle?.hero || "bg-[#061127]") + " text-white"}>
        <div className="flex w-full flex-col justify-between gap-4 px-4 py-10 sm:flex-row sm:items-end sm:px-6 lg:px-8">
          <div><p className={"text-xs font-bold uppercase tracking-[.25em] " + (selectedStyle?.eyebrow || "text-cyan-300")}>NAVSTAR DIGITAL HUB / {selectedPortal.id}</p><h1 className="mt-2 text-3xl font-black">{selectedPortal.title}</h1><div className="mt-2 flex items-center gap-3 text-slate-300">{user?.profilePhotoUrl && <img src={user.profilePhotoUrl} alt="Profile photo" className="h-10 w-10 rounded-full border border-white/30 object-cover"/>}<p className="font-semibold text-white">{user ? `Welcome back, ${user.name} · ${selectedPortal.title}` : status}</p></div></div>
          {!user && <Button asChild className="w-fit rounded-full bg-blue-600 hover:bg-blue-500"><Link to={`/login?role=${selectedPortal.id}`}>Sign in securely <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>}
          {user && <div className="flex flex-wrap gap-2"><Button asChild variant="outline" className="border-white/30 bg-white/5 text-white hover:bg-white/10"><Link to="/portals/notifications"><Bell className="mr-2 h-4 w-4"/>Notifications</Link></Button><Button asChild variant="outline" className="border-white/30 bg-white/5 text-white hover:bg-white/10"><Link to="/my-account"><UserRound className="mr-2 h-4 w-4"/>My account</Link></Button>{['admin','principal','tutor'].includes(user.role) && <Button asChild variant="outline" className="border-cyan-300/50 bg-cyan-300/10 text-white hover:bg-cyan-300/20"><Link to="/learning">Academic operations</Link></Button>}{user.role === 'admin' && <Button asChild variant="outline" className="border-white/30 bg-white/5 text-white hover:bg-white/10"><Link to="/admin">Admin workspace</Link></Button>}<Button type="button" variant="outline" onClick={() => void signOut()} className="border-amber-300/60 bg-amber-300/10 text-white hover:bg-amber-300/20"><LogOut className="mr-2 h-4 w-4"/>Log out</Button></div>}
        </div>
      </section>
      <section className="w-full space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        {user && user.role === 'student' && !user.profilePhotoUrl ? <section className="mx-auto max-w-2xl rounded-2xl border border-amber-200 bg-white p-7 text-center shadow-xl"><div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-amber-50 text-amber-700"><UserRound className="h-8 w-8"/></div><p className="mt-5 text-xs font-black uppercase tracking-[.2em] text-blue-800">NAVSTAR DIGITAL HUB · STUDENT IDENTITY</p><h2 className="mt-2 text-2xl font-black text-slate-950">Passport photo required</h2><p className="mt-3 text-sm leading-7 text-slate-600">To complete your student profile and access learning services, upload a clear passport photograph. You can upload it yourself or ask the Navstar administrator to add it to your account.</p><Button asChild className="mt-5 rounded-xl bg-blue-800"><Link to="/my-account">Upload my passport photo</Link></Button></section> : user ? <PortalWorkspaceTabs
          role={user.role as 'student'|'tutor'|'admissions'|'principal'|'finance'|'admin'}
          name={user.name}
          enrollments={enrollments}
          overview={overview}
          payments={financePayments}
          cashouts={financeCashouts}
          onPay={user.role==='student'?requestStudentPayment:undefined}
          payingId={paymentBusyId}
        /> : <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">{status || 'Sign in is required to view private portal records.'} <Link to={`/login?role=${selectedPortal.id}`} className="ml-2 font-bold underline">Go to sign in</Link></div>}
        {user && paymentNotice && <p role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">{paymentNotice}</p>}
      </section>
    </main>
  );
}
