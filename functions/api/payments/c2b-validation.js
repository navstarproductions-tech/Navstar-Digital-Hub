import { json } from '../../_shared/http.js';

// Safaricom calls this before posting the transaction confirmation.
// Navstar accepts the transaction and records it only on the confirmation callback.
export async function onRequestPost() {
  return json({ ResultCode: 0, ResultDesc: 'Accepted' });
}
