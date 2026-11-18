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
function loadOne(src:string):Promise<PdfCtor>{return new Promise((resolve,reject)=>{const s=document.createElement('script');const t=window.setTimeout(()=>{s.remove();reject(new Error('PDF library timed out'));},10000);s.src=src;s.async=true;s.onload=()=>{window.clearTimeout(t);const C=window.jspdf?.jsPDF;C?resolve(C):reject(new Error('PDF library failed to initialise'));};s.onerror=()=>{window.clearTimeout(t);s.remove();reject(new Error('PDF source unavailable'));};document.head.appendChild(s);});}
function getPdf():Promise<PdfCtor>{if(window.jspdf?.jsPDF)return Promise.resolve(window.jspdf.jsPDF);if(!loader)loader=(async()=>{let error:unknown;for(const src of sources){try{return await loadOne(src);}catch(e){error=e;}}throw error instanceof Error?error:new Error('PDF generator unavailable');})().catch(e=>{loader=null;throw e;});return loader;}
function txt(el:Element|null):string{return(el?.textContent||'').replace(/\s+/g,' ').trim();}
function el(root:ParentNode,selectors:string):Element|null{return root.querySelector(selectors);}
async function dataUrl(url?:string|null):Promise<string|null>{if(!url)return null;try{const r=await fetch(new URL(url,location.origin).href,{mode:'cors'});if(!r.ok)return null;const b=await r.blob();return await new Promise(res=>{const f=new FileReader();f.onload=()=>res(typeof f.result==='string'?f.result:null);f.onerror=()=>res(null);f.readAsDataURL(b);});}catch{return null;}}
function wrap(d:PdfDoc,s:string,x:number,y:number,w:number,size=8,color:[number,number,number]=[45,62,82],leading=4.1):number{if(!s)return y;d.setFont('helvetica','normal').setFontSize(size).setTextColor(...color);const lines=d.splitTextToSize(s,w);d.text(lines,x,y);return y+lines.length*leading;}
function addLogo(d:PdfDoc,logo:string|null,x:number,y:number,w:number,h:number){if(logo){try{d.addImage(logo,'JPEG',x,y,w,h);}catch{}}}
function drawHeader(d:PdfDoc,root:ParentNode,W:number,m:number,logo:string|null,kind:'donation'|'payment'){
 const popup=!!el(root,'.letterhead'), header=el(root,'header');
 const brand=txt(el(root,'.brand h1'))||'NAVSTAR DIGITAL HUB', motto=txt(el(root,'.motto'))||'HOME OF TECHNOCRATS';
 const title=txt(el(root,'.receipt-label h2'))|| (kind==='donation'?'DONATION RECEIPT':'PAYMENT RECEIPT');
 const serial=txt(el(root,'.serial'))||'OFFICIAL RECEIPT';
 const contacts=txt(el(root,'.contacts'))||'0797 688 576 · 0706 637 485\nnavstardigitalhub@gmail.com · P.O. Box 546-50200, Bungoma, Kenya';
 const generated=txt(el(root,'.generated,.gen'));
 const headH=popup?53:51;
 // Smooth full-width gradient blended from navy through royal blue into teal.
 const stops:[[number,number,number],[number,number,number],[number,number,number]]=[[6,27,59],[11,67,135],[8,123,131]];
 const mix=(a:number,b:number,t:number)=>Math.round(a+(b-a)*t);
 for(let i=0;i<120;i++){const t=i/119,seg=t<.66?0:1,local=seg===0?t/.66:(t-.66)/.34,a=stops[seg],b=stops[seg+1];d.setFillColor(mix(a[0],b[0],local),mix(a[1],b[1],local),mix(a[2],b[2],local)).rect(W*i/120,0,W/120+.15,headH,'F');}
 d.setFillColor(229,184,75).rect(0,headH,W,1.4,'F');
 addLogo(d,logo,m,8,28,27);
 const tx=m+33,rightX=W-m,rightW=64,leftW=rightX-tx-rightW-5;
 d.setFont('helvetica','bold').setFontSize(17).setTextColor(255,255,255).text(brand,tx,14);
 d.setFontSize(8.5).setTextColor(255,221,131).text(motto,tx,21);
 wrap(d,contacts,tx,29,Math.max(65,leftW),7.2,[238,246,255],3.8);
 d.setFont('helvetica','bold').setFontSize(7.4).setTextColor(219,237,255).text('OFFICIAL DIGITAL DOCUMENT',rightX,11,{align:'right'});
 d.setFontSize(13.5).setTextColor(255,255,255).text(title,rightX,20,{align:'right'});
 const serialW=52,serialX=rightX-serialW;
 d.setFillColor(255,245,246).setDrawColor(255,214,218).roundedRect(serialX,25,serialW,12,2.5,2.5,'FD');
 d.setFontSize(9.2).setTextColor(185,28,28).text(serial,serialX+serialW/2,32.8,{align:'center'});
 if(generated){d.setFont('helvetica','normal').setFontSize(7.1).setTextColor(238,246,255).text(generated,rightX,42,{align:'right'});}
 return {serial,headH};
}
function drawDonation(root:ParentNode,filename:string,C:PdfCtor,logo:string|null,qr:string|null){
 const d=new C({orientation:'portrait',unit:'mm',format:'a4',compress:true}),W=d.internal.pageSize.getWidth(),H=d.internal.pageSize.getHeight(),m=9.5,inner=W-2*m;
 drawHeader(d,root,W,m,logo,'donation');
 const popup=!!el(root,'.letterhead');
 const status=txt(el(root,'.status'))||'✓ PAYMENT RECEIVED · SAFARICOM CONFIRMED';
 d.setFillColor(220,252,231).roundedRect(m,61,inner,9,3,3,'F');
 d.setFont('helvetica','bold').setFontSize(8).setTextColor(22,101,52).text(status.toUpperCase(),m+4,67);
 const left=el(root,popup?'.details .detail-box:first-child':'.grid .box:first-child');
 const right=el(root,popup?'.details .detail-box:nth-child(2)':'.grid .box:nth-child(2)');
 const boxY=75,boxH=46,gap=6,cw=(inner-gap)/2;
 const drawDetail=(node:Element|null,x:number)=>{
   d.setFillColor(255,255,255).setDrawColor(211,225,241).roundedRect(x,boxY,cw,boxH,3,3,'FD');
   const label=txt(el(node||root,'.section-title,.label'))||'PAYMENT DETAILS';
   const all=txt(node);const body=all.replace(label,'').trim();
   d.setFont('helvetica','bold').setFontSize(8).setTextColor(74,103,137).text(label.toUpperCase(),x+4,boxY+6);
   wrap(d,body,x+5,boxY+16,cw-10,9,[24,47,75],4.6);
 };
 drawDetail(left,m);drawDetail(right,m+cw+gap);
 const amountNode=el(root,popup?'.amount-panel':'.amount');
 const amountText=txt(amountNode);
 const amountLabel=txt(el(amountNode||root,'span,.label'))||'AMOUNT RECEIVED';
 const amountValue=txt(el(amountNode||root,'strong'));
 const amountSub=txt(el(amountNode||root,'small'));
 const amountY=127;
 d.setFillColor(235,245,255).setDrawColor(185,215,245).roundedRect(m,amountY,inner,25,3,3,'FD');
 d.setFont('helvetica','bold').setFontSize(8).setTextColor(49,84,119).text(amountLabel.toUpperCase(),m+7,amountY+9);
 wrap(d,amountSub||'Confirmed donation · Kenya Shillings',m+6,amountY+16,inner*.58,7,[83,105,128],3);
 d.setFont('helvetica','bold').setFontSize(21).setTextColor(7,91,73).text(amountValue||amountText.replace(amountLabel,'').trim(),W-m-6,amountY+17,{align:'right'});
 const confirmation=txt(el(root,'.confirmation'))||'Payment confirmation\nThis digital receipt confirms that the donation shown above was received after confirmation from Safaricom M-Pesa. The Navstar serial number is separate from the Safaricom transaction code.';
 d.setFillColor(240,253,250).rect(m,160,inner,28,'F');d.setFillColor(13,148,136).rect(m,160,1.3,28,'F');
 wrap(d,confirmation,m+6,168,inner-12,8,[36,72,91],4.5);
 d.setDrawColor(220,230,240).line(m,196,W-m,196);
 const qrText=txt(el(root,popup?'.qr-copy':'.qr'));
 wrap(d,qrText||'Digital receipt QR code\nScan to read the receipt reference, Safaricom transaction code, amount and confirmed payment status. Keep this receipt for your records.\nNAVSTAR DIGITAL HUB · HOME OF TECHNOCRATS',m,210,inner-42,8,[83,105,128],4.6);
 if(qr){try{d.addImage(qr,'PNG',W-m-34,204,32,32);}catch{}}
 d.setFont('helvetica','bold').setFontSize(6.1).setTextColor(11,67,135).text('NAVSTAR DIGITAL HUB · HOME OF TECHNOCRATS',m,241);
 d.setDrawColor(11,67,135).line(m,251,W-m,251);
 const foot=txt(el(root,popup?'.footer':'.foot'));
 const footParts=foot.split(/Official receipt/i);
 wrap(d,footParts[0]||'Thank you for supporting digital learning. Electronically generated by Navstar Digital Hub.',m,259,inner*.55,7,[96,120,142],4);
 wrap(d,footParts[1]?'Official receipt'+footParts[1]:'Official receipt · No physical signature required\nGenerated in East Africa Time (EAT)',W-m-inner*.42,259,inner*.42,7,[96,120,142],4);
 const appreciation=el(root,'.appreciation');
 if(appreciation){
  d.addPage();d.setFillColor(6,27,59).rect(0,0,W,30,'F');d.setFillColor(229,184,75).rect(0,30,W,1.2,'F');
  d.setFont('helvetica','bold').setFontSize(14).setTextColor(255,255,255).text('NAVSTAR DIGITAL HUB',m,14);
  d.setFontSize(7).setTextColor(246,215,125).text('HOME OF TECHNOCRATS · LETTER OF APPRECIATION',m,21);
  let y=44;const title=txt(el(appreciation,'h2'))||'Thank you for your generosity';d.setFontSize(15).setTextColor(11,67,135).text(title,m,y);y+=12;
  for(const p of Array.from(appreciation.querySelectorAll('p'))){const text=txt(p);if(text){y=wrap(d,text,m,y,inner,9,[51,75,101],5)+5;if(y>270){d.addPage();y=20;}}}
 }
 void d.save(filename);
}
function drawPayment(root:ParentNode,filename:string,C:PdfCtor,logo:string|null,qr:string|null){
 const d=new C({orientation:'portrait',unit:'mm',format:'a4',compress:true}),W=d.internal.pageSize.getWidth(),m=9.5,inner=W-2*m;
 drawHeader(d,root,W,m,logo,'payment');
 const status=txt(el(root,'.inline-flex.rounded-full'))||'✓ PAYMENT RECEIVED · CONFIRMED';
 d.setFillColor(220,252,231).roundedRect(m,56,inner,7,3,3,'F');d.setFont('helvetica','bold').setFontSize(6.5).setTextColor(22,101,52).text(status.toUpperCase(),m+3,60.5);
 const sections=Array.from(root.querySelectorAll('section')).slice(0,2),cw=(inner-5)/2;
 sections.forEach((s,i)=>{const x=m+i*(cw+5);d.setFillColor(255,255,255).setDrawColor(211,225,241).roundedRect(x,68,cw,39,3,3,'FD');const title=txt(s.querySelector('p'));d.setFont('helvetica','bold').setFontSize(6.4).setTextColor(74,103,137).text(title.toUpperCase(),x+4,74);wrap(d,txt(s).replace(title,''),x+4,81,cw-8,7.2,[24,47,75],3.6);});
 const amountText=txt(el(root,'.bg-gradient-to-r.from-blue-50'))||txt(el(root,'main'));const amountLine=amountText.match(/(?:KSh|KES)\s?[\d,]+/i)?.[0]||'';
 d.setFillColor(235,245,255).setDrawColor(185,215,245).roundedRect(m,113,inner,21,3,3,'FD');d.setFont('helvetica','bold').setFontSize(6.6).setTextColor(49,84,119).text('AMOUNT RECEIVED',m+6,120);d.setFontSize(18).setTextColor(7,91,73).text(amountLine,W-m-6,127,{align:'right'});
 const confirm=txt(el(root,'.border-l-4'));d.setFillColor(240,253,250).rect(m,139,inner,22,'F');d.setFillColor(13,148,136).rect(m,139,1.1,22,'F');wrap(d,confirm,m+5,145,inner-10,6.2,[36,72,91],3.7);
 d.setDrawColor(220,230,240).line(m,167,W-m,167);wrap(d,txt(el(root,'img[alt*="QR" i]')?.parentElement||null)||'Digital receipt QR code\nScan to verify this payment.',m,178,inner-38,6.2,[83,105,128],3.8);if(qr){try{d.addImage(qr,'PNG',W-m-29,172,27,27);}catch{}}
 d.setDrawColor(11,67,135).line(m,210,W-m,210);wrap(d,'Thank you for your payment. Electronically generated by Navstar Digital Hub.',m,216,inner*.55,5.8,[96,120,142],3.3);wrap(d,'Official receipt · No physical signature required\nGenerated in East Africa Time (EAT)',W-m-inner*.42,216,inner*.42,5.8,[96,120,142],3.3);
 void d.save(filename);
}
async function create(source:HTMLElement|string,filename:string):Promise<void>{
 const C=await getPdf(),parsed=typeof source==='string'?new DOMParser().parseFromString(source,'text/html'):null,root:ParentNode=parsed?.body||source as HTMLElement;
 const logoUrl=root.querySelector('img[alt*="logo" i]')?.getAttribute('src')||'/Navstar_Official_Logo.jpg',qrUrl=root.querySelector('img[alt*="QR" i],img.qr')?.getAttribute('src');
 const [logo,qr]=await Promise.all([dataUrl(logoUrl),dataUrl(qrUrl)]);
 if(el(root,'.letterhead,.head'))drawDonation(root,filename,C,logo,qr);else drawPayment(root,filename,C,logo,qr);
}
/** Draws a fixed, clean Navstar receipt layout directly into PDF; no HTML canvas or print dialog. */
export async function downloadReceiptElementPdf(element:HTMLElement,filename:string):Promise<void>{await create(element,filename);}
export async function downloadReceiptHtmlPdf(html:string,filename:string):Promise<void>{await create(html,filename);}
