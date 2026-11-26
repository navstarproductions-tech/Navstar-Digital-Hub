export type NavstarStampDesign = {
  stampEnabled?: boolean; shape?: 'Rectangle'|'Oval'; office_line?: string; institution_name?: string;
  address_line?: string; status_word?: string; date_label?: string; sign_label?: string;
  signature_url?: string; color_scheme?: string; stamp_color?: string; date_color?: string;
  font_scale?: number; line_spacing?: number; stampOpacity?: number; stampPosition?: string;
  stampWidthMm?: number; stampMarginMm?: number;
};
type StampPdf = {
  internal:{pageSize:{getWidth():number;getHeight():number};scaleFactor?:number};
  getNumberOfPages():number;setPage(page:number):unknown;
  setDrawColor(...v:number[]):unknown;setTextColor(...v:number[]):unknown;setLineWidth(v:number):unknown;
  rect(x:number,y:number,w:number,h:number,style?:string):unknown;ellipse(x:number,y:number,rx:number,ry:number,style?:string):unknown;
  setFont(name:string,style?:string):unknown;setFontSize(v:number):unknown;getTextWidth(v:string):number;
  text(v:string,x:number,y:number,opts?:Record<string,unknown>):unknown;line(x1:number,y1:number,x2:number,y2:number):unknown;
  addImage(data:string,format:string,x:number,y:number,w:number,h:number):unknown;
};
const DEFAULT:Required<Pick<NavstarStampDesign,'shape'|'office_line'|'institution_name'|'address_line'|'sign_label'|'color_scheme'|'date_color'|'font_scale'|'line_spacing'|'stampOpacity'|'stampWidthMm'|'stampMarginMm'>>={
  shape:'Rectangle',office_line:'THE OFFICE OF FINANCE',institution_name:'NAVSTAR DIGITAL HUB',
  address_line:'P.O BOX 546-50200, BUNGOMA (K)',sign_label:'SIGN',color_scheme:'Royal Blue',
  date_color:'#dc2626',font_scale:100,line_spacing:100,stampOpacity:0.9,stampWidthMm:55,stampMarginMm:8
};
const SCHEMES:Record<string,string>={'Royal Blue':'#1e3a8a','Emerald Green':'#047857',Gold:'#b08a12','Brand Primary':'#1e3a8a'};
function rgb(hex:string):[number,number,number]{let h=String(hex||'').replace('#','').trim();if(h.length===3)h=h.split('').map(x=>x+x).join('');if(!/^[0-9a-f]{6}$/i.test(h))h='1e3a8a';return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}
export async function fetchStampDesign():Promise<NavstarStampDesign>{
  try{const r=await fetch('/api/public-stamp');if(!r.ok)return {...DEFAULT};const data=await r.json();return {...DEFAULT,...(data.settings?.['rubber-stamp']||{})};}
  catch{return {...DEFAULT};}
}
function stampDate(){return new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric',timeZone:'Africa/Nairobi'}).toUpperCase();}
async function signatureData(url?:string):Promise<string|null>{if(!url)return null;try{const r=await fetch(url,{mode:'cors'});if(!r.ok)return null;const blob=await r.blob();return await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(typeof reader.result==='string'?reader.result:null);reader.onerror=()=>resolve(null);reader.readAsDataURL(blob);});}catch{return null;}}
export async function applyNavstarRubberStamp(doc:StampPdf,design:NavstarStampDesign={},page?:number):Promise<number>{
  if(design.stampEnabled===false)return 0;
  const s={...DEFAULT,...design},W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight();
  const w=Math.min(W-12,Math.max(35,Number(s.stampWidthMm)||55)),h=w*.66;
  const margin=Math.max(3,Number(s.stampMarginMm)||8);
  const pos=s.stampPosition||'Bottom right';
  const x=pos==='Bottom left'||pos==='Top left'?margin:pos==='Bottom centre'?(W-w)/2:W-margin-w;
  const y=pos==='Top left'||pos==='Top right'?margin:H-margin-h;
  const main=rgb(s.stamp_color||SCHEMES[s.color_scheme]||SCHEMES['Royal Blue']),date=rgb(s.date_color);
  const opacity=Math.max(.1,Math.min(1,Number(s.stampOpacity)||.9));
  const sig=await signatureData(s.signature_url);
  const pages=page?[page]:Array.from({length:doc.getNumberOfPages()},(_,i)=>i+1);
  const scale=doc.internal.scaleFactor||1,fs=Math.max(.5,Math.min(1.5,(Number(s.font_scale)||100)/100));
  for(const p of pages){
    doc.setPage(p);
    const X=Math.max(2,Math.min(W-w-2,x)),Y=Math.max(2,Math.min(H-h-2,y));
    doc.setDrawColor(...main);doc.setTextColor(...main);
    doc.setLineWidth(Math.max(.35,w*.018));doc.rect(X,Y,w,h);
    doc.setLineWidth(Math.max(.15,w*.004));doc.rect(X+w*.018,Y+w*.018,w-w*.036,h-w*.036);
    const fit=(value:string,size:number,color=main)=>{const t=String(value||'').toUpperCase();doc.setFont('times','bold');doc.setFontSize(size*fs*scale);const tw=doc.getTextWidth(t),max=w*.88;if(tw>max)doc.setFontSize(size*fs*(max/tw)*scale);doc.setTextColor(...color);return t;};
    const cx=X+w/2,sp=Math.max(.6,Math.min(1.6,(Number(s.line_spacing)||100)/100));
    doc.text(fit(s.office_line||DEFAULT.office_line,w*.082),cx,Y+h*.15,{align:'center'});
    doc.text(fit(s.institution_name||DEFAULT.institution_name,w*.1),cx,Y+h*.31,{align:'center'});
    const address=String(s.address_line||DEFAULT.address_line).split(',').map(x=>x.trim()).filter(Boolean);
    doc.text(fit(address[0]||'',w*.075),cx,Y+h*.46,{align:'center'});
    if(address.length>1)doc.text(fit(address.slice(1).join(', '),w*.075),cx,Y+h*.58,{align:'center'});
    doc.text(fit(stampDate(),w*.075,date),cx,Y+h*.73,{align:'center'});
    doc.setTextColor(...main);doc.setFont('times','bold');doc.setFontSize(w*.075*fs*scale);
    const label=(s.sign_label||'SIGN')+':',sx=X+w*.1,sy=Y+h*.9;
    doc.text(label,sx,sy);const dx=sx+doc.getTextWidth(label)+w*.025,end=X+w*.9;
    if(sig){try{doc.addImage(sig,'PNG',dx,sy-h*.16,Math.max(1,end-dx),h*.14);}catch{doc.line(dx,sy,end,sy);}}
    else doc.line(dx,sy,end,sy);
  }
  return h;
}
