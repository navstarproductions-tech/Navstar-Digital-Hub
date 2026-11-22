import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Clock3, GraduationCap, Search, ShieldCheck, CalendarDays, Sparkles } from 'lucide-react';
import { INITIAL_COURSES } from '@/data/courses';
import type { Course } from '@/types';
import { CourseEnrollmentAction } from '@/components/CourseEnrollmentAction';

function formatIntakeDate(value?:string) { return value ? new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Nairobi',day:'numeric',month:'long',year:'numeric'}).format(new Date(value+'T12:00:00+03:00')) : '—'; }

export function CoursesPage() {
  const [search, setSearch] = useState('');
  const [courses, setCourses] = useState<Course[]>(INITIAL_COURSES);
  const [intake, setIntake] = useState<{name:string; enrollmentOpen:string; enrollmentClose:string; trainingStart?:string; trainingEnd?:string; graduationDate?:string; notice?:string; status:'open'|'upcoming'|'closed'|'not-configured'} | null>(null);
  const [now, setNow] = useState(Date.now());
  const opensAt = intake?.enrollmentOpen ? new Date(`${intake.enrollmentOpen}T00:00:00+03:00`).getTime() : 0;
  const closesAt = intake?.enrollmentClose ? new Date(`${intake.enrollmentClose}T23:59:59+03:00`).getTime() : 0;
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { let active = true; fetch('/api/intake').then(async response => response.ok ? response.json() as Promise<{intake?: typeof intake}> : null).then(result => { if(active) setIntake(result?.intake || null); }).catch(() => { if(active) setIntake(null); }); return () => {active=false}; }, []);
  const enrollmentOpen = Boolean(intake && opensAt > 0 && closesAt > 0 && now >= opensAt && now <= closesAt);
  const intakeUpcoming = Boolean(intake && opensAt > now);
  useEffect(() => {
    let active = true;
    fetch('/api/courses')
      .then(async (response) => response.ok ? response.json() as Promise<{ courses?: Course[] }> : null)
      .then((result) => {
        if (active && result?.courses?.length) {
          const liveCourses = result.courses;
          const catalogIds = new Set(INITIAL_COURSES.map((course) => course.id));
          const hasNewCatalog = liveCourses.some((course) => catalogIds.has(course.id));
          setCourses(hasNewCatalog ? liveCourses : INITIAL_COURSES);
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const filteredCourses = useMemo(() => courses.filter((course) =>
    course.title.toLowerCase().includes(search.toLowerCase()) ||
    course.description.toLowerCase().includes(search.toLowerCase())
  ), [courses, search]);

  return (
    <main className="min-h-screen bg-slate-50 pb-16">
      <section className="relative isolate overflow-hidden bg-[#07172f] text-white">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_10%_20%,rgba(37,99,235,.5),transparent_42%),radial-gradient(ellipse_at_90%_80%,rgba(6,182,212,.25),transparent_40%)]" />
        <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <p className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[.22em] text-cyan-200"><GraduationCap className="h-4 w-4" /> Learning Portal</p>
          <div className="mt-5 grid gap-8 lg:grid-cols-[1.2fr_.8fr] lg:items-end">
            <div><h1 className="text-4xl font-black tracking-tight sm:text-5xl">Our Courses</h1><p className="mt-3 max-w-2xl text-base leading-7 text-slate-300">Professional training programmes to boost your digital skills, build confidence, and prepare you for the digital workplace.</p><div className="mt-6 flex flex-wrap gap-3"><a href="#course-list" className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-300">Explore programmes <ArrowRight className="h-4 w-4" /></a><Link to="/portals/student" className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10">Student Gateway</Link></div></div>
            <div className="rounded-2xl border border-white/15 bg-white/[.07] p-5 backdrop-blur">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.2em] text-amber-300"><CalendarDays className="h-4 w-4" /> Intake calendar</div>
              <p className="mt-3 text-lg font-extrabold">{!intake || intake.status === 'not-configured' ? 'Intake dates not yet published' : enrollmentOpen ? `${intake.name} · Enrolment Open` : intakeUpcoming ? `${intake.name} · Upcoming Intake` : `${intake.name} · Enrolment Closed`}</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">{intake?.notice && <span className="mb-2 block font-semibold text-amber-200">{intake.notice}</span>}{!intake ? 'The next intake information will appear here when published by Admin.' : enrollmentOpen ? <>Applications are open until <strong className="text-white">{formatIntakeDate(intake.enrollmentClose)}</strong>. {intake.trainingStart && <>Training begins {formatIntakeDate(intake.trainingStart)}.</>}</> : intakeUpcoming ? <>Applications open on <strong className="text-white">{formatIntakeDate(intake.enrollmentOpen)}</strong>. Get ready to apply.</> : 'The application window for this intake has closed. Tap Enroll on a course to contact our team about the next opportunity.'}</p>
              <div className="mt-4 flex items-center gap-2 text-xs text-emerald-200"><ShieldCheck className="h-4 w-4" /> Flexible fee payment options available</div>
            </div>
          </div>
        </div>
      </section>

      <section id="course-list" className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-end sm:p-7"><div><p className="text-xs font-extrabold uppercase tracking-[.2em] text-blue-700">Professional development</p><h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Explore our programmes</h2><p className="mt-2 text-sm leading-6 text-slate-600">Practical, career-focused training designed to build real digital skills. Choose a programme to view its details and enrol.</p></div><div className="relative w-full sm:max-w-xs"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search courses..." className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></div></div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-slate-600">Browse available training</p><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">{filteredCourses.length} {filteredCourses.length === 1 ? 'programme' : 'programmes'}</span></div>
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {filteredCourses.map((course) => <article key={course.id} className="group flex h-full flex-col overflow-hidden rounded-[1.4rem] border border-slate-200/90 bg-white shadow-[0_5px_24px_rgba(15,23,42,.05)] transition duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-[0_18px_45px_rgba(30,64,175,.13)]">
            <div className="relative h-48 overflow-hidden bg-gradient-to-br from-blue-100 to-cyan-100"><img src={course.image} alt={course.title} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /><span className="absolute left-3 top-3 rounded-full bg-slate-950/80 px-3 py-1 text-[11px] font-bold text-white">{course.level ?? 'Professional'}</span></div>
            <div className="flex flex-1 flex-col p-6"><div className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-blue-700"><span>{course.category}</span><span className="flex items-center gap-1 text-slate-500"><Clock3 className="h-3.5 w-3.5" />{course.duration}</span></div><h3 className="mt-3 text-xl font-extrabold leading-snug tracking-tight text-slate-950">{course.title}</h3><p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{course.description}</p><div className="mt-6 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50/80 to-cyan-50/70 p-4"><p className="text-[11px] font-extrabold uppercase tracking-[.16em] text-slate-500">Training fee</p><p className="mt-1 text-2xl font-black tracking-tight text-slate-950">KES {Number(course.price).toLocaleString('en-KE')}</p><div className="mt-4"><CourseEnrollmentAction courseId={course.id}/></div></div></div>
          </article>)}
        </div>
        {filteredCourses.length === 0 && <p className="py-16 text-center text-slate-500">No courses match your search.</p>}
        <div className="mt-10 grid gap-4 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-cyan-50 p-6 sm:grid-cols-[1fr_auto] sm:items-center"><div className="flex items-start gap-3"><span className="rounded-xl bg-white p-3 text-blue-700 shadow-sm"><Sparkles className="h-5 w-5" /></span><div><h3 className="font-extrabold text-slate-950">Get Certified</h3><p className="mt-1 text-sm leading-6 text-slate-600">Earn a Navstar certificate upon successful completion of your programme and assessment.</p></div></div><Link to="/portals/student" className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white">Access Student Gateway <ArrowRight className="h-4 w-4" /></Link></div>
      </section>
    </main>
  );
}