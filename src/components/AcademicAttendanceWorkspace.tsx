import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';

type Course = { id: string; title: string };
type Learner = { id: string; name: string; email: string; course_id: string; course_title?: string };
type Session = { id: string; course_id: string; title: string; starts_at: string; ends_at?: string | null; venue?: string | null; module_title?: string | null };
type Attendance = { id: string; timetable_id: string; student_user_id: string; status: string; marked_at: string; session_title: string; starts_at: string; course_title: string; student_name: string };
const panel = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
const dateLabel = (value?: string) => value ? new Date(value).toLocaleString('en-KE',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Nairobi'}) : '—';

export function AcademicAttendanceWorkspace() {
  const [courses,setCourses] = useState<Course[]>([]);
  const [learners,setLearners] = useState<Learner[]>([]);
  const [sessions,setSessions] = useState<Session[]>([]);
  const [attendance,setAttendance] = useState<Attendance[]>([]);
  const [courseId,setCourseId] = useState('');
  const [sessionId,setSessionId] = useState('');
  const [studentId,setStudentId] = useState('');
  const [status,setStatus] = useState('present');
  const [search,setSearch] = useState('');
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/academic',{credentials:'same-origin',cache:'no-store'});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Academic attendance records could not be loaded.');
      setCourses(result.courses || []);
      setLearners(result.learners || []);
      setSessions(result.timetable || []);
      setAttendance(result.attendance || []);
      setCourseId(current => current || result.courses?.[0]?.id || '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Academic attendance records could not be loaded.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);
  const courseSessions = useMemo(() => sessions.filter(item => item.course_id === courseId),[sessions,courseId]);
  const courseLearners = useMemo(() => learners.filter(item => item.course_id === courseId),[learners,courseId]);
  useEffect(() => {
    if (!courseSessions.some(item => item.id === sessionId)) setSessionId(courseSessions[0]?.id || '');
  },[courseSessions,sessionId]);
  useEffect(() => {
    if (!courseLearners.some(item => item.id === studentId)) setStudentId(courseLearners[0]?.id || '');
  },[courseLearners,studentId]);

  const filteredAttendance = attendance.filter(item => {
    const matchesCourse = !courseId || sessions.find(session => session.id === item.timetable_id)?.course_id === courseId;
    const term = search.trim().toLowerCase();
    return matchesCourse && (!term || [item.student_name,item.session_title,item.course_title,item.status].some(value => String(value || '').toLowerCase().includes(term)));
  });

  const save = async () => {
    if (!sessionId || !studentId) { setError('Select a timetable session and an accepted student.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/academic',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'mark_attendance',timetableId:sessionId,studentId,status})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Attendance could not be saved.');
      setNotice('Attendance saved for the selected student and session.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Attendance could not be saved.');
    } finally { setBusy(false); }
  };

  return <div className="space-y-5 text-slate-900">
    <header className="rounded-2xl bg-gradient-to-r from-[#071a35] via-blue-950 to-[#16477e] p-5 text-white">
      <p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">NAVSTAR · ACADEMIC RECORDS</p>
      <h2 className="mt-1 text-2xl font-black">Student Attendance Register</h2>
      <p className="mt-1 text-sm text-blue-100">Record attendance against published course timetable sessions. Attendance is linked to the accepted student and course records.</p>
      <div className="mt-4 flex flex-wrap gap-3 text-sm"><span>{learners.length} accepted course enrolments</span><span>·</span><span>{sessions.length} timetable sessions</span><span>·</span><span>{attendance.length} attendance entries</span></div>
    </header>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <section className={panel}>
      <h3 className="font-bold">Record student attendance</h3>
      <p className="mt-1 text-sm text-slate-500">Choose a course, its timetable session and an accepted student. Saving again for the same student/session updates the existing attendance entry.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-bold">Course<select className="mt-1 h-11 w-full rounded-lg border bg-white px-3 text-sm" value={courseId} onChange={event=>setCourseId(event.target.value)}><option value="">Select course</option>{courses.map(course=><option key={course.id} value={course.id}>{course.title}</option>)}</select></label>
        <label className="text-xs font-bold">Timetable session<select className="mt-1 h-11 w-full rounded-lg border bg-white px-3 text-sm" value={sessionId} onChange={event=>setSessionId(event.target.value)}><option value="">Select session</option>{courseSessions.map(session=><option key={session.id} value={session.id}>{session.title} · {dateLabel(session.starts_at)}</option>)}</select></label>
        <label className="text-xs font-bold">Accepted student<select className="mt-1 h-11 w-full rounded-lg border bg-white px-3 text-sm" value={studentId} onChange={event=>setStudentId(event.target.value)}><option value="">Select student</option>{courseLearners.map(learner=><option key={learner.id} value={learner.id}>{learner.name} · {learner.email}</option>)}</select></label>
        <label className="text-xs font-bold">Attendance status<select className="mt-1 h-11 w-full rounded-lg border bg-white px-3 text-sm" value={status} onChange={event=>setStatus(event.target.value)}><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option><option value="excused">Excused</option></select></label>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">{courseSessions.length} session(s) and {courseLearners.length} accepted student(s) in the selected course.</p><Button disabled={busy||!sessionId||!studentId} onClick={()=>void save()}>{busy?'Saving attendance…':'Save attendance'}</Button></div>
      {!sessions.length && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">No timetable sessions are available yet. Create the course timetable under the Timetable workspace first.</p>}
    </section>
    <section className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">Saved attendance entries</h3><p className="mt-1 text-xs text-slate-500">Current course filter · latest entries first</p></div><Button variant="outline" size="sm" disabled={loading} onClick={()=>void load()}>Refresh register</Button></div>
      <input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search student, session or status…" className="mt-4 h-10 w-full rounded-lg border px-3 text-sm"/>
      <div className="mt-3 overflow-x-auto rounded-lg border"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Student</th><th className="p-3">Course</th><th className="p-3">Session</th><th className="p-3">Session date (EAT)</th><th className="p-3">Status</th><th className="p-3">Recorded</th></tr></thead><tbody>{filteredAttendance.map(item=><tr key={item.id} className="border-t"><td className="p-3 font-semibold">{item.student_name}</td><td className="p-3">{item.course_title}</td><td className="p-3">{item.session_title}</td><td className="p-3">{dateLabel(item.starts_at)}</td><td className="p-3"><span className={item.status==='present'?'rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700':item.status==='absent'?'rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700':'rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800'}>{item.status}</span></td><td className="p-3">{dateLabel(item.marked_at)}</td></tr>)}{!loading&&filteredAttendance.length===0&&<tr><td colSpan={6} className="p-6 text-center text-sm text-slate-500">No attendance entries match this course and search.</td></tr>}</tbody></table></div>
    </section>
  </div>;
}
