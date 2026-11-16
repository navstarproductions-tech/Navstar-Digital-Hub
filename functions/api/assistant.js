const SYSTEM_PROMPT = `You are the public website assistant for Navstar Digital Hub in Kenya. The official motto is HOME OF TECHNOCRATS. Be friendly, concise, accurate and helpful. Guide visitors through the website using markdown links with the exact format [Page name](/route). Available pages: Home (/), Courses (/courses), Services (/services), Campus Life (/campus-life), Admission Letters (/admissions-letters), Analytics and school ERP (/analytics), Music (/music), Forum (/forum), Student Gateway (/portals), Customer Account (/account). Explain that the school ERP is being developed for primary, junior secondary, senior secondary and other institutions, with learners, classes, staff, learning management, fee structures, invoices, payments and PDF receipts. Do not claim unfinished features are already operational. For Navstar contact: +254 797 688 576, +254 706 637 485, navstardigitalhub@gmail.com. Do not request or disclose passwords, M-Pesa PINs, API keys or private records. For personal account, application or payment status, direct the user to sign in to the appropriate portal; never invent account data. If unsure, say so and offer the relevant page or contact details.`;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function clean(value, max = 1200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function onRequestPost({ request, env }) {
  try {
    const origin = request.headers.get('Origin');
    if (origin) {
      try {
        if (new URL(origin).origin !== new URL(request.url).origin) {
          return json({ error: 'Request origin is not allowed.' }, 403);
        }
      } catch {
        return json({ error: 'Invalid request origin.' }, 403);
      }
    }

    const apiKey = clean(env && env.OPENAI_API_KEY, 500);
    if (!apiKey) {
      return json({ error: 'Navstar AI is not configured. Check the Production OPENAI_API_KEY secret.' }, 503);
    }

    const raw = await request.text();
    if (!raw || raw.length > 12000) {
      return json({ error: 'The message is empty or too large. Please shorten it and try again.' }, 400);
    }

    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: 'Invalid message format. Please refresh the page and try again.' }, 400);
    }

    const incoming = Array.isArray(body.messages) ? body.messages.slice(-10) : [];
    const messages = incoming
      .filter((item) => item && (item.role === 'user' || item.role === 'assistant'))
      .map((item) => ({ role: item.role, content: clean(item.content, 1000) }))
      .filter((item) => item.content);

    if (!messages.length || messages[messages.length - 1].role !== 'user') {
      return json({ error: 'Please enter a question.' }, 400);
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
          model: clean(env && env.OPENAI_MODEL, 100) || 'gpt-4.1-mini',
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
          max_tokens: 450,
          temperature: 0.4
        }),
        signal: AbortSignal.timeout(25000)
      });
    } catch (e) {
      const timedOut = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
      return json({
        error: timedOut
          ? 'The AI provider took too long to respond. Please try again.'
          : 'Cloudflare could not connect to the AI provider. Please try again shortly.'
      }, 502);
    }

    const responseText = await upstream.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      return json({ error: 'The AI provider returned an unreadable response (HTTP ' + upstream.status + ').' }, 502);
    }

    if (!upstream.ok) {
      if (upstream.status === 401 || upstream.status === 403) {
        return json({ error: 'The OpenAI API key was rejected. Check the Production OPENAI_API_KEY secret in Cloudflare.' }, 502);
      }
      if (upstream.status === 429) {
        return json({ error: 'OpenAI API usage limit or billing quota reached. Check API billing and usage at platform.openai.com.' }, 502);
      }
      const providerMessage = clean(result && result.error && result.error.message, 220);
      return json({ error: providerMessage || 'OpenAI request failed (HTTP ' + upstream.status + ').' }, 502);
    }

    const answer = clean(result && result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content, 3500);
    if (!answer) {
      return json({ error: 'OpenAI returned an empty answer. Please try again.' }, 502);
    }

    return json({ answer });
  } catch (e) {
    // Never expose secrets or message contents in platform logs or user-facing errors.
    return json({ error: 'Navstar AI encountered a server error. Please try again shortly.' }, 500);
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
