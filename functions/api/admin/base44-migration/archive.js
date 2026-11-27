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
      COUNT(r.id) AS saved_records
    FROM base44_migration_tokens t
    LEFT JOIN base44_legacy_records r ON r.migration_batch = t.token_hash
    GROUP BY t.token_hash
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

  const entityRows = await env.DB.prepare(`
    SELECT entity_name, COUNT(*) AS count
    FROM base44_legacy_records
    WHERE migration_batch = ?
    GROUP BY entity_name
    ORDER BY entity_name
  `).bind(selected.id).all();
  const rows = await env.DB.prepare(`
    SELECT entity_name, source_id, source_created_at, source_updated_at, record_json, imported_at
    FROM base44_legacy_records
    WHERE migration_batch = ?
    ORDER BY entity_name, source_id
    LIMIT 2000
  `).bind(selected.id).all();
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
    truncated: selected.savedRecords > records.length
  });
}
