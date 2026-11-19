import { json } from '../_shared/http.js';

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ intake: null });
  const row = await env.DB.prepare("SELECT value FROM system_state WHERE key = 'admin-configuration'").first();
  let config = {};
  try { config = JSON.parse(row?.value || '{}'); } catch { config = {}; }
  const section = config['academic-intakes'] || {};
  const fallbackIntake = 'September 2026 Intake | 2026-09-01 | 2026-09-20 | | |';
  const dateParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const dateValues = Object.fromEntries(dateParts.map(part => [part.type, part.value]));
  const today = `${dateValues.year}-${dateValues.month}-${dateValues.day}`;
  const lines = String(section.intakes || '').split(/\r?\n/).map(line => line.split('|').map(part => part.trim())).filter(parts => parts.length >= 3 && parts[0]);
  const entries = lines.map(parts => ({ name: parts[0], enrollmentOpen: parts[1] || '', enrollmentClose: parts[2] || '', trainingStart: parts[3] || '', trainingEnd: parts[4] || '', graduationDate: parts[5] || '' }));
  if (!entries.length && section.currentIntake) entries.push({ name: section.currentIntake, enrollmentOpen: section.enrollmentOpen || '', enrollmentClose: section.enrollmentClose || '', trainingStart: section.trainingStart || '', trainingEnd: section.trainingEnd || '', graduationDate: section.graduationDate || '' });
  if (!entries.some(item => item.name.toLowerCase() === 'september 2026 intake')) {
    const parts = fallbackIntake.split('|').map(part => part.trim());
    entries.push({name:parts[0],enrollmentOpen:parts[1],enrollmentClose:parts[2],trainingStart:'',trainingEnd:'',graduationDate:''});
  }
  entries.sort((a,b) => (a.enrollmentOpen || '9999-12-31').localeCompare(b.enrollmentOpen || '9999-12-31') || a.name.localeCompare(b.name));
  const open = entries.find(item => item.enrollmentOpen && item.enrollmentClose && today >= item.enrollmentOpen && today <= item.enrollmentClose);
  const upcoming = entries.filter(item => item.enrollmentOpen && item.enrollmentOpen > today)[0];
  const intake = open ? { ...open, status: 'open' } : upcoming ? { ...upcoming, status: 'upcoming' } : entries.length ? { ...entries.slice().sort((a,b) => b.enrollmentClose.localeCompare(a.enrollmentClose))[0], status: 'closed' } : { status: 'not-configured' };
  const formatDate = value => value ? new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Nairobi',day:'numeric',month:'long',year:'numeric'}).format(new Date(value+'T12:00:00+03:00')) : '';
  const defaultNotice = intake.status === 'closed' && intake.enrollmentOpen && intake.enrollmentClose
    ? `${intake.name} Closed — enrollment ran ${formatDate(intake.enrollmentOpen)} to ${formatDate(intake.enrollmentClose)}.` : '';
  const notice = section.showEnrollmentStatus === false ? '' : (intake.status === 'closed' ? (String(section.intakeStatusMessage || '').trim() || defaultNotice) : '');
  return json({ intake: { ...intake, notice }, serverDate: today, timezone: 'Africa/Nairobi' });
}
