import { requireRole } from '../../_shared/auth.js';
import { error,isSameOrigin,json,readJson,uuid } from '../../_shared/http.js';
import { getStorageSettings } from '../../_shared/storage.js';

const supported=new Set(['pdf','jpg','jpeg','png','webp','avif','txt','csv','doc','docx','xls','xlsx','ppt','pptx','mp3','wav','m4a','mp4','mov','webm','zip']);
const integer=(value,min,max,fallback)=>{const n=Number(value);return Number.isInteger(n)&&n>=min&&n<=max?n:fallback};
export async function onRequestGet({request,env}){
 if(!env.DB)return error('Storage settings database is not configured.',503);
 const access=await requireRole(request,env,['admin']);if(access.response)return access.response;
 return json({settings:await getStorageSettings(env.DB),supportedExtensions:[...supported]});
}
export async function onRequestPut({request,env}){
 if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
 if(!env.DB)return error('Storage settings database is not configured.',503);
 const access=await requireRole(request,env,['admin']);if(access.response)return access.response;
 let body;try{body=await readJson(request,8192)}catch{return error('Invalid storage settings.',400)}
 const current=await getStorageSettings(env.DB);
 const maxUploadMb=integer(body.maxUploadMb,1,100,current.maxUploadMb);
 const maxMediaMb=integer(body.maxMediaMb,1,500,current.maxMediaMb);
 const downloadUrlExpirySeconds=integer(body.downloadUrlExpirySeconds,60,900,current.downloadUrlExpirySeconds);
 const storageAlertGb=integer(body.storageAlertGb,1,10000,current.storageAlertGb);
 const retentionDays=integer(body.retentionDays,0,3650,current.retentionDays);
 const allowedExtensions=Array.isArray(body.allowedExtensions)?[...new Set(body.allowedExtensions.map(value=>String(value).toLowerCase()).filter(value=>supported.has(value)))]:current.allowedExtensions;
 if(!allowedExtensions.length)return error('Keep at least one supported file extension enabled.',400);
 await env.DB.prepare(`INSERT INTO storage_settings(id,max_upload_mb,max_media_mb,download_url_expiry_seconds,storage_alert_gb,retention_days,allowed_extensions_json,updated_by,updated_at)
 VALUES(1,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
 ON CONFLICT(id) DO UPDATE SET max_upload_mb=excluded.max_upload_mb,max_media_mb=excluded.max_media_mb,download_url_expiry_seconds=excluded.download_url_expiry_seconds,storage_alert_gb=excluded.storage_alert_gb,retention_days=excluded.retention_days,allowed_extensions_json=excluded.allowed_extensions_json,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
 .bind(maxUploadMb,maxMediaMb,downloadUrlExpirySeconds,storageAlertGb,retentionDays,JSON.stringify(allowedExtensions),access.user.id).run();
 await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),access.user.id,'storage_settings_updated','storage_settings','1').run();
 return json({saved:true,settings:await getStorageSettings(env.DB)});
}
