import { json } from '../_shared/http.js';

function eastAfricaMinute() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day} ${value.hour}:${value.minute}`;
}

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ active: false, portals: [] });
  const row = await env.DB.prepare("SELECT value FROM system_state WHERE key = 'admin-configuration'").first();
  let config = {};
  try { config = JSON.parse(row?.value || '{}'); } catch { config = {}; }
  const settings = config.maintenance || {};
  const portals = String(settings.maintenancePortals || '').split(/[\r\n,]+/).map(value => value.trim().toLowerCase()).filter(Boolean);
  const now = eastAfricaMinute();
  const starts = String(settings.maintenanceStartAt || '').trim();
  const ends = String(settings.maintenanceReturnAt || '').trim();
  const validDate = value => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value);
  const active = settings.maintenanceEnabled === true && portals.length > 0 && validDate(starts) && validDate(ends) && starts <= now && now < ends;
  return json({ active, portals, message: String(settings.maintenanceMessage || 'Navstar Digital Hub is undergoing scheduled maintenance. Please check back soon.'), startsAt: starts, returnAt: ends, backgroundUrl: String(settings.maintenanceBackgroundUrl || ''), serverTime: now, timezone: 'Africa/Nairobi' });
}
