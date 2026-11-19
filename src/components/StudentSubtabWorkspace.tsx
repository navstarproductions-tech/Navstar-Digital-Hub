import { useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Course } from '@/types';
import { downloadNavstarTablePdf } from '@/lib/receipt-pdf';

type StudentAccount = {
  id: string; name: string; email: string; role: string; status: string;
  staffId?: string; profilePhotoUrl?: string; phone?: string; dateOfBirth?: string; county?: string; subCounty?: string; ward?: string; location?: string; subLocation?: string;
};
type ApplicationRow = Record<string, unknown>;

type Props = {
  students: StudentAccount[];
  applications: ApplicationRow[];
  courses: Course[];
  selectedSubtab: string;
  onEditStudent: (student: StudentAccount) => void;
  onAddStudent: () => void;
};

const getText = (value: unknown) => String(value ?? '');
const courseLink = 'https://navstardigitalhub.co.ke/courses';

export function StudentSubtabWorkspace({ students, applications, courses, selectedSubtab, onEditStudent, onAddStudent }: Props) {
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detailId, setDetailId] = useState('');
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [csvError, setCsvError] = useState('');
  const [pdfError, setPdfError] = useState('');\n  const [admissionBusy, setAdmissionBusy] = useState('');\n  const [generatedAdmissions, setGeneratedAdmissions] = useState<Record<string,string>>({});\n  const [admissionMessage, setAdmissionMessage] = useState('');

  const activeStudents = useMemo(() => students.filter(student => student.role === 'student' && student.status.toLowerCase() === 'active'), [students]);
  const allStudents = useMemo(() => students.filter(student => student.role === 'student'), [students]);
  const latestApplication = (student: StudentAccount) => applications
    .filter(row => getText(row.email).toLowerCase() === student.email.toLowerCase())
    .sort((a, b) => getText(b.created_at).localeCompare(getText(a.created_at)))[0];
  const courseId = (student: StudentAccount) => getText(latestApplication(student)?.course_id);
  const courseName = (student: StudentAccount) => courses.find(course => course.id === courseId(student))?.title || 'Course not assigned';
  const filtered = activeStudents.filter(student => {
    const term = search.toLowerCase();
    const matchesText = !term || [student.name, student.email, student.staffId, student.phone].some(value => getText(value).toLowerCase().includes(term));
    return matchesText && (courseFilter === 'all' || courseId(student) === courseFilter);
  });
  const selected = activeStudents.filter(student => selectedIds.includes(student.id));
  const detailStudent = allStudents.find(student => student.id === detailId) || activeStudents[0];
  const generateAdmission = async (student: StudentAccount) => {
    const application = latestApplication(student);
    if (!application?.id) { setAdmissionMessage('No course application is linked to this student. Assign or create the course application first.'); return; }
    setAdmissionBusy(student.id); setAdmissionMessage('');
    try {
      const response = await fetch('/api/admin/admission-number', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ enrollmentId: application.id }) });
      const result = await response.json() as { admissionNumber?:string; error?:string };
      if (!response.ok || !result.admissionNumber) throw new Error(result.error || 'Admission number could not be generated.');
      setGeneratedAdmissions(current => ({...current,[String(application.id)]:result.admissionNumber!}));
      setAdmissionMessage('Admission number saved: ' + result.admissionNumber + '. Email/SMS sharing will be triggered once the notification channel integration is connected.');
    } catch (error) { setAdmissionMessage(error instanceof Error ? error.message : 'Admission number could not be generated.'); }
    finally { setAdmissionBusy(''); }
  };
  const downloadRegister = async (title: string, records: StudentAccount[], filename: string) => {
    setPdfError('');
    try {
      const rows = records.map(student => [student.name, student.staffId || 'Not assigned', courseName(student), student.email, student.phone || 'Not recorded', student.status]);
      await downloadNavstarTablePdf(title, ['Student name','Student ID','Course','Email','Phone','Status'], rows, filename);
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : 'The PDF could not be generated. Please try again.');
    }
  };

  const downloadTemplate = () => {
    const csv = 'fullName,email,phone,dateOfBirth,identityNumber,courseId,studyMode,educationLevel,county,town,emergencyContactName,emergencyContactPhone\nJane Doe,jane@example.com,0712345678,2000-01-01,,COURSE_ID,On campus,Secondary,Bungoma,Bungoma,John Doe,0712345679';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'navstar-student-enrollment-template.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const previewCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCsvError('');
    if (!file.name.toLowerCase().endsWith('.csv') || file.size > 2 * 1024 * 1024) {
      setCsvRows([]);
      setCsvError('Choose a CSV file no larger than 2 MB.');
      return;
    }
    const text = await file.text();
    const rows = text.split(/\r?\n/).filter(Boolean).slice(0, 101).map(line => line.split(',').map(cell => cell.trim().replace(/^"|"$/g, '')));
    setCsvRows(rows);
  };

  const pageTitle = selectedSubtab || 'Active Students';
  const header = (
    <section className="overflow-hidden rounded-2xl border border-cyan-200/20 bg-gradient-to-r from-[#09234a] via-[#123e78] to-[#0b2854] text-white shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div><p className="text-[10px] font-black uppercase tracking-[.22em] text-cyan-200">NAVSTAR DIGITAL HUB · STUDENT MANAGEMENT</p><h2 className="mt-1 text-2xl font-black">{pageTitle}</h2><p className="mt-1 max-w-2xl text-sm text-blue-100">A dedicated workspace connected to the existing Navstar student and admissions records.</p></div>
        <div className="grid grid-cols-2 gap-2 text-center"><div className="rounded-xl border border-white/15 bg-white/10 px-4 py-2"><p className="text-[10px] text-blue-100">Active students</p><p className="text-2xl font-black">{activeStudents.length}</p></div><div className="rounded-xl border border-white/15 bg-white/10 px-4 py-2"><p className="text-[10px] text-blue-100">Courses</p><p className="text-2xl font-black">{courses.length}</p></div></div>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-white/10 bg-black/10 px-5 py-3"><span className="rounded-full bg-cyan-300/15 px-3 py-1 text-xs font-semibold text-cyan-100">Live student accounts</span><span className="rounded-full bg-white/10 px-3 py-1 text-xs text-blue-100">Admissions-linked data</span><span className="rounded-full bg-white/10 px-3 py-1 text-xs text-blue-100">EAT</span></div>
    </section>
  );

  return <div className="space-y-5">{header}{pdfError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{pdfError}</p>}
    {pageTitle === 'Active Students' && <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4 text-slate-900"><div><h3 className="font-bold">Active student register</h3><p className="text-xs text-slate-500">Active student accounts grouped by their latest recorded course application.</p></div><Button onClick={onAddStudent} className="bg-emerald-800 hover:bg-emerald-900">+ Add New Student</Button></div>
      {courses.map(course => { const learners = activeStudents.filter(student => courseId(student) === course.id); return <section key={course.id} className="overflow-hidden rounded-xl border bg-white text-slate-900 shadow-sm"><div className="flex items-center justify-between border-b bg-slate-50 px-4 py-3"><div><h4 className="font-bold">{course.title}</h4><p className="text-xs text-slate-500">{course.duration} · {course.category}</p></div><span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800">{learners.length} active</span></div>{learners.length ? <div className="divide-y">{learners.map(student => <div key={student.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div><p className="font-semibold">{student.name}</p><p className="text-xs text-slate-500">{student.staffId || 'Student ID pending'} · {student.email} · {student.phone || 'No phone recorded'}</p></div><Button size="sm" variant="outline" onClick={() => onEditStudent(student)}>Edit details</Button></div>)}</div> : <p className="px-4 py-4 text-sm text-slate-500">No active students are currently linked to this course.</p>}</section>; })}
      {activeStudents.filter(student => !courses.some(course => course.id === courseId(student))).length > 0 && <section className="rounded-xl border border-amber-200 bg-white text-slate-900"><div className="border-b bg-amber-50 p-4"><h4 className="font-bold text-amber-950">Course not assigned</h4><p className="text-xs text-amber-800">These active accounts have no matching course application.</p></div>{activeStudents.filter(student => !courses.some(course => course.id === courseId(student))).map(student => <div key={student.id} className="border-b p-3 text-sm"><strong>{student.name}</strong><p className="text-xs text-slate-500">{student.email}</p></div>)}</section>}
    </div>}

    {pageTitle === 'Bulk Enrollment' && <section className="space-y-4 rounded-xl border bg-white p-5 text-slate-900"><div><h3 className="font-bold">Bulk enrollment preparation</h3><p className="mt-1 text-sm text-slate-600">Download the official column template and preview a completed CSV before import.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={downloadTemplate}>Download CSV template</Button><label className="inline-flex cursor-pointer items-center rounded-lg bg-blue-800 px-4 py-2 text-sm font-semibold text-white">Choose CSV file<input type="file" accept=".csv,text/csv" className="sr-only" onChange={previewCsv}/></label></div>{csvError && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{csvError}</p>}{csvRows.length > 0 && <div className="overflow-x-auto rounded-lg border"><p className="border-b bg-slate-50 p-3 text-xs font-semibold">{csvRows.length - 1} rows previewed (first 100 rows)</p><table className="min-w-full text-xs"><tbody>{csvRows.slice(0, 8).map((row, index) => <tr key={index} className="border-b">{row.map((cell, column) => <td key={column} className="whitespace-nowrap px-3 py-2">{cell}</td>)}</tr>)}</tbody></table></div>}<p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Import submission is not enabled yet. This preview does not create accounts or alter existing records.</p></section>}

    {pageTitle === 'Completed → Graduates' && <section className="rounded-xl border bg-white text-slate-900"><div className="border-b bg-slate-50 p-4"><h3 className="font-bold">Completed learners and graduates</h3><p className="text-xs text-slate-500">Student accounts currently marked completed or graduated.</p></div><div className="divide-y">{allStudents.filter(student => ['completed', 'graduated'].includes(student.status.toLowerCase())).map(student => <div key={student.id} className="flex items-center justify-between gap-3 p-4"><div><strong>{student.name}</strong><p className="text-xs text-slate-500">{student.staffId || 'ID pending'} · {student.email}</p></div><span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-800">{student.status}</span></div>)}{allStudents.filter(student => ['completed', 'graduated'].includes(student.status.toLowerCase())).length === 0 && <p className="p-5 text-sm text-slate-500">No student accounts are currently marked completed or graduated.</p>}</div></section>}

    {pageTitle === 'Edit Student Details' && <section className="rounded-xl border bg-white text-slate-900"><div className="border-b bg-slate-50 p-4"><h3 className="font-bold">Student profile editor</h3><p className="text-xs text-slate-500">Edit student details, view the passport photo and generate missing course admission numbers.</p></div>{admissionMessage&&<p role="status" className="m-4 rounded-lg bg-cyan-50 p-3 text-sm text-cyan-900">{admissionMessage}</p>}<div className="divide-y">{activeStudents.map(student => { const app=latestApplication(student); const admission=generatedAdmissions[String(app?.id)]||getText(app?.admission_number); return <div key={student.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="flex min-w-0 items-center gap-3">{student.profilePhotoUrl?<img src={student.profilePhotoUrl} alt={student.name} className="h-14 w-14 rounded-xl border object-cover"/>:<div className="grid h-14 w-14 place-items-center rounded-xl bg-slate-100 text-lg font-black text-slate-500">{student.name.split(' ').map(part=>part[0]).slice(0,2).join('')}</div>}<div className="min-w-0"><strong>{student.name}</strong><p className="text-xs text-slate-500">{student.staffId || 'ID pending'} · {student.email}</p><p className="text-xs font-semibold text-cyan-800">{admission || 'Admission number not assigned'} · {courseName(student)}</p></div></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!app?.id||!!admissionBusy} onClick={()=>void generateAdmission(student)}>{admissionBusy===student.id?'Generating…':admission?'Admission assigned':'Generate admission no.'}</Button><Button size="sm" variant="outline" onClick={() => onEditStudent(student)}>Edit student</Button></div></div>; })}</div></section>}

    {pageTitle === 'Assign Intakes & Years' && <section className="overflow-hidden rounded-xl border bg-white text-slate-900"><div className="border-b bg-slate-50 p-4"><h3 className="font-bold">Intake and academic-year register</h3><p className="text-xs text-slate-500">Displays intake information already stored on the latest student application.</p></div><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-100 text-xs uppercase"><tr><th className="p-3">Student</th><th className="p-3">Course</th><th className="p-3">Preferred intake</th><th className="p-3">Application</th></tr></thead><tbody>{activeStudents.map(student => { const app = latestApplication(student); return <tr key={student.id} className="border-t"><td className="p-3 font-semibold">{student.name}</td><td className="p-3">{courseName(student)}</td><td className="p-3">{getText(app?.preferred_intake) || 'Not recorded'}</td><td className="p-3">{getText(app?.status) || 'Account active'}</td></tr>; })}</tbody></table></div></section>}

    {pageTitle === 'Detail Edit Requests' && <section className="rounded-xl border bg-white p-5 text-slate-900"><h3 className="font-bold">Student detail-change requests</h3><p className="mt-1 text-sm text-slate-600">A separate workspace for student-submitted corrections and administrator decisions.</p><div className="mt-4 rounded-xl border border-dashed bg-slate-50 p-6 text-center"><p className="font-semibold">No connected request records</p><p className="mt-1 text-xs text-slate-500">A request-submission and approval API is not yet available. No placeholder requests are invented.</p></div></section>}

    {pageTitle === 'Print Basic List' && <section className="space-y-4 rounded-xl border bg-white p-5 text-slate-900"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">Printable basic student list</h3><p className="text-xs text-slate-500">Active accounts only. Download a genuine Navstar PDF with the official receipt-style letterhead.</p></div><Button onClick={() => void downloadRegister('ACTIVE STUDENT REGISTER', activeStudents, 'navstar-active-student-register.pdf')}>Download PDF</Button></div><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-100 text-xs uppercase"><tr><th className="p-3">#</th><th className="p-3">Student</th><th className="p-3">Student ID</th><th className="p-3">Course</th><th className="p-3">Email</th></tr></thead><tbody>{activeStudents.map((student, index) => <tr key={student.id} className="border-t"><td className="p-3">{index + 1}</td><td className="p-3 font-semibold">{student.name}</td><td className="p-3">{student.staffId || '—'}</td><td className="p-3">{courseName(student)}</td><td className="p-3">{student.email}</td></tr>)}</tbody></table></div></section>}

    {pageTitle === 'Students List PDF (Filters & Select)' && <section className="space-y-4 rounded-xl border bg-white p-5 text-slate-900"><div><h3 className="font-bold">Filtered student list</h3><p className="text-xs text-slate-500">Search and filter active students, then select records for the bulk document workspace.</p></div><div className="grid gap-3 sm:grid-cols-2"><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, email, ID or phone"/><select value={courseFilter} onChange={event => setCourseFilter(event.target.value)} className="h-10 rounded-md border bg-white px-3 text-sm"><option value="all">All courses</option>{courses.map(course => <option key={course.id} value={course.id}>{course.title}</option>)}</select></div><div className="flex items-center justify-between"><span className="text-xs text-slate-500">{filtered.length} matching active students</span><Button onClick={() => void downloadRegister('FILTERED STUDENT REGISTER', filtered, 'navstar-filtered-student-register.pdf')}>Download PDF</Button></div><div className="divide-y rounded-lg border">{filtered.map(student => <label key={student.id} className="flex items-center gap-3 p-3 text-sm"><input type="checkbox" checked={selectedIds.includes(student.id)} onChange={event => setSelectedIds(current => event.target.checked ? [...current, student.id] : current.filter(id => id !== student.id))}/><span className="min-w-0 flex-1"><strong>{student.name}</strong><span className="ml-2 text-xs text-slate-500">{student.email}</span></span><span className="text-xs text-slate-500">{courseName(student)}</span></label>)}</div><p className="text-xs text-slate-500">{selectedIds.length} students selected.</p></section>}

    {pageTitle === 'Manage Logins' && <section className="rounded-xl border bg-white text-slate-900"><div className="border-b bg-slate-50 p-4"><h3 className="font-bold">Student portal login directory</h3><p className="text-xs text-slate-500">Account IDs and status only. Passwords are never displayed.</p></div><div className="divide-y">{allStudents.map(student => <div key={student.id} className="flex items-center justify-between gap-3 p-4"><div><strong>{student.name}</strong><p className="text-xs text-slate-500">{student.staffId || 'ID pending'} · {student.email}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{student.status}</span></div>)}</div></section>}

    {pageTitle === 'Deleted Students & Recovery' && <section className="rounded-xl border bg-white p-5 text-slate-900"><h3 className="font-bold">Inactive student accounts</h3><p className="mt-1 text-sm text-slate-600">The current account service does not expose a soft-deleted archive or restore endpoint. This page therefore lists inactive accounts only; it does not label them as deleted.</p><div className="mt-4 divide-y rounded-lg border">{allStudents.filter(student => student.status.toLowerCase() !== 'active').map(student => <div key={student.id} className="p-3"><strong>{student.name}</strong><p className="text-xs text-slate-500">{student.email} · {student.status}</p></div>)}{allStudents.filter(student => student.status.toLowerCase() !== 'active').length === 0 && <p className="p-4 text-sm text-slate-500">No inactive student accounts found.</p>}</div></section>}

    {pageTitle === 'Enrollment Links' && <section className="space-y-3 rounded-xl border bg-white p-5 text-slate-900"><h3 className="font-bold">Public course enrollment links</h3><p className="text-sm text-slate-600">Applicants can open the official catalogue, select an available course and complete the public application.</p><div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-slate-50 p-4"><div><strong>Navstar course catalogue</strong><p className="text-xs text-slate-500">{courseLink}</p></div><Button variant="outline" onClick={() => navigator.clipboard.writeText(courseLink)}>Copy link</Button></div>{courses.map(course => <div key={course.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div><strong>{course.title}</strong><p className="text-xs text-slate-500">KSh {course.price.toLocaleString()} · {course.duration}</p></div><Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(courseLink)}>Copy catalogue link</Button></div>)}</section>}

    {pageTitle === 'Generate Bulk PDFs' && <section className="space-y-4 rounded-xl border bg-white p-5 text-slate-900"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">Bulk student document printing</h3><p className="text-xs text-slate-500">Selected from Students List PDF (Filters & Select).</p></div><Button onClick={() => void downloadRegister('SELECTED STUDENT RECORDS', selected, 'navstar-selected-student-records.pdf')} disabled={!selected.length}>Download {selected.length} selected as PDF</Button></div><div className="divide-y rounded-lg border">{selected.map(student => <div key={student.id} className="p-3"><strong>{student.name}</strong><p className="text-xs text-slate-500">{student.staffId || 'ID pending'} · {student.email}</p></div>)}{selected.length === 0 && <p className="p-5 text-sm text-slate-500">No students selected. Select students in the filtered list tab first.</p>}</div></section>}

    {pageTitle === 'Student Detail PDF' && <section className="space-y-4 rounded-xl border bg-white p-5 text-slate-900"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">Individual student profile document</h3><p className="text-xs text-slate-500">Select a student and print the visible profile summary.</p></div><Button onClick={() => detailStudent && void downloadNavstarTablePdf('STUDENT PROFILE', ['Field','Record'], [['Name',detailStudent.name],['Student ID',detailStudent.staffId || 'Not assigned'],['Email',detailStudent.email],['Phone',detailStudent.phone || 'Not recorded'],['Course',courseName(detailStudent)],['Status',detailStudent.status]], 'navstar-student-profile.pdf').catch(error => setPdfError(error instanceof Error ? error.message : 'The PDF could not be generated.'))} disabled={!detailStudent}>Download student PDF</Button></div><select value={detailId || detailStudent?.id || ''} onChange={event => setDetailId(event.target.value)} className="h-10 w-full max-w-md rounded-md border bg-white px-3 text-sm"><option value="">Select student</option>{allStudents.map(student => <option key={student.id} value={student.id}>{student.name} · {student.staffId || student.email}</option>)}</select>{detailStudent && <article className="mx-auto max-w-2xl rounded-xl border-2 border-blue-900 p-6"><div className="border-b-2 border-blue-900 pb-4 text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-blue-800">NAVSTAR DIGITAL HUB</p><h4 className="mt-1 text-xl font-black">STUDENT PROFILE</h4><p className="text-xs text-slate-500">HOME OF TECHNOCRATS</p></div><div className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><p><span className="text-slate-500">Name</span><br/><strong>{detailStudent.name}</strong></p><p><span className="text-slate-500">Student ID</span><br/><strong>{detailStudent.staffId || 'Not assigned'}</strong></p><p><span className="text-slate-500">Email</span><br/><strong>{detailStudent.email}</strong></p><p><span className="text-slate-500">Phone</span><br/><strong>{detailStudent.phone || 'Not recorded'}</strong></p><p><span className="text-slate-500">Course</span><br/><strong>{courseName(detailStudent)}</strong></p><p><span className="text-slate-500">Status</span><br/><strong>{detailStudent.status}</strong></p></div></article>}</section>}
  </div>;
}
