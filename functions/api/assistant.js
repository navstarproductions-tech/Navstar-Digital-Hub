const SYSTEM_PROMPT = `You are Navstar AI, the public website assistant for Navstar Digital Hub in Kenya. The official motto is HOME OF TECHNOCRATS. Be friendly, clear, accurate and helpful. You can analyse user-provided images, PDFs and text/code files when attached. Describe what is visible in images; read and explain documents; summarise, compare, proofread, solve questions and help create content. Format answers with clear Markdown headings, **bold emphasis**, bullet lists, numbered steps and code blocks where useful. Guide visitors through the website using markdown links with the exact format [Page name](/route). Available pages: Home (/), Courses (/courses), Services (/services), Campus Life (/campus-life), Admission Letters (/admissions-letters), Analytics and school ERP (/analytics), Music (/music), Forum (/forum), Student Gateway (/portals), Customer Account (/account). Explain that the school ERP is being developed for primary, junior secondary, senior secondary and other institutions. Do not claim unfinished features are already operational. For Navstar contact: +254 797 688 576, +254 706 637 485, navstardigitalhub@gmail.com. Do not request or disclose passwords, M-Pesa PINs, API keys or private records. For personal account, application or payment status, direct the user to sign in; never invent account data. If unsure, say so.`;

function json(data, status = 200, requestId = '') {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (requestId) headers['X-Request-ID'] = requestId;
  return new Response(JSON.stringify(data), { status, headers });
}
function clean(value, max = 1200) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function logAI(event, details = {}) { console.log('[navstar-ai]', JSON.stringify({ event, ...details })); }
function extractText(result) {
  if (typeof result?.output_text === 'string') return result.output_text.trim();
  const parts = [];
  for (const item of result?.output || []) for (const content of item?.content || []) {
    if (content?.type === 'output_text' && content.text) parts.push(content.text);
  }
  return parts.join('\n').trim();
}
function decodeDataUrl(value) {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(value || '');
  if (!match) throw new Error('One of the attachments could not be read. Please attach it again.');
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { mimeType: match[1], bytes };
}

export async function onRequestPost({ request, env }) {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  let stage = 'request_received';
  let uploadedFileId = '';
  try {
    const origin = request.headers.get('Origin');
    if (origin) {
      try {
        if (new URL(origin).origin !== new URL(request.url).origin) return json({ error: 'Request origin is not allowed.', code: 'AI_ORIGIN_REJECTED', requestId }, 403, requestId);
      } catch { return json({ error: 'Invalid request origin.', code: 'AI_ORIGIN_INVALID', requestId }, 403, requestId); }
    }
    const apiKey = clean(env?.OPENAI_API_KEY, 500);
    if (!apiKey) return json({ error: 'Navstar AI is not configured. Check the Production OPENAI_API_KEY secret.', code: 'AI_API_KEY_MISSING', requestId }, 503, requestId);
    const model = clean(env?.OPENAI_MODEL, 100) || 'gpt-4.1-mini';
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
    const prepared = [];
    let hasPdf = false;
    for (const file of attachments) {
      const name = clean(file?.name, 180) || 'attachment';
      const kind = clean(file?.kind, 20);
      if (kind === 'text') {
        const content = clean(file?.data, 120000);
        if (!content) continue;
        currentUser.content += '\n\n[Attached text file: ' + name + ']\n' + content;
      } else {
        const decoded = decodeDataUrl(file?.data);
        if (decoded.bytes.byteLength > 8 * 1024 * 1024) return json({ error: name + ' is larger than 8 MB.', code: 'AI_FILE_TOO_LARGE', requestId }, 413, requestId);
        if (kind === 'image') {
          if (!imageTypes.has(decoded.mimeType)) return json({ error: 'Unsupported image format for ' + name + '. Use JPG, PNG, WEBP or GIF.', code: 'AI_IMAGE_FORMAT_UNSUPPORTED', requestId }, 400, requestId);
          prepared.push({ type: 'image', name, mimeType: decoded.mimeType, data: file.data, bytes: decoded.bytes });
        } else if (kind === 'pdf' && decoded.mimeType === 'application/pdf') {
          prepared.push({ type: 'pdf', name, mimeType: decoded.mimeType, bytes: decoded.bytes });
          hasPdf = true;
        } else return json({ error: 'Unsupported attachment format: ' + name, code: 'AI_FILE_FORMAT_UNSUPPORTED', requestId }, 400, requestId);
      }
    }

    stage = 'prepare_provider_input';
    let providerResponse;
    if (hasPdf) {
      // OpenAI file input is used for PDFs; delete uploaded provider files after the response.
      const fileParts = [];
      for (const item of prepared) {
        if (item.type === 'pdf') {
          const form = new FormData();
          form.append('purpose', 'user_data');
          form.append('file', new Blob([item.bytes], { type: 'application/pdf' }), item.name);
          const upload = await fetch('https://api.openai.com/v1/files', { method: 'POST', headers: { Authorization: 'Bearer ' + apiKey }, body: form, signal: AbortSignal.timeout(25000) });
          const uploaded = await upload.json().catch(() => ({}));
          if (!upload.ok || !uploaded.id) throw new Error('OpenAI could not receive PDF ' + item.name + '. Check the API project file permissions and try again.');
          uploadedFileId = uploaded.id;
          fileParts.push({ type: 'input_file', file_id: uploaded.id });
        } else if (item.type === 'image') fileParts.push({ type: 'input_image', image_url: item.data, detail: 'auto' });
      }
      const input = messages.map((message,index) => ({
        role: message.role,
        content: index === messages.length - 1
          ? [{ type: 'input_text', text: message.content }, ...fileParts]
          : [{ type: message.role === 'assistant' ? 'output_text' : 'input_text', text: message.content }]
      }));
      stage = 'openai_responses_fetch';
      providerResponse = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, instructions: SYSTEM_PROMPT, input, max_output_tokens: 1200 }),
        signal: AbortSignal.timeout(45000)
      });
    } else {
      const chatMessages = [{ role: 'system', content: SYSTEM_PROMPT }];
      for (let index = 0; index < messages.length; index++) {
        const message = messages[index];
        if (index === messages.length - 1 && prepared.some(item => item.type === 'image')) {
          chatMessages.push({ role: message.role, content: [{ type: 'text', text: message.content }, ...prepared.filter(item => item.type === 'image').map(item => ({ type: 'image_url', image_url: { url: item.data, detail: 'auto' } }))] });
        } else chatMessages.push(message);
      }
      stage = 'openai_chat_fetch';
      providerResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: chatMessages, max_tokens: 1200, temperature: 0.4 }),
        signal: AbortSignal.timeout(35000)
      });
    }
    const result = await providerResponse.json().catch(() => ({}));
    if (!providerResponse.ok) {
      const status = providerResponse.status;
      const message = clean(result?.error?.message, 220);
      logAI('provider_rejected', { requestId, stage, model, status, code: clean(result?.error?.code, 100) });
      if (status === 401 || status === 403) return json({ error: 'OpenAI rejected the configured API key or its permissions. Check the Production OPENAI_API_KEY secret.', code: 'AI_UPSTREAM_AUTH_ERROR', requestId }, 502, requestId);
      if (status === 429) return json({ error: 'OpenAI API usage limit or billing quota reached. Check API billing and usage.', code: 'AI_RATE_LIMITED', requestId }, 502, requestId);
      return json({ error: message || 'The AI provider could not process this request (HTTP ' + status + ').', code: 'AI_UPSTREAM_ERROR', requestId }, 502, requestId);
    }
    const answer = hasPdf ? extractText(result) : clean(result?.choices?.[0]?.message?.content, 9000);
    if (!answer) return json({ error: 'OpenAI returned an empty answer. Please try again.', code: 'AI_EMPTY_ANSWER', requestId }, 502, requestId);
    logAI('request_succeeded', { requestId, model, attachments: attachments.length, totalDurationMs: Date.now() - startedAt });
    return json({ answer, requestId }, 200, requestId);
  } catch (error) {
    logAI('request_failed', { requestId, stage, errorName: clean(error?.name, 80) || 'UnknownError', totalDurationMs: Date.now() - startedAt });
    return json({ error: clean(error?.message, 260) || 'Navstar AI encountered a server error. Please try again shortly.', code: 'AI_INTERNAL_ERROR', requestId }, 500, requestId);
  } finally {
    if (uploadedFileId) {
      try { await fetch('https://api.openai.com/v1/files/' + encodeURIComponent(uploadedFileId), { method: 'DELETE', headers: { Authorization: 'Bearer ' + clean(env?.OPENAI_API_KEY, 500) } }); }
      catch { logAI('provider_file_cleanup_failed', { requestId }); }
    }
  }
}

export async function onRequestGet({ env }) {
  return json({ ok: true, service: 'navstar-ai-assistant', provider: 'openai', configured: Boolean(env?.OPENAI_API_KEY), model: clean(env?.OPENAI_MODEL, 100) || 'gpt-4.1-mini', capabilities: ['text','images','pdf'], method: 'POST supported' });
}
