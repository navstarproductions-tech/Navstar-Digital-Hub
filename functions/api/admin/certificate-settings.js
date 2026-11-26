import { requireRole } from '../../_shared/auth.js';
import { error, isSameOrigin, json, readJson } from '../../_shared/http.js';

const defaults = {
  institutionName: 'NAVSTAR DIGITAL HUB',
  motto: 'HOME OF TECHNOCRATS',
  heading: 'CERTIFICATE OF COMPLETION',
  subheading: 'THIS CERTIFICATE IS PROUDLY PRESENTED TO',
  statement: 'For successfully completing the course of study in',
  closingStatement: 'and fulfilling the academic completion requirements of Navstar Digital Hub.',
  primaryColor: '#0a2447',
  accentColor: '#c79a2b',
  textColor: '#26364a',
  orientation: 'landscape',
  backgroundUrl: '',
  background2Url: '',
  logoUrl: '',
  badgeUrl: '',
  sealUrl: '',
  signatureUrl: '',
  showLogo: true,
  showSeal: true,
  showCertificateNumber: true,
  showVerificationUrl: true,
  showIssueDate: true,
  showStudentId: true,
  footerText: 'Verify this certificate using the official Navstar Digital Hub verification link.'
};

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('Certificate settings are not configured.', 503);
  const access = await requireRole(request, env, ['admin','principal']);
  if (access.response) return access.response;
  const row = await env.DB.prepare('SELECT settings_json AS settingsJson, updated_at AS updatedAt FROM certificate_settings WHERE id=1').first();
  let settings = {};
  try { settings = JSON.parse(row?.settingsJson || '{}'); } catch {}
  return json({ settings: { ...defaults, ...settings }, updatedAt: row?.updatedAt || null });
}

export async function onRequestPut({ request, env }) {
  if (!isSameOrigin(request)) return error('Cross-origin request rejected.', 403);
  if (!env.DB) return error('Certificate settings are not configured.', 503);
  const access = await requireRole(request, env, ['admin']);
  if (access.response) return access.response;
  let body;
  try { body = await readJson(request, 20000); } catch { return error('Invalid certificate template settings.'); }
  const input = body?.settings;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return error('Certificate template settings are required.');
  const textFields = ['institutionName','motto','heading','subheading','statement','closingStatement','footerText'];
  const settings = {};
  for (const key of textFields) settings[key] = String(input[key] ?? defaults[key]).trim().slice(0, 500);
  for (const key of ['backgroundUrl','background2Url','logoUrl','badgeUrl','sealUrl','signatureUrl']) {
    const value = String(input[key] || '').trim();
    if (value && (!value.startsWith('/api/media/') || value.length > 300)) return error('Template images must use a Navstar-managed media URL.');
    settings[key] = value;
  }
  for (const key of ['primaryColor','accentColor','textColor']) {
    const value = String(input[key] || defaults[key]);
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) return error('Choose valid six-digit hexadecimal template colours.');
    settings[key] = value;
  }
  settings.orientation = input.orientation === 'portrait' ? 'portrait' : 'landscape';
  for (const key of ['showLogo','showSeal','showCertificateNumber','showVerificationUrl','showIssueDate','showStudentId']) settings[key] = input[key] !== false;
  await env.DB.prepare(`INSERT INTO certificate_settings(id,settings_json,updated_by,updated_at)
    VALUES(1,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET settings_json=excluded.settings_json,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
    .bind(JSON.stringify(settings), access.user.id).run();
  return json({ saved: true, settings });
}
