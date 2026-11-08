# Existing-account magic-link login

The backend accepts an existing account only after SpacetimeAuth verifies its email. There is no NeighborAlert signup, approval list, password table, or login-time user creation. The frontend login screen is owned by your teammate; no files in `frontend` were changed.

## What is implemented

- `user.email`: appended with a default empty string and an index. Existing IDs, requests, messages and resources remain in place. Empty email means the record cannot log in through this flow. Email stays private; existing `my_profile` and `visible_users` view columns/primary keys are preserved.
- `login_existing_user`: **no arguments**. Checks the host-verified JWT's issuer (`https://auth.spacetimedb.com/oidc`), audience (the configured client ID), `email_verified === true`, and email. It trims/lowercases email, looks it up, and binds `ctx.sender` to that existing row. It never inserts a user. No email or permission from frontend form data is trusted.
- Unknown email: `SenderError("No account found for this email.")`. A verified but unknown user can connect to call this reducer, but gets no private account data and cannot use resident/responder operations. Disaster/organization information remains public by design.
- Existing `resident`/`responder` roles determine access; token role claims are ignored. Login synchronizes a responder's existing role into the `access` table. `set_access` still manages permissions and updates the profile role, so logging in again does not undo a demotion.
- A different identity cannot claim an already linked account. One identity cannot attach itself to a second account. Repeat login with the same identity is safe. Changing email on a linked account is rejected; account recovery/rebinding is intentionally outside this MVP.
- Human connections validate issuer, audience and verified email before subscription access; human reducers also validate claims. Anonymous self-registration is disabled: the old `register_user` reducer now returns an explicit error.
- The publishing administrator and explicitly granted `ai`/`integration` identities keep their existing service access. SMS-only user creation remains available to trusted integrations, but those records have no email login unless an administrator prepopulates their account email. No blanket login hook blocks these services or scheduled reducers.

This verifies control of an allowlisted email. It does not connect to State Farm's identity system or verify State Farm membership. The prepopulated account data represents that assumption for the demo. SpacetimeAuth may maintain its own identity-provider user record when someone authenticates; that never creates a NeighborAlert `user` row.

## Maincloud configuration (manual)

1. In your published database's Maincloud dashboard, enable **SpacetimeAuth**. Create/select the client your teammate will use.
2. Enable email magic links in the hosted login configuration and disable anonymous login. For a magic-link-only demo, leave social providers disabled.
3. Add the exact redirect URI your teammate supplies (including scheme, port and callback path), plus the post-logout redirect URI. Native apps need their configured app scheme/development build redirect; browser apps need their HTTP(S) callback. Do not guess a callback URL.
4. Give your teammate the **client ID**, authority `https://auth.spacetimedb.com/oidc`, database name, and Maincloud URI. Request `openid profile email` using Authorization Code with PKCE. No client secret belongs in React/mobile code.
5. Set the same client ID on the backend as `SPACETIMEAUTH_CLIENT_ID`. An unset value denies human login, rather than accepting arbitrary tokens. Admin/service access is retained so configuration can be repaired.

Official references: [SpacetimeAuth setup](https://spacetimedb.com/docs/core-concepts/authentication/spacetimeauth/creating-a-project/), [client configuration and email claims](https://spacetimedb.com/docs/core-concepts/authentication/spacetimeauth/configuring-a-project/), [React OIDC integration](https://spacetimedb.com/docs/core-concepts/authentication/spacetimeauth/react-integration/), [backend claim validation](https://spacetimedb.com/docs/core-concepts/authentication/usage/). SpacetimeAuth is currently beta. Its hosted page sends the link; there is no invented `sendMagicLink` database reducer or frontend SDK method here.

From `backend` in PowerShell, using the original publishing administrator:

```powershell
$env:SPACETIMEAUTH_CLIENT_ID = 'YOUR_SPACETIMEAUTH_CLIENT_ID'
$env:ENABLE_DEV_SEED = 'true'
spacetime publish YOUR-DATABASE --server maincloud --module-path spacetimedb --no-config --delete-data=never
```

Review and accept the reconnect warning when publishing. Adding the email column may disconnect clients even though records are preserved; redeploy/reconnect clients with the regenerated bindings and authenticated connection flow. Do not reset/reseed the database. Existing anonymous human connections are no longer the supported login path. Existing seeded residents with undefined identity can be attached to real demo inboxes without changing their IDs. Legacy profiles already linked to an anonymous identity cannot be silently repurposed; use a new prepopulated demo account or plan an explicit administrator migration.

## Prepopulate demo accounts

`prepopulateDemoAccount` is restricted to the original administrator and `ENABLE_DEV_SEED=true`. This is administrative data preparation, never called by the sign-in screen.

The easiest option uses your existing CLI administrator login:

```powershell
Copy-Item accounts.example.json accounts.local.json
# Edit accounts.local.json with inboxes you control, then:
node scripts/prepopulate-accounts.mjs YOUR-DATABASE accounts.local.json
```

The local account file is gitignored. Add `"userId": "1"` to an entry to attach it to a specific unlinked seeded resident instead of inserting a new demo account. IDs are decimal strings to preserve 64-bit values. The script handles CLI JSON quoting on Windows. Each entry commits separately; stop and correct an error before rerunning. The same email reuses its existing record.

Using an administrator SDK connection (do not put its credential in the frontend):

```typescript
// Attach your real test inbox to an existing seeded resident, preserving requests.
await adminConnection.reducers.prepopulateDemoAccount({
  userId: 1n, // use the actual resident ID from your database
  email: "your-test-inbox@example.com",
  name: "Jordan Parker",
  role: "resident",
  phone: undefined,
});

// Or insert a pre-existing demo account that has not been seeded yet.
await adminConnection.reducers.prepopulateDemoAccount({
  userId: undefined,
  email: "your-responder-inbox@example.com",
  name: "Taylor Reed",
  role: "responder",
  phone: undefined,
});
```

Use inboxes you can actually receive mail at; `example.com` addresses are placeholders. Email comparison is case-insensitive. Do not collapse dots or plus-address suffixes. One email belongs to one account; duplicate/conflicting mappings are rejected. With no user ID, repeating the call for the same email updates that account instead of creating another. Prepopulation sets the supplied name/role/phone, so provide values you intend to retain. Newly inserted demo accounts have `fictional=true` to exclude them from live SMS outreach.

After preparing accounts, turn seeding off while retaining the client ID:

```powershell
Remove-Item Env:ENABLE_DEV_SEED
spacetime publish YOUR-DATABASE --server maincloud --no-config --env-only --unset-env ENABLE_DEV_SEED
Remove-Item Env:SPACETIMEAUTH_CLIENT_ID
```

Removing the shell variable does not erase the published client ID. Keep it configured on Maincloud for future deployments. The regular disaster seed intentionally does not grant login to invented inboxes.

## Frontend integration contract

Your teammate handles the hosted magic-link flow, callback, OIDC state/PKCE, token refresh and logout. After OIDC completes, use the **ID token**, not an access token, an email from a form, or an old anonymous SpacetimeDB token:

```typescript
import { connectExistingAccount } from "./path/to/backend/client/login";

const session = connectExistingAccount({
  uri: "https://maincloud.spacetimedb.com",
  database: "YOUR-DATABASE",
  idToken: oidcUser.id_token,
  onDisconnect: () => { /* return to a disconnected/login state */ },
});

try {
  const connection = await session.ready;
  const account = [...connection.db.myProfile.iter()][0];
  // Open the app using account.role. Backend permissions remain authoritative.
} catch (error) {
  // For an unknown verified email, show exactly:
  // "No account found for this email."
  // Other failures (configuration/network/unverified token) have different errors.
  // Display a safe error message; never print the ID token.
}

// On logout, token replacement, or component cleanup:
session.dispose();
```

The helper calls `loginExistingUser({})` before subscribing to private views and resolves `ready` only when the profile snapshot is available. It does not persist or refresh tokens. On refresh/reconnect, dispose the old connection and construct a new one with the current ID token. Logging out must close the database connection and end/clear the OIDC session; hiding the UI alone does not close a session. Existing `connectDashboard` remains available for trusted integrations, but human frontend code should use `connectExistingAccount`.

## Testing

From `backend`: `npm run typecheck`, `npm run lint`, `npm test`.

`npm run test:auth` uses the official SpacetimeDB datastore test harness to test claims, unknown accounts, no signup, duplicate/rebound identities, stored roles, demotion, private views, AI intake and allocation rollback. It supplies claims to the harness; it does not fake token acceptance in the deployed module or test Maincloud's signature verification. `npm run test:local` publishes a disposable local database and checks denied anonymous connections, disabled signup, private-table access, trusted SMS writes and live service revocation. The older `integration.mjs`, `intake.mjs`, and `outreach.mjs` scenarios assumed open anonymous registration; the default runner now uses the auth-aware tests instead. No production auth bypass is enabled for tests.

Manual end-to-end checks after configuring Maincloud:

1. Prepopulate a resident inbox; sign in via its magic link. `myProfile.id` must match the existing row and user count must not increase. Confirm their existing requests are visible.
2. Sign out and sign in again; the same identity/account ID should be used. Test a second browser/device with the same SpacetimeAuth account.
3. Use a verified inbox absent from `user`: show **No account found for this email.** Confirm no row was inserted and resident/responder writes fail.
4. Prepopulate a responder inbox: confirm responder operations work. A resident must be denied the same operations even if the frontend shows the button.
5. Verify an existing AI/SMS service still connects with its explicitly granted service identity. Do not give it the admin token.

Actual email delivery and browser/mobile callbacks require your SpacetimeAuth configuration and a real inbox. They cannot be verified by the local datastore tests.
