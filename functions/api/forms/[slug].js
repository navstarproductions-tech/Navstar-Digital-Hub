import { getSession } from '../../_shared/auth.js';
import { getCustomerSession } from '../../_shared/customer-auth.js';
import { error,isSameOrigin,json,normalizePhone,readJson,safeString,uuid } from '../../_shared/http.js';

const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function parseFields(value){try{const fields=JSON.parse(value||'[]');return Array.isArray(fields)?fields:[]}catch{return [];}}
async function accessForAudience(request,env,audience){
  if(audience==='public')return {user:null,customer:null};
  if(audience==='student'){const user=await getSession(request,env);if(!user)return {error:error('Sign in with your student account to submit this form.',401)};if(user.role!=='student')return {error:error('This form is for student accounts.',403)};return {user,customer:null};}
  const customer=await getCustomerSession(request,env);if(!customer)return {error:error('Sign in with your customer account to submit this form.',401)};
  return {user:null,customer};
}
export async function onRequestGet({request,env,params}){
  if(!env.DB)return error('Online forms are not configured.',503);
  const slug=safeString(params.slug,100);
  const form=await env.DB.prepare("SELECT id,slug,title,description,audience,fields_json AS fieldsJson FROM online_forms WHERE slug=? AND status='published'").bind(slug).first();
  if(!form)return error('This form is not available.',404);
  const access=await accessForAudience(request,env,form.audience);if(access.error)return access.error;
  return json({form:{id:form.id,slug:form.slug,title:form.title,description:form.description,audience:form.audience,fields:parseFields(form.fieldsJson)}});
}
export async function onRequestPost({request,env,params}){
  if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
  if(!env.DB)return error('Online forms are not configured.',503);
  let body;try{body=await readJson(request,32*1024)}catch{return error('Invalid form submission.');}
  const slug=safeString(params.slug,100);
  const form=await env.DB.prepare("SELECT id,title,audience,fields_json AS fieldsJson FROM online_forms WHERE slug=? AND status='published'").bind(slug).first();
  if(!form)return error('This form is not available.',404);
  const access=await accessForAudience(request,env,form.audience);if(access.error)return access.error;
  const fields=parseFields(form.fieldsJson),answers=body.answers&&typeof body.answers==='object'?body.answers:{},cleaned={};
  for(const field of fields){
    const value=answers[field.id];
    const text=typeof value==='string'?safeString(value,4000):value;
    const empty=text===undefined||text===null||text==='';
    if(field.required&&(empty||(field.type==='checkbox'&&text!==true)))return error('Complete the required field: '+field.label+'.');
    if(empty){cleaned[field.id]='';continue;}
    if(['text','textarea','email','phone','date','select'].includes(field.type)&&typeof text!=='string')return error('Enter a text response for '+field.label+'.');
    if(field.type==='email'&&(!emailPattern.test(String(text))||String(text).length>254))return error('Enter a valid email address for '+field.label+'.');
    if(field.type==='phone'){const phone=normalizePhone(text);if(!phone)return error('Enter a valid phone number for '+field.label+'.');cleaned[field.id]=phone;continue;}
    if(field.type==='number'){const number=Number(text);if(!Number.isFinite(number))return error('Enter a valid number for '+field.label+'.');cleaned[field.id]=number;continue;}
    if(field.type==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(String(text))||!Number.isFinite(Date.parse(String(text)+'T00:00:00Z'))))return error('Enter a valid date for '+field.label+'.');
    if(field.type==='select'&&!(field.options||[]).includes(String(text)))return error('Choose a valid option for '+field.label+'.');
    if(field.type==='checkbox'&&typeof text!=='boolean')return error('Choose a valid checkbox response for '+field.label+'.');
    cleaned[field.id]=text;
  }
  const respondentName=access.user?.name||access.customer?.fullName||safeString(body.respondentName,120);
  const respondentEmail=access.user?.email||access.customer?.email||safeString(body.respondentEmail,254).toLowerCase();
  if(respondentEmail&&!emailPattern.test(respondentEmail))return error('Enter a valid respondent email address.');
  await env.DB.prepare('INSERT INTO online_form_submissions(id,form_id,respondent_user_id,respondent_email,respondent_name,answers_json) VALUES(?,?,?,?,?,?)')
    .bind(uuid(),form.id,access.user?.id||access.customer?.id||null,respondentEmail,respondentName,JSON.stringify(cleaned)).run();
  return json({submitted:true,message:'Your response has been submitted successfully.'},201);
}
