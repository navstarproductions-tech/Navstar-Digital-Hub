import { requireRole } from '../../_shared/auth.js';
import { error,isSameOrigin,json,readJson,safeString,uuid } from '../../_shared/http.js';

const fieldTypes=new Set(['text','textarea','email','phone','number','date','select','checkbox']);
function cleanFields(input){
  if(!Array.isArray(input)||input.length<1||input.length>30)throw new Error('Add between 1 and 30 form fields.');
  const ids=new Set();
  return input.map((raw,index)=>{
    const id=safeString(raw?.id,60)||'field-'+(index+1);
    const label=safeString(raw?.label,100);
    const type=safeString(raw?.type,20);
    const required=raw?.required===true;
    const options=Array.isArray(raw?.options)?raw.options.map(value=>safeString(value,80)).filter(Boolean).slice(0,30):[];
    if(!label||!fieldTypes.has(type)||ids.has(id))throw new Error('Check the label and type for form field '+(index+1)+'.');
    if(type==='select'&&options.length<1)throw new Error('Add at least one option to '+label+'.');
    ids.add(id);
    return {id,label,type,required,options:type==='select'?options:[]};
  });
}
function slugify(value){return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);}
export async function onRequestGet({request,env}){
  if(!env.DB)return error('Online forms are not configured.',503);
  const access=await requireRole(request,env,['admin','principal']);if(access.response)return access.response;
  const [forms,submissions]=await Promise.all([
    env.DB.prepare('SELECT id,slug,title,description,audience,fields_json AS fieldsJson,status,created_at AS createdAt,updated_at AS updatedAt FROM online_forms ORDER BY updated_at DESC').all(),
    env.DB.prepare('SELECT s.id,s.form_id AS formId,s.respondent_email AS respondentEmail,s.respondent_name AS respondentName,s.answers_json AS answersJson,s.status,s.review_note AS reviewNote,s.submitted_at AS submittedAt,f.title AS formTitle FROM online_form_submissions s JOIN online_forms f ON f.id=s.form_id ORDER BY s.submitted_at DESC LIMIT 1000').all()
  ]);
  const rows=(forms.results||[]).map(form=>{let fields=[];try{fields=JSON.parse(form.fieldsJson||'[]')}catch{}return {...form,fields,submissionCount:(submissions.results||[]).filter(item=>item.formId===form.id).length};});
  const items=(submissions.results||[]).map(item=>{let answers={};try{answers=JSON.parse(item.answersJson||'{}')}catch{}return {...item,answers};});
  return json({forms:rows,submissions:items});
}
export async function onRequestPost({request,env}){
  if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
  if(!env.DB)return error('Online forms are not configured.',503);
  const access=await requireRole(request,env,['admin']);if(access.response)return access.response;
  let body;try{body=await readJson(request,32*1024)}catch{return error('Invalid form definition.');}
  const title=safeString(body.title,160),description=safeString(body.description,4000),audience=safeString(body.audience,20)||'public';
  if(title.length<2||!['public','student','customer'].includes(audience))return error('Enter a form title and a valid audience.');
  let fields;try{fields=cleanFields(body.fields)}catch(e){return error(e instanceof Error?e.message:'Invalid form fields.');}
  const slug=slugify(safeString(body.slug,120)||title);
  if(slug.length<2)return error('Enter a valid public form link name.');
  const status=safeString(body.status,20)||'draft';
  if(!['draft','published'].includes(status))return error('New forms must be draft or published.');
  const id=uuid();
  try{await env.DB.prepare('INSERT INTO online_forms(id,slug,title,description,audience,fields_json,status,created_by) VALUES(?,?,?,?,?,?,?,?)').bind(id,slug,title,description,audience,JSON.stringify(fields),status,access.user.id).run();}
  catch{return error('That form link name is already in use. Choose another link name.',409);}
  await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),access.user.id,'online_form_created','online_form',id).run();
  return json({created:true,id,slug},201);
}
export async function onRequestPatch({request,env}){
  if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
  if(!env.DB)return error('Online forms are not configured.',503);
  const access=await requireRole(request,env,['admin']);if(access.response)return access.response;
  let body;try{body=await readJson(request,32*1024)}catch{return error('Invalid form update.');}
  if(body.action==='review_submission'){
    const id=safeString(body.id,80),status=safeString(body.status,20),note=safeString(body.reviewNote,1000);
    if(!id||!['reviewed','rejected','submitted'].includes(status))return error('Choose a valid submission decision.');
    if(status==='rejected'&&note.trim().length<5)return error('Enter a short reason before rejecting this submission.');
    const result=await env.DB.prepare('UPDATE online_form_submissions SET status=?,review_note=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?').bind(status,note,access.user.id,id).run();
    if(!result.meta?.changes)return error('Form submission not found.',404);
    await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),access.user.id,'online_form_submission_reviewed','online_form_submission',id).run();
    return json({saved:true,status});
  }
  const id=safeString(body.id,80),title=safeString(body.title,160),description=safeString(body.description,4000),audience=safeString(body.audience,20),status=safeString(body.status,20);
  if(!id||title.length<2||!['public','student','customer'].includes(audience)||!['draft','published','archived'].includes(status))return error('Check the form title, audience and publication status.');
  let fields;try{fields=cleanFields(body.fields)}catch(e){return error(e instanceof Error?e.message:'Invalid form fields.');}
  const slug=slugify(safeString(body.slug,120)||title);
  if(slug.length<2)return error('Enter a valid form link name.');
  try{
    const result=await env.DB.prepare('UPDATE online_forms SET slug=?,title=?,description=?,audience=?,fields_json=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(slug,title,description,audience,JSON.stringify(fields),status,id).run();
    if(!result.meta?.changes)return error('Form not found.',404);
  }catch{return error('That form link name is already in use. Choose another link name.',409);}
  await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),access.user.id,'online_form_updated','online_form',id).run();
  return json({saved:true,id,slug,status});
}
export async function onRequestDelete({request,env}){
  if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
  if(!env.DB)return error('Online forms are not configured.',503);
  const access=await requireRole(request,env,['admin']);if(access.response)return access.response;
  let body;try{body=await readJson(request,2048)}catch{return error('Invalid archive request.');}
  const id=safeString(body.id,80);if(!id)return error('Select a form to archive.');
  const result=await env.DB.prepare("UPDATE online_forms SET status='archived',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status!='archived'").bind(id).run();
  if(!result.meta?.changes)return error('Form not found or already archived.',404);
  await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),access.user.id,'online_form_archived','online_form',id).run();
  return json({archived:true});
}
