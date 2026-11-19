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
  let model = '';

  try {
    logAI('request_started', {
      requestId,
      method: request.method,
      path: new URL(request.url).pathname
    });

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

    stage = 'environment_check';
    const apiKey = clean(env && env.OPENAI_API_KEY, 500);
    if (!apiKey) {
      logAI('configuration_missing', { requestId, stage });
      return json({
        error: 'Navstar AI is not configured. Check the Production OPENAI_API_KEY secret.',
        code: 'AI_API_KEY_MISSING',
        requestId
      }, 503, requestId);
    }

    model = clean(env && env.OPENAI_MODEL, 100) || 'gpt-4.1-mini';

    stage = 'read_request';
    const raw = await request.text();
    if (!raw || raw.length > 12000) {
      return json({
        error: 'The message is empty or too large. Please shorten it and try again.',
        code: 'AI_REQUEST_EMPTY_OR_TOO_LARGE',
        requestId
      }, 400, requestId);
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

    stage = 'openai_fetch';
    const upstreamStartedAt = Date.now();
    let upstream;
    try {
      upstream = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
          max_tokens: 450,
          temperature: 0.4
        }),
        signal: AbortSignal.timeout(25000)
      });
    } catch (error) {
      const timedOut = error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      const errorName = clean(error && error.name, 80) || 'FetchError';
      logAI('openai_connection_failed', {
        requestId,
        stage,
        model,
        errorName,
        durationMs: Date.now() - upstreamStartedAt,
        totalDurationMs: Date.now() - startedAt
      });
      return json({
        error: timedOut
          ? 'The AI provider took too long to respond. Please try again.'
          : 'Cloudflare could not connect to the AI provider. Please try again shortly.',
        code: timedOut ? 'AI_UPSTREAM_TIMEOUT' : 'AI_UPSTREAM_CONNECTION_FAILED',
        requestId
      }, 502, requestId);
    }

    stage = 'openai_response';
    const responseText = await upstream.text();
    logAI('openai_response_received', {
      requestId,
      stage,
      model,
      status: upstream.status,
      ok: upstream.ok,
      durationMs: Date.now() - upstreamStartedAt
    });

    stage = 'openai_response_parse';
    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      logAI('openai_non_json_response', {
        requestId,
        stage,
        model,
        status: upstream.status,
        responseLength: responseText.length
      });
      return json({
        error: 'The AI provider returned an unreadable response (HTTP ' + upstream.status + ').',
        code: 'AI_UPSTREAM_NON_JSON',
        upstreamStatus: upstream.status,
        requestId
      }, 502, requestId);
    }

    if (!upstream.ok) {
      const providerCode = clean(result && result.error && result.error.code, 100);
      const providerType = clean(result && result.error && result.error.type, 100);
      const providerMessage = clean(result && result.error && result.error.message, 220);

      logAI('openai_request_rejected', {
        requestId,
        stage: 'openai_response',
        model,
        status: upstream.status,
        providerCode,
        providerType,
        totalDurationMs: Date.now() - startedAt
      });

      if (upstream.status === 401 || upstream.status === 403) {
        return json({
          error: 'OpenAI rejected the configured API key or its permissions. Check the API project and Production OPENAI_API_KEY secret.',
          code: 'AI_UPSTREAM_AUTH_ERROR',
          upstreamStatus: upstream.status,
          requestId
        }, 502, requestId);
      }
      if (upstream.status === 429) {
        return json({
          error: 'OpenAI API usage limit or billing quota reached. Check API billing and usage at platform.openai.com.',
          code: providerCode === 'insufficient_quota' ? 'AI_BILLING_QUOTA_EXCEEDED' : 'AI_RATE_LIMITED',
          upstreamStatus: upstream.status,
          requestId
        }, 502, requestId);
      }
      if (upstream.status === 400 || upstream.status === 404) {
        return json({
          error: providerMessage || 'OpenAI rejected the selected model or request settings. Check OPENAI_MODEL in Cloudflare.',
          code: 'AI_MODEL_OR_REQUEST_REJECTED',
          upstreamStatus: upstream.status,
          requestId
        }, 502, requestId);
      }
      return json({
        error: providerMessage || 'OpenAI request failed (HTTP ' + upstream.status + ').',
        code: 'AI_UPSTREAM_ERROR',
        upstreamStatus: upstream.status,
        requestId
      }, 502, requestId);
    }

    stage = 'extract_answer';
    const answer = clean(
      result && result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content,
      3500
    );
    if (!answer) {
      logAI('openai_empty_answer', { requestId, stage, model, totalDurationMs: Date.now() - startedAt });
      return json({ error: 'OpenAI returned an empty answer. Please try again.', code: 'AI_EMPTY_ANSWER', requestId }, 502, requestId);
    }

    logAI('request_succeeded', {
      requestId,
      stage: 'complete',
      model,
      totalDurationMs: Date.now() - startedAt
    });
    return json({ answer, requestId }, 200, requestId);
  } catch (error) {
    // Do not log exception messages, stacks, secrets, or user message contents.
    logAI('request_failed', {
      requestId,
      stage,
      model: model || undefined,
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
