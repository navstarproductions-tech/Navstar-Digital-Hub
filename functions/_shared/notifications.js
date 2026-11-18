const EMAIL_ENDPOINT = 'https://api.resend.com/emails';
const TEXTSMS_ENDPOINT = 'https://sms.textsms.co.ke/api/services/sendsms/';
const NAVSTAR_SMS_INTRO = 'Greetings, You are receiving an SMS from Navstar Digital Hub.';

function normalizeKenyanMobile(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('0') && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.startsWith('7') && digits.length === 9) return `254${digits}`;
  if (digits.startsWith('1') && digits.length === 9) return `254${digits}`;
  return digits;
}

function navstarSmsMessage(message) {
  const body = String(message || '').trim();
  if (!body) return NAVSTAR_SMS_INTRO;
  if (body.toLowerCase().startsWith(NAVSTAR_SMS_INTRO.toLowerCase())) return body;
  return `${NAVSTAR_SMS_INTRO}\n\n${body}`;
}

async function sendTextSms(env, phone, message) {
  const mobile = normalizeKenyanMobile(phone);
  if (!/^254\d{9}$/.test(mobile)) {
    throw new Error('TextSMS rejected notification: recipient must be a valid Kenyan mobile number.');
  }

  const response = await fetch(TEXTSMS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      apikey: env.TEXTSMS_API_KEY,
      partnerID: env.TEXTSMS_PARTNER_ID,
      mobile,
      message: navstarSmsMessage(message),
      // The account lists "TextSMS" as its active default transactional sender ID.
      shortcode: env.TEXTSMS_SENDER_ID || 'TextSMS',
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`TextSMS HTTP error ${response.status}.`);
  }

  const result = payload?.responses?.[0];
  const code = Number(result?.['respose-code'] ?? result?.['response-code']);
  if (code !== 200) {
    const description = String(result?.['response-description'] || payload?.message || 'Unknown TextSMS response');
    throw new Error(`TextSMS delivery request failed (${Number.isFinite(code) ? code : 'no code'}): ${description}`);
  }

  return {
    provider: 'TextSMS',
    accepted: true,
    messageId: result?.messageid ?? null,
    mobile,
    responseDescription: result?.['response-description'] || 'Success',
  };
}

export async function sendCustomerNotice(env, { email, phone, subject, message }) {
  const tasks = [];
  if (email && env.RESEND_API_KEY && env.MAIL_FROM) {
    tasks.push(fetch(EMAIL_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM, to: [email], subject, text: message }),
    }).then(async (response) => {
      if (!response.ok) throw new Error(`Email provider HTTP error ${response.status}.`);
      return { provider: 'Resend', accepted: true };
    }));
  }
  if (phone && env.TEXTSMS_API_KEY && env.TEXTSMS_PARTNER_ID) {
    tasks.push(sendTextSms(env, phone, message));
  } else if (phone) {
    console.error('TextSMS notification not sent: TEXTSMS_API_KEY or TEXTSMS_PARTNER_ID is not configured.');
  }
  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('Customer notification delivery failure:', String(result.reason?.message || result.reason));
    }
  }
  return results;
}

/**
 * Queue external customer notifications without holding up the API response.
 * Cloudflare Pages keeps the task alive with waitUntil after returning the response.
 */
export function queueCustomerNotice(context, env, notice) {
  const task = sendCustomerNotice(env, notice).then((results) => {
    const failed = results.filter((result) => result.status === 'rejected');
    for (const result of failed) {
      console.error('Customer notification delivery failure:', String(result.reason?.message || result.reason));
    }
  }).catch((error) => {
    console.error('Customer notification task failed:', String(error?.message || error));
  });
  if (typeof context?.waitUntil === 'function') context.waitUntil(task);
  else void task;
}
