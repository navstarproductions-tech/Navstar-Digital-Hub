import { useEffect,useState } from 'react';
import { Button } from '@/components/ui/button';
type Course={id:string;title:string};
type Rating={id:string;courseId:string;rating:number;feedback:string;updatedAt:string};
type Question={id:string;label:string;type:'rating'|'text'|'longtext'|'choice';required?:boolean;options?:string[]};
type Form={id:string;title:string;description:string;items:Question[]};
type Response={id:string;formId:string;courseId:string;answers:Record<string,unknown>;overallRating:number;updatedAt:string};
export function StudentClassRatingWorkspace(){
 const [courses,setCourses]=useState<Course[]>([]),[ratings,setRatings]=useState<Rating[]>([]),[form,setForm]=useState<Form|null>(null),[responses,setResponses]=useState<Response[]>([]);
 const [courseId,setCourseId]=useState(''),[rating,setRating]=useState(5),[feedback,setFeedback]=useState(''),[answers,setAnswers]=useState<Record<string,unknown>>({});
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=async()=>{
  setLoading(true);setError('');
  try{const response=await fetch('/api/class-ratings',{credentials:'same-origin',cache:'no-store'});const result=await response.json();if(!response.ok)throw new Error(result.error||'Class feedback could not be loaded.');setCourses(result.courses||[]);setRatings(result.ratings||[]);setForm(result.form||null);setResponses(result.responses||[]);setCourseId(current=>current||result.courses?.[0]?.id||'');}
  catch(cause){setError(cause instanceof Error?cause.message:'Class feedback could not be loaded.');}
  finally{setLoading(false);}
 };
 useEffect(()=>{void load()},[]);
 const existing=ratings.find(item=>item.courseId===courseId);
 const existingResponse=responses.find(item=>item.courseId===courseId&&item.formId===form?.id);
 useEffect(()=>{setRating(existing?.rating||5);setFeedback(existing?.feedback||'');setAnswers(existingResponse?.answers||{})},[courseId,existing?.id,existing?.rating,existing?.feedback,existingResponse?.id,existingResponse?.updatedAt,form?.id]);
 const saveLegacy=async()=>{
  if(!courseId){setError('You need an accepted course enrolment before submitting a rating.');return;}
  setBusy(true);setError('');setNotice('');
  try{const response=await fetch('/api/class-ratings',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({courseId,rating,feedback})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Your class rating could not be saved.');setNotice('Your feedback has been saved. Thank you for helping Navstar improve.');await load();}
  catch(cause){setError(cause instanceof Error?cause.message:'Your class rating could not be saved.');}
  finally{setBusy(false);}
 };
 const saveForm=async()=>{
  if(!form||!courseId){setError('Choose one of your accepted courses.');return;}
  setBusy(true);setError('');setNotice('');
  try{const response=await fetch('/api/class-ratings',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'submit_form',formId:form.id,courseId,answers})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Your class feedback could not be submitted.');setNotice('Your detailed class feedback has been saved. Thank you for helping Navstar improve.');await load();}
  catch(cause){setError(cause instanceof Error?cause.message:'Your class feedback could not be submitted.');}
  finally{setBusy(false);}
 };
 const updateAnswer=(id:string,value:unknown)=>setAnswers(current=>({...current,[id]:value}));
 return <div className="space-y-5">
  <header className="rounded-2xl bg-gradient-to-r from-[#071a35] via-blue-950 to-[#16477e] p-5 text-white"><p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">NAVSTAR · YOUR VOICE MATTERS</p><h2 className="mt-1 text-2xl font-black">Class Rating & Feedback</h2><p className="mt-1 text-sm text-blue-100">Share honest feedback about your learning experience. Your responses are linked to your student account and accepted course.</p></header>
  {error&&<p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}{notice&&<p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
  <section className="rounded-2xl border bg-white p-5 shadow-sm">
   <h3 className="font-black">{form?.title||'Rate an enrolled course'}</h3>
   <p className="mt-1 text-xs text-slate-500">{form?.description||'Your rating is visible to authorised Navstar administrators. You can update your rating later.'}</p>
   <label className="mt-4 block text-xs font-bold">Course<select value={courseId} onChange={e=>setCourseId(e.target.value)} className="mt-1 h-11 w-full rounded-lg border bg-white px-3 text-sm font-normal"><option value="">Select accepted course</option>{courses.map(course=><option key={course.id} value={course.id}>{course.title}</option>)}</select></label>
   {form?<div className="mt-5 space-y-4">{form.items.map((item,index)=><div key={item.id} className="rounded-xl border p-4"><p className="text-sm font-bold">{index+1}. {item.label}{item.required!==false&&<span className="ml-1 text-rose-600">*</span>}</p>
    {item.type==='rating'&&<div className="mt-3 flex flex-wrap gap-2">{[1,2,3,4,5].map(value=><button key={value} type="button" aria-label={value+' stars'} aria-pressed={Number(answers[item.id])===value} onClick={()=>updateAnswer(item.id,value)} className={'rounded-lg border px-3 py-2 text-xl '+(Number(answers[item.id])>=value?'border-amber-300 bg-amber-50 text-amber-500':'border-slate-200 text-slate-300')}>★</button>)}</div>}
    {item.type==='choice'&&<select value={String(answers[item.id]??'')} onChange={e=>updateAnswer(item.id,e.target.value)} className="mt-3 h-10 w-full rounded-lg border bg-white px-3 text-sm"><option value="">Choose an option</option>{(item.options||[]).map(option=><option key={option} value={option}>{option}</option>)}</select>}
    {item.type==='text'&&<input value={String(answers[item.id]??'')} onChange={e=>updateAnswer(item.id,e.target.value)} maxLength={3000} className="mt-3 h-10 w-full rounded-lg border px-3 text-sm" placeholder="Your answer"/>}
    {item.type==='longtext'&&<textarea value={String(answers[item.id]??'')} onChange={e=>updateAnswer(item.id,e.target.value)} maxLength={3000} rows={4} className="mt-3 w-full rounded-lg border p-3 text-sm" placeholder="Write your response here…"/>}
   </div>)}</div>:<><div className="mt-5"><p className="text-xs font-bold">Overall class rating</p><div className="mt-2 flex flex-wrap gap-2">{[1,2,3,4,5].map(value=><button key={value} type="button" aria-label={value+' stars'} aria-pressed={rating===value} onClick={()=>setRating(value)} className={'rounded-xl border px-4 py-3 text-2xl '+(rating>=value?'border-amber-300 bg-amber-50 text-amber-500':'border-slate-200 text-slate-300')}>★</button>)}</div><p className="mt-2 text-xs text-slate-500">{['','Needs significant improvement','Below expectations','Satisfactory','Very good','Excellent'][rating]}</p></div><label className="mt-4 block text-xs font-bold">Comments and suggestions<textarea value={feedback} onChange={e=>setFeedback(e.target.value)} maxLength={3000} rows={5} placeholder="What is working well? What could improve?" className="mt-1 w-full rounded-lg border p-3 text-sm font-normal"/></label></>}
   <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">{form?(existingResponse?'You can update your submitted answers for this course.':'Your response will be saved for this course.'):(existing?'You last updated this rating on '+new Date(existing.updatedAt).toLocaleDateString('en-KE'):'You have not rated this course yet.')}</p><Button disabled={busy||loading||!courseId||!courses.length} onClick={()=>void(form?saveForm():saveLegacy())}>{busy?'Saving…':form?(existingResponse?'Update my feedback':'Submit feedback'):(existing?'Update my rating':'Submit rating')}</Button></div>
  </section>
  {form&&<section className="rounded-2xl border bg-white p-5 shadow-sm"><h3 className="font-bold">My previous form responses</h3><div className="mt-3 space-y-2">{responses.map(response=><article key={response.id} className="rounded-xl border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm">{courses.find(course=>course.id===response.courseId)?.title||'Course'}</b><span className="text-xs text-slate-500">{response.overallRating?response.overallRating.toFixed(2)+' / 5':'Submitted'}</span></div><p className="mt-1 text-xs text-slate-400">Updated {new Date(response.updatedAt).toLocaleDateString('en-KE')}</p></article>)}{!loading&&!responses.length&&<p className="rounded-lg border border-dashed p-5 text-center text-sm text-slate-500">You have not submitted a detailed class-rating form yet.</p>}</div></section>}
  {!form&&<section className="rounded-2xl border bg-white p-5 shadow-sm"><h3 className="font-bold">My submitted ratings</h3><div className="mt-3 space-y-2">{ratings.map(item=><article key={item.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border p-3"><div><b className="text-sm">{courses.find(course=>course.id===item.courseId)?.title||'Course'}</b>{item.feedback&&<p className="mt-1 max-w-2xl whitespace-pre-wrap text-xs text-slate-500">{item.feedback}</p>}<p className="mt-1 text-[11px] text-slate-400">Updated {new Date(item.updatedAt).toLocaleDateString('en-KE')}</p></div><span className="text-lg font-black text-amber-500">{'★'.repeat(item.rating)}<span className="text-slate-200">{'★'.repeat(5-item.rating)}</span></span></article>)}{!loading&&!ratings.length&&<p className="rounded-lg border border-dashed p-5 text-center text-sm text-slate-500">You have not submitted any class ratings yet.</p>}</div></section>}
 </div>;
}
