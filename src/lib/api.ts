export async function readApiResponse<T = Record<string, unknown>>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  const raw = await response.text();
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error(response.status === 404
      ? 'The requested service endpoint is unavailable. Please refresh and try again.'
      : `The server returned an unexpected page (HTTP ${response.status}). Please try again.`);
  }
  let parsed: T & { error?: string; reference?: string };
  try {
    parsed = JSON.parse(raw) as T & { error?: string; reference?: string };
  } catch {
    throw new Error('The server returned an invalid response. Please try again.');
  }
  if (!response.ok) {
    const detail = parsed.error || `Request failed (HTTP ${response.status}).`;
    throw new Error(parsed.reference ? `${detail} Reference: ${parsed.reference}` : detail);
  }
  return parsed;
}
