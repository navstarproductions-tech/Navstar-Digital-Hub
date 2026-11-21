import { Link } from 'react-router-dom';
import { ArrowLeft, Bot, BookOpen, GraduationCap, Sparkles } from 'lucide-react';
import { AIChatWidget } from '@/components/AIChatWidget';

export function AIPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50 px-3 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-bold text-blue-900 hover:text-cyan-700"><ArrowLeft className="h-4 w-4"/>Back to Navstar</Link>
        <header className="my-5 overflow-hidden rounded-3xl bg-gradient-to-r from-[#061a3b] via-[#073b7d] to-[#087eaa] p-5 text-white shadow-xl sm:p-7">
          <div className="flex flex-wrap items-center gap-3"><span className="rounded-2xl border border-white/20 bg-white/10 p-3"><Bot className="h-8 w-8 text-amber-300"/></span><div><p className="text-xs font-black uppercase tracking-[.22em] text-amber-300">HOME OF TECHNOCRATS</p><h1 className="text-2xl font-black sm:text-3xl">Navstar AI</h1><p className="mt-1 text-sm text-blue-100">Your learning, academic and digital services assistant.</p></div></div>
          <div className="mt-5 grid gap-2 sm:grid-cols-3"><div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 p-3 text-xs font-semibold"><GraduationCap className="h-4 w-4 text-amber-300"/>Mathematics, Physics & ICT</div><div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 p-3 text-xs font-semibold"><BookOpen className="h-4 w-4 text-amber-300"/>Assignments, exams & documents</div><div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 p-3 text-xs font-semibold"><Sparkles className="h-4 w-4 text-amber-300"/>Courses, admissions & services</div></div>
        </header>
        <AIChatWidget embedded context="public"/>
        <p className="mt-3 text-center text-xs text-slate-500">Navstar AI is an assistant. Verify important academic, financial and administrative decisions with the responsible Navstar office.</p>
      </div>
    </main>
  );
}
