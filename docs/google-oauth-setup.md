# Google sign-in setup for Navstar Digital Hub

Google sign-in is implemented for existing active Navstar portal accounts. It verifies Google's signed identity, requires a verified email, and links the Google subject to the existing account by email. It does not create an administrator or grant a new role.

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

Do not commit either value to Git or place it in frontend code. After saving the secrets, redeploy the Pages project.

## Account linking and access

- A Google email must match an existing active Navstar portal account.
- The Google email must be verified by Google.
- Google sign-in does not create an account or elevate privileges.
- Existing email/password and staff ID login remain available.
- If an account is already linked to a different Google identity, the link is rejected for administrator review.

## Callback

The Worker callback is `/api/auth/google?callback=1`. State is checked using a short-lived, secure, HttpOnly cookie.
