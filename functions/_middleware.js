export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  const isApi = url.pathname.startsWith('/api/');
  const requestId = crypto.randomUUID();
  try {
    const response = await next();
    if (!isApi) return response;
    // Document endpoints return PDF/Office/binary file streams, not JSON.
    // Pass successful downloads through unchanged instead of converting them to API_NON_JSON_RESPONSE.
    if (/^\\/api\\/downloads?\\/[^/]+$/.test(url.pathname) && response.ok) return response;
    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.toLowerCase().includes('application/json')) return response;
    console.error('Navstar API returned a non-JSON response:', requestId, request.method, url.pathname, response.status, contentType);
    return new Response(JSON.stringify({
      error: response.status === 404
        ? 'The requested service endpoint was not found. Please refresh the page and try again.'
        : 'The server returned an unexpected response. Please refresh and try again.',
      code: 'API_NON_JSON_RESPONSE',
      reference: requestId
    }), {
      status: response.status >= 400 ? response.status : 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Request-ID': requestId }
    });
  } catch (cause) {
    console.error('Navstar API request failed:', requestId, request.method, url.pathname, String(cause?.stack || cause));
    if (!isApi) throw cause;
    return new Response(JSON.stringify({
      error: 'The service could not save this change. Your existing records have not been deleted. Please retry and give Navstar support the reference below if it continues.',
      code: 'API_INTERNAL_ERROR',
      reference: requestId
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Request-ID': requestId }
    });
  }
}
