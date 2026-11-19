const SYSTEM_PROMPT = `You are Navstar AI, the public website assistant for Navstar Digital Hub in Kenya. The official motto is HOME OF TECHNOCRATS. Be friendly, clear, accurate and helpful. You can analyse user-provided images, PDFs and text/code files when attached. Describe what is visible in images; read and explain documents; summarise, compare, proofread, solve questions and help create content. Format answers with clear Markdown headings, **bold emphasis**, bullet lists, numbered steps and code blocks where useful. Guide visitors through the website using markdown links with the exact format [Page name](/route). Available pages: Home (/), Courses (/courses), Services (/services), Campus Life (/campus-life), Admission Letters (/admissions-letters), Analytics and school ERP (/analytics), Music (/music), Forum (/forum), Student Gateway (/portals), Customer Account (/account). Explain that the school ERP is being developed for primary, junior secondary, senior secondary and other institutions. Do not claim unfinished features are already operational. For Navstar contact: +254 797 688 576, +254 706 637 485, navstardigitalhub@gmail.com. Do not request or disclose passwords, M-Pesa PINs, API keys or private records. For personal account, application or payment status, direct the user to sign in; never invent account data. If unsure, say so.`;

function json(data, status = 200, requestId = '') {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (requestId) headers['X-Request-ID'] = requestId;
  return new Response(JSON.stringify(data), { status, headers });
}
function clean(value, max = 1200) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function logAI(event, details = {}) { console.log('[navstar-ai]', JSON.stringify({ event, ...details })); }
function decodeDataUrl(value) {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(value || '');
  if (!match) throw new Error('One of the attachments could not be read. Please attach it again.');
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { mimeType: match[1], base64: match[2], byteLength: bytes.byteLength };
}
function responseText(result) {
  return (result?.candidates?.[0]?.content?.parts || [])
    .map(part => typeof part.text === 'string' ? part.text : '')
    .filter(Boolean).join('\n').trim();
}
function providerError(status, result) {
  const message = clean(result?.error?.message, 220);
  if (status === 401 || status === 403) return { error: 'Google Gemini rejected the configured API key or its permissions. Check the GEMINI_API_KEY secret in Cloudflare.', code: 'AI_UPSTREAM_AUTH_ERROR' };
  if (status === 429) return { error: 'The free Gemini usage limit has been reached for now. Please wait and try again later; no paid fallback is enabled.', code: 'AI_RATE_LIMITED' };
  return { error: message || 'Google Gemini could not process this request (HTTP ' + status + ').', code: 'AI_UPSTREAM_ERROR' };
}

export async function onRequestPost({ request, env }) {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  let stage = 'request_received';
  try {
    const origin = request.headers.get('Origin');
    if (origin) {
      try {
        if (new URL(origin).origin !== new URL(request.url).origin) return json({ error: 'Request origin is not allowed.', code: 'AI_ORIGIN_REJECTED', requestId }, 403, requestId);
      } catch { return json({ error: 'Invalid request origin.', code: 'AI_ORIGIN_INVALID', requestId }, 403, requestId); }
    }
    const apiKey = clean(env?.GEMINI_API_KEY, 500);
    if (!apiKey) return json({ error: 'Navstar AI is not configured. Check the Production GEMINI_API_KEY secret in Cloudflare.', code: 'AI_API_KEY_MISSING', requestId }, 503, requestId);
    const model = clean(env?.GEMINI_MODEL, 100) || 'gemini-2.5-flash-lite';
    stage = 'read_request';
    const raw = await request.text();
    if (!raw || raw.length > 15000000) return json({ error: 'Your message or attachments are too large. Please use files under 8 MB each and try again.', code: 'AI_REQUEST_TOO_LARGE', requestId }, 413, requestId);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid message format. Please refresh and try again.', code: 'AI_INVALID_JSON', requestId }, 400, requestId); }
    const incoming = Array.isArray(body.messages) ? body.messages.slice(-10) : [];
    const messages = incoming.filter(item => item && (item.role === 'user' || item.role === 'assistant'))
      .map(item => ({ role: item.role, content: clean(item.content, 6000) })).filter(item => item.content);
    if (!messages.length || messages[messages.length - 1].role !== 'user') return json({ error: 'Please enter a question or attach a file.', code: 'AI_QUESTION_REQUIRED', requestId }, 400, requestId);

    const attachments = Array.isArray(body.attachments) ? body.attachments : [];
    if (attachments.length > 5) return json({ error: 'Please attach no more than five files per message.', code: 'AI_TOO_MANY_FILES', requestId }, 400, requestId);
    const currentUser = messages[messages.length - 1];
    const imageTypes = new Set(['image/jpeg','image/png','image/webp','image/gif']);
    const mediaParts = [];
    for (const file of attachments) {
      const name = clean(file?.name, 180) || 'attachment';
      const kind = clean(file?.kind, 20);
      if (kind === 'text') {
        const content = clean(file?.data, 120000);
        if (content) currentUser.content += '\n\n[Attached text file: ' + name + ']\n' + content;
        continue;
      }
      const decoded = decodeDataUrl(file?.data);
      if (decoded.byteLength > 8 * 1024 * 1024) return json({ error: name + ' is larger than 8 MB.', code: 'AI_FILE_TOO_LARGE', requestId }, 413, requestId);
      if (kind === 'image' && imageTypes.has(decoded.mimeType)) {
        mediaParts.push({ inlineData: { mimeType: decoded.mimeType, data: decoded.base64 } });
      } else if (kind === 'pdf' && decoded.mimeType === 'application/pdf') {
        mediaParts.push({ inlineData: { mimeType: 'application/pdf', data: decoded.base64 } });
      } else {
        return json({ error: 'Unsupported attachment format: ' + name, code: 'AI_FILE_FORMAT_UNSUPPORTED', requestId }, 400, requestId);
      }
    }

    stage = 'gemini_generate_content';
    const contents = messages.map((message, index) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: index === messages.length - 1
        ? [{ text: message.content }, ...mediaParts]
        : [{ text: message.content }]
    }));
    const providerResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: { maxOutputTokens: 1200, temperature: 0.4 }
      }),
      signal: AbortSignal.timeout(45000)
    });
    const result = await providerResponse.json().catch(() => ({}));
    if (!providerResponse.ok) {
      const status = providerResponse.status;
      logAI('provider_rejected', { requestId, stage, model, status, code: clean(result?.error?.status, 100) });
      const friendly = providerError(status, result);
      return json({ ...friendly, requestId }, 502, requestId);
    }
    const answer = clean(responseText(result), 9000);
    if (!answer) return json({ error: 'Google Gemini returned an empty answer. Please try again.', code: 'AI_EMPTY_ANSWER', requestId }, 502, requestId);
    logAI('request_succeeded', { requestId, model, attachments: attachments.length, totalDurationMs: Date.now() - startedAt });
    return json({ answer, requestId }, 200, requestId);
  } catch (error) {
    logAI('request_failed', { requestId, stage, errorName: clean(error?.name, 80) || 'UnknownError', totalDurationMs: Date.now() - startedAt });
    return json({ error: clean(error?.message, 260) || 'Navstar AI encountered a server error. Please try again shortly.', code: 'AI_INTERNAL_ERROR', requestId }, 500, requestId);
  }
}

export async function onRequestGet({ env }) {
  const model = clean(env?.GEMINI_MODEL, 100) || 'gemini-2.5-flash-lite';
  return json({ ok: true, service: 'navstar-ai-assistant', provider: 'google-gemini', configured: Boolean(env?.GEMINI_API_KEY), model, capabilities: ['text','images','pdf'], method: 'POST supported' });
}
