import { requireRole } from '../../../_shared/auth.js';
import { error, json } from '../../../_shared/http.js';

export async function onRequestGet({request,env}) {
  if(!env.DB) return error('Migration archive database is not configured.',503);
  const access=await requireRole(request,env,['admin']);
  if(access.response) return access.response;
  const latest=await env.DB.prepare('SELECT token_hash,created_at,used_at,records_received FROM base44_migration_tokens ORDER BY created_at DESC LIMIT 1').first();
  if(!latest) return json({batch:null,entities:[],records:[]});
  const rows=await env.DB.prepare('SELECT entity_name,source_id,source_created_at,source_updated_at,record_json,imported_at FROM base44_legacy_records WHERE migration_batch=? ORDER BY entity_name,source_id LIMIT 1000').bind(latest.token_hash).all();
  const records=(rows.results||[]).map(row=>{
    let data={}; try{data=JSON.parse(row.record_json);}catch{}
    return {entityName:row.entity_name,sourceId:row.source_id,createdAt:row.source_created_at,updatedAt:row.source_updated_at,importedAt:row.imported_at,data};
  });
  const counts={};
  for(const row of records) counts[row.entityName]=(counts[row.entityName]||0)+1;
  return json({batch:{createdAt:latest.created_at,completed:!!latest.used_at,recordsReceived:latest.records_received},entities:Object.entries(counts).map(([entityName,count])=>({entityName,count})),records});
}
