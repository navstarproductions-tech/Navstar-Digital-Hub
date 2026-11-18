type PdfDoc = {
 setFillColor(r:number,g:number,b:number):PdfDoc; setDrawColor(r:number,g:number,b:number):PdfDoc; setTextColor(r:number,g:number,b:number):PdfDoc;
 setFont(name:string,style?:string):PdfDoc; setFontSize(n:number):PdfDoc; rect(x:number,y:number,w:number,h:number,style:string):PdfDoc;
 roundedRect(x:number,y:number,w:number,h:number,rx:number,ry:number,style:string):PdfDoc; line(x1:number,y1:number,x2:number,y2:number):PdfDoc;
 text(value:string|string[],x:number,y:number,opts?:Record<string,unknown>):PdfDoc; splitTextToSize(value:string,width:number):string[];
 addImage(data:string,format:string,x:number,y:number,w:number,h:number):PdfDoc; addPage():PdfDoc; save(name:string):Promise<void>|void;
 internal:{pageSize:{getWidth():number;getHeight():number}};
};
type PdfCtor = new(options:Record<string,unknown>)=>PdfDoc;
declare global { interface Window { jspdf?:{jsPDF?:PdfCtor} } }
let loader:Promise<PdfCtor>|null=null;
const sources=['https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js','https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js'];
function loadOne(src:string):Promise<PdfCtor>{return new Promise((resolve,reject)=>{const s=document.createElement('script');const t=window.setTimeout(()=>{s.remove();reject(new Error('timeout'));},10000);s.src=src;s.async=true;s.onload=()=>{window.clearTimeout(t);const C=window.jspdf?.jsPDF;C?resolve(C):reject(new Error('PDF library failed to initialise'));};s.onerror=()=>{window.clearTimeout(t);s.remove();reject(new Error('PDF source unavailable'));};document.head.appendChild(s);});}
function getPdf():Promise<PdfCtor>{if(window.jspdf?.jsPDF)return Promise.resolve(window.jspdf.jsPDF);if(!loader)loader=(async()=>{let error:unknown;for(const src of sources){try{return await loadOne(src);}catch(e){error=e;}}throw error instanceof Error?error:new Error('PDF generator unavailable');})().catch(e=>{loader=null;throw e;});return loader;}
function txt(el:Element|null):string{return(el?.textContent||'').replace(/\\s+/g,' ').trim();}
async function dataUrl(url?:string|null):Promise<string|null>{if(!url)return null;try{const r=await fetch(new URL(url,location.origin).href,{mode:'cors'});if(!r.ok)return null;const b=await r.blob();return await new Promise(res=>{const f=new FileReader();f.onload=()=>res(typeof f.result==='string'?f.result:null);f.onerror=()=>res(null);f.readAsDataURL(b);});}catch{return null;}}
function wrap(d:PdfDoc,s:string,x:number,y:number,w:number,size=8,color:[number,number,number]=[45,62,82]):number{if(!s)return y;d.setFont('helvetica','normal').setFontSize(size).setTextColor(...color);const lines=d.splitTextToSize(s,w);d.text(lines,x,y);return y+lines.length*4.2;}
function card(d:PdfDoc,title:string,body:string,x:number,y:number,w:number){d.setFillColor(255,255,255).setDrawColor(218,228,239).roundedRect(x,y,w,30,2,2,'FD');d.setFont('helvetica','bold').setFontSize(7).setTextColor(82,111,143).text(title.toUpperCase(),x+4,y+7);wrap(d,body,x+4,y+14,w-8,8,[25,43,66]);}
function render(root:ParentNode,filename:string,C:PdfCtor,logo:string|null,qr:string|null){
 const d=new C({orientation:'portrait',unit:'mm',format:'a4',compress:true}), W=d.internal.pageSize.getWidth(), m=14;
 const head=root.querySelector('header'), brand=txt(head?.querySelector('h1'))||'NAVSTAR DIGITAL HUB', motto=txt(head?.querySelector('.motto'))||'HOME OF TECHNOCRATS';
 const title=txt(head?.querySelector('h2'))||'OFFICIAL RECEIPT', serial=txt(head?.querySelector('.serial'))||'OFFICIAL RECEIPT';
 const contacts=txt(head?.querySelector('.contacts'))||'0797 688 576 · 0706 637 485 · navstardigitalhub@gmail.com · P.O. Box 546-50200, Bungoma, Kenya';
 d.setFillColor(6,27,59).rect(0,0,W,49,'F');d.setFillColor(229,184,75).rect(0,49,W,2,'F');
 if(logo){try{d.addImage(logo,'JPEG',m,8,24,25);}catch{}}
 const tx=logo?43:m;d.setFont('helvetica','bold').setFontSize(15).setTextColor(255,255,255).text(brand,tx,17);
 d.setFontSize(8).setTextColor(246,215,125).text(motto,tx,23);wrap(d,contacts,tx,30,W-tx-m,7,[226,239,255]);
 d.setFont('helvetica','bold').setFontSize(12).setTextColor(255,255,255).text(title,m,62);
 d.setFillColor(255,241,242).setDrawColor(254,202,202).roundedRect(m,67,W-2*m,12,2,2,'FD');
 d.setFontSize(9).setTextColor(185,28,28).text(serial,m+5,74.5);
 const status=txt(root.querySelector('.status'));let y=86;
 if(status){d.setFillColor(220,252,231).roundedRect(m,y,W-2*m,10,3,3,'F');d.setFont('helvetica','bold').setFontSize(8).setTextColor(22,101,52).text(status,m+4,y+6.5);y+=15;}
 const cards=Array.from(root.querySelectorAll('.detail-box,.box,.details > section,.grid > section')).filter(e=>txt(e));
 const cw=(W-2*m-5)/2;
 cards.slice(0,4).forEach((el,i)=>{const label=txt(el.querySelector('.section-title,.label,p'))|| (i?'Payment details':'Received from');card(d,label,txt(el).replace(label,'').trim(),m+(i%2)*(cw+5),y+Math.floor(i/2)*35,cw);});
 if(cards.length)y+=Math.ceil(Math.min(cards.length,4)/2)*35;
 else {const main=txt(root.querySelector('.content,.body,main'));y=wrap(d,main,m,y,W-2*m)+4;}
 const amount=Array.from(root.querySelectorAll('*')).find(e=>e.children.length<3&&/AMOUNT RECEIVED/i.test(txt(e))&&txt(e).length<500);
 if(amount){const box=amount.parentElement?.parentElement||amount.parentElement;const value=txt(box);d.setFillColor(235,245,255).setDrawColor(185,215,245).roundedRect(m,y,W-2*m,25,3,3,'FD');d.setFont('helvetica','bold').setFontSize(8).setTextColor(49,84,119).text('AMOUNT RECEIVED',m+5,y+8);wrap(d,value.replace(/AMOUNT RECEIVED/i,'').replace(/TOTAL PAID/i,'Total paid'),m+5,y+15,W-2*m-10,8,[7,91,73]);y+=31;}
 const confirmation=txt(root.querySelector('.confirmation,.rounded-xl.border-l-4'));
 if(confirmation){d.setFillColor(240,253,250).roundedRect(m,y,W-2*m,22,2,2,'F');y=wrap(d,confirmation,m+5,y+7,W-2*m-10,8,[36,72,91])+5;}
 const qrText=txt(root.querySelector('.qr-row,.qr-copy,.qr'));
 if(qrText||qr){d.setDrawColor(220,230,240).line(m,y,W-m,y);y+=8;wrap(d,qrText||'Digital receipt verification',m,y,W-2*m-(qr?32:0),7,[83,105,128]);if(qr){try{d.addImage(qr,'PNG',W-m-27,y-7,25,25);}catch{}}y+=22;}
 const footer=txt(root.querySelector('.footer,.foot'));if(footer){d.setDrawColor(11,67,135).line(m,Math.min(y+3,270),W-m,Math.min(y+3,270));wrap(d,footer,m,Math.min(y+9,276),W-2*m,7,[96,120,142]);}
 const letter=root.querySelector('.appreciation');
 if(letter){d.addPage();d.setFillColor(6,27,59).rect(0,0,W,35,'F');d.setFillColor(229,184,75).rect(0,35,W,2,'F');d.setFont('helvetica','bold').setFontSize(15).setTextColor(255,255,255).text('NAVSTAR DIGITAL HUB',m,17);d.setFontSize(8).setTextColor(246,215,125).text('HOME OF TECHNOCRATS · LETTER OF APPRECIATION',m,25);let ly=52;d.setFontSize(16).setTextColor(11,67,135).text(txt(letter.querySelector('h2'))||'Thank you for your generosity',m,ly);ly+=12;for(const p of Array.from(letter.querySelectorAll('p'))){const t=txt(p);if(t){ly=wrap(d,t,m,ly,W-2*m,10,[51,75,101])+5;if(ly>270){d.addPage();ly=22;}}}}
 void d.save(filename);
}
async function create(source:HTMLElement|string,filename:string):Promise<void>{
 const C=await getPdf(), parsed=typeof source==='string'?new DOMParser().parseFromString(source,'text/html'):null, root:ParentNode=parsed?.body||source as HTMLElement;
 const logoUrl=root.querySelector('img[alt*="logo" i]')?.getAttribute('src')||'/Navstar_Official_Logo.jpg', qrUrl=root.querySelector('img[alt*="QR" i],img.qr')?.getAttribute('src');
 const [logo,qr]=await Promise.all([dataUrl(logoUrl),dataUrl(qrUrl)]);render(root,filename,C,logo,qr);
}
/** Draws the receipt directly into a PDF file. No HTML-to-canvas conversion or print dialog is used. */
export async function downloadReceiptElementPdf(element:HTMLElement,filename:string):Promise<void>{await create(element,filename);}
export async function downloadReceiptHtmlPdf(html:string,filename:string):Promise<void>{await create(html,filename);}
