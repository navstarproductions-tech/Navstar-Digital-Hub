import { requireRole } from '../../../_shared/auth.js';
import { error, json } from '../../../_shared/http.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('Migration archive database is not configured.', 503);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;

  // Return recent packages with their actual persisted record counts. Prefer the
  // newest package containing records so an empty token cannot hide a saved import.
  const packages = await env.DB.prepare(`
    SELECT t.token_hash, t.created_at, t.used_at, t.records_received,
      COALESCE(n.saved_records,o.saved_records,0) AS saved_records
    FROM base44_migration_tokens t
    LEFT JOIN (
      SELECT migration_batch,COUNT(*) AS saved_records
      FROM base44_legacy_archive_records GROUP BY migration_batch
    ) n ON n.migration_batch=t.token_hash
    LEFT JOIN (
      SELECT migration_batch,COUNT(*) AS saved_records
      FROM base44_legacy_records GROUP BY migration_batch
    ) o ON o.migration_batch=t.token_hash
    ORDER BY t.created_at DESC
    LIMIT 30
  `).all();
  const batches = (packages.results || []).map(row => ({
    id: row.token_hash,
    createdAt: row.created_at,
    completed: !!row.used_at,
    recordsReceived: Number(row.records_received || 0),
    savedRecords: Number(row.saved_records || 0)
  }));
  const requested = new URL(request.url).searchParams.get('batch');
  const selected = requested
    ? batches.find(item => item.id === requested)
    : batches.find(item => item.savedRecords > 0) || batches[0];
  if (!selected) return json({ batch: null, batches, entities: [], records: [], truncated: false });

  const newArchiveCount=await env.DB.prepare('SELECT COUNT(*) AS count FROM base44_legacy_archive_records WHERE migration_batch=?').bind(selected.id).first();
  const archiveTable=Number(newArchiveCount?.count||0)>0?'base44_legacy_archive_records':'base44_legacy_records';
  const entityRows = await env.DB.prepare(`
    SELECT entity_name, COUNT(*) AS count
    FROM ${archiveTable}
    WHERE migration_batch = ?
    GROUP BY entity_name
    ORDER BY entity_name
  `).bind(selected.id).all();
  const params = new URL(request.url).searchParams;
  const limit = Math.min(500, Math.max(1, Number(params.get('limit') || 500)));
  const offset = Math.max(0, Number(params.get('offset') || 0));
  const rows = await env.DB.prepare(`
    SELECT entity_name, source_id, source_created_at, source_updated_at, record_json, imported_at
    FROM ${archiveTable}
    WHERE migration_batch = ?
    ORDER BY entity_name, source_id
    LIMIT ? OFFSET ?
  `).bind(selected.id, limit, offset).all();
  const records = (rows.results || []).map(row => {
    let data = {};
    try { data = JSON.parse(row.record_json); } catch { data = { _archiveReadError: true }; }
    return {
      entityName: row.entity_name,
      sourceId: row.source_id,
      createdAt: row.source_created_at,
      updatedAt: row.source_updated_at,
      importedAt: row.imported_at,
      data
    };
  });
  const entityCounts = (entityRows.results || []).map(row => ({
    entityName: row.entity_name,
    count: Number(row.count || 0)
  }));
  return json({
    batch: selected,
    batches,
    entities: entityCounts,
    records,
    offset,
    nextOffset: offset + records.length < selected.savedRecords ? offset + records.length : null,
    truncated: selected.savedRecords > records.length + offset
  });
}
