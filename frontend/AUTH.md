# NeighborAlert authentication setup

The app uses Expo AuthSession for an OIDC authorization-code flow with PKCE; no separate SpacetimeAuth client SDK is installed. It discovers endpoints from `https://auth.spacetimedb.com/oidc/.well-known/openid-configuration`, exchanges the returned code, then gives the ID token to `backend/client/login.ts`. The backend verifies the SpacetimeAuth issuer, audience, and verified email, links only a prepopulated account, and publishes the profile after the login reducer succeeds.

## Environment and provider configuration

Set these frontend values in `frontend/.env.local` and restart Expo after changing them:

- `EXPO_PUBLIC_SPACETIMEAUTH_CLIENT_ID`: public client ID from SpacetimeAuth. This is intentionally public; never put a client secret in the app.
- `EXPO_PUBLIC_SPACETIMEDB_URI`: SpacetimeDB WebSocket URI.
- `EXPO_PUBLIC_SPACETIMEDB_DATABASE`: database name.

Configure the backend module's `SPACETIMEAUTH_CLIENT_ID` to the same client ID. Enable the desired email/magic-link login method and prepopulate eligible accounts; the login flow does not create accounts. The optional email input is only sent as an OIDC login hint.

Register the web callback URLs on the SpacetimeAuth client exactly as used by the deployment:

- Local web: `http://localhost:8081/callback` (or the actual development origin and port).
- Hosted web: `https://hackutd2026.vercel.app/callback`.

The Expo Router callback route is `frontend/src/app/callback.tsx`. Keep the registered callback, `redirectUri` from `frontend/services/spacetimeAuth.ts`, and deployed web origin in sync. The native redirect is `neighboralert://callback`; that exact URI intentionally skips external authorization and goes straight to Home, so it is not used as a SpacetimeAuth callback.

## Flow and route behavior

- When the computed redirect URI is exactly `neighboralert://callback`, no discovery request, browser session, or token exchange is started. Home is accessible on Android (and any other platform producing that exact URI); this is a navigation bypass, not an authenticated SpacetimeDB session.
- For any other redirect URI, the login button starts OIDC with PKCE. Expo AuthSession returns the callback parameters to the original flow; the app exchanges the code using the original verifier and redirect URI, then verifies the account and subscribes to its SpacetimeDB profile. Only an established connection grants normal Home access.
- The Expo Router route tree is `frontend/src/app` (Expo Router selects it when both `src/app` and `app` exist). Loading, missing client ID, cancellation, provider errors, unknown accounts, and expired sessions are surfaced in the UI. No automatic silent renewal is implemented; start sign-in again after expiry.

For testing, use a prepopulated account and inbox for success, an unlisted email for account rejection, and cancel once to confirm retry. Opening `/home` before authentication should return to sign-in unless the special URI bypass applies. Builds and type checks do not send email or alter the database.

The generated SpacetimeDB bindings must match the published module schema before login subscriptions can be applied. This flow does not deploy or reset the database.

Official references:
- https://spacetimedb.com/docs/core-concepts/authentication/spacetimeauth/react-integration/
- https://docs.expo.dev/versions/v58.0.0/sdk/auth-session/
- https://docs.expo.dev/router/advanced/authentication/
