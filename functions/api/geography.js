import { json } from '../_shared/http.js';

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ locationOptions: [], subLocationOptions: [] });
  const row = await env.DB.prepare("SELECT value FROM system_state WHERE key = 'admin-configuration'").first();
  let config = {};
  try { config = JSON.parse(row?.value || '{}'); } catch { config = {}; }
  const campuses = config.campuses || {};
  const lines = value => String(value || '').split(/\r?\n/).map(item => item.trim()).filter(Boolean).slice(0, 2000);
  return json({ locationOptions: lines(campuses.locationOptions), subLocationOptions: lines(campuses.subLocationOptions) });
}
