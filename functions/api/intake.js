import { json } from '../_shared/http.js';

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ intake: null });
  const row = await env.DB.prepare("SELECT value FROM system_state WHERE key = 'admin-configuration'").first();
  let config = {};
  try { config = JSON.parse(row?.value || '{}'); } catch { config = {}; }
  const section = config['academic-intakes'] || {};
  const today = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const lines = String(section.intakes || '').split(/\r?\n/).map(line => line.split('|').map(part => part.trim())).filter(parts => parts.length >= 3 && parts[0]);
  const entries = lines.map(parts => ({ name: parts[0], enrollmentOpen: parts[1] || '', enrollmentClose: parts[2] || '', trainingStart: parts[3] || '', trainingEnd: parts[4] || '', graduationDate: parts[5] || '' }));
  if (!entries.length && section.currentIntake) entries.push({ name: section.currentIntake, enrollmentOpen: section.enrollmentOpen || '', enrollmentClose: section.enrollmentClose || '', trainingStart: section.trainingStart || '', trainingEnd: section.trainingEnd || '', graduationDate: section.graduationDate || '' });
  const open = entries.find(item => item.enrollmentOpen && item.enrollmentClose && today >= item.enrollmentOpen && today <= item.enrollmentClose);
  const upcoming = entries.filter(item => item.enrollmentOpen && item.enrollmentOpen > today).sort((a,b) => a.enrollmentOpen.localeCompare(b.enrollmentOpen))[0];
  const intake = open ? { ...open, status: 'open' } : upcoming ? { ...upcoming, status: 'upcoming' } : entries.length ? { ...entries.sort((a,b) => b.enrollmentClose.localeCompare(a.enrollmentClose))[0], status: 'closed' } : { status: 'not-configured' };
  return json({ intake, serverDate: today, timezone: 'Africa/Nairobi' });
}
