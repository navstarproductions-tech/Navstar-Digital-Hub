import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Clock3, GraduationCap, Home, BookOpen, BriefcaseBusiness, ShieldCheck } from 'lucide-react';

const OPENING_DATE = new Date('2026-12-21T00:00:00+03:00');

function useCountdown(target: Date) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = Math.max(0, target.getTime() - now);
  return {
    days: Math.floor(remaining / 86400000),
    hours: Math.floor((remaining % 86400000) / 3600000),
    minutes: Math.floor((remaining % 3600000) / 60000),
    seconds: Math.floor((remaining % 60000) / 1000),
  };
}

export function PublicEnrollmentPage() {
  const countdown = useCountdown(OPENING_DATE);
  const timeUnits = [
    { label: 'Days', value: countdown.days },
    { label: 'Hours', value: countdown.hours },
    { label: 'Mins', value: countdown.minutes },
    { label: 'Secs', value: countdown.seconds },
  ];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#071329] via-blue-950 to-blue-800 px-5 py-8 text-white shadow-2xl sm:px-10 sm:py-12">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative">
            <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-100 hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to Home</Link>
            <div className="mt-8 flex items-center gap-3">
              <div className="rounded-2xl bg-white/10 p-3"><GraduationCap className="h-7 w-7 text-amber-300" /></div>
              <p className="text-sm font-black tracking-[.18em] text-blue-100">NAVSTAR DIGITAL HUB</p>
            </div>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-amber-200">
              <ShieldCheck className="h-4 w-4" /> Enrollment Window Closed
            </div>
            <h1 className="mt-5 text-3xl font-black tracking-tight sm:text-5xl">September 2026 Intake Enrollment Closed</h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-blue-100">The September 2026 Intake enrollment window closed on <strong className="text-white">20 September 2026</strong>. Applications received after the deadline are not processed.</p>

            <div className="mt-8 rounded-2xl border border-white/15 bg-white/[.07] p-5 sm:p-7">
              <p className="text-xs font-extrabold uppercase tracking-[.2em] text-cyan-200">Next intake</p>
              <h2 className="mt-2 text-2xl font-black sm:text-3xl">January 2027 Intake</h2>
              <div className="mt-4 flex items-center gap-2 text-sm font-bold text-blue-100"><CalendarDays className="h-5 w-5 text-amber-300" /> Enrollment opens on <span className="text-white">21 December 2026</span></div>
              <p className="mt-2 text-sm text-blue-100">Enrollment opens at the announced date. Countdown uses East Africa Time (EAT).</p>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {timeUnits.map(unit => <div key={unit.label} className="rounded-xl border border-white/10 bg-slate-950/30 px-3 py-4 text-center"><p className="text-3xl font-black tabular-nums sm:text-4xl">{String(unit.value).padStart(2, '0')}</p><p className="mt-2 text-xs font-bold uppercase tracking-wider text-blue-200">{unit.label}</p></div>)}
              </div>
              <div className="mt-6 rounded-xl bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
                Prepare your ID document, passport-size photo and course fee today, so you can enroll the moment the window opens. Places are limited per course.
              </div>
            </div>
            <p className="mt-8 text-center text-xs text-blue-200">© 2026 Navstar Digital Hub. All Rights Reserved.</p>
            <p className="mt-2 text-center text-xs text-blue-200">Designed &amp; powered by <strong className="text-white">Navstar Digital Hub</strong> · maintained by <strong className="text-white">Navstar Digital Hub Systems</strong></p>
            <div className="mt-5 text-center"><Link to="/verify-certificate" className="text-sm font-bold text-cyan-200 underline underline-offset-4 hover:text-white">Verify Certificate</Link></div>
            <p className="mt-6 text-center font-black tracking-[.2em] text-amber-300">HOME OF TECHNOCRATS</p>
          </div>
        </section>

        <nav aria-label="Home page navigation" className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-center text-xs font-extrabold uppercase tracking-[.18em] text-slate-500">Explore Navstar Digital Hub</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[{to:'/',label:'Home',icon:Home},{to:'/courses',label:'Courses',icon:BookOpen},{to:'/services',label:'Services',icon:BriefcaseBusiness},{to:'/portals',label:'Portals',icon:ShieldCheck}].map(({to,label,icon:Icon})=><Link key={to} to={to} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 transition hover:border-blue-300 hover:bg-blue-50"><Icon className="h-4 w-4 text-blue-700"/>{label}</Link>)}
          </div>
        </nav>
      </div>
    </main>
  );
}
