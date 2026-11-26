import { requireRole } from '../../_shared/auth.js';
import { error,json } from '../../_shared/http.js';
import { storageConfig } from '../../_shared/storage.js';

async function safeCount(db,sql){try{const row=await db.prepare(sql).first();return Number(row?.count||0)}catch{return 0}}
export async function onRequestGet({request,env}){
  if(!env.DB)return error('File metadata database is not configured.',503);
  const access=await requireRole(request,env,['admin']);if(access.response)return access.response;
  let bucketConnected=false,connectionMessage='Not checked';
  try{
    storageConfig(env);
    await env.NAVSTAR_STORAGE.list({limit:1});
    bucketConnected=true;connectionMessage='Private R2 bucket is reachable';
  }catch(cause){connectionMessage=cause.message||'R2 connection failed'}
  const [totals,byModule,activeIntents,legacyMedia,legacyEmployee,legacyForum,legacyDownloads,legacyApplications]=await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS files,COALESCE(SUM(size_bytes),0) AS bytes,COALESCE(SUM(CASE WHEN status='deleted' THEN 1 ELSE 0 END),0) AS deleted FROM stored_files WHERE status IN ('active','deleted','quarantined')").first(),
    env.DB.prepare("SELECT module,COUNT(*) AS files,COALESCE(SUM(size_bytes),0) AS bytes FROM stored_files WHERE status='active' GROUP BY module ORDER BY bytes DESC").all(),
    safeCount(env.DB,"SELECT COUNT(*) AS count FROM storage_upload_intents WHERE expires_at>CURRENT_TIMESTAMP"),
    safeCount(env.DB,'SELECT COUNT(*) AS count FROM media_assets'),
    safeCount(env.DB,'SELECT COUNT(*) AS count FROM employee_documents'),
    safeCount(env.DB,'SELECT COUNT(*) AS count FROM forum_media_assets'),
    safeCount(env.DB,'SELECT COUNT(*) AS count FROM downloadable_documents'),
    safeCount(env.DB,"SELECT COUNT(*) AS count FROM staff_applications WHERE document_key IS NOT NULL AND document_key<>''")
  ]);
  return json({
    provider:'Cloudflare R2',
    bucketName:env.R2_BUCKET_NAME||'navstar-digital-hub-storage',
    bucketPrivate:true,
    bucketConnected,
    connectionMessage,
    credentialsConfigured:Boolean(env.R2_ACCOUNT_ID&&env.R2_ACCESS_KEY_ID&&env.R2_SECRET_ACCESS_KEY&&(env.R2_ENDPOINT||env.R2_ACCOUNT_ID)),
    totalFiles:Number(totals?.files||0),
    totalBytes:Number(totals?.bytes||0),
    deletedFiles:Number(totals?.deleted||0),
    activeUploadIntents:activeIntents,
    byModule:byModule.results||[],
    legacyStorage:{mediaAssets:legacyMedia,employeeDocuments:legacyEmployee,forumMediaAssets:legacyForum,downloadableDocuments:legacyDownloads,staffApplicationDocuments:legacyApplications},
    billingNote:'Storage usage is calculated from Navstar file metadata. Actual Cloudflare billing and provider-side usage are not exposed by this database estimate.'
  });
}
