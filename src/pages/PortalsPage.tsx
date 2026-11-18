import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, BookOpen, BriefcaseBusiness, GraduationCap, ShieldCheck, UserRound, UsersRound, Sparkles, LockKeyhole, Bell, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatEATDate } from '@/lib/datetime';

const portals = [
  { id: 'student', title: 'Student portal', icon: GraduationCap, summary: 'Access learning information, applications, payment receipts and student updates.', accent: 'from-blue-600 to-cyan-500', tint: 'bg-blue-500/10 text-blue-700' },
  { id: 'tutor', title: 'Tutor portal', icon: BookOpen, summary: 'Manage class lists, learning resources, attendance and student progress.', accent: 'from-violet-600 to-indigo-500', tint: 'bg-violet-500/10 text-violet-700' },
  { id: 'admissions', title: 'Admissions portal', icon: UserRound, summary: 'Review applications, applicant documents, enquiries and admission follow-up.', accent: 'from-cyan-600 to-blue-500', tint: 'bg-cyan-500/10 text-cyan-700' },
  { id: 'principal', title: 'Principal portal', icon: BriefcaseBusiness, summary: 'View academic activity, approvals, staff operations and institutional reports.', accent: 'from-amber-500 to-orange-500', tint: 'bg-amber-500/10 text-amber-700' },
  { id: 'admin', title: 'Administrator portal', icon: ShieldCheck, summary: 'Manage courses, services, users, payments, notifications, downloadable documents and website settings.', accent: 'from-slate-800 to-blue-700', tint: 'bg-slate-800/10 text-slate-800' },
  { id: 'customer', title: 'Customer service desk', icon: BriefcaseBusiness, summary: 'Browse Navstar services, request assistance, place service orders and pay securely. No student or staff account is required.', accent: 'from-emerald-600 to-teal-500', tint: 'bg-emerald-500/10 text-emerald-700' },
];

type SessionUser = { id: string; name: string; email: string; role: string; mustChangePassword?: boolean };
type Enrollment = { id: string; full_name: string; course_id: string; status: string; payment_status: string; created_at: string };
type Overview = { students: number; applications: number; verifiedPayments: number; verifiedDonations: number; courses: number; services: number };

export function PortalsPage() {
  const { role } = useParams();
  const navigate = useNavigate();
  const selectedPortal = portals.find((portal) => portal.id === role);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [status, setStatus] = useState('Checking your secure session…');
  const signOut = async () => { await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined); setUser(null); navigate('/login', { replace: true }); };

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
        if (['admin', 'principal'].includes(session.user.role)) {
          const response = await fetch('/api/admin/overview');
          const result = await response.json() as Overview;
          if (response.ok && active) setOverview(result);
        }
      } catch {
        if (active) setStatus('The portal service could not be reached. Try again after the backend is connected.');
      }
    };
    void loadPortal();
    return () => { active = false; };
  }, [navigate, selectedPortal]);

  if (!selectedPortal) {
    return (
      <main className="min-h-screen bg-slate-50">
        <section className="relative isolate overflow-hidden bg-[#061127] text-white">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_15%_20%,rgba(37,99,235,.45),transparent_40%),radial-gradient(ellipse_at_90%_80%,rgba(6,182,212,.25),transparent_38%)]" />
          <div className="container mx-auto px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <div className="max-w-3xl">
              <img src="/Navstar_Official_Logo.jpg" alt="Official Navstar Digital Hub logo" className="mb-7 h-24 w-48 object-contain object-left sm:h-28 sm:w-56" />
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
                    <Button asChild className={`flex-1 rounded-xl bg-gradient-to-r ${accent} text-white shadow-sm hover:opacity-90`}><Link to={id === 'customer' ? '/services' : `/login?role=${id}`}>{id === 'customer' ? 'Browse & order' : 'Sign in'} <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>

                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className="mt-8 flex flex-col items-start gap-3 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-cyan-50 p-5 sm:flex-row sm:items-center">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm"><UsersRound className="h-5 w-5" /></span>
            <div className="flex-1"><p className="font-bold text-slate-900">Need help accessing your account?</p><p className="mt-1 text-sm text-slate-600">Contact the Navstar Digital Hub team for account assistance. Never share your password with anyone.</p></div>
            <Sparkles className="hidden h-5 w-5 text-amber-500 sm:block" />
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <section className="bg-[#061127] text-white">
        <div className="container mx-auto flex flex-col justify-between gap-4 px-4 py-10 sm:flex-row sm:items-end sm:px-6 lg:px-8">
          <div><p className="text-xs font-bold uppercase tracking-[.25em] text-cyan-300">NAVSTAR DIGITAL HUB / {selectedPortal.id}</p><h1 className="mt-2 text-3xl font-black">{selectedPortal.title}</h1><p className="mt-2 text-slate-300">{user ? `Welcome, ${user.name}` : status}</p></div>
          {!user && <Button asChild className="w-fit rounded-full bg-blue-600 hover:bg-blue-500"><Link to={`/login?role=${selectedPortal.id}`}>Sign in securely <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>}
          {user && <div className="flex flex-wrap gap-2"><Button asChild variant="outline" className="border-white/30 bg-white/5 text-white hover:bg-white/10"><Link to="/portals/notifications"><Bell className="mr-2 h-4 w-4"/>Notifications</Link></Button><Button asChild variant="outline" className="border-white/30 bg-white/5 text-white hover:bg-white/10"><Link to="/my-account"><UserRound className="mr-2 h-4 w-4"/>My account</Link></Button>{user.role === 'admin' && <Button asChild variant="outline" className="border-white/30 bg-white/5 text-white hover:bg-white/10"><Link to="/admin">Admin workspace</Link></Button>}<Button type="button" variant="outline" onClick={() => void signOut()} className="border-amber-300/60 bg-amber-300/10 text-white hover:bg-amber-300/20"><LogOut className="mr-2 h-4 w-4"/>Log out</Button></div>}
        </div>
      </section>
      <section className="container mx-auto space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        {user && <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(user.role === 'student' ? [
            ['My learning', 'Open your enrolled programmes, complete lessons, track progress and submit assignments.', '/learning', 'Open learning workspace'],
            ['My applications', 'Track submitted applications and enrolment progress.', '/portals/student', 'View applications'],
            ['Student support', 'Contact Navstar for help with enrolment, learning and payments.', '/services', 'Get support'],
          ] : user.role === 'tutor' ? [
            ['Teaching workspace', 'Open course content, review learning materials and follow learner submissions as teaching access is enabled.', '/learning', 'Open learning workspace'],
            ['Learning resources', 'Review available course programmes and learning pathways.', '/courses', 'View programmes'],
            ['Tutor support', 'Get assistance with your account and teaching tools.', '/services', 'Contact support'],
          ] : user.role === 'admissions' ? [
            ['Admissions queue', 'Review incoming applications and follow up with applicants.', '/portals/admissions', 'Open applications'],
            ['Course catalogue', 'Check programme details, current fees and intake information.', '/courses', 'View courses'],
            ['Applicant support', 'Respond to enquiries and direct applicants to the right services.', '/services', 'Service desk'],
          ] : user.role === 'principal' ? [
            ['Institution overview', 'Monitor academic activity, applications and operational performance.', '/portals/principal', 'View overview'],
            ['Staff coordination', 'Review role assignments and coordinate operational follow-up.', '/portals', 'Portal directory'],
            ['Reports and records', 'Access institutional information and review progress.', '/courses', 'Academic programmes'],
          ] : [
            ['Website management', 'Manage courses, services, users, settings and public website content.', '/admin', 'Open admin workspace'],
            ['Learning management', 'Create course modules and lessons, publish assignments and review learner submissions.', '/learning', 'Manage learning content'],
            ['Orders and service desk', 'Review customer requests and coordinate service fulfilment.', '/services', 'View public services'],
            ['Documents and downloads', 'Manage the documents published for customers and learners.', '/admin', 'Manage documents'],
          ]).map(([title, detail, href, action]) => <article key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-blue-700">{selectedPortal.title}</p><h2 className="mt-2 text-lg font-extrabold text-slate-950">{title}</h2><p className="mt-2 min-h-12 text-sm leading-6 text-slate-600">{detail}</p><Link to={href} className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-blue-700 hover:text-blue-900">{action} <ArrowRight className="h-4 w-4" /></Link></article>)}
        </section>}
        {user && overview && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[['Students', overview.students], ['Applications', overview.applications], ['Verified payments', `KSh ${overview.verifiedPayments.toLocaleString()}`], ['Active courses', overview.courses]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-black text-slate-950">{value}</p></div>)}</div>}
        {user && <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-bold text-slate-950">{user.role === 'student' ? 'My applications' : user.role === 'tutor' ? 'My classes' : 'Admissions queue'}</h2><p className="mt-1 text-sm text-slate-600">{user.role === 'tutor' ? 'Class rosters are shown once a principal assigns classes to your account.' : 'Live records from the NAVSTAR admissions database.'}</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase text-blue-700">{user.role}</span></div>
          {user.role === 'tutor' ? <p className="mt-5 rounded-xl border bg-slate-50 p-4 text-sm text-slate-600">No classes are assigned to this tutor account yet.</p> : <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="border-b bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Applicant</th><th className="p-3">Course ID</th><th className="p-3">Application</th><th className="p-3">Payment</th><th className="p-3">Date</th></tr></thead><tbody>{enrollments.map((item) => <tr key={item.id} className="border-b last:border-0"><td className="p-3 font-medium">{item.full_name}</td><td className="p-3">{item.course_id}</td><td className="p-3">{item.status}</td><td className="p-3">{item.payment_status}</td><td className="p-3">{formatEATDate(item.created_at)}</td></tr>)}{enrollments.length === 0 && <tr><td className="p-5 text-center text-slate-500" colSpan={5}>No applications to show.</td></tr>}</tbody></table></div>}
        </section>}
        {!user && <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">{status || 'Sign in is required to view private portal records.'} <Link to={`/login?role=${selectedPortal.id}`} className="ml-2 font-bold underline">Go to sign in</Link></div>}
      </section>
    </main>
  );
}
