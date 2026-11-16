import { error, isSameOrigin, json, readJson, safeString } from '../_shared/http.js';

const SYSTEM_PROMPT = `You are the public website assistant for Navstar Digital Hub in Kenya. The official motto is HOME OF TECHNOCRATS. Be friendly, concise, accurate and helpful. Guide visitors through the website using markdown links with the exact format [Page name](/route). Available pages: Home (/), Courses (/courses), Services (/services), Campus Life (/campus-life), Admission Letters (/admissions-letters), Analytics and school ERP (/analytics), Music (/music), Forum (/forum), Student Gateway (/portals), Customer Account (/account). Explain that the school ERP is being developed for primary, junior secondary, senior secondary and other institutions, with learners, classes, staff, learning management, fee structures, invoices, payments and PDF receipts. Do not claim unfinished features are already operational. For Navstar contact: +254 797 688 576, +254 706 637 485, navstardigitalhub@gmail.com. Do not request or disclose passwords, M-Pesa PINs, API keys or private records. For personal account, application or payment status, direct the user to sign in to the appropriate portal; never invent account data. If unsure, say so and offer the relevant page or contact details.`;

export async function onRequestPost({ request, env }) {
 try {
  if (!isSameOrigin(request)) return error('Request origin is not allowed.', 403);
  if (!env.OPENAI_API_KEY) return error('The AI assistant is not configured. Please contact Navstar Digital Hub.', 503);

  let body;
  try { body = await readJson(request, 12000); }
  catch (e) { return error(e?.message || 'Invalid request.'); }

  const messages = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
  const clean = messages
   .filter(item => item && ['user', 'assistant'].includes(item.role))
   .map(item => ({ role: item.role, content: safeString(item.content, 1200) }))
   .filter(item => item.content);

  if (!clean.length || clean[clean.length - 1].role !== 'user') return error('Please enter a question.');

  let upstream;
  try {
   upstream = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
     Authorization: `Bearer ${env.OPENAI_API_KEY}`,
     'Content-Type': 'application/json'
    },
    body: JSON.stringify({
     model: env.OPENAI_MODEL || 'gpt-4.1-mini',
     messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...clean],
     temperature: 0.4,
     max_tokens: 450
    }),
    signal: AbortSignal.timeout(25000)
   });
  } catch (e) {
   return error('Could not connect to the AI provider. Please try again shortly.', 502);
  }

  let data;
  try { data = await upstream.json(); }
  catch { return error(`The AI provider returned an unreadable response (HTTP ${upstream.status}).`, 502); }

  if (!upstream.ok) {
   const providerMessage = safeString(data?.error?.message, 220);
   if (upstream.status === 401 || upstream.status === 403) {
    return error('The AI provider rejected the API key. Please check the production API key in Cloudflare.', 502);
   }
   if (upstream.status === 429) {
    return error('The AI provider is temporarily rate-limited or its API billing/quota needs attention. Please try again later.', 502);
   }
   return error(providerMessage || `The AI provider request failed (HTTP ${upstream.status}).`, 502);
  }

  const answer = safeString(data?.choices?.[0]?.message?.content, 3500);
  if (!answer) return error('The AI provider returned an empty answer. Please try again.', 502);
  return json({ answer });
 } catch (e) {
  // Always return JSON from this endpoint, including for unexpected runtime errors.
  return error('The Navstar AI request failed safely. Please try again. (' + safeString(e?.message, 120) + ')', 500);
 }
}
// Safe deployment check: confirms that the Pages Function is deployed and
// that the production secret is available without exposing its value.
export async function onRequestGet({ env }) {
 return json({
  ok: true,
  service: 'navstar-ai-assistant',
  configured: Boolean(env.OPENAI_API_KEY),
 });
}
