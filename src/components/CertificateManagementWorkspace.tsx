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
  const [template,setTemplate]=useState<Record<string,any>>({});

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
      try { const templateResponse=await fetch('/api/admin/certificate-settings',{credentials:'same-origin',cache:'no-store'}); if(templateResponse.ok){const templateData=await templateResponse.json();setTemplate(templateData.settings||{});} } catch {}
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
    const t=template;
    const verifyUrl=window.location.origin+'/verify-certificate/'+encodeURIComponent(certificate.publicToken);
    const academicRows=(Array.isArray(snapshot.academicResults)?snapshot.academicResults:[]).map((row:any,index:number)=>'<tr><td>'+(index+1)+'</td><td>'+escapeHtml(row.code||'—')+'</td><td>'+escapeHtml(row.title||'—')+'</td><td>'+(row.percentage===null||row.percentage===undefined?'—':Number(row.percentage).toFixed(1)+'%')+'</td><td>'+escapeHtml(row.grade||'—')+'</td><td>'+escapeHtml(row.remarks||'—')+'</td></tr>').join('');
    const gradingRows=(Array.isArray(snapshot.grading)?snapshot.grading:[]).map((grade:any)=>'<tr><td>'+escapeHtml(grade.grade)+'</td><td>'+escapeHtml(grade.min)+'–'+escapeHtml(grade.max)+'</td><td>'+escapeHtml(grade.remarks||'')+'</td></tr>').join('');
    const academicMean=snapshot.academicSummary?.mean===null||snapshot.academicSummary?.mean===undefined?'—':Number(snapshot.academicSummary.mean).toFixed(1)+'%';
    const reportCard=t.showCertificateNumber!==false&&snapshot.reportCardNo?'<div>Published Report Card: '+escapeHtml(snapshot.reportCardNo)+'</div>':'';
    const qr=t.showVerificationUrl!==false?'<img class="qr" src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data='+encodeURIComponent(verifyUrl)+'" alt="Certificate verification QR">':'';
    const w=window.open('','_blank','width=1100,height=850');
    if(!w){setNotice('Allow pop-ups to print the certificate.');return;}
    const landscape=t.orientation!=='portrait';
    const bg=t.backgroundUrl? 'background-image:url('+escapeHtml(t.backgroundUrl)+');background-size:cover;background-position:center;':'';
    const backBg=t.background2Url?'background-image:url('+escapeHtml(t.background2Url)+');':'';
    const backPage='<section class="back-page" style="'+backBg+'"><div class="back-wash"></div><div class="back-content"><div class="brand">'+escapeHtml(t.institutionName||'NAVSTAR DIGITAL HUB')+'</div><h2>OFFICIAL ACADEMIC RESULTS STATEMENT</h2><p><b>Graduate:</b> '+escapeHtml(snapshot.studentName||certificate.studentName)+' &nbsp; <b>Course:</b> '+escapeHtml(snapshot.courseTitle||certificate.courseTitle)+'</p><p><b>Certificate No.:</b> '+escapeHtml(certificate.certificateNo)+' &nbsp; <b>Published Report Card:</b> '+escapeHtml(snapshot.reportCardNo||'—')+'</p><table class="results"><thead><tr><th>No.</th><th>Module code</th><th>Module title</th><th>Mark</th><th>Grade</th><th>Remarks</th></tr></thead><tbody>'+academicRows+'</tbody></table><p><b>Mean mark:</b> '+academicMean+'</p><h3>Official grading scale</h3><table class="results"><thead><tr><th>Grade</th><th>Range</th><th>Classification</th></tr></thead><tbody>'+gradingRows+'</tbody></table><p class="verify">'+escapeHtml(t.footerText||'This academic statement is reproduced from the published, immutable Navstar report-card snapshot.')+'</p><p class="verify">Certificate verification: '+escapeHtml(verifyUrl)+'</p></div></section>'
    const logo=t.showLogo!==false&&t.logoUrl?'<img class="logo" src="'+escapeHtml(t.logoUrl)+'" alt="Institution logo">':'';
    const badge=t.badgeUrl?'<img class="badge" src="'+escapeHtml(t.badgeUrl)+'" alt="Award badge">':'';
    const seal=t.showSeal!==false?(t.sealUrl?'<img class="seal-img" src="'+escapeHtml(t.sealUrl)+'" alt="Institution seal">':'<div class="seal">NAVSTAR<br>OFFICIAL SEAL</div>'):'';
    const signature=t.signatureUrl?'<img class="signature-img" src="'+escapeHtml(t.signatureUrl)+'" alt="Authorised signature">':'';
    const studentId=t.showStudentId!==false&&certificate.studentId?'<div>Student ID: '+escapeHtml(certificate.studentId)+'</div>':'';
    const serial=t.showCertificateNumber!==false?'<div class="serial">Certificate No. '+escapeHtml(certificate.certificateNo)+'</div>':'';
    const issued=t.showIssueDate!==false?'<div>Issued: '+escapeHtml(new Date(certificate.issuedAt).toLocaleDateString('en-KE'))+'</div>':'';
    const verify=t.showVerificationUrl!==false?'<div class="verify">Verify: '+escapeHtml(verifyUrl)+'</div>'+qr:'';
    const statement=escapeHtml(t.statement||'For successfully completing the course of study in');
    const closing=escapeHtml(t.closingStatement||'and fulfilling the academic completion requirements of Navstar Digital Hub.');
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+escapeHtml(certificate.certificateNo)+'</title><style>@page{size:A4 '+(landscape?'landscape':'portrait')+';margin:8mm}*{box-sizing:border-box}body{font-family:Georgia,serif;color:'+escapeHtml(t.textColor||'#26364a')+';margin:0;padding:8px}.frame{border:8px double '+escapeHtml(t.accentColor||'#c79a2b')+';min-height:'+(landscape?'180mm':'265mm')+';padding:24px 42px;text-align:center;position:relative;'+bg+'}.wash{position:absolute;inset:0;background:rgba(255,255,255,.82)}.content{position:relative;z-index:1}.brandrow{display:flex;justify-content:center;align-items:center;gap:18px}.logo,.badge{max-width:100px;max-height:70px;object-fit:contain}.brand{font:700 12px Arial;letter-spacing:4px;color:'+escapeHtml(t.primaryColor||'#0a2447')+'}.motto{font:700 10px Arial;letter-spacing:3px;color:'+escapeHtml(t.accentColor||'#c79a2b')+';margin-top:5px}h1{font-size:34px;letter-spacing:2px;margin:24px 0 6px;color:'+escapeHtml(t.primaryColor||'#0a2447')+'}.sub{font:14px Arial;color:'+escapeHtml(t.textColor||'#52677e')+';letter-spacing:2px}.name{font-size:32px;font-weight:bold;color:'+escapeHtml(t.primaryColor||'#0b4778')+';border-bottom:1px solid '+escapeHtml(t.accentColor||'#c79a2b')+';display:inline-block;padding:10px 40px;margin:20px 0}.statement{font-size:18px;line-height:1.7;max-width:800px;margin:8px auto}.course{font-size:24px;font-weight:bold;color:'+escapeHtml(t.primaryColor||'#0a2447')+';margin:12px}.meta{display:flex;justify-content:space-between;align-items:end;margin-top:24px;font:11px Arial;color:'+escapeHtml(t.textColor||'#52677e')+'}.serial{font-weight:bold;color:'+escapeHtml(t.primaryColor||'#0a2447')+'}.verify{font-size:9px;color:'+escapeHtml(t.textColor||'#52677e')+';text-align:right;max-width:280px;overflow-wrap:anywhere}.qr{width:68px;height:68px;object-fit:contain}.results{width:100%;border-collapse:collapse;margin:14px 0;font:10px Arial}.results th,.results td{border:1px solid #ccd6e2;padding:7px;text-align:left}.results th{background:#eaf4fb}.signature{border-top:1px solid #334155;padding-top:7px;width:210px;font:11px Arial}.seal{border:2px solid '+escapeHtml(t.accentColor||'#c79a2b')+';border-radius:50%;width:82px;height:82px;display:flex;align-items:center;justify-content:center;font:700 9px Arial;color:'+escapeHtml(t.accentColor||'#a0781a')+';letter-spacing:1px}.seal-img{width:82px;height:82px;object-fit:contain}.signature-img{max-width:150px;max-height:54px;object-fit:contain}.footer{font:9px Arial;margin-top:18px}.back-page{page-break-before:always;break-before:page;min-height:'+(landscape?'180mm':'265mm')+';padding:24px;position:relative;text-align:center;background-size:cover;background-position:center;background-image:url('+escapeHtml(t.background2Url)+')}.back-wash{position:absolute;inset:0;background:rgba(255,255,255,.82)}.back-content{position:relative;z-index:1;padding:18mm 12mm}.back-content h2{margin:18px 0;color:'+escapeHtml(t.primaryColor||'#0a2447')+'}.back-content p{margin:12px auto;max-width:760px}</style></head><body><div class="frame"><div class="wash"></div><div class="content"><div class="brandrow">'+logo+'<div><div class="brand">'+escapeHtml(t.institutionName||'NAVSTAR DIGITAL HUB')+'</div><div class="motto">'+escapeHtml(t.motto||'HOME OF TECHNOCRATS')+'</div></div>'+badge+'</div><h1>'+escapeHtml(t.heading||'CERTIFICATE OF COMPLETION')+'</h1><div class="sub">'+escapeHtml(t.subheading||'THIS CERTIFICATE IS PROUDLY PRESENTED TO')+'</div><div class="name">'+escapeHtml(snapshot.studentName||certificate.studentName)+'</div>'+studentId+'<div class="statement">'+statement+'</div><div class="course">'+escapeHtml(snapshot.courseTitle||certificate.courseTitle)+'</div><div class="statement">'+closing+'</div><div class="meta"><div>'+signature+'<div class="signature">Authorised signature</div></div>'+seal+'<div>'+serial+issued+reportCard+verify+'</div></div><div class="footer">'+escapeHtml(t.footerText||'Verify this certificate using the official Navstar Digital Hub verification link.')+'</div></div></div>'+backPage+'<script>window.onload=()=>window.print()</script></body></html>');
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
