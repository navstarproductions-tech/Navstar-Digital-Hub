import { error, isSameOrigin, json, readJson, safeString } from '../_shared/http.js';

const SYSTEM_PROMPT = `You are the public website assistant for Navstar Digital Hub in Kenya. The official motto is HOME OF TECHNOCRATS. Be friendly, concise, accurate and helpful. Guide visitors through the website using markdown links with the exact format [Page name](/route). Available pages: Home (/), Courses (/courses), Services (/services), Campus Life (/campus-life), Admission Letters (/admissions-letters), Analytics and school ERP (/analytics), Music (/music), Forum (/forum), Student Gateway (/portals), Customer Account (/account). Explain that the school ERP is being developed for primary, junior secondary, senior secondary and other institutions, with learners, classes, staff, learning management, fee structures, invoices, payments and PDF receipts. Do not claim unfinished features are already operational. For Navstar contact: +254 797 688 576, +254 706 637 485, navstardigitalhub@gmail.com. Do not request or disclose passwords, M-Pesa PINs, API keys or private records. For personal account, application or payment status, direct the user to sign in to the appropriate portal; never invent account data. If unsure, say so and offer the relevant page or contact details.`;

export async function onRequestPost({ request, env }) {
  try {
    if (!isSameOrigin(request)) return error('Request origin is not allowed.', 403);
    const apiKey = env && env.OPENAI_API_KEY;
    if (!apiKey) return error('The AI assistant is not configured. Check the Production OPENAI_API_KEY secret.', 503);

    let body;
    try { body = await readJson(request, 12000); }
    catch (e) { return error(e && e.message ? e.message : 'Invalid request.'); }

    const incoming = Array.isArray(body.messages) ? body.messages.slice(-10) : [];
    const messages = incoming
      .filter((item) => item && (item.role === 'user' || item.role === 'assistant'))
      .map((item) => ({ role: item.role, content: safeString(item.content, 1000) }))
      .filter((item) => item.content);

    if (!messages.length || messages[messages.length - 1].role !== 'user') {
      return error('Please enter a question.');
    }

    let upstream;
    try {
      upstream = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: (env && env.OPENAI_MODEL) || 'gpt-4.1-mini',
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
          max_tokens: 450,
          temperature: 0.4
        })
      });
    } catch (networkError) {
      return error('Cloudflare could not connect to the AI provider. Please try again shortly.', 502);
    }

    const responseText = await upstream.text();
    let result;
    try { result = JSON.parse(responseText); }
    catch {
      return error('The AI provider returned an invalid response (HTTP ' + upstream.status + ').', 502);
    }

    if (!upstream.ok) {
      if (upstream.status === 401 || upstream.status === 403) {
        return error('The OpenAI API key was rejected. Replace the Production OPENAI_API_KEY in Cloudflare with a valid active key.', 502);
      }
      if (upstream.status === 429) {
        return error('OpenAI rejected the request because of rate limits or API account quota. Check API billing and usage at platform.openai.com.', 502);
      }
      return error(safeString(result && result.error && result.error.message, 220) || ('OpenAI request failed (HTTP ' + upstream.status + ').'), 502);
    }

    const answer = safeString(result && result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content, 3500);
    if (!answer) return error('OpenAI returned an empty answer. Please try again.', 502);
    return json({ answer });
  } catch (e) {
    return error('Navstar AI encountered an internal error: ' + safeString(e && e.message, 140), 500);
  }
}

export async function onRequestGet({ env }) {
  return json({
    ok: true,
    service: 'navstar-ai-assistant',
    configured: Boolean(env && env.OPENAI_API_KEY),
    method: 'POST supported'
  });
}
