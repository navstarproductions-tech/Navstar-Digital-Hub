export async function readApiResponse<T = Record<string, unknown>>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  const raw = await response.text();
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error(response.status === 404
      ? 'The requested service endpoint is unavailable. Please refresh and try again.'
      : `The server returned an unexpected page (HTTP ${response.status}) instead of a response. Please try again.`);
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error('The server returned an invalid response. Please try again.');
  }
}
