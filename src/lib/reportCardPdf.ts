type Report = {report_card_no:string;period_label:string;status:string;snapshot_json?:string|object;snapshot?:any;issued_at?:string;student_name?:string;course_title?:string};
type Options={adminCopy?:boolean;documentType?:'report-card'|'transcript'};

const esc=(v:any)=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]||ch));
const n=(v:any)=>Number.isFinite(Number(v))?Number(v):0;
const money=(v:any)=>'KES '+n(v).toLocaleString('en-KE',{maximumFractionDigits:2});
const safeUrl=(v:any)=>{const s=String(v||'').trim();return /^(https?:\/\/|\/api\/storage\/)/i.test(s)?s:'';};
const gradeName=(grade:any,grading:any[])=>grading.find(g=>String(g.grade)===String(grade))?.classification||grading.find(g=>String(g.grade)===String(grade))?.remarks||'';
function systemComments(results:any[],mean:number|null){
 const total=results.length,complete=results.filter(r=>r.result_status==='published'&&r.percentage!==null&&r.percentage!==undefined).length,missing=total-complete;
 const failed=results.filter(r=>String(r.grade||'').toUpperCase()==='F').length;
 let tutor='';
 if(!total)tutor='No modules are registered for this programme yet. The academic record will be updated when modules and assessments are available.';
 else if(missing)tutor='The learner has completed '+complete+' of '+total+' module assessments. Outstanding marks remain in '+missing+' module(s); complete and verify the missing CAT, practical or final components before final classification.';
 else if(mean===null)tutor='Assessment marks have not yet been recorded. Enter the verified marks for each module to calculate the academic outcome.';
 else if(mean>=80)tutor='Excellent overall performance. The learner demonstrates strong understanding and consistent achievement across the completed modules.';
 else if(mean>=70)tutor='Very good performance. The learner demonstrates sound technical understanding and should maintain this standard while strengthening weaker areas.';
 else if(mean>=60)tutor='Competent performance. The learner has met the expected standard in the assessed modules and should continue improving accuracy and consistency.';
 else if(mean>=50)tutor='Satisfactory progress. Additional guided practice and revision are recommended to strengthen understanding and practical application.';
 else tutor='The current results indicate that further support, revision and supervised practice are needed before the required competency standard is achieved.';
 let principal='';
 if(missing)principal='This report remains INCOMPLETE because '+missing+' module(s) have outstanding assessment components. The final academic classification and graduation decision must wait until all required marks are verified.';
 else if(!total)principal='No module results are available for an academic decision.';
 else if(failed)principal='The learner has '+failed+' module(s) below the pass threshold. A review and any required reassessment must be completed before graduation clearance.';
 else principal='All '+total+' module(s) have recorded results. The overall mean is '+(mean===null?'not available':mean.toFixed(1)+'%')+'. The academic record is complete and may proceed to the institution’s final graduation clearance review.';
 const recommendation=!total?'PENDING — No module results are available.':missing?'NOT RECOMMENDED FOR GRADUATION — '+missing+' module(s) have outstanding marks.':failed?'NOT RECOMMENDED FOR GRADUATION — '+failed+' module(s) require a pass or approved reassessment.':'ELIGIBLE FOR GRADUATION REVIEW — All modules have complete results and no failing grade is recorded.';
 return {tutor,principal,recommendation,complete,missing,failed};
}
function documentHtml(report:Report,options:Options){
 let snap:any={};try{const raw=report.snapshot_json??report.snapshot;snap=typeof raw==='string'?JSON.parse(raw):raw||{};}catch{}
 const student=snap.student||{},course=snap.course||{},summary=snap.summary||{},attendance=snap.attendance||{},settings=snap.reportCardSettings||{},grading=Array.isArray(snap.grading)?snap.grading:[],results=Array.isArray(snap.results)?snap.results:[];
 const transcript=options.documentType==='transcript',admin=!!options.adminCopy;
 const meanValues=results.filter(r=>r.percentage!==null&&r.percentage!==undefined&&Number.isFinite(Number(r.percentage))).map(r=>Number(r.percentage));
 const mean=meanValues.length?meanValues.reduce((a,b)=>a+b,0)/meanValues.length:null;
 const comments=systemComments(results,mean);
 const completed=comments.complete,total=results.length;
 const issueDate=new Date(report.issued_at||Date.now()).toLocaleDateString('en-KE',{day:'2-digit',month:'long',year:'numeric'});
 const logo='/Navstar_Official_Logo.jpg',photo=safeUrl(student.profilePhotoUrl||student.profile_photo_url||student.photoUrl);
 const headers='<th style="width:4%">#</th><th style="width:9%">Code</th><th style="width:28%">Module Title</th><th>CAT</th><th>Practical</th><th>Final</th><th>Total</th><th>Grade</th><th>Remarks</th>';
 const rows=results.map((r:any,i:number)=>{
  const missing=(v:any)=>v===null||v===undefined||v==='';
  const mark=(v:any)=>missing(v)?'<span class="missing">MM</span>':n(v).toFixed(2).replace(/\.00$/,'');
  const incomplete=r.result_status!=='published'||missing(r.percentage);
  return '<tr><td class="center">'+(i+1)+'</td><td class="code">'+esc(r.code||r.module_code||'—')+'</td><td class="module">'+esc(r.title||r.module_name||'—')+'</td><td class="center">'+mark(r.cat_score)+'</td><td class="center">'+mark(r.practical_score)+'</td><td class="center">'+mark(r.exam_score)+'</td><td class="center">'+(missing(r.total_points)?'MM':n(r.total_points).toFixed(1))+'</td><td class="center grade '+(incomplete?'incomplete':'')+'">'+(incomplete?'I':esc(r.grade||'—'))+'</td><td>'+esc(r.remarks|| (incomplete?'Outstanding assessment marks':'—'))+'</td></tr>';
 }).join('');
 const missingRows=results.map((r:any,i:number)=>({r,i,missing:['CAT','Practical','Final Exam'].filter((label,j)=>{const key=['cat_score','practical_score','exam_score'][j];return r[key]===null||r[key]===undefined||r[key]==='';})})).filter(x=>x.missing.length);
 const pending=missingRows.map(x=>'<tr><td class="center">'+(x.i+1)+'</td><td class="code">'+esc(x.r.code||'—')+'</td><td>'+esc(x.r.title||'—')+'</td><td>'+esc(x.missing.join(', '))+'</td><td class="center incomplete">I</td></tr>').join('');
 const gradeRows=grading.map((g:any)=>'<tr><td class="center"><b>'+esc(g.grade)+'</b></td><td>'+esc(g.classification||g.remarks||gradeName(g.grade,grading)||'')+'</td><td class="center">'+esc(g.min)+'–'+esc(g.max)+'%</td></tr>').join('');
 const grade=mean===null?'—':(grading.find((g:any)=>mean>=Number(g.min??g.from??0)&&mean<=Number(g.max??g.to??100))?.grade||'—');
 const classification=gradeName(grade,grading)||'';
 const totalMarks=results.reduce((sum:any,r:any)=>sum+(r.total_points===null||r.total_points===undefined?0:n(r.total_points)),0);
 const system=t=>'<div class="comment"><b>'+esc(t)+'</b></div>';
 const verifyText=report.public_token?'Verification: '+new URL('/verify-result/'+report.public_token,window.location.origin).toString():'Reference: '+report.report_card_no;
 const studentInfo='<table class="identity"><tr><th>Student Name</th><td>'+esc(student.name||report.student_name||'—')+'</td><th>Reg. / Adm No</th><td>'+esc(student.admissionNumber||student.admission_number||'—')+'</td></tr><tr><th>Course / Programme</th><td>'+esc(course.title||report.course_title||'—')+'</td><th>Student ID</th><td>'+esc(student.studentId||student.id||'—')+'</td></tr><tr><th>Intake</th><td>'+esc(student.intake||report.period_label||'—')+'</td><th>Gender</th><td>'+esc(student.gender||'—')+'</td></tr><tr><th>Email</th><td>'+esc(student.email||'—')+'</td><th>Date of Birth</th><td>'+esc(student.dateOfBirth||student.date_of_birth||'—')+'</td></tr></table>';
 const tableTitle=transcript?'ACADEMIC TRANSCRIPT — MODULE RESULTS':'ACADEMIC PERFORMANCE — MODULE MARKS';
 const docTitle=transcript?'OFFICIAL ACADEMIC TRANSCRIPT':'ACADEMIC REPORT FORM';
 const summaryBlock='<div class="summary-grid"><section><h3>ACADEMIC SUMMARY</h3><table class="simple"><tr><th>Mean Score</th><td>'+ (mean===null?'—':mean.toFixed(1))+'</td></tr><tr><th>Overall %</th><td>'+(mean===null?'—':mean.toFixed(1)+'%')+'</td></tr><tr><th>Overall Grade</th><td>'+esc(grade)+'</td></tr><tr><th>Classification</th><td>'+esc(classification||'Pending')+'</td></tr><tr><th>Modules Completed</th><td>'+completed+' / '+total+'</td></tr>'+(admin&&!transcript?'<tr><th>Attendance</th><td>'+(attendance.percentage==null?'—':n(attendance.percentage).toFixed(1)+'%')+'</td></tr><tr><th>Fee Paid</th><td>'+money(summary.paid)+'</td></tr><tr><th>Balance</th><td>'+money(summary.balance)+'</td></tr>':'')+'</table></section><section><h3>GRADING SYSTEM</h3><table class="simple"><tr><th>Grade</th><th>Classification</th><th>Range</th></tr>'+gradeRows+'</table></section></div>';
 const commentsBlock=!transcript?'<section class="comment-section"><h3>TUTOR’S COMMENT</h3><p>'+esc(comments.tutor)+'</p><div class="signature-line">Trainer / Instructor <span>'+esc(issueDate)+'</span></div></section><section class="comment-section"><h3>PRINCIPAL’S COMMENT</h3><p>'+esc(comments.principal)+'</p><div class="signature-line">SIMIYU SIFUNA HARON <span>'+esc(issueDate)+'</span></div></section><section class="recommend"><h3>GRADUATION RECOMMENDATION</h3><p>'+esc(comments.recommendation)+'</p></section>':'<section class="comment-section"><h3>ACADEMIC RECORD STATEMENT</h3><p>This transcript presents the recorded module assessments for the stated programme and intake. Missing components are identified on the following page where applicable.</p></section>';
 const footer='<footer><b>“This is an official academic document of Navstar Digital Hub. Any alteration renders it invalid.”</b><br/>P.O. BOX 546-50200 BUNGOMA (K) | '+esc(report.report_card_no)+' | '+esc(issueDate)+'</footer>';
 return '<!doctype html><html><head><meta charset="utf-8"><title>'+esc(docTitle)+' — '+esc(student.name||report.student_name)+'</title><style>
 @page{size:A4 portrait;margin:8mm}*{box-sizing:border-box}html,body{margin:0;padding:0;color:#1b2b3a;font-family:Arial,Helvetica,sans-serif;font-size:9px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
 .page{width:194mm;min-height:281mm;position:relative;padding:0 0 15mm;page-break-after:always;break-after:page}.page:last-child{page-break-after:auto;break-after:auto}
 .brand{height:31mm;background:#203e60;color:#fff;display:grid;grid-template-columns:25mm 1fr 22mm;align-items:center;padding:4mm 5mm;gap:4mm;text-align:center}.brand img.logo{width:22mm;height:22mm;object-fit:contain;background:#fff}.brand h1{font-size:15px;letter-spacing:1px;margin:0 0 2mm}.brand p{font-size:7px;margin:1mm 0}.brand .tag{font-style:italic;margin-top:2mm}.qr{width:18mm;height:18mm;border:1px solid #fff;background:#fff;display:flex;align-items:center;justify-content:center;color:#203e60;font-weight:bold;font-size:7px;text-align:center}
 .doc-title{margin:4mm 0 2mm;background:#203e60;color:#fff;text-align:center;font-size:11px;font-weight:800;padding:2.5mm;letter-spacing:.4px}.refline{display:flex;justify-content:space-between;font-weight:bold;border-bottom:1px solid #aaa;padding:0 0 2mm;margin-bottom:3mm;font-size:8px}
 .student-block{display:grid;grid-template-columns:1fr 20mm;gap:2mm;align-items:stretch;margin-bottom:3mm}.identity{width:100%;border-collapse:collapse;font-size:8px}.identity th,.identity td{border:1px solid #c8cdd2;padding:2mm;text-align:left}.identity th{background:#f0f3f6;width:17%;white-space:nowrap}.identity td{font-weight:600;width:33%}.photo{width:20mm;height:25mm;object-fit:cover;border:1px solid #b8c0c8}
 .section-title{background:#203e60;color:#fff;font-weight:bold;padding:2mm 3mm;margin:3mm 0 0;font-size:9px}
 .marks{width:100%;border-collapse:collapse;table-layout:fixed;font-size:7.3px}.marks th{background:#e8edf2;font-size:7px;text-align:center}.marks th,.marks td{border:1px solid #c7ccd1;padding:1.7mm 1.2mm;vertical-align:middle}.marks td.module{font-weight:600;overflow-wrap:anywhere}.marks td.code{font-weight:bold;text-align:center}.center{text-align:center}.grade{font-weight:800;color:#17633f}.incomplete,.missing{color:#a45b16;font-weight:bold}.marks tfoot td{background:#edf1f5;font-weight:bold}
 .meanbar{margin:2mm 0 3mm;padding:2mm;background:#eaf2fa;text-align:center;font-weight:bold;color:#203e60;border:1px solid #c8d5e2}
 .summary-grid{display:grid;grid-template-columns:1fr 1fr;gap:3mm;margin-top:2mm}.summary-grid section{border:1px solid #c8cdd2}.summary-grid h3,.comment-section h3,.recommend h3{margin:0;background:#203e60;color:white;padding:2mm 3mm;font-size:8px}.simple{width:100%;border-collapse:collapse;font-size:7.4px}.simple th,.simple td{border-bottom:1px solid #d0d4d8;padding:1.5mm 2mm;text-align:left}.simple th{width:46%;background:#f3f5f7}.simple td{text-align:right;font-weight:bold}
 .comment-section{margin-top:3mm;border:1px solid #c7ccd1;min-height:21mm;position:relative}.comment-section p{margin:2mm 3mm;line-height:1.4;font-size:7.7px;min-height:7mm}.signature-line{display:flex;justify-content:flex-end;gap:20mm;padding:1mm 4mm 2mm;font-size:7px;font-weight:bold;color:#374b60}.signature-line span{font-weight:normal}.recommend{margin-top:3mm;border:1px solid #c7ccd1;background:#fff7f4}.recommend p{margin:2mm 3mm;font-size:8px;font-weight:bold;color:#8a3026}
 footer{position:absolute;bottom:0;left:0;right:0;background:#203e60;color:#fff;text-align:center;padding:3mm 2mm;font-size:7px;line-height:1.5}
 .pending-intro{font-size:9px;line-height:1.5;font-weight:600;margin:6mm 0}.pending{width:100%;border-collapse:collapse;font-size:8px}.pending th,.pending td{border:1px solid #c7ccd1;padding:3mm}.pending th{background:#e8edf2}.registrar{position:absolute;right:3mm;bottom:22mm;width:52mm;height:38mm;border:3px double #203e60;text-align:center;padding:3mm;color:#203e60;font-size:8px;font-weight:bold;line-height:1.5}
 @media screen{body{background:#e5e7eb;padding:10px}.page{background:white;margin:0 auto 14px;padding:0 8mm 15mm;box-shadow:0 2px 12px #0002;min-height:281mm}.brand{margin:0 -8mm}}
 @media print{body{background:white}.page{margin:0;padding:0 0 15mm;box-shadow:none}.brand{margin:0}.page:last-child{page-break-after:auto}}
 </style></head><body>
 <section class="page"><div class="brand"><img class="logo" src="'+logo+'" alt="Navstar official logo"/><div><h1>NAVSTAR DIGITAL HUB</h1><p>P.O. BOX 546-50200 BUNGOMA (K)</p><p>Tel: +254 (0) 797 688 576 | +254 (0) 706 637 485 | navstardigitalhub@gmail.com</p><p class="tag">Home of Technocrats</p></div><div class="qr">'+(report.public_token?'VERIFIED\nRECORD':'NAVSTAR\nACADEMIC')+'</div></div>
 <div class="doc-title">'+docTitle+'</div><div class="refline"><span>Document No: '+esc(report.report_card_no)+(transcript?' (Transcript)':'')+'</span><span>Generated: '+esc(issueDate)+'</span></div>
 <div class="student-block">'+studentInfo+(photo?'<img class="photo" src="'+esc(photo)+'" alt="Student photograph"/>':'<div class="photo"></div>')+'</div>
 <div class="section-title">'+tableTitle+'</div><table class="marks"><thead><tr>'+headers+'</tr></thead><tbody>'+rows+'</tbody><tfoot><tr><td colspan="6" style="text-align:right">TOTAL RECORDED MARKS:</td><td class="center">'+totalMarks.toFixed(1)+'</td><td class="center">'+completed+' / '+total+'</td><td></td></tr></tfoot></table>
 <div class="meanbar">MEAN SCORE: '+(mean===null?'—':mean.toFixed(1)+'%')+' &nbsp; • &nbsp; MEAN GRADE: '+esc(grade)+' — '+esc(classification||'Pending')+'</div>
 '+summaryBlock+commentsBlock+footer+'</section>
 <section class="page"><div class="brand"><img class="logo" src="'+logo+'" alt="Navstar official logo"/><div><h1>NAVSTAR DIGITAL HUB</h1><p>'+ (transcript?'ACADEMIC TRANSCRIPT — CONTINUED':'INCOMPLETE / MISSING MARKS')+'</p><p>'+esc(student.name||report.student_name||'Student')+' | '+esc(course.title||report.course_title||'Course')+' | Ref: '+esc(report.report_card_no)+'</p></div><div class="qr">ACADEMIC<br/>RECORD</div></div>
 <div class="doc-title">'+(transcript?'ACADEMIC RECORD DETAILS':'INCOMPLETE / MISSING MARKS — PENDING COMPONENTS')+'</div>
 <p class="pending-intro">'+(missingRows.length?'I (Incomplete) means one or more assessment components are not yet recorded. MM (Missing Marks) identifies a component with no mark. The outstanding items below must be completed before the final academic classification can be confirmed.':'All module components currently have recorded marks. No missing assessment components are listed.')+'</p>
 '+(missingRows.length?'<table class="pending"><thead><tr><th>S/N</th><th>Code</th><th>Module Title</th><th>Missing Components</th><th>Status</th></tr></thead><tbody>'+pending+'</tbody></table>':'<div class="meanbar">ALL '+total+' MODULES HAVE RECORDED MARKS</div>')+
 '<div class="registrar">OFFICE OF THE REGISTRAR<br/>NAVSTAR DIGITAL HUB<br/>P.O. BOX 546-50200<br/>BUNGOMA (K)<br/>'+esc(issueDate.toUpperCase())+'<br/>SIGN: __________________</div>'+footer+'</section>
 <script>window.addEventListener("load",()=>{const imgs=[...document.images];Promise.all(imgs.map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r}))).then(()=>setTimeout(()=>window.print(),500));});</script></body></html>';
}
export function downloadReportCardPdf(report:Report,options:Options={}){
 const html=documentHtml(report,options);
 const win=window.open('','_blank');
 if(!win){alert('Allow pop-ups for this site to print or save the academic document as a PDF.');return;}
 win.document.open();win.document.write(html);win.document.close();
}
