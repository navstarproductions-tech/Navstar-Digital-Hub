const SYSTEM_PROMPT = `You are the public website assistant for Navstar Digital Hub in Kenya. The official motto is HOME OF TECHNOCRATS. Be friendly, concise, accurate and helpful. Guide visitors through the website using markdown links with the exact format [Page name](/route). Available pages: Home (/), Courses (/courses), Services (/services), Campus Life (/campus-life), Admission Letters (/admissions-letters), Analytics and school ERP (/analytics), Music (/music), Forum (/forum), Student Gateway (/portals), Customer Account (/account). Explain that the school ERP is being developed for primary, junior secondary, senior secondary and other institutions, with learners, classes, staff, learning management, fee structures, invoices, payments and PDF receipts. Do not claim unfinished features are already operational. For Navstar contact: +254 797 688 576, +254 706 637 485, navstardigitalhub@gmail.com. Do not request or disclose passwords, M-Pesa PINs, API keys or private records. For personal account, application or payment status, direct the user to sign in to the appropriate portal; never invent account data. If unsure, say so and offer the relevant page or contact details.`;

function json(data, status = 200, requestId = '') {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  };
  if (requestId) headers['X-Request-ID'] = requestId;
  return new Response(JSON.stringify(data), { status, headers });
}

function clean(value, max = 1200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function logAI(event, details = {}) {
  // Deliberately exclude API keys, prompts, and user message contents.
  console.log('[navstar-ai]', JSON.stringify({ event, ...details }));
}

export async function onRequestPost({ request, env }) {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  let stage = 'request_received';
  const model = '@cf/meta/llama-3.1-8b-instruct';

  try {
    logAI('request_started', { requestId, method: request.method, path: new URL(request.url).pathname });

    stage = 'origin_validation';
    const origin = request.headers.get('Origin');
    if (origin) {
      try {
        if (new URL(origin).origin !== new URL(request.url).origin) {
          logAI('request_rejected', { requestId, stage, reason: 'origin_mismatch' });
          return json({ error: 'Request origin is not allowed.', code: 'AI_ORIGIN_REJECTED', requestId }, 403, requestId);
        }
      } catch {
        logAI('request_rejected', { requestId, stage, reason: 'invalid_origin' });
        return json({ error: 'Invalid request origin.', code: 'AI_ORIGIN_INVALID', requestId }, 403, requestId);
      }
    }

    stage = 'cloudflare_ai_configuration';
    if (!env || !env.AI || typeof env.AI.run !== 'function') {
      logAI('configuration_missing', { requestId, stage, binding: 'AI' });
      return json({
        error: 'Navstar AI is not connected to Cloudflare Workers AI. Check the AI binding on the production Pages project.',
        code: 'AI_BINDING_MISSING',
        requestId
      }, 503, requestId);
    }

    stage = 'read_request';
    const raw = await request.text();
    if (!raw || raw.length > 12000) {
      return json({ error: 'The message is empty or too large. Please shorten it and try again.', code: 'AI_REQUEST_EMPTY_OR_TOO_LARGE', requestId }, 400, requestId);
    }

    stage = 'parse_request';
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: 'Invalid message format. Please refresh the page and try again.', code: 'AI_INVALID_JSON', requestId }, 400, requestId);
    }

    const incoming = Array.isArray(body.messages) ? body.messages.slice(-10) : [];
    const messages = incoming
      .filter((item) => item && (item.role === 'user' || item.role === 'assistant'))
      .map((item) => ({ role: item.role, content: clean(item.content, 1000) }))
      .filter((item) => item.content);

    if (!messages.length || messages[messages.length - 1].role !== 'user') {
      return json({ error: 'Please enter a question.', code: 'AI_QUESTION_REQUIRED', requestId }, 400, requestId);
    }

    stage = 'cloudflare_ai_run';
    const upstreamStartedAt = Date.now();
    let result;
    try {
      result = await env.AI.run(model, {
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        max_tokens: 450,
        temperature: 0.4
      });
    } catch (error) {
      logAI('cloudflare_ai_failed', {
        requestId,
        stage,
        model,
        errorName: clean(error && error.name, 80) || 'AIProviderError',
        durationMs: Date.now() - upstreamStartedAt,
        totalDurationMs: Date.now() - startedAt
      });
      return json({
        error: 'Cloudflare AI could not complete the request. Please try again shortly.',
        code: 'AI_CLOUDFLARE_PROVIDER_FAILED',
        requestId
      }, 502, requestId);
    }

    stage = 'extract_answer';
    const answer = clean(result && (result.response || result.output || result.generated_text), 3500);
    if (!answer) {
      logAI('cloudflare_ai_empty_answer', {
        requestId,
        stage,
        model,
        resultKeys: result && typeof result === 'object' ? Object.keys(result).slice(0, 12) : [],
        totalDurationMs: Date.now() - startedAt
      });
      return json({ error: 'Cloudflare AI returned an empty answer. Please try again.', code: 'AI_EMPTY_ANSWER', requestId }, 502, requestId);
    }

    logAI('request_succeeded', {
      requestId,
      provider: 'cloudflare_workers_ai',
      model,
      totalDurationMs: Date.now() - startedAt
    });
    return json({ answer, requestId }, 200, requestId);
  } catch (error) {
    logAI('request_failed', {
      requestId,
      stage,
      provider: 'cloudflare_workers_ai',
      errorName: clean(error && error.name, 80) || 'UnknownError',
      totalDurationMs: Date.now() - startedAt
    });
    return json({
      error: 'Navstar AI encountered a server error. Please try again shortly.',
      code: 'AI_INTERNAL_ERROR',
      requestId
    }, 500, requestId);
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
