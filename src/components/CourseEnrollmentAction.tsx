import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, PhoneCall, X } from 'lucide-react';

type Intake = {
  name?: string;
  enrollmentOpen?: string;
  enrollmentClose?: string;
  trainingStart?: string;
  notice?: string;
  status?: 'open' | 'upcoming' | 'closed' | 'not-configured';
} | null;

export function CourseEnrollmentAction({ courseId, className }: { courseId: string; className?: string }) {
  const navigate = useNavigate();
  const [intake, setIntake] = useState<Intake>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/intake', { cache: 'no-store' })
      .then(async (response) => response.ok ? response.json() as Promise<{ intake?: Intake }> : null)
      .then((data) => { if (active) setIntake(data?.intake || null); })
      .catch(() => { if (active) setIntake(null); })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);

  const opensAt = intake?.enrollmentOpen ? new Date(intake.enrollmentOpen + 'T00:00:00+03:00').getTime() : 0;
  const closesAt = intake?.enrollmentClose ? new Date(intake.enrollmentClose + 'T23:59:59+03:00').getTime() : 0;
  const enrollmentOpen = Boolean(opensAt && closesAt && Date.now() >= opensAt && Date.now() <= closesAt);
  const buttonClass = className || 'inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-200';

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', onKeyDown); };
  }, [open]);

  const handleEnroll = () => {
    const currentlyOpen = Boolean(opensAt && closesAt && Date.now() >= opensAt && Date.now() <= closesAt);
    if (loaded && currentlyOpen) navigate('/enroll/' + courseId);
    else setOpen(true);
  };

  return (
    <>
      <button type="button" onClick={handleEnroll} className={buttonClass}>
        Enroll <ArrowRight className="h-4 w-4" />
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[99999] flex h-[100dvh] min-h-screen w-screen flex-col overflow-y-auto bg-[#06152d] text-white" role="dialog" aria-modal="true" aria-labelledby="navstar-enrollment-title">
          <header className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-white/10 bg-[#06152d]/95 px-4 py-4 backdrop-blur-xl sm:px-8">
            <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 font-black">N</div><div><p className="text-sm font-black tracking-wide">NAVSTAR DIGITAL HUB</p><p className="text-[10px] font-bold uppercase tracking-[.2em] text-cyan-300">HOME OF TECHNOCRATS</p></div></div>
            <div className="flex items-center gap-2"><button type="button" onClick={() => setOpen(false)} className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-3 py-2.5 text-sm font-bold text-slate-200 hover:bg-white/10"><ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Go back</span></button><button type="button" onClick={() => setOpen(false)} aria-label="Exit enrollment notice" className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm font-black text-slate-900 hover:bg-cyan-100"><X className="h-4 w-4" /><span className="hidden sm:inline">Exit</span></button></div>
          </header>
          <main className="relative flex flex-1 items-center justify-center overflow-hidden px-5 py-12 sm:px-8">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_15%_20%,rgba(37,99,235,.35),transparent_42%),radial-gradient(ellipse_at_85%_80%,rgba(6,182,212,.22),transparent_40%)]" />
            <section className="relative mx-auto w-full max-w-3xl text-center">
              <div className="mx-auto mb-7 flex h-20 w-20 items-center justify-center rounded-3xl border border-amber-300/30 bg-amber-300/10 text-amber-200"><Clock3 className="h-10 w-10" /></div>
              <p className="text-xs font-black uppercase tracking-[.3em] text-cyan-300">Course enrolment information</p>
              <h2 id="navstar-enrollment-title" className="mx-auto mt-4 max-w-2xl text-4xl font-black leading-tight tracking-tight sm:text-6xl">{!loaded ? 'Checking enrolment' : enrollmentOpen ? 'Enrolment is open' : 'Enrolment is currently closed'}</h2>
              <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-blue-100 sm:text-lg">{!loaded ? 'Please wait while we confirm the current application period.' : enrollmentOpen ? 'Applications are being accepted. Continue to complete your course application.' : intake?.notice || 'Thank you for your interest in training with Navstar Digital Hub. Applications for the current intake are not being accepted at the moment. Please contact our team for guidance on the next opportunity.'}</p>
              {loaded && !enrollmentOpen && intake?.name && <div className="mx-auto mt-8 flex max-w-xl items-center justify-center gap-3 rounded-2xl border border-cyan-300/20 bg-white/[.07] px-5 py-4 text-left"><CheckCircle2 className="h-6 w-6 shrink-0 text-cyan-300" /><div><p className="text-sm font-extrabold text-white">{intake.name}</p><p className="mt-1 text-xs leading-5 text-blue-200">Contact Navstar for information about the next application opportunity.</p></div></div>}
              <div className="mx-auto mt-9 flex max-w-xl flex-col justify-center gap-3 sm:flex-row"><a href="tel:+254797688576" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-7 py-4 text-sm font-black text-slate-950 hover:bg-cyan-300"><PhoneCall className="h-4 w-4" /> Call Navstar</a><button type="button" onClick={() => setOpen(false)} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/5 px-7 py-4 text-sm font-bold text-white hover:bg-white/10"><ArrowLeft className="h-4 w-4" /> Back to courses</button></div>
              <p className="mt-12 text-[10px] font-black tracking-[.32em] text-amber-300">LEARN · CREATE · INNOVATE</p>
            </section>
          </main>
          <footer className="shrink-0 border-t border-white/10 px-5 py-4 text-center text-xs text-blue-200/70">© {new Date().getFullYear()} Navstar Digital Hub · HOME OF TECHNOCRATS</footer>
        </div>,
        document.body
      )}
    </>
  );
}
