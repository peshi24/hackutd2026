# Email sign-in setup

1. Copy `.env.example` to `.env.local`; set the public SpacetimeAuth client ID and database name. Never include a client secret. The backend must have the same `SPACETIMEAUTH_CLIENT_ID` and a prepopulated account for the email.
2. Enable email magic-link login in SpacetimeAuth. Register these exact callback URLs on its client:
   - Native development/production build: `neighboralert://callback`.
   - Local web: `http://localhost:8081/callback` (match the actual host/port).
   - Hosted web: `https://YOUR-HOST/callback`.
3. Restart Expo after environment changes. Native login needs a development build with the new `neighboralert` scheme and installed native packages, not Expo Go. Rebuild after changing the scheme.

Submit starts the documented hosted OIDC login with PKCE. The email is sent as a `login_hint`, not authorization. Select/confirm email magic-link sign-in on the hosted page; SpacetimeAuth sends the email. Its UI may ask for the email again. There is no undocumented direct-send endpoint in this implementation.

After the link returns, the app exchanges the code with the original PKCE verifier and passes the ID token to `backend/client/login.ts`. The backend verifies the email/account/role. Only after account verification and subscriptions succeed does routing open `/home`. Unknown accounts show `No account found for this email.` Cancellation/errors allow retry. No account is created by login.

Routes now live in `src/app`; wrappers reuse existing screens under `app`. The session provider exposes the connection through `useSession()`. Existing chat/location fixture content is unchanged.

## Test

Use a prepopulated real inbox for success, an unlisted inbox for rejection, and cancel once to check retry. Open `/home` before login to verify the guard. Keep the original app/tab open and complete the email link on the same device/browser. No email is sent during builds or code checks.

Sessions/PKCE are memory-only for this MVP. Reloading or killing the app requires starting login again. Expiry/disconnection returns to login; no silent refresh is implemented. A callback opened on another device or after restarting cannot complete the original request.

## Existing blockers

The generated bindings include the urgency-score schema. The published database must match these bindings before the shared login helper can subscribe. This change does not deploy or reset Maincloud.

The existing location screen uses native `react-native-maps`; web builds need the team's web map fallback. Native development builds are the primary target.

Official references:
- https://spacetimedb.com/docs/core-concepts/authentication/spacetimeauth/react-integration/
- https://docs.expo.dev/guides/authentication/
