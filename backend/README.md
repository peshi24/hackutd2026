# Disaster response backend

SpacetimeDB CLI **2.14.1**, server/client SDK **2.14.0** (pinned and locked). Implementation, generated client bindings and tests are entirely in `backend/`; the Expo frontend is unchanged.

## Install and verify

For everyday development, from `backend/`, just run **`npm run dev`**. It starts (or reuses) the local server, publishes `hackutd-disaster-dev`, seeds fictional demo data once, generates bindings, and watches for backend changes. Restarting preserves your data. Press Ctrl+C to stop; a server already running before the command is left running.

Run **`npm test`** for the full integration suite. It starts/reuses the server and publishes a fresh test database automatically. Test data is separate from the development database. No environment variables or manual publish commands are needed. Both commands target loopback port 3107 only and prohibit data deletion.

Install dependencies once after cloning with `npm ci` and `npm ci --prefix spacetimedb`; repeat only when dependency lockfiles change. The commands below are individual checks and manual alternatives, not steps required every time you run the backend.

Install the CLI from https://spacetimedb.com/install. On this machine: `C:\Users\kabir\AppData\Local\SpacetimeDB\spacetime.exe`. Reopen your terminal to refresh PATH or invoke that path with PowerShell's `&` operator. Use Node 22+.

From `backend/`:

```powershell
npm ci
npm ci --prefix spacetimedb
npm run typecheck
npm run lint
npm run build
npm run generate
```

`lint` checks formatting with Prettier; the CLI build also runs its built-in source lint. Both the module and client example use strict TypeScript checks. Regenerate and commit `client/module_bindings/` after schema/reducer changes; never hand edit bindings.

## Local server, publish and seed

From `backend/`, in a dedicated terminal:

```powershell
spacetime start --listen-addr 127.0.0.1:3107 --data-dir .spacetime --non-interactive
```

In another terminal, from `backend/`:

```powershell
$env:ENABLE_DEV_SEED = 'true'
spacetime publish hackutd-disaster-dev --server http://127.0.0.1:3107 --module-path spacetimedb --no-config --delete-data=never --yes=skip-login
spacetime call hackutd-disaster-dev seed_development --server http://127.0.0.1:3107 --no-config
Remove-Item Env:ENABLE_DEV_SEED
```

Without a saved credential, publishing creates a local development identity, not a Maincloud account login. The publishing identity becomes the application administrator in `init`; keep its credential. Never reset a teammate's database. Choose a new name if incompatible schema changes block publishing.

The seed requires administrator authorization and database environment `ENABLE_DEV_SEED=true`. It is disabled by default, atomic, and rejects repeat calls. It creates exactly one simulated Richardson tornado, ten fictional residents without login identities or phone numbers, ten requests, five fictional organizations and twenty resources (four each of hotel, trailer, vehicle, food and water). Coordinates are invented Richardson-area points, not verified pickup addresses. Labels explicitly identify simulations. Capacities use beds, seats, meal parcels and liters; shelter is also a supported resource kind.

Removing a shell variable does not remove the database's stored setting. Disable it explicitly when finished:

```powershell
spacetime publish hackutd-disaster-dev --server http://127.0.0.1:3107 --no-config --env-only --unset-env ENABLE_DEV_SEED --yes=skip-login
```

## Authorization and subscriptions

| Data | Client access |
| --- | --- |
| `user` | Private; `my_profile` returns self, `visible_users` returns profiles only to responders/admin |
| `assistance_request` | Private; `visible_requests` returns own requests to residents, all to responders/admin |
| `message` | Private; `my_messages` returns only messages sent/received by the caller's profile |
| `resource` | Private; `visible_resources` is responder/admin only |
| `resource_assignment` | Private; `visible_assignments` returns own-request assignments, all to responders/admin |
| `disaster`, `organization` | Public event/provider information; no resident contacts |
| `access`, `settings` | Private administrative state, no public views |

Database owners retain administrative access to private data. Views track access rows: revocation removes dashboard data from live subscriptions. All responders have platform-wide access in this MVP; there is no organization tenancy boundary. Integrations have no responder read permission. Do not put personal details in public event/provider descriptions.

`registerUser` derives identity from the connection; it cannot grant privileges. Obtain an operator's identity with `identity.toHexString()`, verify it, then use the publishing administrator's CLI credential to approve it (replace placeholders):

```powershell
spacetime call hackutd-disaster-dev set_access '"IDENTITY_HEX"' '"responder"' --server http://127.0.0.1:3107 --no-config
spacetime call hackutd-disaster-dev set_access '"INTEGRATION_IDENTITY_HEX"' '"integration"' --server http://127.0.0.1:3107 --no-config
# Revoke by setting role "none".
```

Never put administrator/integration credentials in the mobile app, EXPO_PUBLIC variables, source control or logs. Only grant responder access to verified operator identities.

| Reducer | Caller / behavior |
| --- | --- |
| `register_user` | Caller registers own profile with optional private phone |
| `set_access` | Admin grants responder/integration/none |
| `create_disaster`, `create_organization` | Responder/admin creates event/provider |
| `create_assistance_request` | Caller creates own request (`userId: undefined`); integration may supply existing resident ID |
| `update_request_status` | Responder/admin; open → in_progress/cancelled; in_progress → resolved/cancelled |
| `save_message` | App sender derives from caller; SMS requires integration and explicit sender ID |
| `create_resource` | Responder/admin; validates provider, coordinates, kind, positive capacity |
| `assign_resource` | Responder/admin; checks open request, capacity, positive quantity, no duplicate active pair |
| `update_resource_availability` | Responder/admin; capacity must cover active allocations |
| `release_assignment` | Responder/admin releases a reservation once |
| `register_integration_resident` | Integration creates identity-less SMS resident |
| `seed_development` | Administrator plus explicit development environment gate |

Allocation checks, capacity update, assignment insertion and request update commit in one transaction; failures roll back. Concurrent assignments cannot overbook. Remaining capacity is `capacity - allocated`. Disabling availability blocks new reservations without cancelling existing ones. Resolving/cancelling requests atomically releases active assignments. Food/water quantities are reservations, not a consumption ledger: reduce capacity after distribution. Terminal requests cannot reopen.

`conversationId` is the assistance request ID. Messages must connect that resident and an authorized responder/admin profile. App clients cannot spoof senders or write SMS. This module stores messages; it does not deliver SMS. A trusted adapter must verify provider webhook signatures and handle delivery. An operator supplies the adapter with resident/request IDs located through the dashboard; reducers do not return inserted IDs. Integration-created residents are not automatically linked to later app accounts.

## Frontend integration

`client/connect.ts` is a typechecked framework-neutral helper using generated bindings, subscriptions and automatic reconnect. Supply secure token storage through its callback. `onReady` runs after initial replay and after reconnection replay. Register row handlers once, unsubscribe/disconnect on teardown, and treat cached data as stale while offline. Handle reducer failures and do not automatically retry mutations whose outcome is unknown after disconnect.

Frontend teammate setup, from `frontend/`:

```powershell
npx expo install spacetimedb@2.14.0
```

Copy `backend/client/module_bindings/` and `backend/client/connect.ts` together to a non-route directory such as `frontend/src/lib/spacetime/`, or configure a shared package. This implementation did not modify frontend files or dependencies. The app uses Expo SDK 58: https://docs.expo.dev/versions/v58.0.0/.

```typescript
const dashboard = connectDashboard({
  uri: 'http://127.0.0.1:3107', database: 'hackutd-disaster-dev',
  token: previouslyLoadedToken,
  saveToken: token => { /* persist using app secure storage */ },
  onReady: connection => {
    const requests = [...connection.db.visibleRequests.iter()];
    // Update app state; unapproved identities see only their own requests.
  },
  onError: error => { /* display connection/subscription error */ },
});
// Once connected; register a profile only once:
await dashboard.connection.reducers.registerUser({ name: 'Demo operator', phone: undefined });
// Once approved by admin, from a user action:
await dashboard.connection.reducers.assignResource({ requestId, resourceId, quantity: 2 });
// On teardown: dashboard.dispose();
```

The frontend supplies the snippet's storage, state and IDs. Read current rows with `.iter()` and observe changes with `.onInsert`, `.onUpdate`, `.onDelete`. Alternatively use SDK `SpacetimeDBProvider` and `useTable` from `spacetimedb/react`, letting the hooks own subscriptions instead of the manual helper.

Transport was verified with Node 22, not an Expo device. Test the SDK on the actual native target. A physical phone's `127.0.0.1` is the phone itself: use a reachable development host or Maincloud over TLS. Do not expose this isolated loopback test server as-is.

## Local integration tests

With the server running, use a **fresh database name** each run. Tests refuse non-loopback servers and leave fictional test data in place; they do not delete/reset databases.

```powershell
$env:SPACETIME_TEST_DATABASE = 'hackutd-test-' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$env:SPACETIME_TEST_URI = 'http://127.0.0.1:3107'
$env:ENABLE_DEV_SEED = 'true'
spacetime publish $env:SPACETIME_TEST_DATABASE --server $env:SPACETIME_TEST_URI --module-path spacetimedb --no-config --delete-data=never --yes=skip-login
Remove-Item Env:ENABLE_DEV_SEED
# If needed, set SPACETIME_CLI to the full CLI executable path.
npm run test:local
```

Verified on the real 2.14.1 server: seed counts/reseed rejection, private-table denial, resident isolation, responder authorization, privilege escalation denial, two concurrent allocations with one success, overbooking/capacity rollback, release, app messaging, rejected SMS impersonation, trusted integration writes and live revocation.

## Maincloud and HACKUTD2026 credits

1. Open the official https://spacetimedb.com/redeem page in your browser. It requires login. Enter **HACKUTD2026**, redeem, then confirm the credited balance and expiry before deploying. Code amount/eligibility/expiry were not verified; ask the HackUTD Spacetime sponsor if redemption fails. Account energy page: https://spacetimedb.com/settings/buy-energy.
2. Run `spacetime login` yourself when ready, or explicitly authorize an agent login. No Maincloud login or publication was performed here.
3. From `backend/`, publish under a unique name with seeding disabled:

```powershell
$env:ENABLE_DEV_SEED = 'false'
spacetime publish YOUR-UNIQUE-DATABASE --server maincloud --module-path spacetimedb --no-config --delete-data=never
Remove-Item Env:ENABLE_DEV_SEED
```

4. Connect clients with `https://maincloud.spacetimedb.com` and that database name. Register and approve verified responders using `set_access` as the publishing administrator (`--server maincloud`). Create real events/providers/resources through authorized reducers. Do not seed simulations into a live-response deployment.
5. Regenerate bindings for changes and typecheck the frontend. Review incompatible migrations instead of adding destructive flags. Global server defaults need not change; always specify the deployment target.

## Agent setup status

**SpacetimeDB Agent Setup: Partial**

- Agents: Codex detected; Claude Code/Cursor not detected.
- CLI: 2.14.1 installed; MCP command available.
- Guidance: official `spacetimedb@spacetimedb-plugins` 0.1.0 installed/enabled from clockworklabs/SpacetimeDB at `C:/Users/kabir/.codex/plugins/cache/spacetimedb-plugins/spacetimedb/0.1.0`. Server/client/concepts/CLI skills read.
- MCP: plugin declares `spacetime mcp`; tools are not active in this session, so connectivity/ping is unverified. Restart/reload Codex and ensure the CLI is on PATH. Global CLI default remains Maincloud; do not run mutating MCP tools against it without authorization.
- Project: SDK 2.14.0, generated bindings CLI 2.14.1; existing instructions read.
- Changes: CLI/plugin installation and new backend files; local development credential and test databases. No account login, Maincloud publication, existing database deletion or reset.
- Remaining: Codex reload/MCP verification, optional Maincloud login/code redemption, native-device frontend validation.

Official setup: https://spacetimedb.com/agent-setup.md. Exact API usage follows installed SDK types and generated bindings.
