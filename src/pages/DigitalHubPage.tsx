import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, BookOpen, CalendarDays, ChartNoAxesCombined, MessageCircle, ShieldCheck, GraduationCap, Wallet, Users, ClipboardList, Library, Bus, FileText, School, Settings, Bell, ReceiptText, Layers3 } from 'lucide-react';

const generalSections:Record<string,{title:string;eyebrow:string;description:string;icon:typeof BookOpen;items:string[]}> = {
  '/campus-life':{title:'Campus Life',eyebrow:'LEARN • CONNECT • GROW',description:'A digital home for Navstar learners, alumni and the wider technology community.',icon:CalendarDays,items:['Learner announcements and updates','Campus events and activities','Student support and useful resources','Clubs, projects and technology showcases']},
  '/admissions-letters':{title:'Admissions Letters',eyebrow:'ADMISSIONS SERVICES',description:'A dedicated place to access admission communication and application guidance.',icon:BookOpen,items:['Application and admission guidance','Admission status information','Letter access for approved applicants','Help from the admissions team']},
  '/forum':{title:'Navstar Community Forum',eyebrow:'COMMUNITY • IDEAS • DISCUSSION',description:'A community space for learners, alumni, customers and technology enthusiasts to exchange ideas respectfully.',icon:MessageCircle,items:['Community posts and discussions','Comments and helpful reactions','Member profiles and account access','Community guidelines and moderation']}
};

const erpModules = [
  {icon:School,title:'Multi-school management',description:'Separate workspaces for each registered school, with school profile, branding, contacts and secure staff membership.'},
  {icon:GraduationCap,title:'Learners & admissions',description:'Applications, admission numbers, learner profiles, guardians, transfers, progression and enrolment records.'},
  {icon:Layers3,title:'Classes, grades & streams',description:'Primary, Junior Secondary, Senior Secondary and college structures, academic years, terms, streams and class lists.'},
  {icon:BookOpen,title:'LMS & curriculum',description:'Subjects, teacher allocation, learning materials, assignments, assessments, marks, report cards and learner progress.'},
  {icon:Wallet,title:'Fee structures & billing',description:'Build fee structures by school, grade, class, term, course or programme; add itemised charges, discounts and due dates.'},
  {icon:ReceiptText,title:'Payments & PDF receipts',description:'Record M-Pesa, bank, cash and other payments; allocate part-payments to invoices, track balances and issue printable PDF receipts.'},
  {icon:Users,title:'Staff & HR',description:'Staff profiles, roles, departments, teaching assignments, attendance, leave and accountability.'},
  {icon:ClipboardList,title:'Exams & report cards',description:'Assessment schedules, marks entry, grading rules, report cards, transcripts and performance analysis.'},
  {icon:Library,title:'Library & resources',description:'Books, issue and return records, digital learning resources and inventory tracking.'},
  {icon:Bus,title:'Operations & transport',description:'School assets, stores, transport routes, maintenance, procurement and operational records.'},
  {icon:ChartNoAxesCombined,title:'Finance & analytics',description:'Income, outstanding balances, collections by class or term, expenditure, cash summaries and management reports.'},
  {icon:Bell,title:'Communication & notices',description:'Parent notices, SMS and email announcements, reminders, alerts and downloadable documents.'}
];

function AnalyticsPage(){
 return <main className="min-h-[70vh] bg-slate-50 px-4 py-10 sm:py-14">
  <div className="mx-auto max-w-7xl">
   <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-950 via-blue-950 to-blue-800 p-7 text-white shadow-xl sm:p-12">
    <div className="absolute -right-20 -top-24 h-80 w-80 rounded-full border-[36px] border-white/5"/><div className="absolute -bottom-40 right-1/4 h-96 w-96 rounded-full bg-cyan-400/10 blur-3xl"/>
    <div className="relative max-w-4xl">
     <p className="text-xs font-extrabold tracking-[.28em] text-cyan-200">NAVSTAR EDUCATION TECHNOLOGY</p>
     <h1 className="mt-5 text-3xl font-black leading-tight sm:text-5xl">School ERP & Learning Management System</h1>
     <p className="mt-5 max-w-3xl text-sm leading-7 text-blue-100 sm:text-base">A unified school management platform designed for Primary, Junior Secondary, Senior Secondary and other learning institutions. Each school gets its own protected workspace for academics, learners, staff, fees and administration.</p>
     <div className="mt-7 flex flex-wrap gap-3"><Link to="/portals" className="inline-flex items-center rounded-xl bg-white px-5 py-3 text-sm font-bold text-blue-950 hover:bg-cyan-50">School & staff portals <ArrowRight className="ml-2 h-4 w-4"/></Link><Link to="/account" className="inline-flex items-center rounded-xl border border-white/30 bg-white/10 px-5 py-3 text-sm font-bold text-white hover:bg-white/15">Customer account</Link></div>
    </div>
   </section>

   <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    {[['School levels','Primary • Junior • Senior'],['Academic records','Learners • Classes • Subjects'],['Finance','Fees • Invoices • Payments'],['Learning','Assignments • Exams • Reports']].map(([label,value])=><div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-blue-700">{label}</p><p className="mt-2 font-bold text-slate-900">{value}</p></div>)}
   </section>

   <section className="mt-12">
    <div className="max-w-3xl"><p className="text-xs font-extrabold tracking-[.2em] text-blue-700">ONE INTEGRATED PLATFORM</p><h2 className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">Core ERP modules</h2><p className="mt-3 text-sm leading-6 text-slate-600">The platform is being built as a multi-school system. School records will be isolated by school membership and role permissions, so one institution cannot access another institution’s data.</p></div>
    <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{erpModules.map((module,index)=>{const Icon=module.icon;return <article key={module.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-center justify-between"><div className="rounded-xl bg-blue-50 p-3 text-blue-800"><Icon className="h-5 w-5"/></div><span className="text-xs font-bold text-slate-300">{String(index+1).padStart(2,'0')}</span></div><h3 className="mt-4 font-bold text-slate-950">{module.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{module.description}</p></article>})}</div>
   </section>

   <section className="mt-10 grid gap-6 lg:grid-cols-2">
    <article className="rounded-2xl border border-blue-100 bg-blue-50 p-6 sm:p-8"><div className="flex items-center gap-3"><Wallet className="h-6 w-6 text-blue-800"/><h2 className="text-xl font-black text-slate-950">Fee structures and school accounts</h2></div><p className="mt-3 text-sm leading-6 text-slate-700">A bursar will be able to create an academic-year and term fee structure, then assign it to a grade, class, course or programme. Each structure can contain tuition, activity, meals, transport, boarding, examination and other itemised charges. The system will calculate totals, discounts, invoices, payments and outstanding balances.</p></article>
    <article className="rounded-2xl border border-emerald-100 bg-emerald-50 p-6 sm:p-8"><div className="flex items-center gap-3"><FileText className="h-6 w-6 text-emerald-800"/><h2 className="text-xl font-black text-slate-950">Payment receipts as PDF</h2></div><p className="mt-3 text-sm leading-6 text-slate-700">Every confirmed payment will have a unique school receipt number and a printable PDF receipt showing the school, learner, admission number, amount, payment method, date, invoice allocation and transaction reference. Pending, failed or reversed transactions will never be presented as paid receipts.</p></article>
   </section>

   <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center"><div><h2 className="text-xl font-black text-slate-950">Secure school access</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">The ERP database foundation is being added first. School onboarding, tenant-specific sign-in, role permissions and working academic and finance screens will be enabled in stages after the database migration is applied and tested.</p></div><div className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-xs font-bold text-slate-600"><ShieldCheck className="h-4 w-4 text-emerald-700"/>Protected school data</div></div></section>
  </div>
 </main>
}

export function DigitalHubPage(){const {pathname}=useLocation();if(pathname==='/analytics')return <AnalyticsPage/>;const page=generalSections[pathname]||generalSections['/campus-life'];const Icon=page.icon;return <main className="min-h-[70vh] bg-slate-50 px-4 py-12 sm:py-16"><div className="mx-auto max-w-6xl"><section className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-blue-950 to-blue-800 p-8 text-white shadow-xl sm:p-12"><p className="text-xs font-bold tracking-[.25em] text-blue-200">{page.eyebrow}</p><div className="mt-6 flex items-start gap-4"><div className="rounded-2xl bg-white/10 p-3"><Icon className="h-8 w-8"/></div><div><h1 className="text-3xl font-black sm:text-5xl">{page.title}</h1><p className="mt-4 max-w-2xl leading-7 text-blue-100">{page.description}</p></div></div></section><section className="mt-8 grid gap-4 sm:grid-cols-2">{page.items.map((item,i)=><article key={item} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-xs font-bold text-blue-700">0{i+1}</p><h2 className="mt-2 font-semibold text-slate-900">{item}</h2></article>)}</section><section className="mt-8 rounded-2xl border bg-white p-6 sm:p-8"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center"><div><h2 className="text-xl font-bold text-slate-950">Access your Navstar account</h2><p className="mt-1 text-sm text-slate-600">Sign in or create an account to access customer and community features as they are enabled.</p></div><Link to="/account" className="inline-flex items-center justify-center rounded-xl bg-blue-800 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-900">Customer account <ArrowRight className="ml-2 h-4 w-4"/></Link></div></section></div></main>}
