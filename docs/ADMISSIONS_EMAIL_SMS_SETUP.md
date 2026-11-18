# Navstar Admissions email and SMS setup

The admissions wizard uses two independent verification codes. Applicants must enter the code delivered by email and the different code delivered by SMS. The application API will not create an application unless both delivery channels report success.

## Required Cloudflare Pages settings

Open Cloudflare Dashboard → Workers & Pages → **navstar-digital-hub** → Settings → Variables and Secrets.

Add the following values to the **Production** environment. Add them to **Preview** as well only if preview deployments should send real verification messages.

| Name | Cloudflare type | Purpose |
| --- | --- | --- |
| `RESEND_API_KEY` | Secret | Resend API key used to send applicant verification and admission emails |
| `MAIL_FROM` | Variable | Exact sender address verified in Resend, for example the Admissions sender address on your verified Navstar domain |
| `AT_USERNAME` | Variable | Africa's Talking account username for the selected environment |
| `AT_API_KEY` | Secret | Africa's Talking API key |
| `AT_SENDER_ID` | Variable, optional | Approved SMS sender ID. Leave unset unless Africa's Talking has approved it for your account |

Do not paste API keys into source files, GitHub commits, support messages or this chat. Enter secret values directly in Cloudflare.

## Resend setup

1. Sign in to Resend and open Domains.
2. Verify a domain you control by completing the DNS records Resend supplies.
3. Create an API key with permission to send email.
4. Add that API key as the Cloudflare secret `RESEND_API_KEY`.
5. Set `MAIL_FROM` to the exact sender address permitted by the verified domain. Do not use an unverified or invented sender address.

## Africa's Talking setup

1. Sign in to the Africa's Talking account.
2. Select the intended environment (Sandbox for controlled tests or Production for live applicants).
3. Copy the account username into `AT_USERNAME`.
4. Add the corresponding API key as the Cloudflare secret `AT_API_KEY`.
5. Add `AT_SENDER_ID` only if a sender ID has been approved for the selected account and environment.

The username and API key must belong to the same Africa's Talking environment. A Sandbox key will not deliver to real applicants.

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
