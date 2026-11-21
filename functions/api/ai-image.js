import { getSession } from '../_shared/auth.js';
const MODEL = '@cf/black-forest-labs/flux-2-klein-4b';
const MAX_PROMPT = 4000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
function clean(value, max = 1000) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function decodeImage(value) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value || '');
  if (!match) throw new Error('Use a JPG, PNG or WebP reference image.');
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error('Each reference image must be 5 MB or smaller.');
  return { mime: match[1], bytes };
}
function eatDayStart() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return new Date(values.year + '-' + values.month + '-' + values.day + 'T00:00:00+03:00').toISOString();
}
async function usageIdentity(request, user) {
  const raw = user?.id ? 'user:' + user.id : 'ip:' + (request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || 'unknown');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function onRequestPost({ request, env }) {
  try {
    const origin = request.headers.get('Origin');
    if (origin && new URL(origin).origin !== new URL(request.url).origin) return json({ error: 'Cross-origin request rejected.' }, 403);
    if (!env?.AI || typeof env.AI.run !== 'function') return json({ error: 'Cloudflare Workers AI is not connected to this deployment.' }, 503);
    if (!env.DB) return json({ error: 'Navstar AI usage controls are temporarily unavailable. Please try again later.' }, 503);
    const sessionUser = await getSession(request, env).catch(() => null);
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid image request.' }, 400); }
    const settingsRow = env.DB ? await env.DB.prepare("SELECT value FROM system_state WHERE key = 'admin-configuration'").first().catch(() => null) : null;
    let settings = {};
    try { settings = JSON.parse(settingsRow?.value || '{}')?.['ai-assistant'] || {}; } catch { /* Use defaults. */ }
    if (settings.aiEnabled === false || settings.aiImageGeneration === false) return json({ error: 'AI image generation is disabled in Admin Settings → Navstar AI.' }, 403);
    const prompt = clean(body.prompt, MAX_PROMPT);
    if (!prompt) return json({ error: 'Describe the image you want to create or edit.' }, 400);
    const references = Array.isArray(body.images) ? body.images.slice(0, 4) : [];
    const identityHash = await usageIdentity(request, sessionUser);
    const generationLimit = Math.max(1, Math.min(20, Number(settings.aiDailyImageGenerations) || 5));
    const usageStart = eatDayStart();
    const usedRow = await env.DB.prepare("SELECT COUNT(*) AS total FROM api_rate_limits WHERE scope = 'ai-image-generation-day' AND key_hash = ? AND created_at >= ?").bind(identityHash, usageStart).first();
    const used = Number(usedRow?.total || 0);
    if (used >= generationLimit) return json({ error: 'You have reached today’s image-generation limit (' + generationLimit + '). Please try again tomorrow.', code: 'AI_IMAGE_GENERATION_DAILY_LIMIT', limit: generationLimit, used }, 429);
    if (references.length && settings.aiImageEditing === false) return json({ error: 'AI image editing is disabled in Admin Settings → Navstar AI.' }, 403);

    if (references.length && settings.aiImageEditing === false) return json({ error: 'AI image editing is disabled in Admin Settings → Navstar AI.' }, 403);
    await env.DB.prepare('INSERT INTO api_rate_limits (id, scope, key_hash, created_at) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), 'ai-image-generation-day', identityHash, new Date().toISOString()).run();
    const form = new FormData();
    form.append('prompt', prompt);
    const width = Math.max(256, Math.min(1536, Number(body.width) || 1024));
    const height = Math.max(256, Math.min(1536, Number(body.height) || 1024));
    form.append('width', String(width));
    form.append('height', String(height));
    if (Number.isInteger(body.seed)) form.append('seed', String(body.seed));
    for (let index = 0; index < references.length; index++) {
      const image = decodeImage(references[index]);
      form.append('input_image_' + index, new Blob([image.bytes], { type: image.mime }), 'reference-' + index + '.' + (image.mime === 'image/jpeg' ? 'jpg' : image.mime.split('/')[1]));
    }
    const serialized = new Response(form);
    const result = await env.AI.run(MODEL, { multipart: { body: serialized.body, contentType: serialized.headers.get('content-type') } });
    await env.DB.prepare('INSERT INTO api_rate_limits (id, scope, key_hash, created_at) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), 'ai-image-generation-day', identityHash, new Date().toISOString()).run();
    const encoded = typeof result?.image === 'string' ? result.image : '';
    if (!encoded) {
      console.error('[navstar-ai-image] Empty model output', JSON.stringify({ keys: Object.keys(result || {}) }));
      return json({ error: 'The image model did not return an image. Please try again.' }, 502);
    }
    return json({ image: encoded.startsWith('data:') ? encoded : 'data:image/png;base64,' + encoded, mimeType: 'image/png', model: MODEL });
  } catch (error) {
    const message = clean(error?.message, 260);
    console.error('[navstar-ai-image] generation failed', error?.name || 'Error', message);
    if (/limit|quota|neurons|rate.?limit|429/i.test(message)) return json({ error: 'The Cloudflare AI usage allowance or request limit has been reached. Please try again later.' }, 429);
    return json({ error: message || 'Navstar AI could not create this image. Please try again.' }, 502);
  }
}
export async function onRequestGet({ env }) {
  return json({ ok: Boolean(env?.AI && typeof env.AI.run === 'function'), provider: 'cloudflare-workers-ai', model: MODEL, capabilities: ['text-to-image', 'image-editing', 'multi-reference'] });
}
