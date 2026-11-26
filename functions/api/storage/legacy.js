import { requireRole } from '../../_shared/auth.js';
import { error,json } from '../../_shared/http.js';

export async function onRequestGet({request,env}){
 if(!env.DB)return error('Legacy storage records are not available.',503);
 const access=await requireRole(request,env,['admin']);if(access.response)return access.response;
 const [media,employees,documents,forum,applications]=await Promise.all([
  env.DB.prepare("SELECT id,'media_assets' AS source,alt_text AS title,mime_type AS mimeType,size_bytes AS sizeBytes,created_at AS createdAt,object_key AS legacyKey FROM media_assets WHERE NOT EXISTS(SELECT 1 FROM stored_files s WHERE s.id=media_assets.id) ORDER BY created_at DESC LIMIT 100").all(),
  env.DB.prepare("SELECT id,'employee_documents' AS source,title,mime_type AS mimeType,size_bytes AS sizeBytes,created_at AS createdAt,object_key AS legacyKey FROM employee_documents WHERE NOT EXISTS(SELECT 1 FROM stored_files s WHERE s.id=employee_documents.id) ORDER BY created_at DESC LIMIT 100").all(),
  env.DB.prepare("SELECT id,'downloadable_documents' AS source,title,mime_type AS mimeType,size_bytes AS sizeBytes,created_at AS createdAt,object_key AS legacyKey FROM downloadable_documents WHERE NOT EXISTS(SELECT 1 FROM stored_files s WHERE s.id=downloadable_documents.id) ORDER BY created_at DESC LIMIT 100").all(),
  env.DB.prepare("SELECT id,'forum_media_assets' AS source,'Community photo' AS title,mime_type AS mimeType,size_bytes AS sizeBytes,created_at AS createdAt,object_key AS legacyKey FROM forum_media_assets WHERE NOT EXISTS(SELECT 1 FROM stored_files s WHERE s.id=forum_media_assets.id) ORDER BY created_at DESC LIMIT 100").all(),
  env.DB.prepare("SELECT id,'staff_applications' AS source,COALESCE(document_name,'Application document') AS title,COALESCE(document_mime_type,'application/octet-stream') AS mimeType,0 AS sizeBytes,created_at AS createdAt,document_key AS legacyKey FROM staff_applications WHERE document_key IS NOT NULL AND document_key<>'' AND NOT EXISTS(SELECT 1 FROM stored_files s WHERE s.id='staffdoc-'||staff_applications.id) ORDER BY created_at DESC LIMIT 100").all()
 ]);
 const files=[...(media.results||[]),...(employees.results||[]),...(documents.results||[]),...(forum.results||[]),...(applications.results||[])].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
 return json({legacyFiles:files,total:files.length,limitPerSource:100,note:'Legacy objects remain in their original buckets until each migration is verified. This list is capped at 100 records per source.'});
}
