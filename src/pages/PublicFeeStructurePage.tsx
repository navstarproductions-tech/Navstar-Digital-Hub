import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Printer, ArrowLeft, Download, ShieldCheck } from 'lucide-react';

type Course = { id: string; title: string; course_code?: string | null; duration?: string };
type FeeItem = { itemName: string; amount: number };
const money = (value: number) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(value || 0);

export function PublicFeeStructurePage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState('');
  const [course, setCourse] = useState<Course | null>(null);
  const [items, setItems] = useState<FeeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/courses')
      .then(async response => {
        if (!response.ok) throw new Error('Courses are temporarily unavailable.');
        return response.json() as Promise<{ courses?: Course[] }>;
      })
      .then(data => setCourses(data.courses || []))
      .catch(() => setError('Could not load courses. Please refresh and try again.'));
  }, []);

  async function selectCourse(id: string) {
    setCourseId(id);
    setCourse(courses.find(item => item.id === id) || null);
    setItems([]);
    setLoaded(false);
    setError('');
    if (!id) return;
    setLoading(true);
    try {
      const response = await fetch('/api/public-fee-structure?courseId=' + encodeURIComponent(id), { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The published fee structure is not available for this course yet.');
      setItems(Array.isArray(data.items) ? data.items : []);
      setLoaded(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Fee structure unavailable.');
    } finally {
      setLoading(false);
    }
  }

  const total = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const issueDate = new Intl.DateTimeFormat('en-KE', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date());
  const canGenerate = Boolean(course && loaded && items.length > 0 && !loading);

  function generatePdf() {
    if (!canGenerate) return;
    window.print();
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-blue-50 px-3 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-950 hover:text-emerald-700"><ArrowLeft size={17}/> Back to Home</Link>
          <span className="text-xs font-semibold text-slate-500">NAVSTAR DIGITAL HUB · PUBLIC DOCUMENT</span>
        </div>

        <section className="mb-5 overflow-hidden rounded-2xl bg-gradient-to-r from-blue-950 via-blue-900 to-emerald-900 p-5 text-white shadow-xl sm:p-7 print:hidden">
          <div className="flex items-center gap-3">
            <img src="/Navstar_Official_Logo.jpg" alt="Navstar Digital Hub official logo" className="h-14 w-20 rounded-lg bg-white p-1 object-contain"/>
            <div><p className="text-xs font-bold uppercase tracking-[.2em] text-amber-300">Official public information</p><h1 className="text-2xl font-black sm:text-3xl">Fee Structure</h1></div>
          </div>
          <p className="mt-4 max-w-xl text-sm leading-6 text-blue-100">Choose a course below to view its currently published fee items and generate a printable A4 portrait fee schedule.</p>
          <label htmlFor="fee-course" className="mt-5 block text-sm font-bold text-white">Select course</label>
          <select id="fee-course" className="mt-2 min-h-12 w-full rounded-xl border border-white/30 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:ring-4 focus:ring-amber-300/50" value={courseId} onChange={event => void selectCourse(event.target.value)}>
            <option value="">Tap here to choose a course</option>
            {courses.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
          {loading && <p className="mt-3 text-sm font-semibold text-amber-200" role="status">Retrieving the published fee structure…</p>}
          {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">{error}</p>}
          {!loading && course && loaded && items.length === 0 && <p className="mt-3 rounded-lg bg-amber-100 p-3 text-sm font-semibold text-amber-950">No published fee items are available for this course yet.</p>}
        </section>

        {canGenerate && course && (
          <article id="fee-document" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl print:rounded-none print:border-0 print:shadow-none">
            <header className="relative flex items-center gap-4 border-b-4 border-amber-400 bg-blue-950 p-5 text-white sm:p-7">
              <img src="/Navstar_Official_Logo.jpg" alt="Navstar Digital Hub official logo" className="h-20 w-28 rounded-lg bg-white p-2 object-contain"/>
              <div className="min-w-0"><h2 className="text-lg font-black tracking-wide sm:text-xl">NAVSTAR DIGITAL HUB</h2><p className="text-xs font-bold tracking-[.2em] text-amber-300">HOME OF TECHNOCRATS</p><p className="mt-1 text-xs text-blue-100">Official Published Fee Structure</p></div>
            </header>
            <div className="p-5 sm:p-8">
              <div className="text-center">
                <p className="text-xs font-bold uppercase tracking-[.22em] text-emerald-700">Official course fees</p>
                <h2 className="mt-2 text-xl font-black text-blue-950 sm:text-2xl">{course.title}</h2>
                <p className="mt-1 text-sm text-slate-600">{[course.course_code, course.duration].filter(Boolean).join(' · ')}</p>
              </div>
              <table className="mt-7 w-full border-collapse text-sm">
                <thead className="bg-blue-950 text-white"><tr><th className="border border-blue-900 p-3 text-left">Fee Item</th><th className="border border-blue-900 p-3 text-right">Amount (KES)</th></tr></thead>
                <tbody>{items.map((item, index) => <tr key={index} className="border-b border-slate-200"><td className="p-3">{item.itemName}</td><td className="whitespace-nowrap p-3 text-right tabular-nums">{money(Number(item.amount))}</td></tr>)}</tbody>
                <tfoot className="bg-amber-50 font-black text-blue-950"><tr><td className="p-3">TOTAL</td><td className="p-3 text-right tabular-nums">{money(total)}</td></tr></tfoot>
              </table>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-5">
                <div className="max-w-md text-xs leading-5 text-slate-600">
                  <p>This document reflects the fee items currently published by Navstar Digital Hub for the selected course.</p>
                  <p className="mt-2 font-semibold">Date issued: {issueDate}</p>
                </div>
                <div className="flex h-28 w-28 shrink-0 rotate-[-8deg] items-center justify-center rounded-full border-[3px] border-double border-emerald-700 text-center text-emerald-800">
                  <div className="flex h-[5.5rem] w-[5.5rem] flex-col items-center justify-center rounded-full border border-emerald-700 px-1">
                    <ShieldCheck size={19}/>
                    <span className="mt-1 text-[8px] font-black leading-3 tracking-wider">NAVSTAR DIGITAL HUB</span>
                    <span className="mt-0.5 text-[7px] font-bold tracking-widest">OFFICIAL FEE SCHEDULE</span>
                    <span className="mt-0.5 text-[7px] font-black">KENYA</span>
                  </div>
                </div>
              </div>
              <footer className="mt-6 border-t border-slate-300 pt-4 text-center text-xs leading-5 text-slate-600">
                <p className="font-bold text-blue-950">NAVSTAR DIGITAL HUB · HOME OF TECHNOCRATS</p>
                <p>0797 688 576 · 0706 637 485 · navstardigitalhub@gmail.com</p>
              </footer>
            </div>
          </article>
        )}

        {canGenerate && (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 print:hidden">
            <p className="text-sm font-bold text-emerald-950">Your fee structure is ready.</p>
            <p className="mt-1 text-xs leading-5 text-emerald-900">Tap below, then choose “Save as PDF” in your print options to save the official portrait document to your phone or computer.</p>
            <button type="button" onClick={generatePdf} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-700 to-blue-900 px-4 py-3 text-sm font-extrabold text-white shadow-lg hover:brightness-110 sm:w-auto"><Download size={18}/> Generate &amp; Download PDF</button>
          </div>
        )}
      </div>
      <style>{`@page { size: A4 portrait; margin: 12mm; } @media print { html, body { width: 100%; height: auto; background: #fff !important; } body * { visibility: hidden !important; } #fee-document, #fee-document * { visibility: visible !important; } #fee-document { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; max-width: 100% !important; margin: 0 !important; border: 0 !important; box-shadow: none !important; } main { padding: 0 !important; background: #fff !important; } } `}</style>
    </main>
  );
}
