import { requireRole } from '../../_shared/auth.js';
import { error,json,safeString } from '../../_shared/http.js';

export async function onRequestGet({request,env}){
  if(!env.DB)return error('File metadata database is not configured.',503);
  const access=await requireRole(request,env,['admin','principal']);if(access.response)return access.response;
  const url=new URL(request.url);
  const q=safeString(url.searchParams.get('q'),120);
  const module=safeString(url.searchParams.get('module'),80);
  const type=safeString(url.searchParams.get('type'),80);
  const status=safeString(url.searchParams.get('status')||'active',20);
  const page=Math.max(1,Math.min(10000,Number(url.searchParams.get('page'))||1));
  const limit=50,offset=(page-1)*limit;
  const where=[],values=[];
  if(q){where.push('(original_name LIKE ? OR description LIKE ? OR object_key LIKE ?)');values.push('%'+q+'%','%'+q+'%','%'+q+'%');}
  if(module){where.push('module=?');values.push(module);}
  if(type){where.push('mime_type LIKE ?');values.push(type+'%');}
  if(status!=='all'){where.push('status=?');values.push(status);}
  const clause=where.length?' WHERE '+where.join(' AND '):'';
  const [rows,total]=await Promise.all([
    env.DB.prepare('SELECT id,original_name AS originalName,extension,mime_type AS mimeType,size_bytes AS sizeBytes,module,record_id AS recordId,owner_id AS ownerId,uploaded_by AS uploadedBy,visibility,status,description,etag,created_at AS createdAt,deleted_at AS deletedAt FROM stored_files'+clause+' ORDER BY created_at DESC LIMIT ? OFFSET ?').bind(...values,limit,offset).all(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM stored_files'+clause).bind(...values).first()
  ]);
  return json({files:rows.results||[],page,limit,total:Number(total?.count||0),pages:Math.ceil(Number(total?.count||0)/limit)});
}
