import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CertificateManagementWorkspace } from '@/components/CertificateManagementWorkspace';
import { CertificateTemplateStudio } from '@/components/CertificateTemplateStudio';

type AcademicRecord = { user_id: string; course_id: string; student_name?: string; course_title: string; status: string; completed_at?: string | null };
type Learner = { id: string; name: string; email: string; course_id: string; course_title: string };
type Certificate = { id: string; certificateNo: string; publicToken: string; status: string; issuedAt: string; studentName: string; studentId?: string; courseTitle: string };
type AcademicData = { graduation: AcademicRecord[]; learners: Learner[]; reportCards: any[]; assessmentResults: any[]; examRuntimeAttempts: any[]; courses: any[] };
type AuditRecord = { id: string; action: string; entity_type: string; entity_id: string; created_at: string; actor_name?: string };
const panel = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
const title = 'text-lg font-extrabold text-slate-950';
const muted = 'text-sm text-slate-500';

const tabs = [
  'Dashboard','Merit List — Promote to Complete','Graduation List — Complete → Graduate',
  'Graduate Serial Processing','Certificate Management','Document Access Control',
  'Certificate Templates','Academic Documents','Student Records','Examination Records',
  'QR Auth Center','Digital Signatures','Reports & Analytics','Audit Logs','Certificate Settings'
];

export function CertificateAdminTabs({ selectedTab }: { selectedTab: string }) {
  const [academic,setAcademic] = useState<AcademicData>({graduation:[],learners:[],reportCards:[],assessmentResults:[],examRuntimeAttempts:[],courses:[]});
  const [certificates,setCertificates] = useState<Certificate[]>([]);
  const [audit,setAudit] = useState<AuditRecord[]>([]);
  const [settings,setSettings] = useState<Record<string,any>>({});
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState('');
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [filter,setFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [a,c,s,l] = await Promise.all([
        fetch('/api/academic',{credentials:'same-origin',cache:'no-store'}),
        fetch('/api/admin/certificates',{credentials:'same-origin',cache:'no-store'}),
        fetch('/api/admin/certificate-settings',{credentials:'same-origin',cache:'no-store'}),
        fetch('/api/admin/certificate-audit',{credentials:'same-origin',cache:'no-store'})
      ]);
      const [ad,cd,sd,ld] = await Promise.all([a.json(),c.json(),s.json(),l.json()]);
      if(!a.ok) throw new Error(ad.error || 'Academic records could not be loaded.');
      if(!c.ok) throw new Error(cd.error || 'Certificate records could not be loaded.');
      setAcademic({...ad,graduation:ad.graduation||[],learners:ad.learners||[],reportCards:ad.reportCards||[],assessmentResults:ad.assessmentResults||[],examRuntimeAttempts:ad.examRuntimeAttempts||[],courses:ad.courses||[]});
      setCertificates(cd.certificates||[]);
      if(s.ok) setSettings(sd.settings||{});
      if(l.ok) setAudit(ld.logs||[]);
    } catch(e) { setError(e instanceof Error?e.message:'The certificate workspace could not be loaded.'); }
    finally { setLoading(false); }
  },[]);
  useEffect(()=>{void load();},[load]);

  const setStatus = async (record: AcademicRecord,status:'eligible'|'graduated') => {
    const key=record.user_id+'|'+record.course_id;
    setBusy(key);setError('');setNotice('');
    try {
      const response=await fetch('/api/academic',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'set_graduation_status',studentId:record.user_id,courseId:record.course_id,status})});
      const result=await response.json();
      if(!response.ok) throw new Error(result.error||'The graduation status could not be saved.');
      setNotice(status==='eligible'?'Student promoted to the completion list.':'Student marked as graduated.');
      await load();
    } catch(e) { setError(e instanceof Error?e.message:'The graduation status could not be saved.'); }
    finally { setBusy(''); }
  };

  const saveSettings = async () => {
    setBusy('settings');setError('');setNotice('');
    try {
      const response=await fetch('/api/admin/certificate-settings',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({settings})});
      const result=await response.json();
      if(!response.ok) throw new Error(result.error||'Certificate settings could not be saved.');
      setSettings(result.settings||settings);setNotice('Certificate settings saved.');
    } catch(e) { setError(e instanceof Error?e.message:'Certificate settings could not be saved.'); }
    finally { setBusy(''); }
  };

  const visibleGraduates = useMemo(()=>academic.graduation.filter(r=>[r.student_name,r.course_title,r.status].join(' ').toLowerCase().includes(filter.toLowerCase())),[academic.graduation,filter]);
  const eligible = academic.graduation.filter(r=>r.status==='eligible');
  const candidates = academic.graduation.filter(r=>r.status==='candidate'||r.status==='deferred');
  const graduated = academic.graduation.filter(r=>r.status==='graduated');
  const issued = certificates.filter(c=>c.status==='issued');
  const revoked = certificates.filter(c=>c.status!=='issued');

  const Header = ({heading,description}:{heading:string;description:string}) => <div className={panel}><p className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-800">NAVSTAR · CERTIFICATE ADMINISTRATION</p><h2 className={title+' mt-1'}>{heading}</h2><p className={muted+' mt-1'}>{description}</p></div>;
  const Search = () => <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Search by graduate, course or status…" className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 sm:max-w-sm"/>;
  const Empty = ({children}:{children:string}) => <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{children}</div>;
  const RecordsTable = ({rows,action}:{rows:AcademicRecord[];action?:'eligible'|'graduated'}) => <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Student</th><th className="p-3">Course</th><th className="p-3">Status</th><th className="p-3">Completion date</th>{action&&<th className="p-3">Action</th>}</tr></thead><tbody>{rows.map(r=><tr key={r.user_id+'|'+r.course_id} className="border-t"><td className="p-3 font-semibold text-slate-900">{r.student_name||r.user_id}</td><td className="p-3">{r.course_title}</td><td className="p-3"><span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-800">{r.status}</span></td><td className="p-3">{r.completed_at?new Date(r.completed_at).toLocaleDateString('en-KE'):'—'}</td>{action&&<td className="p-3"><Button size="sm" disabled={!!busy} onClick={()=>void setStatus(r,action)}>{busy===r.user_id+'|'+r.course_id?'Saving…':action==='eligible'?'Promote to Complete':'Complete → Graduate'}</Button></td>}</tr>)}</tbody></table></div>;

  if(selectedTab==='Certificate Management') return <CertificateManagementWorkspace/>;
  if(selectedTab==='Certificate Templates') return <CertificateTemplateStudio/>;

  return <div className="space-y-5 text-slate-900">
    {error&&<p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice&&<p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-700">NAVSTAR · ACADEMIC AWARDS</p><h2 className="text-xl font-black text-slate-950">{selectedTab}</h2></div><Button size="sm" variant="outline" disabled={loading} onClick={()=>void load()}>{loading?'Refreshing…':'Refresh records'}</Button></div>

    {selectedTab==='Dashboard'&&<>
      <Header heading="Certificate & Graduation Dashboard" description="A live overview of student completion, graduation decisions, issued certificates and verification status."/>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
        ['Graduation records',academic.graduation.length],['Merit / completion candidates',candidates.length],['Eligible to graduate',eligible.length],['Graduated',graduated.length],['Certificates issued',issued.length],['Revoked certificates',revoked.length],['Academic documents',academic.reportCards.length],['Examination results',academic.assessmentResults.length]
      ].map(([label,value])=><div key={String(label)} className={panel}><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-3xl font-black text-slate-950">{loading?'—':value}</p></div>)}</div>
      <div className={panel}><h3 className="font-bold">Recent certificate activity</h3>{certificates.length?<div className="mt-3 divide-y">{certificates.slice(0,6).map(c=><div key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><span className="font-semibold">{c.studentName} · {c.courseTitle}</span><span className="font-mono text-xs">{c.certificateNo}</span></div>)}</div>:<Empty>No certificates have been issued yet.</Empty>}</div>
    </>}

    {selectedTab==='Merit List — Promote to Complete'&&<>
      <Header heading="Merit List" description="Review students already marked as completion candidates or deferred, then promote approved records to the Complete / Eligible stage. Each decision is saved to the academic graduation register."/>
      <Search/>{loading?<Empty>Loading merit list…</Empty>:candidates.length?<RecordsTable rows={visibleGraduates.filter(r=>r.status==='candidate'||r.status==='deferred')} action="eligible"/>:<Empty>No candidate records are waiting for merit-list review. Record a Candidate status in the academic graduation register first.</Empty>}
    </>}

    {selectedTab==='Graduation List — Complete → Graduate'&&<>
      <Header heading="Graduation List" description="This list contains students who have completed the required stage and are eligible for graduation. Confirm the final decision to move a student to Graduated."/>
      <Search/>{loading?<Empty>Loading completion list…</Empty>:eligible.length?<RecordsTable rows={visibleGraduates.filter(r=>r.status==='eligible')} action="graduated"/>:<Empty>No eligible students are awaiting the final graduation decision.</Empty>}
    </>}

    {selectedTab==='Graduate Serial Processing'&&<>
      <Header heading="Graduate Serial Processing" description="Review permanent certificate serial allocation for graduates. Serial numbers are assigned atomically when a certificate is issued and are never regenerated by this screen."/>
      <div className={panel}><div className="grid gap-3 sm:grid-cols-3"><div><p className={muted}>Graduated learners</p><p className="text-2xl font-black">{graduated.length}</p></div><div><p className={muted}>Serials allocated</p><p className="text-2xl font-black">{certificates.length}</p></div><div><p className={muted}>Awaiting certificate</p><p className="text-2xl font-black">{Math.max(0,graduated.length-certificates.length)}</p></div></div></div>
      {certificates.length?<div className="overflow-x-auto rounded-xl border"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-xs uppercase"><tr><th className="p-3 text-left">Permanent serial</th><th className="p-3 text-left">Graduate</th><th className="p-3 text-left">Course</th><th className="p-3 text-left">Allocated</th><th className="p-3 text-left">Status</th></tr></thead><tbody>{certificates.map(c=><tr key={c.id} className="border-t"><td className="p-3 font-mono font-bold">{c.certificateNo}</td><td className="p-3">{c.studentName}</td><td className="p-3">{c.courseTitle}</td><td className="p-3">{new Date(c.issuedAt).toLocaleDateString('en-KE')}</td><td className="p-3">{c.status}</td></tr>)}</tbody></table></div>:<Empty>No graduate serials have been allocated. Serial numbers are created during certificate issuance.</Empty>}
    </>}

    {selectedTab==='Document Access Control'&&<>
      <Header heading="Document Access Control" description="Access boundaries for certificate and academic documents. Access is enforced by the server; this panel documents the current role permissions and does not expose private student files publicly."/>
      <div className={panel}><h3 className="font-bold">Access policy</h3><div className="mt-3 overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-xs uppercase"><tr><th className="p-3 text-left">Role</th><th className="p-3 text-left">Academic records</th><th className="p-3 text-left">Issue / revoke certificates</th><th className="p-3 text-left">Template settings</th><th className="p-3 text-left">Public verification</th></tr></thead><tbody>{[['Admin','Manage','Issue and revoke','Edit','Verify issued status'],['Principal','View permitted records','No issuance','View','Verify issued status'],['Student','Own records only','No','No','Verify issued status'],['Public','No private access','No','No','Verify using public token']].map(row=><tr key={row[0]} className="border-t">{row.map(cell=><td key={cell} className="p-3">{cell}</td>)}</tr>)}</tbody></table></div><p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Role permissions are enforced by the certificate and academic API endpoints. Changes to access roles must be made in Admin Access Control, not by changing this display.</p></div>
    </>}

    {selectedTab==='Academic Documents'&&<>
      <Header heading="Academic Documents Register" description="Browse issued report cards and completion certificates. Student-specific documents remain protected by portal authentication."/>
      <div className={panel}><h3 className="font-bold">Report cards ({academic.reportCards.length})</h3>{academic.reportCards.length?<div className="mt-3 overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-xs uppercase"><tr><th className="p-3 text-left">Student</th><th className="p-3 text-left">Course</th><th className="p-3 text-left">Period</th><th className="p-3 text-left">Issued</th></tr></thead><tbody>{academic.reportCards.map((r:any)=><tr key={r.id} className="border-t"><td className="p-3">{r.student_name||r.user_id}</td><td className="p-3">{r.course_title}</td><td className="p-3">{r.period_label}</td><td className="p-3">{r.issued_at?new Date(r.issued_at).toLocaleDateString('en-KE'):'—'}</td></tr>)}</tbody></table></div>:<Empty>No academic report cards are available.</Empty>}</div>
      <div className={panel}><h3 className="font-bold">Completion certificates ({certificates.length})</h3>{certificates.length?<p className="mt-2 text-sm text-slate-600">Certificate records are managed in the Certificate Management tab. {issued.length} are currently valid and {revoked.length} are revoked.</p>:<Empty>No completion certificates have been issued.</Empty>}</div>
    </>}

    {selectedTab==='Student Records'&&<>
      <Header heading="Student Records" description="Students enrolled in active courses, linked to their course records and graduation decisions."/>
      <Search/>{academic.learners.length?<div className="overflow-x-auto rounded-xl border"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-xs uppercase"><tr><th className="p-3 text-left">Student</th><th className="p-3 text-left">Email</th><th className="p-3 text-left">Course</th><th className="p-3 text-left">Graduation status</th></tr></thead><tbody>{academic.learners.filter(r=>[r.name,r.email,r.course_title].join(' ').toLowerCase().includes(filter.toLowerCase())).map(r=><tr key={r.id+'|'+r.course_id} className="border-t"><td className="p-3 font-semibold">{r.name}</td><td className="p-3">{r.email}</td><td className="p-3">{r.course_title}</td><td className="p-3">{academic.graduation.find(g=>g.user_id===r.id&&g.course_id===r.course_id)?.status||'Not assessed'}</td></tr>)}</tbody></table></div>:<Empty>No active student-course records were returned by the academic service.</Empty>}
    </>}

    {selectedTab==='Examination Records'&&<>
      <Header heading="Examination Records" description="Assessment results and online examination attempts used for academic review. Only published assessment results are returned to the certificate administration workspace."/>
      <div className="grid gap-3 sm:grid-cols-3"><div className={panel}><p className={muted}>Assessment results</p><p className="text-2xl font-black">{academic.assessmentResults.length}</p></div><div className={panel}><p className={muted}>Online exam attempts</p><p className="text-2xl font-black">{academic.examRuntimeAttempts.length}</p></div><div className={panel}><p className={muted}>Courses</p><p className="text-2xl font-black">{academic.courses.length}</p></div></div>
      {academic.assessmentResults.length?<div className="overflow-x-auto rounded-xl border"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-xs uppercase"><tr><th className="p-3 text-left">Student</th><th className="p-3 text-left">Assessment</th><th className="p-3 text-left">Course</th><th className="p-3 text-left">Score</th></tr></thead><tbody>{academic.assessmentResults.map((r:any)=><tr key={r.id} className="border-t"><td className="p-3">{r.student_name}</td><td className="p-3">{r.assessment_title}</td><td className="p-3">{r.course_title}</td><td className="p-3">{r.points_awarded??'—'} / {r.max_points??r.paper_max_points??'—'}</td></tr>)}</tbody></table></div>:<Empty>No published examination results are available.</Empty>}
    </>}

    {selectedTab==='QR Auth Center'&&<>
      <Header heading="QR Authentication Centre" description="Public verification references for issued certificates. Each certificate has a permanent, unguessable verification token; revoked certificates remain identifiable as revoked."/>
      {certificates.length?<div className="grid gap-3 lg:grid-cols-2">{certificates.map(c=><article key={c.id} className={panel}><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-mono text-xs font-bold text-blue-800">{c.certificateNo}</p><h3 className="mt-1 font-bold">{c.studentName}</h3><p className={muted}>{c.courseTitle}</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold">{c.status}</span></div><p className="mt-3 break-all text-xs text-slate-500">{window.location.origin+'/verify-certificate/'+c.publicToken}</p><div className="mt-3 flex flex-wrap gap-2"><a className="rounded-lg border px-3 py-2 text-xs font-bold text-blue-800" href={'/verify-certificate/'+encodeURIComponent(c.publicToken)} target="_blank" rel="noreferrer">Open verification</a><Button size="sm" variant="outline" onClick={()=>void navigator.clipboard.writeText(window.location.origin+'/verify-certificate/'+c.publicToken)}>Copy verification URL</Button></div></article>)}</div>:<Empty>QR verification references will appear here after certificates are issued.</Empty>}
    </>}

    {selectedTab==='Digital Signatures'&&<>
      <Header heading="Digital Signatures & Seals" description="Manage the authorised signature artwork and official seal used on printed certificates. Upload and position artwork in Certificate Templates."/>
      <div className={panel}><h3 className="font-bold">Current signature artwork</h3>{settings.signatureUrl?<img src={settings.signatureUrl} alt="Saved certificate signature" className="mt-3 max-h-28 max-w-xs object-contain"/>:<Empty>No signature artwork has been uploaded yet.</Empty>}<h3 className="mt-5 font-bold">Current official seal</h3>{settings.sealUrl?<img src={settings.sealUrl} alt="Saved certificate seal" className="mt-3 max-h-28 max-w-xs object-contain"/>:<p className={muted+' mt-2'}>No custom seal artwork is saved; the certificate print layout uses the Navstar official seal fallback.</p>}<p className="mt-4 text-xs text-slate-500">To upload or replace these assets, open the Certificate Templates tab.</p></div>
    </>}

    {selectedTab==='Reports & Analytics'&&<>
      <Header heading="Reports & Analytics" description="Live totals for graduation progress, document issuance and examination activity."/>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['Candidates',candidates.length],['Eligible',eligible.length],['Graduated',graduated.length],['Certificates issued',issued.length],['Revoked',revoked.length],['Report cards',academic.reportCards.length],['Assessment results',academic.assessmentResults.length],['Exam attempts',academic.examRuntimeAttempts.length]].map(([label,value])=><div key={String(label)} className={panel}><p className={muted}>{label}</p><p className="mt-2 text-3xl font-black">{loading?'—':value}</p></div>)}</div>
      <div className={panel}><h3 className="font-bold">Graduation pipeline</h3>{[['Candidate / deferred',candidates.length],['Eligible to graduate',eligible.length],['Graduated',graduated.length]].map(([label,value])=><div key={String(label)} className="mt-3"><div className="flex justify-between text-xs"><span>{label}</span><b>{value}</b></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-700" style={{width:academic.graduation.length?Math.min(100,Number(value)/academic.graduation.length*100)+'%':'0%'}}/></div></div>)}</div>
    </>}

    {selectedTab==='Audit Logs'&&<>
      <Header heading="Certificate Audit Logs" description="Administrative events affecting certificate settings and certificate issuance or revocation. Entries are read from the central audit log."/>
      {audit.length?<div className="overflow-x-auto rounded-xl border"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-xs uppercase"><tr><th className="p-3 text-left">Time</th><th className="p-3 text-left">Actor</th><th className="p-3 text-left">Action</th><th className="p-3 text-left">Record</th></tr></thead><tbody>{audit.map(a=><tr key={a.id} className="border-t"><td className="p-3">{a.created_at?new Date(a.created_at).toLocaleString('en-KE'):'—'}</td><td className="p-3">{a.actor_name||'Admin'}</td><td className="p-3 font-semibold">{a.action}</td><td className="p-3">{a.entity_type} · {a.entity_id}</td></tr>)}</tbody></table></div>:<Empty>No certificate audit entries were returned. Refresh after issuing a certificate or changing its template.</Empty>}
    </>}

    {selectedTab==='Certificate Settings'&&<>
      <Header heading="Certificate Settings" description="Control default certificate presentation and which official details appear on newly printed documents. Design artwork and wording remain in Certificate Templates."/>
      <div className={panel}><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1 text-sm font-semibold">Default page orientation<select value={settings.orientation||'landscape'} onChange={e=>setSettings(s=>({...s,orientation:e.target.value}))} className="h-10 w-full rounded-lg border bg-white px-3"><option value="landscape">A4 Landscape</option><option value="portrait">A4 Portrait</option></select></label><div className="space-y-3">{[['showLogo','Show institution logo'],['showSeal','Show official seal'],['showCertificateNumber','Show permanent serial number'],['showVerificationUrl','Show public verification URL'],['showIssueDate','Show issue date'],['showStudentId','Show student ID']].map(([key,label])=><label key={String(key)} className="flex items-center justify-between gap-3 text-sm"><span>{label}</span><input type="checkbox" checked={settings[String(key)]!==false} onChange={e=>setSettings(s=>({...s,[String(key)]:e.target.checked}))} className="h-4 w-4 accent-blue-800"/></label>)}</div></div><Button className="mt-5" disabled={busy==='settings'} onClick={()=>void saveSettings()}>{busy==='settings'?'Saving…':'Save certificate settings'}</Button></div>
    </>}
    {loading&&<p className="text-xs text-slate-500">Loading live certificate and academic records…</p>}
  </div>;
}
