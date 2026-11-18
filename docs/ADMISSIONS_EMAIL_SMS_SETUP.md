# Navstar Admissions email and SMS setup

The admissions wizard uses two independent verification codes. Applicants must enter the code delivered by email and the different code delivered by SMS. The application API will not create an application unless both delivery channels report success.

## Required Cloudflare Pages settings

Open Cloudflare Dashboard → Workers & Pages → **navstar-digital-hub** → Settings → Variables and Secrets.

Add the following values to the **Production** environment. Add them to **Preview** as well only if preview deployments should send real verification messages.

| Name | Cloudflare type | Purpose |
| --- | --- | --- |
| `RESEND_API_KEY` | Secret | Resend API key used to send applicant verification and admission emails |
| `MAIL_FROM` | Variable | Exact sender address verified in Resend, for example the Admissions sender address on your verified Navstar domain |
| `TEXTSMS_API_KEY` | Secret | TextSMS API key |
| `TEXTSMS_PARTNER_ID` | Secret | TextSMS Partner ID |
| `TEXTSMS_SENDER_ID` | Variable, optional | TextSMS sender name; defaults to the account's active transactional sender ID, `TextSMS` |

Do not paste API keys into source files, GitHub commits, support messages or this chat. Enter secret values directly in Cloudflare.

## Resend setup

1. Sign in to Resend and open Domains.
2. Verify a domain you control by completing the DNS records Resend supplies.
3. Create an API key with permission to send email.
4. Add that API key as the Cloudflare secret `RESEND_API_KEY`.
5. Set `MAIL_FROM` to the exact sender address permitted by the verified domain. Do not use an unverified or invented sender address.

## TextSMS setup

1. Sign in to the TextSMS account and open the API credentials page.
2. Store the generated API key as the Cloudflare secret `TEXTSMS_API_KEY`.
3. Store the Partner ID as the Cloudflare secret `TEXTSMS_PARTNER_ID`.
4. The account's active transactional sender entry is labelled `TextSMS` (dashboard record ID 12998). The API's `shortcode` field expects the sender name `TextSMS`, not the dashboard record number. The integration uses `TextSMS` by default; set `TEXTSMS_SENDER_ID` only if the provider instructs you to use a different sender name.
5. Keep the API key out of source code, GitHub, screenshots and support messages.

All outbound customer SMS sent through the shared notification service begin with: "Greetings, You are receiving an SMS from Navstar Digital Hub." The remaining notification content follows this introduction.

The TextSMS API returns a provider response code and message ID. The integration treats a message as accepted only when the provider returns response code 200. Acceptance by the gateway is not proof of handset delivery; use the provider's delivery-report feature for final delivery confirmation.

## Deployment and verification order

1. Merge the admissions implementation PR after reviewing its checks.
2. Allow the D1 migration workflow to apply migration `0015_admissions_workflows.sql`.
3. Add the Production values above in Cloudflare Pages.
4. Trigger a new Pages deployment so the Functions receive the new environment values.
5. Submit a controlled application using an email inbox and mobile number you can access.
6. Confirm that the email code and SMS code are different and both are required.
7. Complete the M-Pesa test using a controlled test payment environment before enabling live applicant traffic.
8. In Admin → Applications, test deferred payment and reduced-deposit approvals, then check their audit entries.
9. Test acceptance, rejection and withdrawal notices; generate each applicable letter and use the print dialog to save a PDF.
10. Accept a test student and confirm that the password setup link works once, expires after 24 hours, and does not expose a password.

## Important behaviour

- Email OTP and SMS OTP expire after 10 minutes.
- Verification codes are stored as hashes, are limited by request/attempt controls and are single-use.
- If either OTP channel fails, the application is not submitted.
- A reduced initial payment must be confirmed by M-Pesa before the application can be accepted.
- A full payment deferral must be approved by an authorised Admin, Admissions or Principal user and is recorded with its reason and due date.
- Admission password setup links are single-use and expire after 24 hours.
- No real delivery or payment test is complete until the Cloudflare values are configured and a new deployment has been verified.
