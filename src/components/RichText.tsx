import { useEffect, useRef } from 'react';

type EditorProps={value:string;onChange:(value:string)=>void;rows?:number;placeholder?:string;onImageUpload?:(file:File)=>Promise<string>};
const escapeHtml=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const inline=(source:string)=>escapeHtml(source)
 .replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+|\/api\/storage\/[^\s)]+)\)/g,'<img src="$2" alt="$1"/>')
 .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2">$1</a>')
 .replace(/`([^`]+)`/g,'<code>$1</code>')
 .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
 .replace(/\*(.+?)\*/g,'<em>$1</em>')
 .replace(/~~(.+?)~~/g,'<del>$1</del>');
const allowed=new Set(['div','p','br','hr','h1','h2','h3','h4','h5','h6','strong','b','em','i','u','s','del','ul','ol','li','blockquote','pre','code','table','thead','tbody','tr','th','td','span','a','sub','sup','img']);
function sanitize(source:string){
 const noDanger=source.replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select|svg|math)\b[^>]*\/?\s*>/gi,'');
 return noDanger.replace(/<\/?([a-z][a-z0-9-]*)\b([^>]*)>/gi,(whole,rawTag:string,attrs:string)=>{
  const tag=rawTag.toLowerCase();if(!allowed.has(tag))return '';
  if(/^<\//.test(whole))return tag==='img'?'':`</${tag}>`;
  if(tag==='img'){
   const src=attrs.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i),url=src?.[1]||src?.[2]||src?.[3]||'';
   if(!/^(https:\/\/|\/api\/storage\/)/i.test(url)||/^\s*javascript:/i.test(url))return '';
   const alt=attrs.match(/\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
   return `<img src="${url.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}" alt="${(alt?.[1]||alt?.[2]||'Assignment image').replace(/&/g,'&amp;').replace(/"/g,'&quot;')}"/>`;
  }
  let safe='';
  const href=attrs.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  if(tag==='a'&&href){const url=href[1]||href[2]||href[3]||'';if(/^(https:\/\/|mailto:|\/)/i.test(url)&&!/javascript:/i.test(url))safe+=` href="${url.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}"`;}
  const title=attrs.match(/\btitle\s*=\s*(?:"([^"]*)"|'([^']*)')/i);if(title)safe+=` title="${(title[1]||title[2]||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;')}"`;
  const style=attrs.match(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  if(style){const value=(style[1]||style[2]||'').split(';').map(x=>x.trim()).filter(x=>/^(text-align|font-weight|font-style|text-decoration|color|background-color)\s*:\s*[#(),.% a-zA-Z0-9-]+$/i.test(x)&&!/url|expression|var\(/i.test(x)).join(';');if(value)safe+=` style="${value.replace(/"/g,'')}"`;}
  return `<${tag}${safe}>`;
 });
}
function decode(value:string){let out=String(value||'');const entities:Record<string,string>={'&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'",'&#x27;':"'",'&nbsp;':' ','&amp;':'&'};for(let i=0;i<3;i++)out=out.replace(/&(?:lt|gt|quot|#39|#x27|nbsp|amp);/gi,m=>entities[m.toLowerCase()]??m);return out;}
export function richTextHtml(value:string){
 const decoded=decode(value);
 if(/<\/?(?:p|div|h[1-6]|ul|ol|li|br|hr|strong|b|em|i|u|s|del|blockquote|pre|code|table|thead|tbody|tr|th|td|span|a|sub|sup|img)\b[^>]*>/i.test(decoded))return sanitize(decoded);
 const out:string[]=[];let paragraph:string[]=[],list:'ul'|'ol'|null=null,code=false,codeLines:string[]=[];
 const closeList=()=>{if(list){out.push(list==='ul'?'</ul>':'</ol>');list=null;}};
 const flush=()=>{if(paragraph.length){out.push('<p>'+paragraph.map(inline).join('<br/>')+'</p>');paragraph=[];}};
 for(const line of decoded.replace(/\r/g,'').split('\n')){
  if(/^\s*```/.test(line)){flush();closeList();if(code){out.push('<pre><code>'+codeLines.map(escapeHtml).join('\n')+'</code></pre>');codeLines=[];code=false;}else code=true;continue;}
  if(code){codeLines.push(line);continue;}
  if(!line.trim()){flush();closeList();continue;}
  const h=line.match(/^\s*(#{1,3})\s+(.+)$/),bullet=line.match(/^\s*[-*+]\s+(.+)$/),numbered=line.match(/^\s*\d+[.)]\s+(.+)$/),quote=line.match(/^\s*>\s?(.*)$/);
  if(h){flush();closeList();out.push('<h'+h[1].length+'>'+inline(h[2])+'</h'+h[1].length+'>');continue;}
  if(bullet||numbered){flush();const kind=bullet?'ul':'ol';if(list!==kind){closeList();list=kind;out.push(kind==='ul'?'<ul>':'<ol>');}out.push('<li>'+inline((bullet||numbered)![1])+'</li>');continue;}
  if(quote){flush();closeList();out.push('<blockquote>'+inline(quote[1])+'</blockquote>');continue;}
  closeList();paragraph.push(line);
 }
 flush();closeList();if(code)out.push('<pre><code>'+codeLines.map(escapeHtml).join('\n')+'</code></pre>');return out.join('');
}
export function RichTextDisplay({value,className=''}:{value:string;className?:string}){
 return <div className={'rich-content max-w-none [&_img]:my-3 [&_img]:max-h-96 [&_img]:max-w-full [&_img]:rounded-lg [&_img]:border [&_img]:border-slate-200 [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-100 [&_th]:p-2 [&_td]:border [&_td]:border-slate-300 [&_td]:p-2 [&_a]:font-semibold [&_a]:text-blue-700 [&_a]:underline [&_h1]:mb-2 [&_h1]:text-xl [&_h1]:font-black [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-extrabold [&_h3]:mb-1 [&_h3]:font-bold [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mb-1 [&_blockquote]:my-3 [&_blockquote]:border-l-4 [&_blockquote]:border-blue-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-slate-950 [&_pre]:p-4 [&_pre]:text-slate-100 '+className} dangerouslySetInnerHTML={{__html:richTextHtml(value)}}/>;
}
export function RichTextEditor({value,onChange,rows=8,placeholder='Write clear instructions. Use the toolbar to format headings, lists and key information.',onImageUpload}:EditorProps){
 const ref=useRef<HTMLDivElement>(null),imageRef=useRef<HTMLInputElement>(null);
 useEffect(()=>{const el=ref.current;if(!el)return;const html=richTextHtml(value||'');if(el.innerHTML!==html)el.innerHTML=html;},[value]);
 const command=(name:string,arg?:string)=>{ref.current?.focus();document.execCommand(name,false,arg);if(ref.current)onChange(ref.current.innerHTML);};
 const insertHtml=(html:string)=>{ref.current?.focus();document.execCommand('insertHTML',false,html);if(ref.current)onChange(ref.current.innerHTML);};
 const addLink=()=>{const url=window.prompt('Paste the full https:// link');if(url&&/^https:\/\//i.test(url))command('createLink',url);};
 const addTable=()=>insertHtml('<table><thead><tr><th>Heading</th><th>Details</th></tr></thead><tbody><tr><td>Item 1</td><td>Enter details</td></tr><tr><td>Item 2</td><td>Enter details</td></tr></tbody></table><p><br/></p>');
 const addImage=async(file?:File)=>{if(!file)return;try{let src='';if(onImageUpload)src=await onImageUpload(file);else src=window.prompt('Paste a secure image URL (https://)')||'';if(!src||!(/^(https:\/\/|\/api\/storage\/)/i.test(src)))return;insertHtml('<p><img src="'+src.replace(/"/g,'&quot;')+'" alt="Assignment illustration"/></p>');}catch(e){window.alert(e instanceof Error?e.message:'Image upload failed.');}};
 const tools:[string,()=>void][]=[['H1',()=>command('formatBlock','<h1>')],['H2',()=>command('formatBlock','<h2>')],['H3',()=>command('formatBlock','<h3>')],['Bold',()=>command('bold')],['Italic',()=>command('italic')],['Underline',()=>command('underline')],['Bullets',()=>command('insertUnorderedList')],['Numbered',()=>command('insertOrderedList')],['Quote',()=>command('formatBlock','<blockquote>')],['Link',addLink],['Table',addTable],['Picture',()=>imageRef.current?.click()],['Undo',()=>command('undo')],['Redo',()=>command('redo')],['Clear format',()=>command('removeFormat')]];
 return <div className="overflow-hidden rounded-xl border border-slate-300 bg-white focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100">
  <div className="flex flex-wrap gap-1 border-b bg-slate-50 p-2">{tools.map(([label,action])=><button key={label} type="button" onMouseDown={e=>e.preventDefault()} onClick={action} className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-800">{label}</button>)}</div>
  <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={e=>{const file=e.target.files?.[0];void addImage(file);e.target.value='';}}/>
  <div ref={ref} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" data-placeholder={placeholder} onInput={e=>onChange(e.currentTarget.innerHTML)} style={{minHeight:Math.max(180,rows*24)}} className="rich-editor max-h-[620px] overflow-y-auto px-4 py-3 text-sm leading-7 text-slate-900 outline-none [&_h1]:text-xl [&_h1]:font-black [&_h2]:text-lg [&_h2]:font-extrabold [&_h3]:font-bold [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mb-1 [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:bg-slate-100 [&_th]:p-2 [&_td]:border [&_td]:p-2 [&_img]:my-3 [&_img]:max-h-80 [&_img]:max-w-full [&_img]:rounded-lg [&_img]:border" />
  <style>{'.rich-editor:empty:before{content:attr(data-placeholder);color:#94a3b8;pointer-events:none}.rich-editor:focus:before{content:""}'}</style>
  <div className="border-t bg-slate-50 px-3 py-2 text-[11px] text-slate-500">Word-style editor: format text directly, add or remove numbered lists, insert tables, hyperlinks and uploaded pictures. Changes are saved as rich content.</div>
 </div>;
}
