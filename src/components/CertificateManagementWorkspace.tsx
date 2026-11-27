import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

type Graduate = { user_id: string; course_id: string; student_name: string; course_title: string; status: string; completed_at?: string | null; admission_number?: string | null };
type Certificate = { id: string; userId: string; courseId: string; certificateNo: string; publicToken: string; status: string; issuedAt: string; studentName: string; studentId?: string; courseTitle: string; snapshot: Record<string,unknown> };
const panel='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
const escapeHtml=(value:unknown)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]||char));

export function CertificateManagementWorkspace() {
  const [graduates,setGraduates]=useState<Graduate[]>([]);
  const [certificates,setCertificates]=useState<Certificate[]>([]);
  const [selected,setSelected]=useState('');
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  const load=async()=>{
    setLoading(true);setError('');
    try{
      const [academicResponse,certificateResponse]=await Promise.all([
        fetch('/api/academic',{credentials:'same-origin',cache:'no-store'}),
        fetch('/api/admin/certificates',{credentials:'same-origin',cache:'no-store'})
      ]);
      const [academic,certificateData]=await Promise.all([academicResponse.json(),certificateResponse.json()]);
      if(!academicResponse.ok)throw new Error(academic.error||'Graduation records could not be loaded.');
      if(!certificateResponse.ok)throw new Error(certificateData.error||'Certificate register could not be loaded.');
      setGraduates((academic.graduation||[]).filter((row:Graduate)=>row.status==='graduated'));
      setCertificates(certificateData.certificates||[]);
    }catch(cause){setError(cause instanceof Error?cause.message:'Certificate records could not be loaded.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{void load();},[]);

  const issue=async()=>{
    if(!selected){setError('Select a graduated student and course.');return;}
    const [studentId,courseId]=selected.split('|');
    if(!studentId||!courseId){setError('Select a valid graduation record.');return;}
    if(!window.confirm('Issue a permanent Navstar completion certificate for this graduated student?'))return;
    setBusy(true);setError('');setNotice('');
    try{
      const response=await fetch('/api/admin/certificates',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({studentId,courseId})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'Certificate could not be issued.');
      setNotice('Certificate '+result.certificateNo+' issued successfully. The student has received an in-app notification.');
      setSelected('');
      await load();
    }catch(cause){setError(cause instanceof Error?cause.message:'Certificate could not be issued.');}
    finally{setBusy(false);}
  };

  const revoke=async(certificate:Certificate)=>{
    const reason=window.prompt('Enter the reason for revoking certificate '+certificate.certificateNo+'.');
    if(!reason||reason.trim().length<5)return;
    if(!window.confirm('Revoke this certificate? Its public verification will become invalid.'))return;
    setBusy(true);setError('');setNotice('');
    try{
      const response=await fetch('/api/admin/certificates',{method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:certificate.id,action:'revoke',reason:reason.trim()})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'Certificate could not be revoked.');
      setNotice('Certificate '+certificate.certificateNo+' has been revoked and its verification status is now invalid.');
      await load();
    }catch(cause){setError(cause instanceof Error?cause.message:'Certificate could not be revoked.');}
    finally{setBusy(false);}
  };

  const print=(certificate:Certificate)=>{
    const snapshot=certificate.snapshot||{};
    const verifyUrl=window.location.origin+'/verify-certificate/'+encodeURIComponent(certificate.publicToken);
    const academicRows=(Array.isArray(snapshot.academicResults)?snapshot.academicResults:[]).map((row:any,index:number)=>'<tr><td>'+(index+1)+'</td><td>'+escapeHtml(row.code||'—')+'</td><td>'+escapeHtml(row.title||'—')+'</td><td>'+(row.percentage===null||row.percentage===undefined?'—':Number(row.percentage).toFixed(1)+'%')+'</td><td>'+escapeHtml(row.grade||'—')+'</td><td>'+escapeHtml(row.remarks||'—')+'</td></tr>').join('');
    const academicMean=snapshot.academicSummary?.mean===null||snapshot.academicSummary?.mean===undefined?'—':Number(snapshot.academicSummary.mean).toFixed(1)+'%';
    const gradingRows=(Array.isArray(snapshot.grading)?snapshot.grading:[]).map((grade:any)=>'<tr><td>'+escapeHtml(grade.grade)+'</td><td>'+escapeHtml(grade.min)+'–'+escapeHtml(grade.max)+'</td><td>'+escapeHtml(grade.remarks||'')+'</td></tr>').join('');
    const w=window.open('','_blank','width=1100,height=850');
    if(!w){setNotice('Allow pop-ups to print the certificate.');return;}
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+escapeHtml(certificate.certificateNo)+'</title><style>@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font-family:Georgia,serif;color:#0a2447;margin:0;padding:18px}.frame{border:8px double #c79a2b;min-height:175mm;padding:24px 42px;text-align:center;position:relative}.brand{font:700 12px Arial;letter-spacing:4px;color:#0a477a}.motto{font:700 10px Arial;letter-spacing:3px;color:#b38725;margin-top:5px}h1{font-size:34px;letter-spacing:2px;margin:24px 0 6px;color:#0a2447}.sub{font:14px Arial;color:#52677e;letter-spacing:2px}.name{font-size:32px;font-weight:bold;color:#0b4778;border-bottom:1px solid #c79a2b;display:inline-block;padding:10px 40px;margin:20px 0}.statement{font-size:18px;line-height:1.7;max-width:800px;margin:8px auto}.course{font-size:24px;font-weight:bold;color:#0a2447;margin:12px}.meta{display:flex;justify-content:space-between;align-items:end;margin-top:24px;font:11px Arial;color:#52677e}.serial{font-weight:bold;color:#0a2447}.verify{font-size:9px;color:#52677e;text-align:right;max-width:280px;overflow-wrap:anywhere}.page-break{break-before:page;page-break-before:always;padding:20px 12px}.results{width:100%;border-collapse:collapse;margin:16px 0;font:10px Arial}.results th,.results td{border:1px solid #ccd6e2;padding:7px;text-align:left}.results th{background:#eaf4fb}.academic-title{font:700 22px Arial;color:#0a2447;border-bottom:3px solid #c79a2b;padding-bottom:10px}.signature{border-top:1px solid #334155;padding-top:7px;width:210px;font:11px Arial}.seal{border:2px solid #c79a2b;border-radius:50%;width:82px;height:82px;display:flex;align-items:center;justify-content:center;font:700 9px Arial;color:#a0781a;letter-spacing:1px}</style></head><body><div class="frame"><div class="brand">NAVSTAR DIGITAL HUB</div><div class="motto">HOME OF TECHNOCRATS</div><h1>CERTIFICATE OF COMPLETION</h1><div class="sub">THIS CERTIFICATE IS PROUDLY PRESENTED TO</div><div class="name">'+escapeHtml(snapshot.studentName)+'</div><div class="statement">For successfully completing the course of study in</div><div class="course">'+escapeHtml(snapshot.courseTitle)+'</div><div class="statement">and fulfilling the academic completion requirements of Navstar Digital Hub.</div><div class="meta"><div><div class="signature">Authorised signature</div></div><div class="seal">NAVSTAR<br/>DIGITAL HUB</div><div><div class="serial">Certificate No. '+escapeHtml(certificate.certificateNo)+'</div><div>Report Card: '+escapeHtml(snapshot.reportCardNo||'—')+'</div><div>Issued: '+escapeHtml(new Date(certificate.issuedAt).toLocaleDateString('en-KE'))+'</div><div class="verify">Verify: '+escapeHtml(verifyUrl)+'</div><img width="68" height="68" alt="Certificate verification QR" src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data='+encodeURIComponent(verifyUrl)+'"/></div></div></div><section class="page-break"><div class="brand">NAVSTAR DIGITAL HUB · OFFICIAL ACADEMIC RECORD</div><h2 class="academic-title">Academic Results Statement</h2><p><b>Graduate:</b> '+escapeHtml(certificate.studentName)+' &nbsp; <b>Course:</b> '+escapeHtml(certificate.courseTitle)+'</p><p><b>Certificate:</b> '+escapeHtml(certificate.certificateNo)+' &nbsp; <b>Published Report Card:</b> '+escapeHtml(snapshot.reportCardNo||'—')+'</p><table class="results"><thead><tr><th>No.</th><th>Module code</th><th>Module title</th><th>Mark</th><th>Grade</th><th>Remarks</th></tr></thead><tbody>'+academicRows+'</tbody></table><p><b>Mean mark:</b> '+academicMean+'</p><h3>Official grading scale</h3><table class="results"><thead><tr><th>Grade</th><th>Range</th><th>Classification</th></tr></thead><tbody>'+gradingRows+'</tbody></table><p class="verify">This academic statement is reproduced from the published, immutable report-card snapshot. Verify the certificate using the QR code on page one.</p></section><script>window.onload=()=>window.print()</script></body></html>');
    w.document.close();
  };

  const available=graduates.filter(graduate=>!certificates.some(certificate=>certificate.userId===graduate.user_id&&certificate.courseId===graduate.course_id));
  return <div className="space-y-5 text-slate-900">
    <header className="rounded-2xl bg-gradient-to-r from-[#071a35] via-blue-950 to-[#16477e] p-5 text-white"><p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">NAVSTAR · ACADEMIC AWARDS</p><h2 className="mt-1 text-2xl font-black">Certificates & Verification</h2><p className="mt-1 text-sm text-blue-100">Issue permanent course-completion certificates only after a Graduated decision has been recorded for an accepted student enrolment.</p><div className="mt-4 flex flex-wrap gap-3 text-sm"><span>{graduates.length} graduated records</span><span>·</span><span>{certificates.length} certificates issued</span><span>·</span><span>{available.length} eligible for issuance</span></div></header>
    {error&&<p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice&&<p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <section className={panel}><h3 className="font-bold">Issue completion certificate</h3><p className="mt-1 text-sm text-slate-500">The certificate number and verification token are generated by the system. A student can receive only one certificate per course.</p><div className="mt-3 flex flex-wrap items-end gap-3"><label className="min-w-[260px] flex-1 text-xs font-bold">Graduated student<select className="mt-1 h-11 w-full rounded-lg border bg-white px-3 text-sm font-normal" value={selected} onChange={event=>setSelected(event.target.value)}><option value="">Select eligible graduate</option>{available.map(graduate=><option key={graduate.user_id+'|'+graduate.course_id} value={graduate.user_id+'|'+graduate.course_id}>{graduate.student_name} · {graduate.course_title}</option>)}</select></label><Button disabled={busy||!selected} onClick={()=>void issue()}>{busy?'Issuing…':'Issue certificate'}</Button></div>{!graduates.length&&!loading&&<p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">No student has a Graduated decision yet. Record the graduation status under Student Management → Completed → Graduates first.</p>}</section>
    <section className={panel}><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">Certificate register</h3><p className="mt-1 text-xs text-slate-500">Permanent serial numbers and public verification links.</p></div><Button size="sm" variant="outline" disabled={loading} onClick={()=>void load()}>Refresh</Button></div><div className="mt-3 overflow-x-auto rounded-lg border"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Certificate no.</th><th className="p-3">Student</th><th className="p-3">Course</th><th className="p-3">Issued</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead><tbody>{certificates.map(certificate=><tr key={certificate.id} className="border-t"><td className="p-3 font-mono text-xs font-bold">{certificate.certificateNo}</td><td className="p-3">{certificate.studentName}<span className="block text-xs text-slate-500">{certificate.studentId||''}</span></td><td className="p-3">{certificate.courseTitle}</td><td className="p-3">{new Date(certificate.issuedAt).toLocaleDateString('en-KE')}</td><td className="p-3"><span className={certificate.status==='issued'?'rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700':'rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700'}>{certificate.status}</span></td><td className="p-3"><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>print(certificate)}>Print / Save PDF</Button><a className="rounded-lg border px-3 py-2 text-xs font-bold text-blue-800" href={'/verify-certificate/'+encodeURIComponent(certificate.publicToken)} target="_blank" rel="noreferrer">Verify</a>{certificate.status==='issued'&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>void revoke(certificate)}>Revoke</Button>}</div></td></tr>)}{!loading&&certificates.length===0&&<tr><td colSpan={6} className="p-6 text-center text-sm text-slate-500">No completion certificates have been issued yet.</td></tr>}</tbody></table></div></section>
  </div>;
}
