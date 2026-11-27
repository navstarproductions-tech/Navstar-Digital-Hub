import { useEffect,useRef,useState } from 'react';
type Exam={id:string;title:string;course_id:string;course_title?:string;instructions?:string;starts_at?:string|null;due_at?:string|null;duration_minutes?:number;max_points:number;max_attempts?:number;pass_mark?:number;status:string;require_admin_approval?:number;approval_status?:string;strict_time_limit?:number};
type Question={id:string;questionText:string;questionType:string;options:string[];points:number};
export function StudentExamRunner({exams,attempts=[]}:{exams:Exam[];attempts?:any[]}){
 const [examId,setExamId]=useState(''),[questions,setQuestions]=useState<Question[]>([]),[answers,setAnswers]=useState<Record<string,any>>({}),[attempt,setAttempt]=useState(''),[attemptNumber,setAttemptNumber]=useState(0),[expires,setExpires]=useState(''),[index,setIndex]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[remaining,setRemaining]=useState(''),[security,setSecurity]=useState<Record<string,boolean>>({});
 const submittingRef=useRef(false),autoSubmitRef=useRef(false);
 const selected=exams.find(x=>x.id===examId),question=questions[index];
 const selectedAttempts=selected?attempts.filter(item=>item.assessment_id===selected.id):[];
 const activeAttempt=selectedAttempts.find(item=>item.status==='in_progress');
 const attemptLimit=Math.max(1,Number(selected?.max_attempts||1));
 const isUpcoming=Boolean(selected?.starts_at&&Date.parse(selected.starts_at)>Date.now());
 const isClosed=Boolean(selected?.due_at&&Date.parse(selected.due_at)<Date.now());
 const attemptsExhausted=selectedAttempts.length>=attemptLimit&&!activeAttempt;
 const approvalPending=Boolean(selected?.require_admin_approval)&&selected?.approval_status!=='approved';
 const approvalRejected=selected?.approval_status==='rejected';
 useEffect(()=>{if(!exams.length){setExamId('');return;}if(!examId||!exams.some(x=>x.id===examId))setExamId(exams[0].id);},[exams,examId]);
 useEffect(()=>{if(!attempt||!expires)return;const update=()=>{const ms=Math.max(0,Date.parse(expires)-Date.now());setRemaining(Math.floor(ms/60000)+'m '+Math.floor((ms%60000)/1000)+'s');};update();const timer=window.setInterval(update,1000);return()=>window.clearInterval(timer);},[attempt,expires]);
 const start=async()=>{
  if(!selected)return;setBusy(true);setError('');setMessage('');
  try{
   const preflight=await fetch('/api/exam-questions?assessmentId='+encodeURIComponent(selected.id),{credentials:'same-origin',cache:'no-store'});
   const paper=await preflight.json();if(!preflight.ok)throw new Error(paper.error||'Question paper unavailable.');
   if(Number(paper.questionCount||0)<1)throw new Error('This examination has no questions yet. Contact your tutor or administrator.');
   const sr=await fetch('/api/exam-questions',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'start_runtime',assessmentId:selected.id})});
   const sj=await sr.json();if(!sr.ok)throw new Error(sj.error||'Examination could not be started.');
   const qr=await fetch('/api/exam-questions?assessmentId='+encodeURIComponent(selected.id)+'&attemptId='+encodeURIComponent(sj.attemptId),{credentials:'same-origin',cache:'no-store'});
   const qj=await qr.json();if(!qr.ok)throw new Error(qj.error||'The examination could not be resumed.');
   setQuestions(qj.questions||[]);setSecurity(qj.securitySettings||{});setAttempt(sj.attemptId);setAttemptNumber(Number(sj.attemptNumber||1));setExpires(sj.expiresAt);setIndex(0);setAnswers(qj.savedAnswers||{});autoSubmitRef.current=false;submittingRef.current=false;
   setMessage(sj.resumed?'Your previous examination attempt has been restored. Continue from where you left off.':'Your examination has started. Your answers are saved automatically as you work.');
  }catch(e){setError(e instanceof Error?e.message:'Unable to start examination.');}finally{setBusy(false);}
 };
 const submit=async()=>{
  if(!selected||!attempt||submittingRef.current)return;submittingRef.current=true;setBusy(true);setError('');
  try{
   const r=await fetch('/api/exam-questions',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'submit_runtime',assessmentId:selected.id,attemptId:attempt,answers:questions.map(q=>({questionId:q.id,answer:answers[q.id]??null}))})});
   const j=await r.json();if(!r.ok)throw new Error(j.error||'Answers could not be submitted.');
   setMessage((j.autoMarked?'Submitted. Objective score: '+j.objectiveScore+'.':'Submitted. Objective items were auto-marked; written answers require tutor/admin marking.')+(j.negativeDeductions>0?' Negative-mark deduction: '+j.negativeDeductions+'.':''));
   setAttempt('');setExpires('');setQuestions([]);setAnswers({});setAttemptNumber(0);
  }catch(e){setError(e instanceof Error?e.message:'Submission failed.');}
  finally{setBusy(false);submittingRef.current=false;}
 };
 const saveAnswer=(questionId:string,value:any)=>setAnswers(current=>({...current,[questionId]:value}));
 useEffect(()=>{
  if(!attempt||!selected||!Object.keys(answers).length)return;
  let live=true;const timer=window.setTimeout(()=>{void fetch('/api/exam-questions',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save_runtime_answers',assessmentId:selected.id,attemptId:attempt,answers:questions.map(q=>({questionId:q.id,answer:answers[q.id]??null}))})}).then(async response=>{const result=await response.json().catch(()=>({}));if(live&&!response.ok)setMessage(result.error||'Some answers could not be autosaved. Submit before the timer expires.');}).catch(()=>{if(live)setMessage('Connection interrupted. Your latest answers may not be saved yet; reconnect and submit before time expires.');});},450);
  return()=>{live=false;window.clearTimeout(timer);};
 },[answers,attempt,selected?.id,questions]);
 useEffect(()=>{if(!attempt||!expires||!remaining)return;const ms=Date.parse(expires)-Date.now();if(ms<=3000&&!autoSubmitRef.current&&!submittingRef.current){autoSubmitRef.current=true;setMessage('Time is almost over. Navstar is submitting your saved answers automatically.');void submit();}},[remaining,attempt,expires]);
 const violation=(kind:string)=>{if(!attempt||!selected)return;void fetch('/api/exam-questions',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'report_violation',assessmentId:selected.id,attemptId:attempt,kind})}).catch(()=>undefined);};
 useEffect(()=>{
  if(!attempt)return;
  const onBlur=()=>{if(security.blockAppSwitching||security.lockTabSwitching||security.flagForReview)violation('window_blur');};
  const onVisibility=()=>{if(document.hidden&&(security.blockAppSwitching||security.lockTabSwitching||security.flagForReview)){violation('tab_hidden');if(security.pauseOnViolation)setMessage('A focus change has been flagged for tutor review. The server timer continues while you are away; return to the exam promptly.');}};
  const block=(e:Event)=>e.preventDefault();
  const key=(e:KeyboardEvent)=>{if((security.killShortcuts||security.blockCopying||security.blockPasting)&&(e.ctrlKey||e.metaKey)&&['c','x','v','s','p','u'].includes(e.key.toLowerCase())){e.preventDefault();violation('restricted_shortcut');}};
  const unload=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='Your examination is in progress.';};
  if(security.disableRightClick)document.addEventListener('contextmenu',block);
  if(security.blockCopying)document.addEventListener('copy',block);
  if(security.blockPasting)document.addEventListener('paste',block);
  if(security.killShortcuts||security.blockCopying||security.blockPasting)document.addEventListener('keydown',key);
  if(security.blockDragging)document.addEventListener('dragstart',block);
  if(security.blockReload)window.addEventListener('beforeunload',unload);
  window.addEventListener('blur',onBlur);document.addEventListener('visibilitychange',onVisibility);
  return()=>{document.removeEventListener('contextmenu',block);document.removeEventListener('copy',block);document.removeEventListener('paste',block);document.removeEventListener('keydown',key);document.removeEventListener('dragstart',block);window.removeEventListener('beforeunload',unload);window.removeEventListener('blur',onBlur);document.removeEventListener('visibilitychange',onVisibility);};
 },[attempt,examId,security]);
 if(!exams.length)return <section className="rounded-2xl border bg-white p-5"><h3 className="font-black">Online tests & examinations</h3><p className="mt-2 text-sm text-slate-500">No published examination is currently available for your enrolled courses.</p></section>;
 return <section className={'space-y-3 rounded-2xl border bg-white p-5 '+(security.freezeTextSelection?'select-none':'')}>
  <div><h3 className="text-lg font-black">Online tests & examinations</h3><p className="text-sm text-slate-600">Choose an open paper, review its rules and complete the timed questions. Your answers are autosaved while you work.</p></div>
  {error&&<p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
  {message&&<p role="status" className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">{message}</p>}
  {!attempt?<div className="space-y-3">
   <div className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-black text-slate-900">Available examination papers</h4><span className="text-xs font-semibold text-slate-500">{exams.length} paper(s)</span></div>{exams.map(paper=>{const paperAttempts=attempts.filter(item=>item.assessment_id===paper.id);const used=paperAttempts.length;const limit=Math.max(1,Number(paper.max_attempts||1));const upcoming=Boolean(paper.starts_at&&Date.parse(paper.starts_at)>Date.now());const closed=Boolean(paper.due_at&&Date.parse(paper.due_at)<Date.now());const waiting=Boolean(paper.require_admin_approval)&&paper.approval_status!=='approved';const state=paper.approval_status==='rejected'?'Access declined':waiting?'Awaiting approval':upcoming?'Scheduled':closed?'Closed':used>=limit?'Attempts used':'Active';const active=paper.id===examId;return <button key={paper.id} type="button" onClick={()=>setExamId(paper.id)} className={'w-full rounded-2xl border p-4 text-left transition '+(active?'border-blue-700 bg-blue-50 ring-2 ring-blue-100':'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40')}><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-wider text-blue-800">{paper.course_title||'Course'}{paper.module_title?' · '+paper.module_title:''}</p><h5 className="mt-1 font-black text-slate-950">{paper.title}</h5><p className="mt-1 text-xs text-slate-500">{String((paper as any).assessment_type||'Examination').replace(/_/g,' ').toUpperCase()} · {paper.duration_minutes||60} minutes · {paper.max_points} marks</p></div><span className={'rounded-full px-3 py-1 text-[11px] font-bold '+(state==='Active'?'bg-emerald-100 text-emerald-800':state==='Closed'||state==='Access declined'?'bg-rose-100 text-rose-800':'bg-amber-100 text-amber-900')}>{state}</span></div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-slate-600"><span>{used} / {limit} attempts used</span><span>Pass mark: {paper.pass_mark??'—'}</span><span>{paper.strict_time_limit?'Timed / controlled paper':'Standard examination'}</span>{paper.starts_at&&<span>Opens {new Date(paper.starts_at).toLocaleString('en-KE',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Nairobi'})}</span>}</div></button>;})}</div>
   <label className="block text-sm font-bold text-slate-700">Selected examination<select className="mt-1 w-full rounded-lg border px-3 py-2.5" value={examId} onChange={e=>setExamId(e.target.value)}>{exams.map(e=><option key={e.id} value={e.id}>{e.course_title?e.course_title+' · ':''}{e.title} · {e.duration_minutes||60} min</option>)}</select></label>
   {selected&&<div className="grid gap-2 sm:grid-cols-3"><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Duration</p><b>{selected.duration_minutes||60} minutes</b></div><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Maximum marks</p><b>{selected.max_points}</b></div><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Allowed attempts</p><b>{selected.max_attempts||1}</b></div></div>}
   {selected&&<p className={'rounded-lg p-3 text-xs font-semibold '+(isUpcoming?'bg-blue-50 text-blue-900':isClosed?'bg-slate-100 text-slate-600':attemptsExhausted?'bg-amber-50 text-amber-900':'bg-emerald-50 text-emerald-900')}>{approvalRejected?'Your tutor or administrator declined access. Contact them for clarification.':approvalPending?'This paper requires tutor/administrator approval. You can start after your approval status changes to approved.':isUpcoming?'Opens '+new Date(selected.starts_at!).toLocaleString('en-KE',{timeZone:'Africa/Nairobi'}):isClosed?'This paper has closed. Check your previous attempt or results below.':attemptsExhausted?'You have used all permitted attempts.':activeAttempt?'You have an active saved attempt. Resume it to continue.':'This paper is currently within its scheduled attempt window.'}</p>}
   {selected?.instructions&&<div className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700"><b className="mb-1 block">Instructions</b>{selected.instructions}</div>}
   <p className="text-xs leading-5 text-slate-500">Your eligibility is checked by the server. The paper may require tutor/admin approval, full fee payment or an assignment submission. Once started, the server timer continues even if you leave this page.</p>
   <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-semibold text-slate-500">Attempts used: {selectedAttempts.length} / {attemptLimit}{activeAttempt?' · A saved attempt is in progress':''}</p><button disabled={busy||!selected||isClosed||(isUpcoming&&!activeAttempt)||(attemptsExhausted&&!activeAttempt)||(approvalPending&&!activeAttempt)} onClick={()=>void start()} className="rounded-lg bg-blue-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy?'Preparing exam…':isClosed?'Examination closed':activeAttempt?'Resume examination':approvalRejected?'Access declined':approvalPending?'Awaiting approval':isUpcoming?'Not yet open':attemptsExhausted?'No attempts remaining':'Start examination'}</button></div>
  </div>:<div className="space-y-4">
   <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-blue-950 p-3 text-white"><div><b>{selected?.title}</b><p className="text-xs text-blue-200">Attempt {attemptNumber} · {index+1} of {questions.length} questions</p></div><span className="font-mono text-sm">Time remaining: {remaining}</span></div>
   {question?<div className="space-y-4 rounded-xl border p-4"><div className="flex justify-between text-xs font-bold text-slate-500"><span>Question {index+1} of {questions.length}</span><span>{question.points} mark(s)</span></div><h4 className="text-base font-bold text-slate-900">{question.questionText}</h4>
    {['single_choice','true_false'].includes(question.questionType)?<div className="space-y-2">{question.options.map((option,optionIndex)=><label key={option} className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm hover:bg-blue-50"><input type="radio" name={question.id} checked={answers[question.id]===option} onChange={()=>saveAnswer(question.id,option)}/><b className="text-xs text-slate-500">{String.fromCharCode(65+optionIndex)}.</b>{option}</label>)}</div>:question.questionType==='multiple_choice'?<div className="space-y-2">{question.options.map((option,optionIndex)=><label key={option} className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm hover:bg-blue-50"><input type="checkbox" checked={(answers[question.id]||[]).includes(option)} onChange={e=>saveAnswer(question.id,e.target.checked?[...(answers[question.id]||[]),option]:(answers[question.id]||[]).filter((x:string)=>x!==option))}/><b className="text-xs text-slate-500">{String.fromCharCode(65+optionIndex)}.</b>{option}</label>)}</div>:<textarea className="w-full rounded-lg border px-3 py-2 text-sm" rows={question.questionType==='essay'?8:3} value={answers[question.id]||''} onChange={e=>saveAnswer(question.id,e.target.value)} placeholder="Type your answer here"/>}
   </div>:<p className="rounded-lg border p-4 text-sm">No questions have been added to this examination yet. Contact your tutor.</p>}
   <div className="flex flex-wrap justify-between gap-2"><button disabled={index===0} onClick={()=>setIndex(v=>Math.max(0,v-1))} className="rounded-lg border px-4 py-2 text-sm font-bold">Previous</button><div className="flex flex-wrap gap-2">{index<questions.length-1&&<button onClick={()=>setIndex(v=>Math.min(questions.length-1,v+1))} className="rounded-lg bg-blue-800 px-4 py-2 text-sm font-bold text-white">Next question</button>}<button disabled={busy||!questions.length} onClick={()=>void submit()} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy?'Submitting…':'Submit examination'}</button></div></div>
   <p className="text-xs leading-5 text-slate-500">Tab and window focus changes may be logged for review. Browser controls cannot reliably prevent screenshots, second devices or other forms of outside assistance.</p>
  </div>}
 </section>;
}
