import { requireRole } from '../../_shared/auth.js';
import { assignAdmissionNumber } from '../../_shared/admissions.js';
import { error, isSameOrigin, json, readJson, safeString } from '../../_shared/http.js';

export async function onRequestPost(context) {
  const {request,env}=context;
  if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
  if(!env.DB)return error('Admissions database is not configured.',503);
  const access=await requireRole(request,env,['admin','admissions']);
  if(access.response)return access.response;
  let body;try{body=await readJson(request,2048);}catch{return error('Invalid request body.');}
  const enrollmentId=safeString(body.enrollmentId,80);
  if(!enrollmentId)return error('Select a student application.');
  try{
    const result=await assignAdmissionNumber(context,enrollmentId,access.user.id);
    return json(result);
  }catch(cause){
    return error(cause instanceof Error?cause.message:'Admission number could not be generated.',Number(cause?.status)||500);
  }
}
