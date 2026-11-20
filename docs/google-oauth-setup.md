# Google sign-in setup for Navstar Digital Hub

Google sign-in is a public customer-account option on the main Navstar website. It appears under **Log in / Sign up** at `/account`, alongside the existing email registration and sign-in forms. It is not a staff or student portal login method.

## Google Cloud Console

1. Create or select a Google Cloud project and configure the OAuth consent screen.
2. Create an OAuth Client ID of type **Web application**.
3. Add this authorised JavaScript origin:
   `https://navstardigitalhub.co.ke`
4. Add this authorised redirect URI exactly:
   `https://navstardigitalhub.co.ke/api/auth/google?callback=1`

## Cloudflare Pages secrets

Add these as encrypted production secrets / environment variables for the Pages project:

- `GOOGLE_CLIENT_ID` — the OAuth web client ID.
- `GOOGLE_CLIENT_SECRET` — the OAuth web client secret.

Do not commit either value to Git or place it in frontend code. Redeploy the Pages project after saving the secrets.

## Public customer account behaviour

- A verified Google email creates a public Navstar customer account on first sign-in.
- Returning customers are signed in to the same account.
- If a customer account already exists with that email, Google links to that account.
- Suspended accounts are not allowed to sign in.
- Google sign-in does not create or grant staff/student portal privileges.
- Existing email/password customer registration and sign-in remain available.
- Staff and student portals continue using their separate portal login process.

## Database migration

Apply migration `0021_customer_google_signin.sql` to add the unique Google identity link to the customer-account table before enabling the feature in production.

## Callback security

The Worker callback is `/api/auth/google?callback=1`. It checks a short-lived, secure, HttpOnly state cookie and verifies the Google token audience and verified email before creating a customer session.
