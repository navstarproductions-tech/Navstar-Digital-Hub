import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Clock3, X } from 'lucide-react';

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

  const handleEnroll = () => {
    if (!loaded) {
      setOpen(true);
      return;
    }
    if (enrollmentOpen) navigate('/enroll/' + courseId);
    else setOpen(true);
  };

  return (
    <>
      <button type="button" onClick={handleEnroll} className={buttonClass}>
        Enroll <ArrowRight className="h-4 w-4" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-slate-950/75 px-4 py-8 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="navstar-enrollment-title"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}
        >
          <section className="relative my-auto w-full max-w-md overflow-hidden rounded-[2rem] border border-white/20 bg-white shadow-[0_30px_100px_rgba(2,6,23,.45)]">
            <div className="relative overflow-hidden bg-gradient-to-br from-[#06152d] via-[#0b3474] to-[#087eae] px-7 pb-8 pt-9 text-white">
              <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full border-[28px] border-cyan-300/10" />
              <button type="button" onClick={() => setOpen(false)} aria-label="Close enrollment notice" className="absolute right-4 top-4 rounded-full border border-white/20 bg-white/10 p-2 text-white transition hover:bg-white/20">
                <X className="h-5 w-5" />
              </button>
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-300/30 bg-amber-300/15 text-amber-200 shadow-lg">
                {loaded ? <Clock3 className="h-7 w-7" /> : <Clock3 className="h-7 w-7 animate-pulse" />}
              </div>
              <p className="text-xs font-extrabold uppercase tracking-[.24em] text-cyan-200">Navstar Digital Hub</p>
              <h2 id="navstar-enrollment-title" className="mt-2 text-3xl font-black leading-tight">
                {!loaded ? 'Checking enrollment' : enrollmentOpen ? 'Enrollment is open' : 'Enrollment is currently closed'}
              </h2>
              <p className="mt-3 text-sm leading-6 text-blue-100">
                {!loaded
                  ? 'Please wait while we confirm the current application period.'
                  : enrollmentOpen
                    ? 'Applications are being accepted. Continue to complete your course application.'
                    : intake?.notice || 'Thank you for your interest in training with Navstar Digital Hub. Applications for the current intake are not being accepted at the moment.'}
              </p>
            </div>
            <div className="space-y-5 px-7 py-7">
              {loaded && !enrollmentOpen && intake?.name && (
                <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
                  <div>
                    <p className="text-sm font-extrabold text-slate-900">{intake.name}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">Please contact our team for information about the next application opportunity.</p>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <a href="tel:+254797688576" className="inline-flex items-center justify-center rounded-xl bg-blue-800 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-900">Call Navstar</a>
                <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50">Close</button>
              </div>
              <p className="text-center text-[10px] font-black tracking-[.22em] text-amber-600">HOME OF TECHNOCRATS</p>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
