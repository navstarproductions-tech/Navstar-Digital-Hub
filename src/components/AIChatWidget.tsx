import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, X, Send, Sparkles, ExternalLink, Loader2, Paperclip, Image as ImageIcon, FileText, Bold, Italic, List, Code2, Trash2 } from 'lucide-react';

type Attachment={name:string;mimeType:string;data:string;kind:'image'|'pdf'|'text';size:number};
type Message={role:'user'|'assistant';content:string;attachments?:Array<Pick<Attachment,'name'|'mimeType'|'kind'|'size'>>};
const quickLinks=[['Courses','/courses'],['Services','/services'],['Student Gateway','/portals'],['Admission Letters','/admissions-letters'],['School ERP','/analytics'],['Forum','/forum']];
const MAX_FILE=8*1024*1024;
const TEXT_TYPES=new Set(['text/plain','text/markdown','text/csv','application/json','text/html','text/xml','application/xml','text/javascript','application/javascript']);
const TEXT_EXT=/\.(txt|md|csv|json|html|xml|js|ts|tsx|jsx|css|py|java|sql|log|yaml|yml)$/i;

function InlineMarkdown({text}:{text:string}){
 const tokens=text.split(/(\*\*[^*]+\*\*|(?<!\*)\*[^*]+\*(?!\*)|`[^`]+`|\[[^\]]+\]\(\/[^)]+\))/g);
 return <>{tokens.map((token,i)=>{
  const link=token.match(/^\[([^\]]+)\]\((\/[^)]+)\)$/);
  if(link)return <Link key={i} to={link[2]} className="font-bold text-blue-700 underline">{link[1]}<ExternalLink className="ml-1 inline h-3 w-3"/></Link>;
  if(token.startsWith('**')&&token.endsWith('**'))return <strong key={i} className="font-extrabold">{token.slice(2,-2)}</strong>;
  if(token.startsWith('*')&&token.endsWith('*'))return <em key={i}>{token.slice(1,-1)}</em>;
  if(token.startsWith('`')&&token.endsWith('`'))return <code key={i} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[.9em] text-rose-700">{token.slice(1,-1)}</code>;
  return <span key={i}>{token}</span>;
 })}</>;
}
function MessageText({content}:{content:string}){
 return <div className="space-y-1.5">{content.split('\n').map((line,i)=>{
  const trimmed=line.trim();
  if(/^#{1,3}\s/.test(trimmed)){const value=trimmed.replace(/^#{1,3}\s/,'');return <p key={i} className="pt-1 font-extrabold text-slate-950"><InlineMarkdown text={value}/></p>}
  if(/^[-*]\s/.test(trimmed))return <div key={i} className="flex gap-2"><span className="font-bold text-blue-600">•</span><span><InlineMarkdown text={trimmed.slice(2)}/></span></div>;
  if(/^\d+\.\s/.test(trimmed))return <p key={i} className="pl-1"><InlineMarkdown text={trimmed}/></p>;
  if(trimmed.startsWith('```'))return <p key={i} className="font-mono text-xs text-slate-500">{trimmed.replace(/`/g,'')}</p>;
  return <p key={i} className="min-h-[.5rem] whitespace-pre-wrap"><InlineMarkdown text={line}/></p>;
 })}</div>;
}
function readFile(file:File):Promise<string>{return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(new Error('Could not read '+file.name));reader.readAsDataURL(file);});}

export function AIChatWidget(){
 const [open,setOpen]=useState(false);
 const [input,setInput]=useState('');
 const [busy,setBusy]=useState(false);
 const [attachments,setAttachments]=useState<Attachment[]>([]);
 const [error,setError]=useState('');
 const inputRef=useRef<HTMLTextAreaElement>(null);
 const fileRef=useRef<HTMLInputElement>(null);
 const [messages,setMessages]=useState<Message[]>([{role:'assistant',content:'Hello! I am **Navstar AI**. Ask me anything, upload an image or document, or paste your work for help. I can explain, analyse, summarise and help you create content.'}]);
 const addFiles=async(files:FileList|null)=>{
  if(!files)return;setError('');
  let totalBytes=attachments.reduce((sum,file)=>sum+file.size,0);
  for(const file of Array.from(files)){
   if(attachments.length>=5){setError('You can attach up to 5 files per message.');break;}
   if(file.size>MAX_FILE){setError(file.name+' is larger than 8 MB.');continue;}
   if(totalBytes+file.size>10*1024*1024){setError('Keep the combined attachments under 10 MB per message.');break;}
   const isImage=file.type.startsWith('image/');
   const isPdf=file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf');
   const isText=TEXT_TYPES.has(file.type)||TEXT_EXT.test(file.name);
   if(!isImage&&!isPdf&&!isText){setError(file.name+': use an image, PDF or text/document file (TXT, DOC-exported text, CSV, MD, JSON, code).');continue;}
   try{
    const data=isText?await file.text():await readFile(file);
    setAttachments(current=>[...current,{name:file.name,mimeType:file.type|| (isPdf?'application/pdf':'text/plain'),data,kind:isImage?'image':isPdf?'pdf':'text',size:file.size}]);
    totalBytes+=file.size;
   }catch(e){setError(e instanceof Error?e.message:'File could not be read.');}
  }
  if(fileRef.current)fileRef.current.value='';
 };
 const format=(before:string,after=before)=>{
  const el=inputRef.current;if(!el)return;const start=el.selectionStart,end=el.selectionEnd;
  const selected=input.slice(start,end)||'text';
  const updated=input.slice(0,start)+before+selected+after+input.slice(end);
  setInput(updated);requestAnimationFrame(()=>{el.focus();el.setSelectionRange(start+before.length,start+before.length+selected.length);});
 };
 const send=async()=>{
  const question=input.trim();if((!question&&!attachments.length)||busy)return;
  const metadata=attachments.map(({name,mimeType,kind,size})=>({name,mimeType,kind,size}));
  const next=[...messages,{role:'user' as const,content:question||'Please analyse the attached file(s).',attachments:metadata}];
  setMessages(next);setInput('');setBusy(true);setError('');
  try{
   const response=await fetch('/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:next.slice(-10).map(({role,content})=>({role,content})),attachments:attachments.map(({name,mimeType,data,kind})=>({name,mimeType,data,kind}))})});
   const raw=await response.text();let data:{answer?:string;error?:string};
   try{data=JSON.parse(raw) as {answer?:string;error?:string};}
   catch{throw new Error('The AI server returned an invalid response (HTTP '+response.status+'). Please try again.');}
   if(!response.ok)throw new Error(data.error||'The assistant request failed (HTTP '+response.status+').');
   setMessages(current=>[...current,{role:'assistant',content:data.answer||'I could not prepare an answer. Please try again.'}]);
   setAttachments([]);
  }catch(e){setMessages(current=>[...current,{role:'assistant',content:e instanceof Error?e.message:'The assistant is unavailable right now.'}]);}
  finally{setBusy(false);}
 };
 return <div className="fixed bottom-5 right-4 z-[80] sm:bottom-6 sm:right-6">
  {open&&<section className="mb-3 flex h-[min(78vh,720px)] w-[min(calc(100vw-1.25rem),460px)] flex-col overflow-hidden rounded-3xl border border-blue-200 bg-white shadow-[0_24px_80px_rgba(2,20,55,.28)]">
   <header className="flex items-center justify-between bg-gradient-to-r from-[#061a3b] via-[#073b7d] to-[#075a9c] p-4 text-white"><div className="flex items-center gap-3"><span className="rounded-2xl border border-white/15 bg-white/10 p-2.5"><Bot className="h-6 w-6 text-amber-300"/></span><div><p className="font-extrabold tracking-wide">Navstar AI</p><p className="text-[11px] text-blue-100">Your digital assistant · HOME OF TECHNOCRATS</p></div></div><button onClick={()=>setOpen(false)} aria-label="Close assistant" className="rounded-xl p-2 hover:bg-white/10"><X className="h-5 w-5"/></button></header>
   <div className="flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-slate-50 to-blue-50/50 p-3.5">{messages.map((message,index)=><div key={index} className={message.role==='user'?'ml-7 rounded-2xl rounded-br-md bg-gradient-to-br from-blue-800 to-blue-700 p-3.5 text-sm leading-6 text-white shadow-sm':'mr-4 rounded-2xl rounded-bl-md border border-slate-200 bg-white p-3.5 text-sm leading-6 text-slate-800 shadow-sm'}><MessageText content={message.content}/>{message.attachments?.length? <div className="mt-2 flex flex-wrap gap-1.5">{message.attachments.map(file=><span key={file.name} className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2 py-1 text-[10px]"><FileText className="h-3 w-3"/>{file.name}</span>)}</div>:null}</div>)}{busy&&<div className="mr-10 flex items-center gap-2 rounded-xl border bg-white p-3 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-blue-700"/>Navstar AI is analysing your request…</div>}</div>
   <div className="border-t border-slate-200 bg-white p-3">
    {attachments.length>0&&<div className="mb-2 flex flex-wrap gap-2">{attachments.map((file,index)=><div key={file.name+index} className="flex max-w-full items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-2 py-1.5 text-xs text-blue-950">{file.kind==='image'?<ImageIcon className="h-4 w-4"/>:<FileText className="h-4 w-4"/>}<span className="max-w-[190px] truncate font-semibold">{file.name}</span><button onClick={()=>setAttachments(current=>current.filter((_,i)=>i!==index))} aria-label={'Remove '+file.name}><Trash2 className="h-3.5 w-3.5 text-rose-600"/></button></div>)}</div>}
    {error&&<p className="mb-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">{error}</p>}
    <div className="mb-2 flex items-center gap-1 rounded-xl bg-slate-50 p-1"><span className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Format</span><button type="button" onClick={()=>format('**')} title="Bold" className="rounded-lg p-2 text-slate-600 hover:bg-blue-100 hover:text-blue-800"><Bold className="h-4 w-4"/></button><button type="button" onClick={()=>format('*')} title="Italic" className="rounded-lg p-2 text-slate-600 hover:bg-blue-100 hover:text-blue-800"><Italic className="h-4 w-4"/></button><button type="button" onClick={()=>format('- ' ,'')} title="Bullet list" className="rounded-lg p-2 text-slate-600 hover:bg-blue-100 hover:text-blue-800"><List className="h-4 w-4"/></button><button type="button" onClick={()=>format('`')} title="Code" className="rounded-lg p-2 text-slate-600 hover:bg-blue-100 hover:text-blue-800"><Code2 className="h-4 w-4"/></button><span className="ml-auto pr-2 text-[10px] text-slate-400">Markdown supported</span></div>
    <form onSubmit={event=>{event.preventDefault();void send();}} className="rounded-2xl border border-slate-300 bg-white p-2 shadow-inner focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
     <textarea ref={inputRef} value={input} onChange={event=>setInput(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void send();}}} placeholder="Ask Navstar AI anything… (Shift + Enter for new line)" className="max-h-32 min-h-[68px] w-full resize-y border-0 bg-transparent px-2 py-1.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:ring-0" maxLength={6000}/>
     <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2"><div className="flex items-center gap-1"><input ref={fileRef} type="file" multiple accept="image/*,application/pdf,.txt,.md,.csv,.json,.html,.xml,.js,.ts,.tsx,.jsx,.css,.py,.java,.sql,.log,.yaml,.yml" className="hidden" onChange={event=>void addFiles(event.target.files)}/><button type="button" onClick={()=>fileRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-900 hover:bg-blue-100"><Paperclip className="h-4 w-4"/>Attach files</button><span className="text-[10px] text-slate-400">Images · PDF · text · max 8 MB each / 10 MB total</span></div><button type="submit" disabled={busy||(!input.trim()&&!attachments.length)} aria-label="Send message" className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-900 to-blue-700 px-4 py-2.5 text-xs font-extrabold text-white shadow-md hover:from-blue-800 disabled:opacity-40"><Send className="h-4 w-4"/>Send</button></div>
    </form>
    <div className="mt-2 flex gap-2 overflow-x-auto pb-1">{quickLinks.map(([label,path])=><Link key={path} to={path} onClick={()=>setOpen(false)} className="shrink-0 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-[10px] font-semibold text-blue-900">{label}</Link>)}</div><p className="mt-1 text-[10px] text-slate-400">Never share passwords, PINs or private payment credentials. Files are sent to the AI provider for analysis.</p>
   </div>
  </section>}
  <button onClick={()=>setOpen(value=>!value)} aria-label={open?'Close Navstar AI':'Ask Navstar AI'} className="ml-auto flex items-center gap-2 rounded-full border-2 border-amber-300 bg-blue-950 px-4 py-3 text-sm font-black text-white shadow-xl transition hover:-translate-y-0.5 hover:bg-blue-900"><Sparkles className="h-5 w-5 text-amber-300"/><span>Ask Navstar AI</span>{open?<X className="h-4 w-4"/>:<Bot className="h-4 w-4"/>}</button>
 </div>;
}
