import { error, isSameOrigin, json, safeString, uuid } from '../_shared/http.js';

const allowed = new Set(['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png']);
const maxBytes = 8 * 1024 * 1024;

export async function onRequestPost({request,env}) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.',403);
  if (!env.DB) return error('Staff recruitment database is not configured.',503);
  let name='',email='',phone='',position='',specialisations='',qualifications='',experience='',coverLetter='',file=null,honeypot='';
  const type=request.headers.get('content-type')||'';
  if(type.includes('multipart/form-data')) {
    let form; try { form=await request.formData(); } catch { return error('Invalid application form.'); }
    name=safeString(form.get('name'),140);email=safeString(form.get('email'),254).toLowerCase();phone=safeString(form.get('phone'),32);
    position=safeString(form.get('position'),120);specialisations=safeString(form.get('specialisations'),1000);
    qualifications=safeString(form.get('qualifications'),2000);experience=safeString(form.get('experience'),3000);
    coverLetter=safeString(form.get('coverLetter'),5000);honeypot=safeString(form.get('website'),200);
    const candidate=form.get('document');if(candidate instanceof File&&candidate.size>0)file=candidate;
  } else {
    let body;try{body=await request.json();}catch{return error('Invalid application form.');}
    name=safeString(body.name,140);email=safeString(body.email,254).toLowerCase();phone=safeString(body.phone,32);
    position=safeString(body.position,120);specialisations=safeString(body.specialisations,1000);
    qualifications=safeString(body.qualifications,2000);experience=safeString(body.experience,3000);
    coverLetter=safeString(body.coverLetter,5000);honeypot=safeString(body.website,200);
  }
  if(honeypot)return json({submitted:true});
  if(name.length<3||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||phone.length<9||position.length<2||qualifications.length<2)return error('Complete your name, valid email, phone, position and qualifications.');
  if(file&&(!allowed.has(file.type)||file.size>maxBytes))return error('Attach a PDF, Word document, JPG or PNG up to 8 MB.');
  const id=uuid();let documentKey=null;
  if(file){
    if(!env.DOCS)return error('Application document storage is not configured. Please submit without an attachment or contact Navstar support.',503);
    documentKey='staff-applications/'+id;
    await env.DOCS.put(documentKey,file.stream(),{httpMetadata:{contentType:file.type}});
  }
  try{
    await env.DB.prepare('INSERT INTO staff_applications(id,applicant_name,email,phone,position_applied,subject_specialisations,qualifications,experience,cover_letter,document_key,document_name,document_mime_type) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(id,name,email,phone,position,specialisations,qualifications,experience,coverLetter,documentKey,file?safeString(file.name,180):null,file?.type||null).run();
  }catch(e){if(documentKey)await env.DOCS?.delete(documentKey);console.error('Staff application save failed',String(e));return error('Your application could not be saved. Please try again later.',500);}
  return json({submitted:true,reference:id,message:'Your staff application has been received by Navstar Digital Hub.'},201);
}
