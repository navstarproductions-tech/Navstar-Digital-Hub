import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BookOpen, CheckCircle2, Clock3, FileText, GraduationCap, PlusCircle, Send, ShieldCheck } from 'lucide-react';

type Submission = { id: string; status: string; points_awarded?: number | null; feedback?: string | null; submitted_at: string; learner_name?: string; response_text?: string; attachment_url?: string | null };
type Lesson = { id: string; title: string; content: string; video_url?: string | null; resource_url?: string | null; estimated_minutes: number; completed: boolean; status: string };
type Module = { id: string; title: string; description: string; status: string; lessons: Lesson[] };
type Assignment = { id: string; title: string; instructions: string; due_at?: string | null; max_points: number; status: string; submission?: Submission | null; submissions?: Submission[] };
type Course = { id: string; title: string; description: string; duration: string; image?: string; modules: Module[]; assignments: Assignment[] };
type LearningData = { courses: Course[]; role: string; message?: string };

const fieldClass = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60';

export function LearningPage() {
  const [data, setData] = useState<LearningData | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedLessonId, setSelectedLessonId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [moduleTitle, setModuleTitle] = useState('');
  const [moduleDescription, setModuleDescription] = useState('');
  const [moduleStatus, setModuleStatus] = useState('draft');
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonContent, setLessonContent] = useState('');
  const [lessonModuleId, setLessonModuleId] = useState('');
  const [lessonVideo, setLessonVideo] = useState('');
  const [lessonResource, setLessonResource] = useState('');
  const [lessonStatus, setLessonStatus] = useState('draft');
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [assignmentInstructions, setAssignmentInstructions] = useState('');
  const [assignmentDue, setAssignmentDue] = useState('');
  const [assignmentPoints, setAssignmentPoints] = useState('100');
  const [assignmentModuleId, setAssignmentModuleId] = useState('');
  const [assignmentStatus, setAssignmentStatus] = useState('draft');
  const [answerText, setAnswerText] = useState('');
  const [answerLink, setAnswerLink] = useState('');
  const [gradeValues, setGradeValues] = useState<Record<string, { points: string; feedback: string }>>({});

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/learning', { headers: { Accept: 'application/json' } });
      const result = await response.json() as LearningData & { error?: string };
      if (!response.ok) throw new Error(result.error || 'The learning workspace could not be loaded.');
      setData(result);
      setSelectedCourseId((current) => result.courses.some((course) => course.id === current) ? current : result.courses[0]?.id ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The learning workspace could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const selectedCourse = useMemo(() => data?.courses.find((course) => course.id === selectedCourseId) ?? null, [data, selectedCourseId]);
  const allModules = data?.courses.flatMap((course) => course.modules.map((module) => ({ ...module, courseTitle: course.title, courseId: course.id }))) ?? [];
  const completedLessons = selectedCourse?.modules.flatMap((module) => module.lessons).filter((lesson) => lesson.completed).length ?? 0;
  const totalLessons = selectedCourse?.modules.reduce((total, module) => total + module.lessons.length, 0) ?? 0;
  const isAdmin = data?.role === 'admin';
  const isStudent = data?.role === 'student';

  const sendAction = async (payload: Record<string, unknown>) => {
    setBusy(true);
    setNotice('');
    setError('');
    try {
      const response = await fetch('/api/learning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { error?: string; id?: string };
      if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
      setNotice('Saved successfully.');
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The request could not be completed.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const createModule = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCourse) return;
    if (await sendAction({ action: 'create_module', courseId: selectedCourse.id, title: moduleTitle, description: moduleDescription, status: moduleStatus })) {
      setModuleTitle(''); setModuleDescription('');
    }
  };

  const createLesson = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await sendAction({ action: 'create_lesson', moduleId: lessonModuleId, title: lessonTitle, content: lessonContent, videoUrl: lessonVideo, resourceUrl: lessonResource, status: lessonStatus })) {
      setLessonTitle(''); setLessonContent(''); setLessonVideo(''); setLessonResource('');
    }
  };

  const createAssignment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCourse) return;
    if (await sendAction({ action: 'create_assignment', courseId: selectedCourse.id, moduleId: assignmentModuleId, title: assignmentTitle, instructions: assignmentInstructions, dueAt: assignmentDue ? new Date(assignmentDue).toISOString() : '', maxPoints: Number(assignmentPoints), status: assignmentStatus })) {
      setAssignmentTitle(''); setAssignmentInstructions(''); setAssignmentDue('');
    }
  };

  const markLesson = async (lesson: Lesson, completed: boolean) => {
    if (await sendAction({ action: 'mark_lesson', lessonId: lesson.id, completed })) setSelectedLessonId(lesson.id);
  };

  const submitAssignment = async (assignment: Assignment) => {
    if (await sendAction({ action: 'submit_assignment', assignmentId: assignment.id, responseText: answerText, attachmentUrl: answerLink })) {
      setAnswerText(''); setAnswerLink('');
    }
  };

  const gradeSubmission = async (submission: Submission) => {
    const values = gradeValues[submission.id] ?? { points: '', feedback: '' };
    await sendAction({ action: 'grade_submission', submissionId: submission.id, pointsAwarded: Number(values.points), feedback: values.feedback });
  };

  if (loading) return <main className="min-h-[60vh] bg-slate-50 px-4 py-16 text-center text-slate-600">Loading your learning workspace…</main>;

  return (
    <main className="min-h-screen bg-slate-50 pb-16">
      <section className="bg-gradient-to-r from-blue-950 via-blue-900 to-emerald-900 text-white">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <Link to="/portals" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-100 hover:text-white"><ArrowLeft className="h-4 w-4" /> Portals</Link>
          <div className="mt-5 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div><p className="text-xs font-extrabold uppercase tracking-[.24em] text-amber-300">NAVSTAR DIGITAL HUB · HOME OF TECHNOCRATS</p><h1 className="mt-2 flex items-center gap-3 text-3xl font-black sm:text-4xl"><GraduationCap className="h-9 w-9 text-emerald-300" /> Learning Workspace</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">Course modules, lessons, learner progress, assignments and feedback in one place.</p></div>
            <div className="flex flex-wrap gap-2"><span className="rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-bold capitalize">{data?.role || 'portal'}</span><Link to="/courses" className="rounded-xl bg-amber-300 px-4 py-2.5 text-sm font-extrabold text-blue-950 hover:bg-amber-200">Course catalogue</Link></div>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[290px_minmax(0,1fr)] lg:px-8">
        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-extrabold text-slate-950">My programmes</h2>
            <p className="mt-1 text-xs text-slate-500">{data?.courses.length ?? 0} course(s) available</p>
            <div className="mt-4 space-y-2">
              {data?.courses.map((course) => <button key={course.id} onClick={() => { setSelectedCourseId(course.id); setSelectedLessonId(''); }} className={`w-full rounded-xl border p-3 text-left transition ${selectedCourseId === course.id ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'}`}><span className="block text-sm font-bold text-slate-900">{course.title}</span><span className="mt-1 block text-xs text-slate-500">{course.duration || 'Self-paced'} · {course.modules.length} module(s)</span></button>)}
              {!data?.courses.length && <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{data?.message || 'No courses are currently linked to this account.'}</p>}
            </div>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><div className="flex items-center gap-2 text-emerald-900"><ShieldCheck className="h-5 w-5" /><h3 className="font-bold">Learning records</h3></div><p className="mt-2 text-xs leading-5 text-emerald-800">Your lesson completion and assignment records are saved to your Navstar account.</p></div>
        </aside>

        <section className="min-w-0 space-y-6">
          {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
          {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div>}
          {selectedCourse ? <>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Selected programme</p><h2 className="mt-2 text-2xl font-black text-slate-950">{selectedCourse.title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{selectedCourse.description}</p></div><div className="min-w-32 rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Lesson progress</p><p className="mt-1 text-2xl font-black text-slate-950">{completedLessons}/{totalLessons}</p><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-emerald-500" style={{ width: totalLessons ? `${completedLessons / totalLessons * 100}%` : '0%' }} /></div></div></div>
            </div>

            {isAdmin && <div className="grid gap-4 xl:grid-cols-2">
              <form onSubmit={createModule} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="flex items-center gap-2 font-extrabold text-slate-950"><PlusCircle className="h-5 w-5 text-blue-700" /> Add course module</h3><input className={fieldClass} value={moduleTitle} onChange={(e) => setModuleTitle(e.target.value)} placeholder="Module title" required /><textarea className={fieldClass} rows={2} value={moduleDescription} onChange={(e) => setModuleDescription(e.target.value)} placeholder="Short module description" /><select className={fieldClass} value={moduleStatus} onChange={(e) => setModuleStatus(e.target.value)}><option value="draft">Save as draft</option><option value="published">Publish immediately</option></select><button className={buttonClass} disabled={busy}><PlusCircle className="h-4 w-4" /> Create module</button></form>
              <form onSubmit={createLesson} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="flex items-center gap-2 font-extrabold text-slate-950"><BookOpen className="h-5 w-5 text-blue-700" /> Add lesson</h3><select className={fieldClass} value={lessonModuleId} onChange={(e) => setLessonModuleId(e.target.value)} required><option value="">Choose module</option>{allModules.filter((module) => module.courseId === selectedCourse.id).map((module) => <option key={module.id} value={module.id}>{module.title}</option>)}</select><input className={fieldClass} value={lessonTitle} onChange={(e) => setLessonTitle(e.target.value)} placeholder="Lesson title" required /><textarea className={fieldClass} rows={4} value={lessonContent} onChange={(e) => setLessonContent(e.target.value)} placeholder="Lesson notes and learning content" /><input className={fieldClass} value={lessonVideo} onChange={(e) => setLessonVideo(e.target.value)} placeholder="Optional HTTPS video link" /><input className={fieldClass} value={lessonResource} onChange={(e) => setLessonResource(e.target.value)} placeholder="Optional HTTPS resource link" /><select className={fieldClass} value={lessonStatus} onChange={(e) => setLessonStatus(e.target.value)}><option value="draft">Save as draft</option><option value="published">Publish immediately</option></select><button className={buttonClass} disabled={busy}><PlusCircle className="h-4 w-4" /> Create lesson</button></form>
              <form onSubmit={createAssignment} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2"><h3 className="flex items-center gap-2 font-extrabold text-slate-950"><FileText className="h-5 w-5 text-blue-700" /> Create assignment</h3><div className="grid gap-3 sm:grid-cols-2"><input className={fieldClass} value={assignmentTitle} onChange={(e) => setAssignmentTitle(e.target.value)} placeholder="Assignment title" required /><select className={fieldClass} value={assignmentModuleId} onChange={(e) => setAssignmentModuleId(e.target.value)}><option value="">General course assignment</option>{allModules.filter((module) => module.courseId === selectedCourse.id).map((module) => <option key={module.id} value={module.id}>{module.title}</option>)}</select><input className={fieldClass} type="datetime-local" value={assignmentDue} onChange={(e) => setAssignmentDue(e.target.value)} /><input className={fieldClass} type="number" min="1" max="10000" value={assignmentPoints} onChange={(e) => setAssignmentPoints(e.target.value)} placeholder="Maximum points" /></div><textarea className={fieldClass} rows={3} value={assignmentInstructions} onChange={(e) => setAssignmentInstructions(e.target.value)} placeholder="Assignment instructions" /><select className={fieldClass} value={assignmentStatus} onChange={(e) => setAssignmentStatus(e.target.value)}><option value="draft">Save as draft</option><option value="published">Publish immediately</option></select><button className={buttonClass} disabled={busy}><PlusCircle className="h-4 w-4" /> Save assignment</button></form>
            </div>}

            <div className="space-y-4">
              <div className="flex items-center justify-between"><h3 className="text-xl font-black text-slate-950">Course content</h3><span className="text-xs font-semibold text-slate-500">{selectedCourse.modules.length} module(s)</span></div>
              {selectedCourse.modules.map((module, index) => <article key={module.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 sm:p-5"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Module {index + 1}</p><h4 className="mt-1 text-lg font-extrabold text-slate-950">{module.title}</h4>{module.description && <p className="mt-1 text-sm text-slate-600">{module.description}</p>}</div>{isAdmin && <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold capitalize text-amber-800">{module.status}</span>}</div><div className="divide-y divide-slate-100">{module.lessons.map((lesson) => <div key={lesson.id} className="p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><button onClick={() => setSelectedLessonId(selectedLessonId === lesson.id ? '' : lesson.id)} className="min-w-0 flex-1 text-left"><span className="flex items-center gap-2 font-bold text-slate-900">{lesson.completed ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <BookOpen className="h-5 w-5 shrink-0 text-blue-700" />}{lesson.title}</span><span className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5" /> {lesson.estimated_minutes} minutes</span></button>{isAdmin && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-600">{lesson.status}</span>}</div>{selectedLessonId === lesson.id && <div className="mt-4 rounded-xl bg-slate-50 p-4"><p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{lesson.content || 'No lesson notes have been added yet.'}</p><div className="mt-3 flex flex-wrap gap-3">{lesson.video_url && <a href={lesson.video_url} target="_blank" rel="noreferrer" className="text-sm font-bold text-blue-700 underline">Open lesson video</a>}{lesson.resource_url && <a href={lesson.resource_url} target="_blank" rel="noreferrer" className="text-sm font-bold text-blue-700 underline">Open lesson resource</a>}</div>{isStudent && <button onClick={() => void markLesson(lesson, !lesson.completed)} disabled={busy} className={`${buttonClass} mt-4`}>{lesson.completed ? 'Mark as not completed' : 'Mark lesson complete'}</button>}</div>}</div>)}{module.lessons.length === 0 && <p className="p-4 text-sm text-slate-500">No lessons have been published in this module yet.</p>}</div></article>)}
              {selectedCourse.modules.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><BookOpen className="mx-auto h-8 w-8 text-slate-400" /><p className="mt-3 font-bold text-slate-800">No modules have been added yet.</p><p className="mt-1 text-sm text-slate-500">{isAdmin ? 'Use the module form above to start building this course.' : 'Your tutor will publish learning content here.'}</p></div>}
            </div>

            <section className="space-y-4"><h3 className="text-xl font-black text-slate-950">Assignments and assessments</h3>{selectedCourse.assignments.map((assignment) => <article key={assignment.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-extrabold text-slate-950">{assignment.title}</h4><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">{assignment.instructions}</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">/{assignment.max_points} points</span></div>{assignment.due_at && <p className="mt-3 text-xs text-slate-500">Due: {new Date(assignment.due_at).toLocaleString()}</p>}{isStudent && <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">{assignment.submission ? <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900"><p className="font-bold">Submission: {assignment.submission.status}</p>{assignment.submission.points_awarded !== null && assignment.submission.points_awarded !== undefined && <p className="mt-1">Score: {assignment.submission.points_awarded}/{assignment.max_points}</p>}{assignment.submission.feedback && <p className="mt-1">Feedback: {assignment.submission.feedback}</p>}</div> : <><textarea className={fieldClass} rows={4} value={answerText} onChange={(e) => setAnswerText(e.target.value)} placeholder="Write your assignment answer here" /><input className={fieldClass} value={answerLink} onChange={(e) => setAnswerLink(e.target.value)} placeholder="Optional HTTPS link to your work" /><button className={buttonClass} onClick={() => void submitAssignment(assignment)} disabled={busy || (!answerText.trim() && !answerLink.trim())}><Send className="h-4 w-4" /> Submit assignment</button></>}</div>}{isAdmin && <div className="mt-4 space-y-3 border-t border-slate-100 pt-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Learner submissions</p>{(assignment.submissions ?? []).map((submission) => <div key={submission.id} className="rounded-xl bg-slate-50 p-3"><p className="text-sm font-bold text-slate-900">{submission.learner_name || 'Learner'} · {new Date(submission.submitted_at).toLocaleString()}</p>{submission.response_text && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{submission.response_text}</p>}{submission.attachment_url && <a className="mt-2 inline-block text-sm font-bold text-blue-700 underline" href={submission.attachment_url} target="_blank" rel="noreferrer">Open submitted resource</a>}<div className="mt-3 grid gap-2 sm:grid-cols-[120px_1fr_auto]"><input className={fieldClass} type="number" min="0" max={assignment.max_points} placeholder="Score" value={gradeValues[submission.id]?.points ?? (submission.points_awarded ?? '')} onChange={(e) => setGradeValues((current) => ({ ...current, [submission.id]: { points: e.target.value, feedback: current[submission.id]?.feedback ?? submission.feedback ?? '' } }))} /><input className={fieldClass} placeholder="Feedback" value={gradeValues[submission.id]?.feedback ?? submission.feedback ?? ''} onChange={(e) => setGradeValues((current) => ({ ...current, [submission.id]: { points: current[submission.id]?.points ?? String(submission.points_awarded ?? ''), feedback: e.target.value } }))} /><button className={buttonClass} disabled={busy || (gradeValues[submission.id]?.points ?? String(submission.points_awarded ?? '')).trim() === ''} onClick={() => void gradeSubmission(submission)}>Save grade</button></div></div>)}{!(assignment.submissions?.length) && <p className="text-sm text-slate-500">No learner submissions yet.</p>}</div>}</article>)}{selectedCourse.assignments.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">No assignments have been published for this course yet.</p>}</section>
          </> : <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><GraduationCap className="mx-auto h-10 w-10 text-blue-700" /><h2 className="mt-3 text-xl font-black text-slate-950">Your learning workspace is ready</h2><p className="mt-2 text-sm text-slate-600">{data?.message || 'No course content is available yet.'}</p><Link to="/courses" className="mt-5 inline-flex rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white">Explore courses</Link></div>}
        </section>
      </div>
    </main>
  );
}
