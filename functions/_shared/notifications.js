const EMAIL_ENDPOINT = 'https://api.resend.com/emails';
const SMS_ENDPOINT = 'https://api.africastalking.com/version1/messaging';

export async function sendCustomerNotice(env, { email, phone, subject, message }) {
  const tasks = [];
  if (email && env.RESEND_API_KEY && env.MAIL_FROM) {
    tasks.push(fetch(EMAIL_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM, to: [email], subject, text: message }),
    }));
  }
  if (phone && env.AT_USERNAME && env.AT_API_KEY) {
    const form = new URLSearchParams({ username: env.AT_USERNAME, to: phone.startsWith('+') ? phone : `+${phone}`, message });
    if (env.AT_SENDER_ID) form.set('from', env.AT_SENDER_ID);
    tasks.push(fetch(SMS_ENDPOINT, {
      method: 'POST',
      headers: { apiKey: env.AT_API_KEY, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    }));
  }
  return Promise.allSettled(tasks);
}

/**
 * Queue external customer notifications without holding up the API response.
 * Cloudflare Pages keeps the task alive with waitUntil after returning the response.
 */
export function queueCustomerNotice(context, env, notice) {
  const task = sendCustomerNotice(env, notice).then((results) => {
    const failed = results.filter((result) => result.status === 'rejected');
    if (failed.length) console.error('Customer notification delivery failures:', failed.length);
  }).catch((error) => {
    console.error('Customer notification task failed:', String(error?.message || error));
  });
  if (typeof context?.waitUntil === 'function') context.waitUntil(task);
  else void task;
}
