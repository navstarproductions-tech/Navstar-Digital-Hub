import { json } from '../_shared/http.js';

const BRANDING_KEYS = [
  'logoAssetUrl',
  'loginBackgroundUrl',
  'adminGateBackgroundUrl',
  'customerGateBackgroundUrl',
  'staffGateBackgroundUrl',
  'studentGateBackgroundUrl',
  'tutorGateBackgroundUrl',
];

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ branding: {} }, 200, { 'Cache-Control': 'no-store' });
  const row = await env.DB.prepare("SELECT value FROM system_state WHERE key = ?").bind('admin-configuration').first();
  let settings = {};
  try {
    settings = row?.value ? JSON.parse(row.value) : {};
  } catch {
    settings = {};
  }
  const branding = settings?.branding && typeof settings.branding === 'object' ? settings.branding : {};
  const safeBranding = Object.fromEntries(BRANDING_KEYS.map(key => [key, typeof branding[key] === 'string' ? branding[key] : '']));
  return json({ branding: safeBranding }, 200, { 'Cache-Control': 'no-store' });
}
