export async function onRequest({ request, next }) {
  const isApi = new URL(request.url).pathname.startsWith('/api/');
  try {
    const response = await next();
    if (!isApi) return response;
    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.toLowerCase().includes('application/json')) return response;
    console.error('Navstar API returned a non-JSON response:', request.method, new URL(request.url).pathname, response.status, contentType);
    return new Response(JSON.stringify({
      error: response.status === 404
        ? 'The requested service endpoint was not found. Please refresh the page and try again.'
        : 'The service returned an unexpected page instead of data. Please try again. If this continues, contact Navstar support.',
      code: 'API_NON_JSON_RESPONSE'
    }), {
      status: response.status >= 400 ? response.status : 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  } catch (cause) {
    console.error('Navstar API request failed:', request.method, new URL(request.url).pathname, String(cause?.stack || cause));
    if (!isApi) throw cause;
    return new Response(JSON.stringify({
      error: 'The service could not complete this request. Please try again. Your existing records have not been reset.',
      code: 'API_INTERNAL_ERROR'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }
}
