const SYSTEM_PROMPT = `You are Navstar AI, the public website assistant for Navstar Digital Hub in Kenya. The official motto is HOME OF TECHNOCRATS. Be friendly, clear, accurate and helpful. You can analyse user-provided images, PDFs and text/code files when attached. Describe what is visible in images; read and explain documents; summarise, compare, proofread, solve questions and help create content. Format answers with clear Markdown headings, **bold emphasis**, bullet lists, numbered steps and code blocks where useful. Guide visitors through the website using markdown links with the exact format [Page name](/route). Available pages: Home (/), Courses (/courses), Services (/services), Campus Life (/campus-life), Admission Letters (/admissions-letters), Analytics and school ERP (/analytics), Music (/music), Forum (/forum), Student Gateway (/portals), Customer Account (/account). Explain that the school ERP is being developed for primary, junior secondary, senior secondary and other institutions. Do not claim unfinished features are already operational. For Navstar contact: +254 797 688 576, +254 706 637 485, navstardigitalhub@gmail.com. Do not request or disclose passwords, M-Pesa PINs, API keys or private records. For personal account, application or payment status, direct the user to sign in; never invent account data. If unsure, say so.`;

const DEFAULT_MODEL = '@cf/google/gemma-4-26b-a4b-it';
const MAX_REQUEST_CHARS = 15000000;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function json(data, status = 200, requestId = '') {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (requestId) headers['X-Request-ID'] = requestId;
  return new Response(JSON.stringify(data), { status, headers });
}
function clean(value, max = 1200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function logAI(event, details = {}) {
  console.log('[navstar-ai]', JSON.stringify({ event, ...details }));
}
function decodeDataUrl(value) {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(value || '');
  if (!match) throw new Error('An attachment could not be read. Please attach it again.');
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { mimeType: match[1].toLowerCase(), base64: match[2], bytes, byteLength: bytes.byteLength };
}
function extractAnswer(result) {
  const value = result?.choices?.[0]?.message?.content
    ?? result?.response
    ?? result?.output_text
    ?? '';
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value.map(part => typeof part?.text === 'string' ? part.text : '').filter(Boolean).join('\n').trim();
  }
  return '';
}
async function convertDocument(env, file, decoded) {
  if (typeof env?.AI?.toMarkdown !== 'function') {
    throw new Error('Document conversion is not available on this Cloudflare AI binding. Please try a text file instead.');
  }
  const converted = await env.AI.toMarkdown({
    name: file.name,
    blob: new Blob([decoded.bytes], { type: decoded.mimeType })
  });
  const item = Array.isArray(converted) ? converted[0] : converted;
  if (!item || item.format === 'error' || !clean(item.data, 1)) {
    throw new Error(clean(item?.error, 220) || 'Cloudflare could not extract readable text from ' + file.name + '.');
  }
  return clean(item.data, 120000);
}
function friendlyAIError(error) {
  const message = clean(error?.message, 260);
  if (/limit|quota|neurons|rate.?limit|429/i.test(message)) {
    return { status: 429, code: 'AI_USAGE_LIMIT', error: 'The Cloudflare AI daily free allowance or request limit has been reached. Please try again after the allowance resets.' };
  }
  if (/model.*(not found|unknown|unavailable)|404|410|5028/i.test(message)) {
    return { status: 503, code: 'AI_MODEL_UNAVAILABLE', error: 'The configured Cloudflare AI model is temporarily unavailable. Please contact Navstar support.' };
  }
  if (/binding|workers.?ai|not configured/i.test(message)) {
    return { status: 503, code: 'AI_BINDING_UNAVAILABLE', error: 'Cloudflare Workers AI is not available to this deployment yet. Please check the Production AI binding and redeploy.' };
  }
  return { status: 502, code: 'AI_UPSTREAM_ERROR', error: 'Cloudflare AI could not complete this request. Please try again shortly.' };
}

export async function onRequestPost({ request, env }) {
  let requestId = 'navstar-' + Date.now().toString(36);
  const startedAt = Date.now();
  let stage = 'request_received';
  try {
    try { requestId = crypto.randomUUID(); } catch { /* retain fallback ID */ }
    logAI('request_started', { requestId, method: request.method, path: new URL(request.url).pathname });

    const origin = request.headers.get('Origin');
    if (origin) {
      try {
        if (new URL(origin).origin !== new URL(request.url).origin) {
          return json({ error: 'Request origin is not allowed.', code: 'AI_ORIGIN_REJECTED', requestId }, 403, requestId);
        }
      } catch {
        return json({ error: 'Invalid request origin.', code: 'AI_ORIGIN_INVALID', requestId }, 403, requestId);
      }
    }

    if (!env?.AI || typeof env.AI.run !== 'function') {
      return json({ error: 'Cloudflare Workers AI is not connected to this Production deployment. Check the AI binding and redeploy.', code: 'AI_BINDING_MISSING', requestId }, 503, requestId);
    }

    stage = 'read_request';
    const raw = await request.text();
    if (!raw || raw.length > MAX_REQUEST_CHARS) {
      return json({ error: 'Your message or attachments are too large. Please use files under 8 MB each and try again.', code: 'AI_REQUEST_TOO_LARGE', requestId }, 413, requestId);
    }
    let body;
    try { body = JSON.parse(raw); } catch {
      return json({ error: 'Invalid message format. Please refresh and try again.', code: 'AI_INVALID_JSON', requestId }, 400, requestId);
    }

    const context = clean(body.context, 24) || 'public';
    let aiSettings = {};
    let siteSettings = {};
    if (env.DB) {
      const settingsRow = await env.DB.prepare("SELECT value FROM system_state WHERE key = 'admin-configuration'").first().catch(() => null);
      try {
        const saved = JSON.parse(settingsRow?.value || '{}');
        aiSettings = saved?.['ai-assistant'] || {};
        siteSettings = saved || {};
      } catch { /* Keep safe default behaviour if saved settings are malformed. */ }
    }
    if (aiSettings.aiEnabled === false) {
      return json({ error: 'Navstar AI is temporarily disabled by the administrator.', code: 'AI_DISABLED', requestId }, 503, requestId);
    }
    if (context === 'admin' && aiSettings.aiAdminAssistance === false) {
      return json({ error: 'Administrator AI assistance is disabled in Admin Settings → Navstar AI.', code: 'AI_ADMIN_DISABLED', requestId }, 403, requestId);
    }
    if (context === 'student' && aiSettings.aiStudentLearning === false) {
      return json({ error: 'Student learning assistance is disabled in Admin Settings → Navstar AI.', code: 'AI_STUDENT_DISABLED', requestId }, 403, requestId);
    }
    if (context === 'public' && aiSettings.aiPublicAssistant === false) {
      return json({ error: 'Public Navstar AI guidance is currently disabled.', code: 'AI_PUBLIC_DISABLED', requestId }, 403, requestId);
    }

    const incoming = Array.isArray(body.messages) ? body.messages.slice(-10) : [];
    const messages = incoming
      .filter(item => item && (item.role === 'user' || item.role === 'assistant'))
      .map(item => ({ role: item.role, content: clean(item.content, 6000) }))
      .filter(item => item.content);
    if (!messages.length || messages[messages.length - 1].role !== 'user') {
      return json({ error: 'Please enter a question or attach a file.', code: 'AI_QUESTION_REQUIRED', requestId }, 400, requestId);
    }

    const attachments = Array.isArray(body.attachments) ? body.attachments : [];
    if (attachments.length && aiSettings.aiDocumentAnalysis === false) {
      return json({ error: 'Document and image analysis is disabled in Admin Settings → Navstar AI.', code: 'AI_DOCUMENTS_DISABLED', requestId }, 403, requestId);
    }
    if (attachments.length > 5) {
      return json({ error: 'Please attach no more than five files per message.', code: 'AI_TOO_MANY_FILES', requestId }, 400, requestId);
    }

    stage = 'process_attachments';
    const currentUser = messages[messages.length - 1];
    const contentParts = [{ type: 'text', text: currentUser.content || 'Please analyse the attached file(s).' }];
    for (const file of attachments) {
      const name = clean(file?.name, 180) || 'attachment';
      const kind = clean(file?.kind, 20);
      if (kind === 'text') {
        const textContent = clean(file?.data, 120000);
        if (textContent) contentParts[0].text += '\n\n[Attached text file: ' + name + ']\n' + textContent;
        continue;
      }

      const decoded = decodeDataUrl(file?.data);
      if (decoded.byteLength > MAX_FILE_BYTES) {
        return json({ error: name + ' is larger than 8 MB.', code: 'AI_FILE_TOO_LARGE', requestId }, 413, requestId);
      }

      if (kind === 'image' && IMAGE_TYPES.has(decoded.mimeType)) {
        contentParts.push({
          type: 'image_url',
          image_url: { url: 'data:' + decoded.mimeType + ';base64,' + decoded.base64 }
        });
      } else if ((kind === 'pdf' && decoded.mimeType === 'application/pdf') ||
                 (kind === 'image' && decoded.mimeType === 'image/gif')) {
        const extracted = await convertDocument(env, { name }, decoded);
        contentParts[0].text += '\n\n[Extracted content from ' + name + ']\n' + extracted;
      } else {
        return json({ error: 'Unsupported attachment format: ' + name + '. Use JPEG, PNG, WEBP, GIF, PDF or a text file.', code: 'AI_FILE_FORMAT_UNSUPPORTED', requestId }, 400, requestId);
      }
    }

    stage = 'cloudflare_ai_inference';
    const model = clean(env?.NAVSTAR_AI_MODEL, 120) || DEFAULT_MODEL;
    let liveContext = '';
    if (env.DB && (context === 'public' || context === 'student')) {
      try {
        const courseRows = await env.DB.prepare("SELECT title, description, duration, category, price FROM courses WHERE status = 'active' ORDER BY title LIMIT 40").all();
        const courses = (courseRows.results || []).map(course => ({
          title: clean(course.title, 120), description: clean(course.description, 360),
          duration: clean(course.duration, 60), category: clean(course.category, 80),
          feeKsh: Number(course.price || 0)
        }));
        if (courses.length) liveContext += '\\nPublished active course catalogue (read-only): ' + JSON.stringify(courses);
      } catch (error) {
        logAI('course_context_unavailable', { requestId, errorMessage: clean(error?.message, 120) });
      }
      const intakeSettings = siteSettings?.['academic-intakes'] || {};
      if (typeof intakeSettings.intakes === 'string' && intakeSettings.intakes.trim()) {
        liveContext += '\\nConfigured intake calendar (read-only; dates are YYYY-MM-DD): ' + clean(intakeSettings.intakes, 5000);
      }
      if (typeof intakeSettings.intakeStatusMessage === 'string' && intakeSettings.intakeStatusMessage.trim()) {
        liveContext += '\\nOfficial public intake notice: ' + clean(intakeSettings.intakeStatusMessage, 1000);
      }
    }
    const contextInstructions = context === 'admin'
      ? 'You are assisting an authenticated Navstar administrator. Help plan exams, assessment questions, grading, timetables, settings, reports and operational workflows. You cannot change settings, publish exams, edit records or perform transactions from this chat. Give exact navigation guidance and clearly state when an administrator must save or confirm an action. Never invent student, staff, payment or private account records.'
      : context === 'student'
        ? 'You are supporting a Navstar learner. Teach step by step, show workings for Mathematics and Physics, explain ICT and programming clearly, and guide assignment planning without falsely claiming to submit work or alter marks.'
        : 'You are the public Navstar guide. Use the supplied published catalogue and configured intake notice when answering course and admissions questions. Do not invent admission status, available seats, fees, deadlines or personal application results. Direct personal status checks to secure sign-in.';
    const aiMessages = [
      { role: 'system', content: SYSTEM_PROMPT + '\\n\\n' + contextInstructions + liveContext },
      ...messages.slice(0, -1),
      { role: 'user', content: contentParts }
    ];
    const result = await env.AI.run(model, {
      messages: aiMessages,
      max_completion_tokens: 1200,
      temperature: 0.4,
      chat_template_kwargs: { enable_thinking: false }
    });

    const answer = clean(extractAnswer(result), 9000);
    if (!answer) {
      logAI('empty_model_response', { requestId, model, resultKeys: Object.keys(result || {}) });
      return json({ error: 'Cloudflare AI returned an empty answer. Please try again.', code: 'AI_EMPTY_ANSWER', requestId }, 502, requestId);
    }

    logAI('request_succeeded', {
      requestId, provider: 'cloudflare-workers-ai', model,
      attachments: attachments.length, totalDurationMs: Date.now() - startedAt
    });
    return json({ answer, requestId, provider: 'cloudflare-workers-ai', model }, 200, requestId);
  } catch (error) {
    const friendly = friendlyAIError(error);
    logAI('request_failed', {
      requestId, stage, code: friendly.code,
      errorName: clean(error?.name, 80) || 'UnknownError',
      errorMessage: clean(error?.message, 240),
      totalDurationMs: Date.now() - startedAt
    });
    return json({ error: friendly.error, code: friendly.code, requestId }, friendly.status, requestId);
  }
}

export async function onRequestGet({ env }) {
  const configured = Boolean(env?.AI && typeof env.AI.run === 'function');
  return json({
    ok: true,
    service: 'navstar-ai-assistant',
    provider: 'cloudflare-workers-ai',
    configured,
    model: clean(env?.NAVSTAR_AI_MODEL, 120) || DEFAULT_MODEL,
    capabilities: ['text', 'images', 'pdf', 'text-files'],
    method: 'POST supported'
  }, configured ? 200 : 503);
}
