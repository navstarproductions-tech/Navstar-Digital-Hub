import { requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, readJson } from '../../_shared/http.js';

const KEY = 'admin-configuration';
const MAX_BYTES = 48 * 1024;
const MAX_DEPTH = 5;

function clean(value, depth = 0) {
  if (depth > MAX_DEPTH) throw new Error('Settings data is nested too deeply.');
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Invalid number in settings.');
    return value;
  }
  if (typeof value === 'string') return value.slice(0, 8000);
  if (Array.isArray(value)) {
    if (value.length > 500) throw new Error('Too many entries in settings.');
    return value.map(item => clean(item, depth + 1));
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length > 120) throw new Error('Too many settings fields.');
    const result = {};
    for (const [key, item] of entries) {
      if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(key)) throw new Error('Invalid settings field name.');
      if (/password|secret|token|consumerkey|consumersecret|passkey|nationalid$|national_id/i.test(key)) throw new Error('Sensitive credentials and identity numbers cannot be stored in general settings.');
      result[key] = clean(item, depth + 1);
    }
    return result;
  }
  throw new Error('Unsupported settings value.');
}

async function readSettings(DB) {
  const row = await DB.prepare('SELECT value FROM system_state WHERE key = ?').bind(KEY).first();
  if (!row?.value) return {};
  try { const parsed = JSON.parse(row.value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; }
  catch { return {}; }
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('Settings database is not configured.', 503);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;
  return json({ settings: await readSettings(env.DB) });
}

export async function onRequestPut({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Settings database is not configured.', 503);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;
  let body;
  try { body = await readJson(request, MAX_BYTES); } catch { return error('Invalid settings request.'); }
  if (!body || typeof body.section !== 'string' || !/^[a-z][a-z0-9-]{1,79}$/.test(body.section) || !body.values || typeof body.values !== 'object' || Array.isArray(body.values)) return error('Choose a valid settings section and values.');
  let values;
  try { values = clean(body.values); } catch (e) { return error(e instanceof Error ? e.message : 'Invalid settings values.'); }
  if(body.section==='grading'){
    const maximum=Number(values.publishedMaximum);
    if(!Number.isFinite(maximum)||maximum<1||maximum>100)return error('The institution-wide published marks maximum must be between 1 and 1000.');
    const bands=String(values.gradeScale||'').split(/\r?\n/).map(line=>line.split('|').map(part=>part.trim())).filter(parts=>parts[0]&&parts[2]!==''&&parts[3]!==''&&Number.isFinite(Number(parts[2]))&&Number.isFinite(Number(parts[3]))).map(parts=>({grade:parts[0],min:Number(parts[2]),max:Number(parts[3])})).sort((a,b)=>a.min-b.min);
    if(!bands.length||bands[0].min!==0||bands[bands.length-1].max!==100)return error('The official grading scale must cover 0% through 100%.');
    for(let i=0;i<bands.length;i++){if(!bands[i].grade||bands[i].min<0||bands[i].max>100||bands[i].min>bands[i].max)return error('Check the official percentage grading bands.');if(i&&bands[i].min!==bands[i-1].max+1)return error('Official grading bands must be continuous, without gaps or overlaps.');}
  }
  if (body.section === 'academic-intakes' && typeof values.intakes === 'string') {
    const seen = new Set();
    for (const line of values.intakes.split(/\r?\n/).map(value => value.trim()).filter(Boolean)) {
      const parts = line.split('|').map(value => value.trim());
      if (parts.length !== 6 || !parts[0]) return error('Each intake must contain a name and five date fields.');
      const key = parts[0].toLowerCase();
      if (seen.has(key)) return error('The intake "' + parts[0] + '" already exists. Load the existing intake instead of creating it again.', 409);
      seen.add(key);
      for (const date of parts.slice(1)) if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return error('Intake dates must use YYYY-MM-DD.');
      if (parts[1] && parts[2] && parts[1] > parts[2]) return error('An intake enrollment opening date cannot be after its closing date.');
      if (parts[3] && parts[4] && parts[3] > parts[4]) return error('A training start date cannot be after its end date.');
    }
  }
  if (body.section === 'maintenance') {
    const allowed = new Set(['student','tutor','finance','principal','admissions','admin','customer']);
    const portals = String(values.maintenancePortals || '').split(/[\r\n,]+/).map(value => value.trim().toLowerCase()).filter(Boolean);
    if (portals.some(portal => !allowed.has(portal))) return error('Choose only the listed Navstar portals for maintenance.');
    if (values.maintenanceEnabled === true) {
      const starts = String(values.maintenanceStartAt || '').trim();
      const ends = String(values.maintenanceReturnAt || '').trim();
      const valid = value => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value);
      if (!portals.length || !valid(starts) || !valid(ends) || ends <= starts) return error('Select at least one portal and enter a valid maintenance start and expected return time in EAT. The return time must be later than the start.');
    }
  }
  if (body.section === 'enrollment-settings' && typeof values.installmentPlans === 'string' && values.installmentPlans.trim()) {
    const lines = values.installmentPlans.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const totals = new Map();
    for (const line of lines) {
      const parts = line.split('|').map(part => part.trim());
      if (parts.length < 3 || !parts[0] || !parts[1] || !/^\d+$/.test(parts[2])) return error('Installment lines must use: course ID or exact course title | instalment name | amount in KSh | due date (YYYY-MM-DD, optional).');
      const amount = Number(parts[2]);
      if (!Number.isSafeInteger(amount) || amount < 1 || (parts[3] && !/^\d{4}-\d{2}-\d{2}$/.test(parts[3]))) return error('Each instalment must have a positive whole-shilling amount and a valid optional due date.');
      totals.set(parts[0], (totals.get(parts[0]) || 0) + amount);
    }
    for (const [courseId, total] of totals) {
      const course = await env.DB.prepare("SELECT title, price FROM courses WHERE (id = ? OR lower(title) = lower(?)) AND status = 'active'").bind(courseId, courseId).first();
      if (!course) return error('An instalment plan references an unavailable course. Check the course ID or exact title.');
      if (total !== Number(course.price)) return error(`The instalments for ${course.title} total KSh ${total.toLocaleString('en-KE')}, but the published course fee is KSh ${Number(course.price).toLocaleString('en-KE')}. The totals must match exactly.`);
    }
  }
  const all = await readSettings(env.DB);
  all[body.section] = values;
  const serialized = JSON.stringify(all);
  if (new TextEncoder().encode(serialized).length > MAX_BYTES) return error('Settings are too large. Reduce the amount of text and try again.', 413);
  await env.DB.prepare('INSERT INTO system_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(KEY, serialized).run();
  return json({ settings: all, savedSection: body.section });
}
