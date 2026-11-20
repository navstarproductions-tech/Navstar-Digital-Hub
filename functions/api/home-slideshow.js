import { json } from '../_shared/http.js';

const defaults = { homeSlideSeconds: 6.5, homeFadeSeconds: 1.1 };
export async function onRequestGet({ env }) {
  if (!env.DB) return json({ images: [], settings: defaults });
  const row = await env.DB.prepare("SELECT value FROM system_state WHERE key = 'admin-configuration'").first();
  let settings = {};
  try { settings = row?.value ? JSON.parse(row.value) : {}; } catch { settings = {}; }
  const home = settings?.['home-content'] || {};
  const images = Array.from({ length: 10 }, (_, index) => home['homeSlideImage' + (index + 1)])
    .filter(url => typeof url === 'string' && url.trim())
    .slice(0, 10)
    .map(url => ({ url }));
  return json({ images, settings: { homeSlideSeconds: Number(home.homeSlideSeconds) || defaults.homeSlideSeconds, homeFadeSeconds: Number(home.homeFadeSeconds) || defaults.homeFadeSeconds } });
}
