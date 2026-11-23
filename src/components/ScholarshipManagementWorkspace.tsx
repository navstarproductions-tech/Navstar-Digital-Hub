import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

type Course = { id: string; title: string };
type Scholarship = { id: string; course_id?: string | null; course_title?: string | null; title: string; description?: string; award_amount: number; deadline?: string | null; status: string };
type Application = { id: string; scholarship_id: string; scholarship_title: string; student_name: string; email: string; course_title?: string | null; statement: string; status: string; created_at: string };
const panel = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';

export function ScholarshipManagementWorkspace({courses}:{courses:Course[]}) {
  const [scholarships,setScholarships] = useState<Scholarship[]>([]);
  const [applications,setApplications] = useState<Application[]>([]);
  const [title,setTitle] = useState('');
  const [description,setDescription] = useState('');
  const [amount,setAmount] = useState('0');
  const [courseId,setCourseId] = useState('');
  const [deadline,setDeadline] = useState('');
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/academic',{credentials:'same-origin',cache:'no-store'});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Scholarship records could not be loaded.');
      setScholarships(result.scholarships || []);
      setApplications(result.scholarshipApplications || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Scholarship records could not be loaded.');
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const publish = async (event:React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const awardAmount = Number(amount);
    if (title.trim().length < 2 || !Number.isSafeInteger(awardAmount) || awardAmount < 0 || (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline))) {
      setError('Enter a title, a valid whole-number award amount and a valid deadline.'); return;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/academic',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'publish_scholarship',title:title.trim(),description,awardAmount,courseId,deadline})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Scholarship could not be published.');
      setTitle(''); setDescription(''); setAmount('0'); setCourseId(''); setDeadline('');
      setNotice('Scholarship published and available to eligible students.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Scholarship could not be published.');
    } finally { setBusy(false); }
  };

  const review = async (application:Application,status:'approved'|'rejected'|'pending') => {
    if (!window.confirm((status==='approved'?'Approve':status==='rejected'?'Reject':'Return to pending')+' the scholarship application from '+application.student_name+'?')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/academic',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'review_scholarship',applicationId:application.id,status})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Scholarship decision could not be saved.');
      setNotice('Scholarship application marked '+status+'.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Scholarship decision could not be saved.');
    } finally { setBusy(false); }
  };

  return <div className="space-y-5 text-slate-900">
    <header className="rounded-2xl bg-gradient-to-r from-[#071a35] via-blue-950 to-[#16477e] p-5 text-white"><p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">NAVSTAR · STUDENT SUPPORT</p><h2 className="mt-1 text-2xl font-black">Scholarships & Discounts</h2><p className="mt-1 text-sm text-blue-100">Publish genuine scholarship opportunities and review student applications against the saved scholarship records.</p><div className="mt-4 flex flex-wrap gap-3 text-sm"><span>{scholarships.length} scholarships</span><span>·</span><span>{applications.length} applications</span><span>·</span><span>{applications.filter(item=>item.status==='pending').length} pending review</span></div></header>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <section className={panel}>
      <h3 className="font-bold">Publish scholarship opportunity</h3>
      <form onSubmit={publish} className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold">Scholarship / discount title<input value={title} onChange={event=>setTitle(event.target.value)} required maxLength={160} className="mt-1 h-11 w-full rounded-lg border px-3 text-sm font-normal"/></label>
        <label className="text-xs font-bold">Award amount (KSh)<input type="number" min="0" step="1" value={amount} onChange={event=>setAmount(event.target.value)} required className="mt-1 h-11 w-full rounded-lg border px-3 text-sm font-normal"/></label>
        <label className="text-xs font-bold">Eligible course<select value={courseId} onChange={event=>setCourseId(event.target.value)} className="mt-1 h-11 w-full rounded-lg border bg-white px-3 text-sm font-normal"><option value="">All eligible courses</option>{courses.map(course=><option key={course.id} value={course.id}>{course.title}</option>)}</select></label>
        <label className="text-xs font-bold">Application deadline<input type="date" value={deadline} onChange={event=>setDeadline(event.target.value)} className="mt-1 h-11 w-full rounded-lg border px-3 text-sm font-normal"/></label>
        <label className="text-xs font-bold sm:col-span-2">Eligibility details / conditions<textarea value={description} onChange={event=>setDescription(event.target.value)} rows={3} maxLength={3000} className="mt-1 w-full rounded-lg border p-3 text-sm font-normal" placeholder="Explain who qualifies, required documents and how applications will be assessed."/></label>
        <div className="sm:col-span-2 flex justify-end"><Button disabled={busy||title.trim().length<2}>{busy?'Saving…':'Publish opportunity'}</Button></div>
      </form>
    </section>
    <section className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">Published scholarship opportunities</h3><p className="mt-1 text-xs text-slate-500">Opportunities and eligibility as stored in the academic database.</p></div><Button size="sm" variant="outline" disabled={loading} onClick={()=>void load()}>Refresh</Button></div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">{scholarships.map(item=><article key={item.id} className="rounded-xl border p-4"><div className="flex items-start justify-between gap-2"><h4 className="font-bold">{item.title}</h4><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{item.status}</span></div><p className="mt-1 text-sm text-slate-600">{item.description || 'No additional eligibility details recorded.'}</p><div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500"><span>{item.course_title || 'All courses'}</span><span>KSh {Number(item.award_amount||0).toLocaleString('en-KE')}</span><span>Deadline: {item.deadline || 'Not set'}</span></div></article>)}{!loading&&scholarships.length===0&&<p className="rounded-lg border border-dashed p-5 text-sm text-slate-500 md:col-span-2">No scholarship opportunities have been published yet.</p>}</div>
    </section>
    <section className={panel}>
      <h3 className="font-bold">Student applications & decisions</h3>
      <p className="mt-1 text-xs text-slate-500">Approve, reject or return an application to pending. Decisions are saved against the student’s scholarship application.</p>
      <div className="mt-3 space-y-3">{applications.map(application=><article key={application.id} className="rounded-xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-bold">{application.student_name}</h4><p className="text-xs text-slate-500">{application.email} · {application.course_title || 'Course not specified'}</p><p className="mt-1 text-sm font-semibold text-blue-900">{application.scholarship_title}</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{application.statement || 'No supporting statement submitted.'}</p><p className="mt-2 text-xs text-slate-500">Submitted: {application.created_at ? new Date(application.created_at).toLocaleString('en-KE',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Nairobi'}) : '—'}</p></div><span className={application.status==='approved'?'rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700':application.status==='rejected'?'rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700':'rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800'}>{application.status}</span></div><div className="mt-3 flex flex-wrap justify-end gap-2"><Button size="sm" variant="outline" disabled={busy||application.status==='pending'} onClick={()=>void review(application,'pending')}>Return to pending</Button><Button size="sm" variant="outline" disabled={busy||application.status==='rejected'} onClick={()=>void review(application,'rejected')}>Reject</Button><Button size="sm" disabled={busy||application.status==='approved'} onClick={()=>void review(application,'approved')}>Approve</Button></div></article>)}{!loading&&applications.length===0&&<p className="rounded-lg border border-dashed p-5 text-center text-sm text-slate-500">No student scholarship applications have been submitted.</p>}</div>
    </section>
  </div>;
}
