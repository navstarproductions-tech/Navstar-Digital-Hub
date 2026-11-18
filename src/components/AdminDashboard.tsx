import { ArrowUpRight, BookOpen, BriefcaseBusiness, CalendarDays, CheckCircle2, CircleDollarSign, FileText, GraduationCap, Plus, Users, Wallet } from 'lucide-react';

type DashboardApplication = {
  id?: string;
  full_name?: string;
  course_id?: string;
  status?: string;
  payment_status?: string;
  created_at?: string;
  preferred_intake?: string;
  course?: string;
};
type DashboardCourse = { id: string; title: string; status?: string };
type DashboardUser = { id: string; name: string; role: string; status: string };
type Props = {
  metrics: Record<string, unknown>;
  applications: DashboardApplication[];
  courses: DashboardCourse[];
  users: DashboardUser[];
  onNavigate: (section: string, subtab?: string) => void;
};

const number = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = (value: unknown) => new Intl.NumberFormat('en-KE', { maximumFractionDigits: 0 }).format(number(value));
const monthLabel = (date: Date) => date.toLocaleDateString('en-KE', { month: 'short' });

export function AdminDashboard({ metrics, applications, courses, users, onNavigate }: Props) {
  const activeStudents = users.filter(user => user.role === 'student' && user.status === 'active').length || number(metrics.students);
  const staffCount = users.filter(user => user.role !== 'student').length;
  const pendingApplications = applications.filter(item => ['submitted', 'under_review'].includes(String(item.status))).length;
  const pendingFees = applications.filter(item => ['unpaid', 'pending'].includes(String(item.payment_status))).length;
  const revenue = number(metrics.verifiedPayments);
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    return { key: date.toISOString().slice(0, 7), label: monthLabel(date) };
  });
  const monthly = months.map(month => ({
    ...month,
    count: applications.filter(item => String(item.created_at || '').slice(0, 7) === month.key).length,
  }));
  const maxMonth = Math.max(1, ...monthly.map(item => item.count));
  const courseCounts = courses.slice(0, 6).map(course => ({
    title: course.title,
    count: applications.filter(item => String(item.course_id) === String(course.id)).length,
  }));
  const maxCourse = Math.max(1, ...courseCounts.map(item => item.count));
  const recent = (Array.isArray(metrics.recentApplications) ? metrics.recentApplications as DashboardApplication[] : applications).slice(0, 6);
  const cards = [
    { label: 'Active Students', value: activeStudents, note: 'Active student accounts', icon: GraduationCap, tone: 'blue' },
    { label: 'Applications', value: pendingApplications, note: 'Awaiting admissions action', icon: FileText, tone: 'violet' },
    { label: 'Courses', value: number(metrics.courses) || courses.length, note: 'Available course catalogue', icon: BookOpen, tone: 'cyan' },
    { label: 'Total Employees', value: staffCount, note: 'Staff and management accounts', icon: Users, tone: 'gold' },
    { label: 'Verified Payments (KES)', value: 'KES ' + money(revenue), note: 'Confirmed payment transactions only', icon: Wallet, tone: 'green' },
    { label: 'Pending Fee Records', value: pendingFees, note: 'Unpaid or pending applications', icon: CircleDollarSign, tone: 'rose' },
    { label: 'Services', value: number(metrics.services), note: 'Active service catalogue', icon: BriefcaseBusiness, tone: 'indigo' },
    { label: 'Donations (KES)', value: 'KES ' + money(metrics.verifiedDonations), note: 'Verified donations only', icon: CheckCircle2, tone: 'teal' },
  ];
  const quickActions = [
    { label: 'Add Student', detail: 'Register a learner', section: 'school', subtab: 'Add New Student', icon: Plus },
    { label: 'Enter Marks', detail: 'Assessment and results', section: 'marks-tests', subtab: 'Marks Hub — Practical · CAT · Final · Assignments', icon: BookOpen },
    { label: 'Collect Fees', detail: 'Record and verify fees', section: 'fees', subtab: 'Collect Fees', icon: Wallet },
    { label: 'Upload Notes', detail: 'Learning materials', section: 'upload-notes', subtab: 'Upload Notes', icon: FileText },
    { label: 'Certificates', detail: 'Manage academic awards', section: 'certificates', subtab: 'Certificate Management', icon: GraduationCap },
    { label: 'Services', detail: 'Manage digital services', section: 'services', subtab: 'Manage Services', icon: BriefcaseBusiness },
    { label: 'Reports', detail: 'Institution reports', section: 'reports', subtab: 'Operational Reports', icon: ArrowUpRight },
    { label: 'Settings', detail: 'Configure Navstar', section: 'settings', subtab: 'Institute Profile', icon: CalendarDays },
  ];
  const statusGroups = [
    { label: 'Submitted', count: applications.filter(item => item.status === 'submitted').length, color: 'bg-sky-500' },
    { label: 'Under review', count: applications.filter(item => item.status === 'under_review').length, color: 'bg-amber-500' },
    { label: 'Accepted', count: applications.filter(item => item.status === 'accepted').length, color: 'bg-emerald-500' },
    { label: 'Rejected', count: applications.filter(item => item.status === 'rejected').length, color: 'bg-rose-500' },
  ];
  const statusTotal = Math.max(1, statusGroups.reduce((sum, item) => sum + item.count, 0));

  return <div className="space-y-6">
    <section className="relative isolate overflow-hidden rounded-[26px] border border-blue-200/20 bg-[#071b3b] px-6 py-7 text-white shadow-xl sm:px-9 sm:py-9">
      <img src="/navstar-admin-hero.webp" alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#061631]/95 via-[#08275a]/85 to-[#08275a]/25" />
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-2xl"><p className="text-[11px] font-black uppercase tracking-[.28em] text-amber-300">NAVSTAR DIGITAL HUB</p><h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Welcome back, SIMIYU <span aria-hidden="true">👋</span></h1><p className="mt-2 text-sm font-medium text-blue-100">{new Intl.DateTimeFormat('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Nairobi' }).format(new Date())}</p><p className="mt-3 text-xs font-bold uppercase tracking-[.18em] text-white/75">HOME OF TECHNOCRATS · Learn · Create · Innovate · Grow</p></div>
        <div className="flex items-center gap-3 rounded-2xl border border-white/20 bg-white/10 p-3 backdrop-blur-md"><img src="/navstar-logo.webp" alt="Navstar Digital Hub" className="h-12 w-12 rounded-xl bg-white object-contain p-1" /><div><p className="text-xs font-bold text-white">Administrator workspace</p><p className="mt-1 text-[11px] text-blue-100">Live system overview</p></div></div>
      </div>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(({ label, value, note, icon: Icon, tone }) => <article key={label} className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-2xl font-black tracking-tight text-slate-950">{value}</p></div><span className={`rounded-xl p-3 ${tone === 'gold' ? 'bg-amber-50 text-amber-700' : tone === 'green' || tone === 'teal' ? 'bg-emerald-50 text-emerald-700' : tone === 'rose' ? 'bg-rose-50 text-rose-700' : tone === 'violet' ? 'bg-violet-50 text-violet-700' : 'bg-blue-50 text-blue-700'}`}><Icon className="h-5 w-5" /></span></div>
        <p className="mt-3 text-[11px] text-slate-500">{note}</p>
      </article>)}
    </section>

    <section className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><div><h2 className="font-extrabold text-slate-950">Monthly Enrollments</h2><p className="mt-1 text-xs text-slate-500">Applications received over the last six months</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-bold text-blue-800">6 months</span></div>
        <div className="mt-6 grid h-48 grid-cols-6 items-end gap-3 border-b border-l border-slate-100 px-2 pb-2">{monthly.map(item => <div key={item.key} className="flex h-full flex-col items-center justify-end gap-2"><span className="text-[11px] font-bold text-slate-700">{item.count}</span><div className="flex w-full flex-1 items-end"><div title={`${item.label}: ${item.count}`} className="w-full rounded-t-lg bg-gradient-to-t from-blue-800 to-cyan-400 transition-all" style={{ height: `${Math.max(4, item.count / maxMonth * 100)}%` }} /></div><span className="text-[11px] font-semibold text-slate-500">{item.label}</span></div>)}</div>
      </article>
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-extrabold text-slate-950">Application Status</h2><p className="mt-1 text-xs text-slate-500">Live distribution from application records</p><div className="mt-5 flex h-3 overflow-hidden rounded-full bg-slate-100">{statusGroups.map(item => <div key={item.label} className={item.color} style={{ width: `${item.count / statusTotal * 100}%` }} />)}</div><div className="mt-5 space-y-3">{statusGroups.map(item => <div key={item.label} className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm text-slate-700"><i className={`h-2.5 w-2.5 rounded-full ${item.color}`} />{item.label}</span><strong className="text-sm tabular-nums text-slate-950">{item.count}</strong></div>)}</div></article>
    </section>

    <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-extrabold text-slate-950">Enrollments by Course</h2><p className="mt-1 text-xs text-slate-500">Based on applications linked to the course catalogue</p><div className="mt-5 space-y-4">{courseCounts.map(item => <div key={item.title}><div className="mb-1.5 flex justify-between gap-3 text-xs"><span className="max-w-[80%] truncate font-semibold text-slate-700">{item.title}</span><span className="font-bold tabular-nums text-slate-900">{item.count}</span></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-blue-800 to-cyan-400" style={{ width: `${item.count / maxCourse * 100}%` }} /></div></div>)}{courseCounts.length === 0 && <p className="text-sm text-slate-500">No course records are available.</p>}</div></article>
      <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="grid h-full sm:grid-cols-2"><div className="relative min-h-48"><img src="/navstar-admin-hero.webp" alt="Navstar learning environment" className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-[#061631]/90 via-[#061631]/20 to-transparent" /><div className="absolute bottom-4 left-4 right-4 text-white"><p className="text-[10px] font-black uppercase tracking-[.2em] text-amber-300">Campus life</p><h3 className="mt-1 text-lg font-extrabold">Learn by doing</h3><p className="mt-1 text-xs text-white/85">Instructor-led training and collaborative digital practice</p></div></div><div className="relative min-h-48 bg-[#0d2853] p-5 text-white"><img src="/gebeya.webp" alt="Community and enterprise" className="absolute inset-0 h-full w-full object-cover opacity-25" /><div className="relative"><p className="text-[10px] font-black uppercase tracking-[.2em] text-amber-300">Our community</p><h3 className="mt-2 text-lg font-extrabold">Technology for opportunity</h3><p className="mt-2 text-xs leading-5 text-blue-100">Build practical skills, share ideas and create solutions for the digital era.</p><button type="button" onClick={() => onNavigate('campus-history', 'Campus Life')} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-bold text-blue-900 hover:bg-blue-50">Explore campus life <ArrowUpRight className="h-3.5 w-3.5" /></button></div></div></div></article>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-extrabold text-slate-950">Quick Actions</h2><p className="mt-1 text-xs text-slate-500">Go directly to common administration tasks</p></div><span className="text-[11px] font-semibold text-slate-400">NAVSTAR WORKSPACE</span></div><div className="mt-4 grid gap-3 grid-cols-2 sm:grid-cols-4 xl:grid-cols-8">{quickActions.map(({ label, detail, section, subtab, icon: Icon }) => <button type="button" key={label} onClick={() => onNavigate(section, subtab)} className="group rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-blue-300 hover:bg-blue-50"><span className="inline-flex rounded-lg bg-white p-2 text-blue-800 shadow-sm group-hover:bg-blue-800 group-hover:text-white"><Icon className="h-4 w-4" /></span><span className="mt-3 block text-xs font-extrabold text-slate-900">{label}</span><span className="mt-1 block text-[10px] leading-4 text-slate-500">{detail}</span></button>)}</div></section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between gap-3 border-b border-slate-100 p-5"><div><h2 className="font-extrabold text-slate-950">Recent Admissions</h2><p className="mt-1 text-xs text-slate-500">Latest applications received by Navstar</p></div><button type="button" onClick={() => onNavigate('applications', 'All Applications')} className="text-xs font-bold text-blue-800 hover:text-blue-950">View all <ArrowUpRight className="ml-1 inline h-3.5 w-3.5" /></button></div><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Applicant</th><th className="px-5 py-3">Course</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Received</th></tr></thead><tbody>{recent.map((item, index) => <tr key={String(item.id || index)} className="border-t border-slate-100"><td className="px-5 py-3 font-semibold text-slate-900">{item.full_name || 'Applicant'}</td><td className="px-5 py-3 text-slate-600">{item.course || courses.find(course => course.id === item.course_id)?.title || item.course_id || '—'}</td><td className="px-5 py-3"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold capitalize text-blue-800">{String(item.status || 'submitted').replaceAll('_', ' ')}</span></td><td className="px-5 py-3 text-xs text-slate-500">{item.created_at ? new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeZone: 'Africa/Nairobi' }).format(new Date(item.created_at)) : '—'}</td></tr>)}{recent.length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-sm text-slate-500">No admissions have been received yet.</td></tr>}</tbody></table></div></section>
  </div>;
}
