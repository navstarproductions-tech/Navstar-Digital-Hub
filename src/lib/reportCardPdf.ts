type Report = {report_card_no:string;period_label:string;status:string;snapshot_json?:string|object;snapshot?:any;issued_at?:string;student_name?:string;course_title?:string};
const n=(v:any)=>Number.isFinite(Number(v))?Number(v):0;
const safe=(v:any)=>String(v??'-').normalize('NFKD').replace(/[\\u0300-\\u036f]/g,'').replace(/[–—]/g,'-').replace(/[’‘]/g,"'").replace(/[“”]/g,'"').replace(/[^\\x20-\\x7E]/g,' ');
const esc=(v:any)=>safe(v).replace(/\\\\/g,'\\\\\\\\').replace(/\\(/g,'\\\\(').replace(/\\)/g,'\\\\)');
const wrap=(v:any,max:number)=>{const words=safe(v).split(/\\s+/);const lines:string[]=[];let line='';for(const word of words){if((line+' '+word).trim().length>max&&line){lines.push(line);line=word;}else line=(line+' '+word).trim();}if(line)lines.push(line);return lines.length?lines:['-'];};
const rgb=(hex:string)=>{const h=hex.replace('#','');return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v.toFixed(3)).join(' ');};
function pdfBlob(commands:string[]){const objs:string[]=[];const add=(s:string)=>{objs.push(s);return objs.length;};const root=add(''),pages=add(''),font=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),bold=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');const stream=commands.join('\\n');const content=add('<< /Length '+stream.length+' >>\\nstream\\n'+stream+'\\nendstream');const page=add('<< /Type /Page /Parent '+pages+' 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 '+font+' 0 R /F2 '+bold+' 0 R >> >> /Contents '+content+' 0 R >>');objs[root-1]='<< /Type /Catalog /Pages '+pages+' 0 R >>';objs[pages-1]='<< /Type /Pages /Kids ['+page+' 0 R] /Count 1 >>';let out='%PDF-1.4\\n',ofs=[0];objs.forEach((o,i)=>{ofs.push(out.length);out+=(i+1)+' 0 obj\\n'+o+'\\nendobj\\n';});const x=out.length;out+='xref\\n0 '+(objs.length+1)+'\\n0000000000 65535 f \\n';for(let i=1;i<ofs.length;i++)out+=String(ofs[i]).padStart(10,'0')+' 00000 n \\n';out+='trailer\\n<< /Size '+(objs.length+1)+' /Root '+root+' 0 R >>\\nstartxref\\n'+x+'\\n%%EOF';return new Blob([out],{type:'application/pdf'});}
function box(c:string[],x:number,y:number,w:number,h:number,hex:string){c.push('q '+rgb(hex)+' rg '+x+' '+y+' '+w+' '+h+' re f Q');}
function line(c:string[],x1:number,y1:number,x2:number,y2:number,hex='#D7E0EA'){c.push('q '+rgb(hex)+' RG .6 w '+x1+' '+y1+' m '+x2+' '+y2+' l S Q');}
function txt(c:string[],x:number,y:number,v:any,size=8,b=false,hex='#1A2C40'){c.push(rgb(hex)+' rg BT /'+(b?'F2':'F1')+' '+size+' Tf '+x+' '+y+' Td ('+esc(v)+') Tj ET');}
function fitLines(c:string[],x:number,y:number,items:any[],size=7,maxLines=2){items.slice(0,maxLines).forEach((it,i)=>txt(c,x,y-i*(size+2),it,size,false));}
export function downloadReportCardPdf(report:Report,options:{adminCopy?:boolean}={}){
 let snap:any={};try{const raw=report.snapshot_json??report.snapshot;snap=typeof raw==='string'?JSON.parse(raw):raw||{};}catch{}
 const admin=!!options.adminCopy,student=snap.student||{},summary=snap.summary||{},attendance=snap.attendance||{},settings=snap.reportCardSettings||{},results=Array.isArray(snap.results)?snap.results:[];
 const c:string[]=[];const W=595,H=842;
 // Navstar branded masthead
 box(c,0,748,W,94,'#0A2340');box(c,0,743,W,5,'#D4A63A');
 box(c,32,770,48,48,'#D4A63A');txt(c,42,788,'N',26,true,'#0A2340');txt(c,91,793,'NAVSTAR DIGITAL HUB',18,true,'#FFFFFF');txt(c,92,775,'HOME OF TECHNOCRATS',8,true,'#E6C36B');
 txt(c,355,793,admin?'ADMIN COPY':'ACADEMIC REPORT CARD',8,true,'#FFFFFF');txt(c,355,777,'Ref: '+report.report_card_no,8,false,'#FFFFFF');txt(c,355,761,'Period: '+report.period_label,8,false,'#FFFFFF');
 // School and student info
 txt(c,32,724,'STUDENT ACADEMIC REPORT',10,true,'#14527B');txt(c,32,709,'Institution / school: '+(snap.school?.name||snap.schoolName||settings.schoolName||'Navstar Digital Hub'),8,true);
 box(c,30,638,535,58,'#F0F5F9');txt(c,42,679,'STUDENT',6,true,'#557087');txt(c,42,661,student.name||report.student_name||'Student',10,true);
 txt(c,218,679,'ADMISSION NUMBER',6,true,'#557087');txt(c,218,661,student.admissionNumber||student.admission_number||'-',9,true);
 txt(c,365,679,'COURSE / CLASS',6,true,'#557087');txt(c,365,661,snap.course?.title||report.course_title||student.course||'-',8,true);
 txt(c,42,646,'INTAKE / TERM: '+(student.intake||report.period_label||'-'),7);txt(c,218,646,'ACADEMIC YEAR: '+(snap.academicYear||settings.year||'-'),7);txt(c,365,646,'STATUS: '+(report.status==='published'?'PUBLISHED':'DRAFT'),7,true,report.status==='published'?'#147047':'#9B6200');
 txt(c,32,619,'ACADEMIC PERFORMANCE',9,true,'#14527B');
 // Results table with fixed compact portrait columns
 const tableX=30,tableW=535,headerY=600,rowTop=581;box(c,tableX,headerY-17,tableW,19,'#123454');
 const colX=[34,61,224,274,322,370,421,469,511],headers=['#','MODULE / SUBJECT','CAT','PRACT.','FINAL','TOTAL','%','GRADE','REMARKS'];
 headers.forEach((h,i)=>txt(c,colX[i],headerY-11,h,6,true,'#FFFFFF'));
 const rowHeight=22,maxRows=Math.min(16,results.length||1);let y=rowTop;
 for(let i=0;i<maxRows;i++){const r=results[i]||{title:'No module results available'};const incomplete=r.result_status!=='published';const mark=(v)=>v==null||(incomplete&&Number(v)===0)?'MM':n(v).toFixed(1);
 const values=[i+1,r.title||r.module_name||'-',mark(r.cat_score),mark(r.practical_score),mark(r.exam_score),r.total_points==null||(incomplete&&Number(r.total_points)===0)?'MM':n(r.total_points).toFixed(1),r.percentage==null?'MM':n(r.percentage).toFixed(1),incomplete?'MM':r.grade||'MM',r.remarks||''];
 if(i%2===0)box(c,tableX,y-rowHeight+3,tableW,rowHeight,'#F5F8FB');
 values.forEach((v,j)=>{const max=[3,23,5,5,5,5,5,4,10][j];const lines=wrap(v,max);fitLines(c,colX[j],y-9,lines,5.7,2);});
 line(c,tableX,y-rowHeight+3,tableX+tableW,y-rowHeight+3);y-=rowHeight;
 }
 if(results.length>16)txt(c,34,y-3,'Additional modules omitted from this one-page summary: '+(results.length-16),6,false,'#8B5C00');
 y-=12;
 // Summary band
 box(c,30,y-43,535,42,'#EAF2F8');txt(c,42,y-16,'PERFORMANCE SUMMARY',7,true,'#14527B');txt(c,42,y-32,'Mean: '+(summary.mean==null?'MM':n(summary.mean).toFixed(1)+'%'),8,true);txt(c,205,y-32,'Published modules: '+results.filter((r:any)=>r.result_status==='published').length+'/'+results.length,7,true);txt(c,390,y-32,'Attendance: '+(attendance.percentage==null?'MM':n(attendance.percentage).toFixed(1)+'%'),7,true);y-=58;
 // fees, attendance
 txt(c,32,y,'FEES & ATTENDANCE',8,true,'#14527B');txt(c,32,y-14,'Fee: KSh '+n(summary.fee).toLocaleString('en-KE')+'   Paid: KSh '+n(summary.paid).toLocaleString('en-KE')+'   Balance: KSh '+n(summary.balance).toLocaleString('en-KE'),7);txt(c,32,y-28,'Present: '+n(attendance.present)+'   Late: '+n(attendance.late)+'   Absent: '+n(attendance.absent)+'   Excused: '+n(attendance.excused),7);y-=45;
 // Comments
 box(c,30,y-48,535,44,'#F5F8FB');txt(c,42,y-15,'TUTOR / CLASS TEACHER COMMENT',6.5,true,'#14527B');fitLines(c,42,y-29,wrap(snap.tutorComment||snap.teacherComment||'No comment recorded',84),7,2);txt(c,315,y-15,'ADMINISTRATOR COMMENT',6.5,true,'#14527B');fitLines(c,315,y-29,wrap(snap.principalComment||snap.adminComment||'No comment recorded',44),7,2);y-=60;
 // Sign-off and footer
 txt(c,32,y,'TUTOR SIGNATURE: ______________________',7,true);txt(c,320,y,'ADMIN SIGNATURE: ______________________',7,true);y-=24;txt(c,32,y,'PARENT / GUARDIAN: ___________________',7,true);txt(c,320,y,'DATE: _______________________________',7,true);
 box(c,0,0,W,35,'#0A2340');txt(c,32,21,'NAVSTAR DIGITAL HUB  •  HOME OF TECHNOCRATS',7,true,'#FFFFFF');txt(c,350,21,(admin?'CONFIDENTIAL ADMIN COPY':'STUDENT COPY')+'  |  '+(report.status==='published'?'OFFICIAL':'UNPUBLISHED'),6,true,'#E6C36B');txt(c,32,9,'Generated '+(report.issued_at||new Date().toISOString()),5.5,false,'#D6E0EA');
 const blob=pdfBlob(c),url=URL.createObjectURL(blob),a=document.createElement('a');const name=safe(student.name||report.student_name||'student').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'student';a.href=url;a.download=name+'-'+safe(report.report_card_no).replace(/[^a-zA-Z0-9-]/g,'-')+(admin?'-admin':'')+'-report-card.pdf';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}