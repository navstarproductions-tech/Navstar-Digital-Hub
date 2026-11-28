import { useRef } from 'react';

type EditorProps={value:string;onChange:(value:string)=>void;rows?:number;placeholder?:string};
const inline=(source:string)=>source
 .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
 .replace(/`([^`]+)`/g,'<code class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[.92em] text-rose-700">$1</code>')
 .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
 .replace(/\*(.+?)\*/g,'<em>$1</em>')
 .replace(/~~(.+?)~~/g,'<del>$1</del>')
 .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2" target="_blank" rel="noreferrer" class="font-semibold text-blue-700 underline">$1</a>');
export function richTextHtml(value:string){
 const lines=String(value||'').replace(/\r/g,'').split('\n');const out:string[]=[];let paragraph:string[]=[];let list:'ul'|'ol'|null=null;let code=false;let codeLines:string[]=[];
 const closeList=()=>{if(list){out.push(list==='ul'?'</ul>':'</ol>');list=null;}};
 const flush=()=>{if(paragraph.length){out.push('<p>'+paragraph.map(inline).join('<br/>')+'</p>');paragraph=[];}};
 for(const line of lines){
  if(/^\s*```/.test(line)){flush();closeList();if(code){out.push('<pre><code>'+codeLines.map(s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')).join('\n')+'</code></pre>');codeLines=[];code=false;}else code=true;continue;}
  if(code){codeLines.push(line);continue;}
  const heading=line.match(/^\s*(#{1,3})\s+(.+)$/);
  const bullet=line.match(/^\s*[-*+]\s+(.+)$/);
  const numbered=line.match(/^\s*\d+[.)]\s+(.+)$/);
  const quote=line.match(/^\s*>\s?(.*)$/);
  if(!line.trim()){flush();closeList();continue;}
  if(heading){flush();closeList();const n=heading[1].length;out.push('<h'+n+'>'+inline(heading[2])+'</h'+n+'>');continue;}
  if(bullet||numbered){flush();const kind=bullet?'ul':'ol';if(list!==kind){closeList();list=kind;out.push(kind==='ul'?'<ul>':'<ol>');}out.push('<li>'+inline((bullet||numbered)![1])+'</li>');continue;}
  if(quote){flush();closeList();out.push('<blockquote>'+inline(quote[1])+'</blockquote>');continue;}
  closeList();paragraph.push(line);
 }
 flush();closeList();if(code)out.push('<pre><code>'+codeLines.map(s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')).join('\n')+'</code></pre>');
 return out.join('');
}
export function RichTextDisplay({value,className=''}:{value:string;className?:string}){
 return <div className={'rich-content max-w-none [&_h1]:mb-2 [&_h1]:text-xl [&_h1]:font-black [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-extrabold [&_h3]:mb-1 [&_h3]:font-bold [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mb-1 [&_blockquote]:my-3 [&_blockquote]:border-l-4 [&_blockquote]:border-blue-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-slate-950 [&_pre]:p-4 [&_pre]:text-slate-100 '+className} dangerouslySetInnerHTML={{__html:richTextHtml(value)}}/>;
}
export function RichTextEditor({value,onChange,rows=8,placeholder='Write clear instructions. Use the toolbar to format headings, lists and key information.'}:EditorProps){
 const ref=useRef<HTMLTextAreaElement>(null);
 const insert=(before:string,after='')=>{const el=ref.current;if(!el){onChange(value+before+after);return;}const start=el.selectionStart,end=el.selectionEnd;const selected=value.slice(start,end);const next=value.slice(0,start)+before+(selected||'text')+after+value.slice(end);onChange(next);requestAnimationFrame(()=>{el.focus();const cursor=start+before.length+(selected||'text').length;el.setSelectionRange(cursor,cursor);});};
 const prefix=(marker:string)=>{const el=ref.current;if(!el){onChange(value+'\n'+marker);return;}const start=el.selectionStart;const lineStart=value.lastIndexOf('\n',start-1)+1;onChange(value.slice(0,lineStart)+marker+value.slice(lineStart));requestAnimationFrame(()=>{el.focus();el.setSelectionRange(start+marker.length,start+marker.length);});};
 const tools:[string,()=>void][]=[['H1',()=>prefix('# ')],['H2',()=>prefix('## ')],['Bold',()=>insert('**','**')],['Italic',()=>insert('*','*')],['Bullets',()=>prefix('- ')],['Numbered',()=>prefix('1. ')],['Quote',()=>prefix('> ')],['Code',()=>insert('```\n','\n```')]];
 return <div className="overflow-hidden rounded-xl border border-slate-300 bg-white focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100"><div className="flex flex-wrap gap-1 border-b bg-slate-50 p-2">{tools.map(([label,action])=><button key={label} type="button" onClick={action} className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-800">{label}</button>)}</div><textarea ref={ref} rows={rows} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="w-full resize-y border-0 px-4 py-3 text-sm leading-7 text-slate-900 outline-none focus:ring-0"/><div className="border-t bg-slate-50 px-3 py-2 text-[11px] text-slate-500">Formatting supported: headings, bold, italics, numbered and bullet lists, quotations, links and code blocks.</div></div>;
}
