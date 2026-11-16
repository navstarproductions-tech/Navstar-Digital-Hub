import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, X, Send, Sparkles, ExternalLink, Loader2 } from 'lucide-react';

type Message={role:'user'|'assistant';content:string};
const quickLinks=[['Courses','/courses'],['Services','/services'],['Student Gateway','/portals'],['Admission Letters','/admissions-letters'],['School ERP','/analytics'],['Forum','/forum']];

function MessageText({content}:{content:string}){
 const parts=content.split(/(\[[^\]]+\]\(\/(?:[^)]+)\))/g);
 return <>{parts.map((part,index)=>{const match=part.match(/^\[([^\]]+)\]\((\/[^)]+)\)$/);return match?<Link key={index} to={match[2]} className="mx-0.5 inline-flex items-center gap-1 font-bold text-blue-700 underline">{match[1]}<ExternalLink className="h-3 w-3"/></Link>:<span key={index} className="whitespace-pre-wrap">{part}</span>})}</>
}

export function AIChatWidget(){
 const [open,setOpen]=useState(false);
 const [input,setInput]=useState('');
 const [busy,setBusy]=useState(false);
 const [messages,setMessages]=useState<Message[]>([{role:'assistant',content:'Hello! I am the Navstar Digital Hub assistant. Ask me about our courses, services, student gateway, admissions, school ERP or how to navigate this website.'}]);
 const send=async(text=input)=>{
  const question=text.trim();if(!question||busy)return;
  const next=[...messages,{role:'user' as const,content:question}];
  setMessages(next);setInput('');setBusy(true);
  try{
   const response=await fetch('/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:next.slice(-12)})});
   const data=await response.json() as {answer?:string;error?:string};
   if(!response.ok)throw new Error(data.error||'The assistant is temporarily unavailable.');
   setMessages(current=>[...current,{role:'assistant',content:data.answer||'I could not prepare an answer. Please try again.'}]);
  }catch(error){setMessages(current=>[...current,{role:'assistant',content:error instanceof Error?error.message:'The assistant is unavailable right now.'}]);}
  finally{setBusy(false);}
 };
 return <div className="fixed bottom-5 right-4 z-[80] sm:bottom-6 sm:right-6">
  {open&&<section className="mb-3 flex h-[min(70vh,620px)] w-[min(calc(100vw-2rem),390px)] flex-col overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-2xl">
   <header className="flex items-center justify-between bg-gradient-to-r from-blue-950 to-blue-800 p-4 text-white"><div className="flex items-center gap-3"><span className="rounded-xl bg-white/10 p-2"><Bot className="h-5 w-5"/></span><div><p className="font-bold">Navstar AI Assistant</p><p className="text-[11px] text-blue-100">Website help & navigation</p></div></div><button onClick={()=>setOpen(false)} aria-label="Close assistant" className="rounded-lg p-2 hover:bg-white/10"><X className="h-5 w-5"/></button></header>
   <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3">{messages.map((message,index)=><div key={index} className={message.role==='user'?'ml-8 rounded-2xl rounded-br-sm bg-blue-800 p-3 text-sm text-white':'mr-5 rounded-2xl rounded-bl-sm border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-800'}><MessageText content={message.content}/></div>)}{busy&&<div className="mr-10 flex items-center gap-2 rounded-xl bg-white p-3 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin"/>Thinking…</div>}</div>
   <div className="border-t bg-white p-3"><div className="mb-2 flex gap-2 overflow-x-auto pb-1">{quickLinks.map(([label,path])=><Link key={path} to={path} onClick={()=>setOpen(false)} className="shrink-0 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-[11px] font-semibold text-blue-900">{label}</Link>)}</div><form onSubmit={event=>{event.preventDefault();void send();}} className="flex items-center gap-2"><input value={input} onChange={event=>setInput(event.target.value)} placeholder="Ask Navstar anything…" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-3 text-sm outline-none focus:border-blue-600" maxLength={1200}/><button type="submit" disabled={busy||!input.trim()} aria-label="Send message" className="rounded-xl bg-blue-800 p-3 text-white disabled:opacity-40"><Send className="h-4 w-4"/></button></form><p className="mt-2 text-[10px] text-slate-400">Do not share passwords, PINs or private payment credentials.</p></div>
  </section>}
  <button onClick={()=>setOpen(value=>!value)} aria-label={open?'Close Navstar AI':'Ask Navstar AI'} className="ml-auto flex items-center gap-2 rounded-full border-2 border-amber-300 bg-blue-950 px-4 py-3 text-sm font-black text-white shadow-xl transition hover:-translate-y-0.5 hover:bg-blue-900"><Sparkles className="h-5 w-5 text-amber-300"/><span>Ask Navstar AI</span>{open?<X className="h-4 w-4"/>:<Bot className="h-4 w-4"/>}</button>
 </div>
}
