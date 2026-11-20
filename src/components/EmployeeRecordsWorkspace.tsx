import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CalendarCheck, FileLock2, RefreshCw, Upload } from 'lucide-react';

type Staff={id:string;name:string;email:string;role:string;status:string;staffId?:string;department?:string};
type Attendance={id:string;employeeUserId:string;employeeName:string;staffId?:string;attendanceDate:string;status:string;checkIn?:string;checkOut?:string;notes?:string};
type DocumentRow={id:string;employeeUserId:string;employeeName:string;staffId?:string;title:string;category:string;originalName:string;sizeBytes:number;createdAt:string;downloadUrl:string};

const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Nairobi',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const moneySize=(n:number)=>n<1024*1024?(n/1024).toFixed(0)+' KB':(n/1024/1024).toFixed(1)+' MB';

export function EmployeeRecordsWorkspace({mode}:{mode:'attendance'|'documents'}){
 const [staff,setStaff]=useState<Staff[]>([]),[attendance,setAttendance]=useState<Attendance[]>([]),[documents,setDocuments]=useState<DocumentRow[]>([]);
 const [employeeId,setEmployeeId]=useState(''),[date,setDate]=useState(today()),[status,setStatus]=useState('present'),[checkIn,setCheckIn]=useState(''),[checkOut,setCheckOut]=useState(''),[notes,setNotes]=useState('');
 const [title,setTitle]=useState(''),[category,setCategory]=useState('Employment'),[description,setDescription]=useState(''),[file,setFile]=useState<File|null>(null);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const load=async()=>{
  setError('');
  try{
   const [u,a,d]=await Promise.all([fetch('/api/admin/users'),fetch('/api/admin/employee-records?type=attendance'),fetch('/api/admin/employee-records?type=documents')]);
   const ud=await u.json(),ad=await a.json(),dd=await d.json();
   if(!u.ok)throw Error(ud.error||'Staff directory could not be loaded.');
   if(!a.ok)throw Error(ad.error||'Attendance register could not be loaded.');
   if(!d.ok)throw Error(dd.error||'Employee document register could not be loaded.');
   const employees=(ud.users||[]).filter((x:Staff)=>x.role!=='student');
   setStaff(employees);setAttendance(ad.attendance||[]);setDocuments(dd.documents||[]);
   if(!employeeId&&employees.length)setEmployeeId(employees[0].id);
  }catch(e){setError(e instanceof Error?e.message:'Employee records could not be loaded.');}
 };
 useEffect(()=>{void load();},[]);
 const filteredAttendance=useMemo(()=>attendance.filter(a=>a.attendanceDate===date),[attendance,date]);
 const saveAttendance=async(e:FormEvent)=>{
  e.preventDefault();setBusy(true);setNotice('');setError('');
  try{const r=await fetch('/api/admin/employee-records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({employeeId,date,status,checkIn,checkOut,notes})});const d=await r.json();if(!r.ok)throw Error(d.error||'Attendance could not be saved.');setNotice('Attendance record saved successfully.');await load();}
  catch(e){setError(e instanceof Error?e.message:'Attendance could not be saved.');}finally{setBusy(false);}
 };
 const uploadDocument=async(e:FormEvent)=>{
  e.preventDefault();if(!file||!employeeId){setError('Select an employee and choose a document first.');return;}
  setBusy(true);setNotice('');setError('');
  try{const fd=new FormData();fd.set('employeeId',employeeId);fd.set('title',title||file.name);fd.set('category',category);fd.set('description',description);fd.set('file',file);const r=await fetch('/api/admin/employee-records',{method:'POST',body:fd});const d=await r.json();if(!r.ok)throw Error(d.error||'Document upload failed.');setNotice('Employee document uploaded and securely stored.');setFile(null);setTitle('');setDescription('');await load();}
  catch(e){setError(e instanceof Error?e.message:'Document upload failed.');}finally{setBusy(false);}
 };
 return <section className="space-y-5">
  <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-[#071b3b] via-[#0b3470] to-[#087eaa] p-5 text-white shadow-lg sm:p-6">
   <div className="flex items-center gap-3"><img src="/Navstar_Official_Logo.jpg" alt="Navstar Digital Hub" className="h-12 w-20 rounded-lg bg-white object-contain p-1"/><div><p className="text-[10px] font-black uppercase tracking-[.22em] text-cyan-200">NAVSTAR DIGITAL HUB · HUMAN RESOURCES</p><h2 className="text-xl font-black">{mode==='attendance'?'Staff attendance register':'Employee document vault'}</h2><p className="text-xs font-semibold text-blue-100">HOME OF TECHNOCRATS</p></div></div>
   <p className="mt-4 max-w-3xl text-sm leading-6 text-blue-50">{mode==='attendance'?'Record and review daily staff attendance. One record per employee per date; corrections update the saved record and are audited.':'Store employment letters, contracts, certificates and other employee-specific files in private R2 storage, separate from public website downloads.'}</p>
  </div>
  {notice&&<p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{notice}</p>}
  {error&&<p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</p>}
  <div className="flex justify-end"><button type="button" onClick={()=>void load()} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs font-bold text-slate-700"><RefreshCw className="h-4 w-4"/>Refresh records</button></div>
  {mode==='attendance'?<>
   <form onSubmit={saveAttendance} className="grid gap-3 rounded-2xl border bg-white p-5 shadow-sm sm:grid-cols-2 xl:grid-cols-3">
    <div className="sm:col-span-2 xl:col-span-3"><h3 className="font-black text-slate-950">Record staff attendance</h3><p className="text-xs text-slate-500">Select an employee and date. Saving again for the same date updates that employee’s record.</p></div>
    <label className="text-xs font-bold text-slate-700">Employee<select required value={employeeId} onChange={e=>setEmployeeId(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">{staff.map(s=><option key={s.id} value={s.id}>{s.name} · {s.staffId||s.role}</option>)}</select></label>
    <label className="text-xs font-bold text-slate-700">Attendance date<input required type="date" value={date} onChange={e=>setDate(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"/></label>
    <label className="text-xs font-bold text-slate-700">Status<select value={status} onChange={e=>setStatus(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option><option value="leave">On leave</option></select></label>
    <label className="text-xs font-bold text-slate-700">Check-in time<input type="time" value={checkIn} onChange={e=>setCheckIn(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"/></label>
    <label className="text-xs font-bold text-slate-700">Check-out time<input type="time" value={checkOut} onChange={e=>setCheckOut(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"/></label>
    <label className="text-xs font-bold text-slate-700 sm:col-span-2">Notes<input value={notes} onChange={e=>setNotes(e.target.value)} maxLength={500} placeholder="Optional notes" className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"/></label>
    <div className="sm:col-span-2 xl:col-span-3"><button disabled={busy||!staff.length} className="rounded-xl bg-blue-800 px-5 py-3 text-sm font-black text-white shadow hover:bg-blue-900 disabled:opacity-50">{busy?'Saving attendance…':'Save attendance record'}</button></div>
   </form>
   <div className="overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="flex items-center justify-between border-b p-4"><div><h3 className="font-black text-slate-950">Saved attendance · {date}</h3><p className="text-xs text-slate-500">{filteredAttendance.length} saved records for this date</p></div><CalendarCheck className="h-6 w-6 text-blue-800"/></div><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Employee</th><th className="p-3">Staff ID</th><th className="p-3">Status</th><th className="p-3">Check-in</th><th className="p-3">Check-out</th><th className="p-3">Notes</th></tr></thead><tbody>{filteredAttendance.map(a=><tr key={a.id} className="border-t"><td className="p-3 font-bold">{a.employeeName}</td><td className="p-3">{a.staffId||'—'}</td><td className="p-3 capitalize">{a.status}</td><td className="p-3">{a.checkIn||'—'}</td><td className="p-3">{a.checkOut||'—'}</td><td className="p-3">{a.notes||'—'}</td></tr>)}{!filteredAttendance.length&&<tr><td colSpan={6} className="p-6 text-center text-slate-500">No attendance records have been saved for this date.</td></tr>}</tbody></table></div></div>
  </>:<>
   <form onSubmit={uploadDocument} className="grid gap-3 rounded-2xl border bg-white p-5 shadow-sm sm:grid-cols-2 xl:grid-cols-3">
    <div className="sm:col-span-2 xl:col-span-3"><h3 className="font-black text-slate-950">Upload employee document</h3><p className="text-xs text-slate-500">Private employee records are not published to the website downloads page. Maximum file size 15 MB.</p></div>
    <label className="text-xs font-bold text-slate-700">Employee<select required value={employeeId} onChange={e=>setEmployeeId(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">{staff.map(s=><option key={s.id} value={s.id}>{s.name} · {s.staffId||s.role}</option>)}</select></label>
    <label className="text-xs font-bold text-slate-700">Document title<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Employment contract" className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"/></label>
    <label className="text-xs font-bold text-slate-700">Category<select value={category} onChange={e=>setCategory(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option>Employment</option><option>Identity</option><option>Academic certificates</option><option>Training</option><option>Performance</option><option>Leave</option><option>Other</option></select></label>
    <label className="text-xs font-bold text-slate-700 sm:col-span-2">Description<input value={description} onChange={e=>setDescription(e.target.value)} maxLength={500} placeholder="Optional description" className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"/></label>
    <label className="text-xs font-bold text-slate-700 sm:col-span-2 xl:col-span-3">Select file<input required type="file" onChange={e=>setFile(e.target.files?.[0]||null)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-blue-800 file:px-3 file:py-2 file:font-bold file:text-white"/></label>
    <div className="sm:col-span-2 xl:col-span-3"><button disabled={busy||!staff.length||!file} className="inline-flex items-center gap-2 rounded-xl bg-blue-800 px-5 py-3 text-sm font-black text-white shadow hover:bg-blue-900 disabled:opacity-50"><Upload className="h-4 w-4"/>{busy?'Uploading…':'Upload to private employee file'}</button></div>
   </form>
   <div className="overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="flex items-center justify-between border-b p-4"><div><h3 className="font-black text-slate-950">Employee document register</h3><p className="text-xs text-slate-500">{documents.length} securely stored documents</p></div><FileLock2 className="h-6 w-6 text-blue-800"/></div><div className="divide-y">{documents.map(d=><div key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="font-bold text-slate-950">{d.title}</p><p className="mt-1 text-xs text-slate-500">{d.employeeName} · {d.staffId||'Staff'} · {d.category} · {d.originalName} · {moneySize(d.sizeBytes)}</p></div><a href={d.downloadUrl} className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-bold text-blue-800 hover:bg-blue-50">Download securely</a></div>)}{!documents.length&&<p className="p-6 text-center text-sm text-slate-500">No employee documents have been uploaded yet.</p>}</div></div>
  </>}
 </section>;
}
