import { requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString } from '../../_shared/http.js';

const allowed = new Set([
  'student-projects','scholarships','certificates','alumni','report-cards','auto-reports','attendance','class-rating',
  'online-forms','reports','songs-music','news-updates','events','demo-previews','cv-builder','timetable',
  'online-classes','eclass-meetings','student-chat','support-tickets','broadcast-social','sms-alerts','birthday-center',
  'about-us','campus-history','device-management','ict-portal','customer-carts','maintenance'
]);
const id = () => crypto.randomUUID();

function cleanDetails(value) {
  if (typeof value !== 'string') return '';
  return value.slice(0, 12000);
}

export async function onRequestGet({request,env}) {
  if (!env.DB) return error('Admin workspace storage is not configured.',503);
  const access = await requireRole(request,env,['admin','principal']);
  if (access.response) return access.response;
  const url = new URL(request.url);
  const workspace = safeString(url.searchParams.get('section'),80);
  const subtab = safeString(url.searchParams.get('subtab') || '',100);
  if (!allowed.has(workspace)) return error('This workspace does not use the general records register.',400);
  const result = await env.DB.prepare(`SELECT id,workspace,subtab,title,status,details,data_json,created_at,updated_at
    FROM admin_workspace_records WHERE workspace=? AND (?='' OR subtab=?)
    ORDER BY updated_at DESC LIMIT 500`).bind(workspace,subtab,subtab).all();
  const records = (result.results || []).map(row => {
    let data = {};
    try { data = JSON.parse(row.data_json || '{}'); } catch {}
    return {...row,...(data && typeof data==='object' && !Array.isArray(data) ? data : {})};
  });
  return json({records});
}

export async function onRequestPost({request,env}) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.',403);
  if (!env.DB) return error('Admin workspace storage is not configured.',503);
  const access = await requireRole(request,env,['admin']);
  if (access.response) return access.response;
  let body; try { body=await readJson(request,20000); } catch { return error('Enter valid record details.'); }
  const workspace=safeString(body.workspace,80), subtab=safeString(body.subtab || '',100);
  const title=safeString(body.title,180), status=safeString(body.status || 'active',40);
  const details=cleanDetails(body.details);
  if (!allowed.has(workspace)) return error('This workspace cannot use the general records register.',400);
  if (!title) return error('Enter a record title.');
  const recordId=id();
  await env.DB.prepare(`INSERT INTO admin_workspace_records
    (id,workspace,subtab,title,status,details,data_json,created_by,updated_by)
    VALUES (?,?,?,?,?,?,?,?,?)`).bind(recordId,workspace,subtab,title,status,details,JSON.stringify({}),access.user.id,access.user.id).run();
  return json({record:{id:recordId,workspace,subtab,title,status,details}},201);
}

export async function onRequestPut({request,env}) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.',403);
  if (!env.DB) return error('Admin workspace storage is not configured.',503);
  const access = await requireRole(request,env,['admin']);
  if (access.response) return access.response;
  let body; try { body=await readJson(request,20000); } catch { return error('Enter valid record details.'); }
  const recordId=safeString(body.id,80), workspace=safeString(body.workspace,80);
  const title=safeString(body.title,180), status=safeString(body.status,40), details=cleanDetails(body.details);
  if (!recordId || !allowed.has(workspace) || !title) return error('Record details are incomplete.');
  const result=await env.DB.prepare(`UPDATE admin_workspace_records SET title=?,status=?,details=?,updated_by=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND workspace=?`).bind(title,status || 'active',details,access.user.id,recordId,workspace).run();
  if (!result.meta?.changes) return error('The record was not found in this workspace.',404);
  return json({success:true});
}

export async function onRequestDelete({request,env}) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.',403);
  if (!env.DB) return error('Admin workspace storage is not configured.',503);
  const access = await requireRole(request,env,['admin']);
  if (access.response) return access.response;
  let body; try { body=await readJson(request,4096); } catch { return error('Choose a record to delete.'); }
  const workspace=safeString(body.workspace,80), recordId=safeString(body.id,80);
  if (!allowed.has(workspace) || !recordId) return error('Record details are incomplete.');
  const result=await env.DB.prepare('DELETE FROM admin_workspace_records WHERE id=? AND workspace=?').bind(recordId,workspace).run();
  if (!result.meta?.changes) return error('The record was not found in this workspace.',404);
  return json({success:true});
}
