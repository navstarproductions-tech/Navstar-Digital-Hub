import { useEffect, useMemo, useState } from 'react';
import { FileDown, FileText, Search, RefreshCw, Wrench } from 'lucide-react';

type Course={id:string;title:string};
type Student={id:string;name:string;email:string;admission_number?:string;preferred_intake?:string};
type Report={id:string;report_card_no:string;period_label:string;public_token:string;status:string;course_id:string;snapshot_json:string;issued_at?:string;student_name?:string;course_title?:string};
type DocumentType='student-report'|'admin-report'|'student-transcript'|'admin-transcript';
type Scope='individual'|'intake'|'all';
const types:{id:DocumentType;title:string;description:string}[]=[{id:'admin-transcript',title:'Admin Transcript',description:'Grades-only administrative transcript. Unpublished internal record.'}];
const panel='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
const button='inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-900 to-cyan-700 px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50';
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
export function ReportCardsTranscriptsWorkspace({courses=[]}:{courses:Course[]}){
 const [courseId,setCourseId]=useState(courses[0]?.id||'');
 const [students,setStudents]=useState<Student[]>([]);
 const [studentId,setStudentId]=useState('');
 const [search,setSearch]=useState('');
 const [documentType,setDocumentType]=useState<DocumentType>('admin-transcript');
 const [scope,setScope]=useState<Scope>('individual');
 const [intake,setIntake]=useState('');
 const [repairing,setRepairing]=useState(false);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');
 const [generated,setGenerated]=useState<Report[]>([]);
 const [skipped,setSkipped]=useState(0);
 const [failed,setFailed]=useState(0);
 const [reports,setReports]=useState<Report[]>([]);
 const intakes=useMemo(()=>Array.from(new Set(students.map(s=>String(s.preferred_intake||'').trim()).filter(Boolean))).sort(),[students]);
 const filtered=useMemo(()=>students.filter(s=>(s.name+' '+s.email+' '+(s.admission_number||'')).toLowerCase().includes(search.toLowerCase())),[students,search]);
 const selectedStudent=students.find(s=>s.id===studentId);
 useEffect(()=>{if(courses.length&&!courses.some(c=>c.id===courseId))setCourseId(courses[0].id)},[courses,courseId]);
 useEffect(()=>{if(!courseId){setStudents([]);return;}fetch('/api/academic-workspace?action=students&courseId='+encodeURIComponent(courseId),{credentials:'same-origin'}).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error||'Could not load active students.');setStudents(j.students||[]);}).catch(e=>{setStudents([]);setNotice(e instanceof Error?e.message:'Could not load active students.');});},[courseId]);
 async function refreshReports(){const r=await fetch('/api/academic-workspace?action=report-cards',{credentials:'same-origin'});const j=await r.json();if(r.ok)setReports(j.reportCards||[]);}
 useEffect(()=>{void refreshReports().catch(()=>undefined)},[]);
 function printDocument(report:Report,targetWindow?:Window|null){
  let snap:any={};try{snap=typeof report.snapshot_json==='string'?JSON.parse(report.snapshot_json):report.snapshot_json||{}}catch{}
  const transcript=true;
  const admin=false;
  const no=transcript?String(report.report_card_no||'').replace(/^RC-/,'TR-'):report.report_card_no;
  const rows=(snap.results||[]).map((r:any,i:number)=>'<tr><td>'+ (i+1)+'</td><td>'+esc(r.code||'—')+'</td><td>'+esc(r.title||'—')+'</td>'+(transcript?'':'<td>'+Number(r.cat_score||0).toFixed(2)+'</td><td>'+Number(r.practical_score||0).toFixed(2)+'</td><td>'+Number(r.exam_score||0).toFixed(2)+'</td><td>'+Number(r.total_points||0).toFixed(2)+' / '+Number(r.max_points||0).toFixed(2)+'</td><td>'+(r.percentage==null?'—':Number(r.percentage).toFixed(1)+'%')+'</td>')+'<td>'+esc(r.grade||'—')+'</td><td>'+esc(r.remarks||'—')+'</td></tr>').join('');
  const headings='<th>#</th><th>Module code</th><th>Module / Unit</th>'+(transcript?'':'<th>CAT</th><th>Practical</th><th>Final</th><th>Total / Max</th><th>Percentage</th>')+'<th>Grade</th><th>Remarks</th>';
  const verify=report.status==='published'?'<p><b>Verification:</b> '+esc(location.origin+'/verify-result/'+report.public_token)+'</p>':'<p class="draft">DRAFT PREVIEW — NOT VALID UNTIL APPROVED AND PUBLISHED</p>';
  const student=snap.student||{},summary=snap.summary||{},attendance=snap.attendance||{};
  const main='<header><div><h1>NAVSTAR DIGITAL HUB</h1><b>HOME OF TECHNOCRATS</b><p>'+(transcript?'OFFICIAL ACADEMIC TRANSCRIPT':'OFFICIAL ACADEMIC REPORT CARD')+'</p></div><div><b>'+(transcript?'TRANSCRIPT NO: ':'REPORT CARD NO: ')+esc(no)+'</b>'+(transcript?'<p>Linked Report Card No: '+esc(report.report_card_no)+'</p>':'')+'<p>'+esc(report.period_label)+'</p>'+verify+'</div></header><div class="meta"><section><p><b>Student:</b> '+esc(student.name)+'</p><p><b>Admission No:</b> '+esc(student.admissionNumber)+'</p><p><b>Email:</b> '+esc(student.email)+'</p><p><b>Intake:</b> '+esc(student.intake)+'</p></section><section><p><b>Course:</b> '+esc(snap.course?.title)+'</p><p><b>Period:</b> '+esc(report.period_label)+'</p><p><b>Issued:</b> '+esc(report.issued_at||new Date().toISOString())+'</p></section></div><table><thead><tr>'+headings+'</tr></thead><tbody>'+rows+'</tbody></table><div class="meta"><section><b>'+(transcript?'Grade classification':'Performance summary')+'</b><p>Mean: '+(summary.mean==null?'—':Number(summary.mean).toFixed(1)+'%')+'</p><p>Published graded modules: '+(snap.results||[]).filter((r:any)=>r.result_status==='published').length+' / '+(snap.results||[]).length+'</p></section>'+(transcript?'':'<section><b>Grading scale</b><p>'+(snap.grading||[]).map((g:any)=>esc(g.grade)+' '+esc(g.min)+'–'+esc(g.max)).join(' · ')+'</p></section>')+'</div>'+(transcript?'':'<section><b>Tutor comments:</b> '+esc(snap.tutorComment||'')+'<p><b>Principal / Administrator comments:</b> '+esc(snap.principalComment||'')+'</p><p><b>Recommendation:</b> '+esc(snap.recommendation||'Pending academic review')+'</p><p><b>Attendance:</b> '+(Number(attendance.percentage||0).toFixed(1))+'% ('+Number(attendance.present||0)+' present, '+Number(attendance.late||0)+' late, '+Number(attendance.absent||0)+' absent)</p></section>')+'<footer>Navstar Digital Hub · Academic Records · '+(report.status==='published'?'Published official record':'Draft for internal review')+'</footer>';
  const adminPage=admin?'<div class="admin-page"><h1>ADMIN COPY — INTERNAL USE ONLY</h1><p>This page is not issued to the student.</p><div class="meta"><section><h3>FINANCIAL POSITION</h3><p>Fees: KSh '+Number(summary.fee||0).toLocaleString()+'</p><p>Paid: KSh '+Number(summary.paid||0).toLocaleString()+'</p><p>Balance: KSh '+Number(summary.balance||0).toLocaleString()+'</p><p>Payment completion: '+Number(summary.paymentPercentage||0).toFixed(1)+'%</p></section><section><h3>ATTENDANCE & FLAGS</h3><p>Attendance: '+Number(attendance.percentage||0).toFixed(1)+'%</p><p>Present: '+Number(attendance.present||0)+' · Late: '+Number(attendance.late||0)+' · Absent: '+Number(attendance.absent||0)+'</p><p>Academic status: '+esc(report.status)+'</p><p>Internal notes: '+esc(snap.principalComment||'None recorded')+'</p></section></div><h3>INTERNAL COMMENTS</h3><p>Tutor: '+esc(snap.tutorComment||'None recorded')+'</p><p>Administrator: '+esc(snap.principalComment||'None recorded')+'</p><p>Recommendation: '+esc(snap.recommendation||'Pending academic review')+'</p></div>':'';
  const w=targetWindow||window.open('','_blank','width=1000,height=1200');if(!w){setNotice('Please allow pop-ups to generate and download the PDF.');return;}
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+esc(no)+'</title><style>@page{size:A4;margin:12mm}body{font:11px Arial;color:#14213d}header{display:flex;justify-content:space-between;border-bottom:3px solid #087eaa;padding-bottom:12px}h1{font-size:20px;color:#082b59;margin:0}table{width:100%;border-collapse:collapse;margin:14px 0}th,td{border:1px solid #ccd6e2;padding:6px;text-align:left;font-size:9px}th{background:#eaf4fb}.meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0}section{border:1px solid #ccd6e2;padding:10px;margin:10px 0}.draft{color:#b45309;font-weight:bold}footer{margin-top:24px;border-top:1px solid #ccd6e2;padding-top:10px;font-size:9px}.admin-page{page-break-before:always;border:3px solid #b91c1c;padding:18px;color:#7f1d1d}.admin-page h1{color:#b91c1c;font-size:24px}.admin-page section{border-color:#fecaca}.admin-page h3{color:#991b1b}</style></head><body>'+main+adminPage+'<script>window.onload=()=>window.print()</script></body></html>');
  w.document.close();
 }
 async function generate(){
  if(!courseId){setNotice('Choose a course.');return;}
  let targets=scope==='individual'?students.filter(s=>s.id===studentId):scope==='intake'?students.filter(s=>s.preferred_intake===intake):students;
  if(scope==='individual'&&!studentId){setNotice('Select a student first.');return;}
  if(scope==='intake'&&!intake){setNotice('Select an intake first.');return;}
  if(!targets.length){setNotice('No active students match the selected generation scope.');return;}
  const printWindow=scope==='individual'?window.open('','_blank','width=1000,height=1200'):null;
  setBusy(true);setNotice('Generating documents for '+targets.length+' active student(s)…');setGenerated([]);setSkipped(0);setFailed(0);
  let skipCount=0,failCount=0;const ids:string[]=[];
  try{
   for(const student of targets){
    try{const r=await fetch('/api/academic-workspace',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'issue-report-card',studentId:student.id,courseId,periodLabel:student.preferred_intake||''})});const j=await r.json();if(r.ok&&j.id)ids.push(j.id);else if(r.status===409)skipCount++;else failCount++;}
    catch{failCount++;}
   }
   const list=await fetch('/api/academic-workspace?action=report-cards',{credentials:'same-origin'});const data=await list.json();const rows:Report[]=(data.reportCards||[]).filter((r:Report)=>ids.includes(r.id));
   setGenerated(rows);setSkipped(skipCount);setFailed(failCount);setReports(data.reportCards||[]);
   setNotice('Generation finished. '+rows.length+' document record(s) created; '+skipCount+' existing record(s) skipped; '+failCount+' failed. All generated records remain unpublished.');
   if(scope==='individual'&&rows[0])printDocument(rows[0],printWindow);else if(printWindow&&!printWindow.closed)printWindow.close();
  }catch(e){if(scope==='individual'&&typeof printWindow!=='undefined'&&printWindow&&!printWindow.closed)printWindow.close();setNotice(e instanceof Error?e.message:'Documents could not be generated.');}
  finally{setBusy(false);}
 }
 const activeType=types[0];
 return <div className="space-y-5">
  <section className={panel}>
   <div className="flex items-center gap-3"><FileText className="h-7 w-7 text-blue-800"/><div><p className="text-xs font-bold uppercase tracking-widest text-cyan-800">NAVSTAR DIGITAL HUB</p><h2 className="text-xl font-black">Admin Transcripts</h2></div></div>
   <p className="mt-2 text-sm text-slate-600">Generate grades-only administrative transcripts for active, accepted enrolments. The system uses each student's intake, not a manually entered reporting month. All generated records remain unpublished.</p>
   <div className="mt-5 grid gap-4 md:grid-cols-2">
    <label className="text-xs font-bold text-slate-700">Select Student
     <select value={studentId} onChange={e=>setStudentId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm"><option value="">Search and select a student</option>{filtered.map(s=><option key={s.id} value={s.id}>{s.name} · {s.admission_number||s.email}</option>)}</select>
     <div className="relative mt-2"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, admission number or email" className="w-full rounded-xl border p-2.5 pl-9 text-sm"/></div>
    </label>
    <label className="text-xs font-bold text-slate-700">Generate For
     <select value={scope} onChange={e=>setScope(e.target.value as Scope)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm"><option value="individual">Individual — the selected student</option><option value="intake">Selected intake — active students</option><option value="all">All active students in this course</option></select>
    </label>
    {scope==='intake'&&<label className="text-xs font-bold text-slate-700">Select Intake<select value={intake} onChange={e=>setIntake(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm"><option value="">Choose intake</option>{intakes.map(v=><option key={v} value={v}>{v}</option>)}</select></label>}
    <label className="text-xs font-bold text-slate-700">Course
     <select value={courseId} onChange={e=>setCourseId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm"><option value="">Select course</option>{courses.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select>
    </label>
   </div>
   <button onClick={()=>void generate()} disabled={busy||!courseId||(scope==='individual'&&!studentId)||(scope==='intake'&&!intake)} className={button+' mt-5'}><FileDown className="h-4 w-4"/>{busy?'Generating…':'Generate & Download PDF'}</button>
   <button onClick={()=>void (async()=>{setRepairing(true);try{const r=await fetch('/api/academic-workspace',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'repair-missing-intakes'})});const j=await r.json();setNotice(r.ok?(j.message+' Scanned: '+j.scanned+'; repaired: '+j.repaired+'; unresolved: '+j.unresolved+'.'):(j.error||'Intake repair failed.'));const s=await fetch('/api/academic-workspace?action=students&courseId='+encodeURIComponent(courseId),{credentials:'same-origin'});const d=await s.json();if(s.ok)setStudents(d.students||[]);}catch{setNotice('Intake repair failed.');}finally{setRepairing(false);}})()} disabled={repairing} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900"><Wrench className="h-4 w-4"/>{repairing?'Repairing intakes…':'Repair Missing Intakes'}</button>
   {notice&&<p role="status" className="mt-3 rounded-xl bg-blue-50 p-3 text-sm text-blue-950">{notice}</p>}
   <p className="mt-3 text-xs text-slate-500">Only active students with accepted enrolments are eligible. Existing records for the same student, course and intake are never overwritten.</p>
  </section>
  {(generated.length>0||reports.length>0)&&<section className={panel}>
   <div className="flex items-center justify-between gap-3"><h3 className="font-black">Generated documents</h3><button onClick={()=>void refreshReports()} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold"><RefreshCw className="h-3.5 w-3.5"/>Refresh</button></div>
   <div className="mt-3 space-y-2">{(generated.length?generated:reports).map(r=><article key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div><b className="text-sm">{r.report_card_no}</b><p className="text-xs text-slate-500">{r.student_name||'Student'} · {r.course_title||r.period_label} · {r.period_label} · {r.status}</p></div><button onClick={()=>printDocument(r)} className="rounded-lg border px-3 py-2 text-xs font-bold">Download selected PDF</button></article>)}</div>
  </section>}
 </div>;
}
