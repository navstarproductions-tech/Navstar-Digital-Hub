import { json } from '../_shared/http.js';

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ stamp: null }, 200, { 'Cache-Control': 'no-store' });
  const row = await env.DB.prepare("SELECT value FROM system_state WHERE key = 'admin-configuration'").first();
  if (!row?.value) return json({ stamp: null }, 200, { 'Cache-Control': 'no-store' });
  try {
    const all = JSON.parse(row.value);
    const saved = all?.['rubber-stamp'] || {};
    const allowed = [
      'stampEnabled','shape','office_line','institution_name','address_line','status_word',
      'date_label','sign_label','signature_url','color_scheme','stamp_color','date_color',
      'font_scale','line_spacing','stampOpacity','stampPosition','stampWidthMm','stampMarginMm'
    ];
    const stamp = {};
    for (const key of allowed) if (saved[key] !== undefined) stamp[key] = saved[key];
    return json({ stamp }, 200, { 'Cache-Control': 'no-store' });
  } catch {
    return json({ stamp: null }, 200, { 'Cache-Control': 'no-store' });
  }
}
