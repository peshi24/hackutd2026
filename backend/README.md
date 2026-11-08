# Disaster response backend

SpacetimeDB CLI **2.14.1**, server/client SDK **2.14.0** (pinned and locked). Implementation, generated client bindings and tests are entirely in `backend/`; the Expo frontend is unchanged.

## Updated demo data

Fresh `seed_development` calls now also populate 10 locations, 10 SMS preferences, 10 intake sessions linked to the demo requests, 20 intake messages, 10 request reviews, one broadcast, and 10 completed delivery records. Follow-up timers are created for active requests and disappear after execution. Names and descriptions no longer contain "simulated"; internal `fictional`/`simulated` flags still identify demo records. No SMS is sent. The delivery history uses placeholder provider IDs and example phone numbers, and belongs to the database identity, not a real sending service.

For an **already seeded** database, publish this module and call `seed_updated_development`. It adds the new fixtures without resetting data, preserves existing location/preferences/review records, and cleans the old seed's label prefixes. Repeating it does not duplicate fixtures or refresh their timestamps. Ordinary non-demo records are untouched.

PowerShell, from `backend` (use your original publishing/admin identity):

```powershell
$env:ENABLE_DEV_SEED = 'true'
spacetime publish YOUR-DATABASE-NAME --server maincloud --module-path spacetimedb --no-config --delete-data=never
spacetime call YOUR-DATABASE-NAME seed_updated_development --server maincloud --no-config
Remove-Item Env:ENABLE_DEV_SEED
spacetime publish YOUR-DATABASE-NAME --server maincloud --no-config --env-only --unset-env ENABLE_DEV_SEED
```

Check that the publish succeeded before calling the seed. On a brand-new database, call `seed_development` instead. `npm run dev` automatically fills the additional demo tables in its local database. Fictional residents remain excluded from live broadcast targeting; these fixtures demonstrate dashboard history, not external delivery.

## Resident locations and disaster outreach

Four additional **private** tables store `user_location`, `outreach_preference`, `broadcast`, and `broadcast_delivery`. Existing tables/records are unchanged. No existing user is automatically assigned a location or opted into SMS. The backend stores locations; the mobile UI must obtain permission or a manually entered location before calling it. No mobile location dependency is added.

After connecting and subscribing using `client/connect.ts`:

```typescript
await connection.reducers.updateMyLocation({
  latitude: 32.9483, longitude: -96.7299, source: "app", // or "manual"
});
await connection.reducers.setMySmsOptIn({ smsOptIn: true });
// Opt out / remove last-known location:
// await connection.reducers.setMySmsOptIn({ smsOptIn: false });
// await connection.reducers.clearMyLocation();
```

Residents can change only their own record. `visibleUserLocations` exposes their own location to residents, and all locations to responders/admin. Services do not get a global location list. `myOutreachPreference` returns only the caller's preference. For SMS-only residents, the owning integration can call `updateIntakeLocation({sessionId, latitude, longitude})` and `setIntakeSmsOptIn({sessionId, smsOptIn})` to record information explicitly supplied by that resident. The service must process opt-out messages and must not infer consent from receiving an arbitrary message.

A responder/admin queues outreach using the disaster's center and a circular radius:

```typescript
await connection.reducers.queueBroadcast({
  externalId: "richardson-outreach-001", // retain this key for retries
  disasterId: 1n,
  radiusKm: 5,
  maxLocationAgeHours: 24,
  content: "Disaster response team: do you need assistance?",
  serviceIdentity, // SDK Identity of a service already granted the ai role
});
```

This transaction selects residents with a location inside the radius, an explicit SMS opt-in, an international-format phone number (`+` and 8-15 digits), and a location no older than the supplied age. Fictional users are excluded. Radius is 1-500 km; maximum age is 1-168 hours. Distance uses the haversine formula. Age is measured from when the server received the location; clients should submit fresh observations. This is a last-known location, not guaranteed live GPS or an official hazard boundary.

The recipient list is a snapshot at queue time. There is one delivery per broadcast/user; repeating the same external key under the same responder identity does not enqueue again, and conflicting arguments are rejected. A new key intentionally creates a new broadcast. Multiple user records sharing one phone number are not deduplicated across users. Scanning locations is intended for MVP scale.

Responders/admin see `visibleBroadcasts` and `visibleBroadcastDeliveries`; the designated currently authorized AI service sees only its assigned broadcasts/deliveries. Delivery rows contain phone numbers and are not visible to residents or other services. To find the newly queued broadcast, use its ID: `JSON.stringify([responderIdentity.toHexString(), externalId])`, then filter delivery rows by `broadcastId`.

### Sending service contract

No SMS is sent by these reducers. Your trusted service subscribes to the broadcast views and:

1. Calls `claimBroadcastDelivery({deliveryId})` for a queued row. Only one concurrent claim succeeds. After a successful call, read the updated row: it may be `skipped` if the location is now stale/outside the area, the resident opted out, the phone changed, or the disaster is inactive. Never send a skipped row. A `sending` row includes an intake `sessionId` owned by the service and an incremented `attempt`.
2. Sends the parent broadcast's content to the row's phone through the provider. Use `delivery.id` as the provider idempotency key (or a stable hash if its API has length restrictions). A resumed worker must reconcile an existing `sending` row with the provider rather than blindly send it again. Opt-out after claiming cannot recall an external send; process provider opt-outs too.
3. Calls `finishBroadcastDelivery({deliveryId, attempt, providerMessageId, error: undefined})` once the provider accepts the message. This atomically marks it `sent` and stores exactly one outbound intake message. Here `sent` means provider accepted, not confirmed handset delivery. Do not separately call `saveIntakeMessage` for that same outgoing message.
4. On a **definite rejection**, calls `finishBroadcastDelivery({deliveryId, attempt, providerMessageId: undefined, error: "reason"})`. A responder can call `retryBroadcastDelivery({deliveryId})` on a failed row to queue it again. The next claim rechecks eligibility. Stale attempt numbers are rejected. Timeouts with unknown provider outcomes must remain `sending` until reconciled; there is no automatic lease expiry or unsafe retry of unknown sends.
5. Records replies through `saveIntakeMessage` using the delivery's session ID, then continues the existing intake workflow. Persist the provider/thread-to-session mapping in the SMS integration; the database cannot infer it from an incoming webhook.

All workers using the same service identity must coordinate ownership of successful claims; a subscription showing `sending` alone is not permission for every worker to send. Database claims prevent concurrent queue acquisition, but exactly-once external SMS requires provider idempotency/reconciliation.

### Publish and test this update

From `backend`, run `npm run typecheck`, `npm run lint`, and `npm test`. Tests use a disposable local database and never send SMS. The outreach suite covers private tables, scoped views, radius filtering, missing locations, invalid phones, opt-in, duplicate broadcasts, concurrent claims, failed-delivery retries, stale attempts, intake logging, opt-out rechecks, and access revocation.

Publish to your existing database without deleting data:

```bash
spacetime publish YOUR-PUBLISHED-DATABASE --server maincloud --module-path spacetimedb --no-config --delete-data=never
```

No reseed or location backfill is needed. Keep the existing request-review initialization instructions below if upgrading from a version before request reviews. Distribute the regenerated `client/module_bindings` and updated `client/connect.ts` to frontend/service teammates. This change does not deploy an SMS worker or a location-entry screen.

## AI intake and request review update

The original nine tables and their columns/IDs are preserved. Four new private tables add the requested workflow:

| Table | Purpose |
| --- | --- |
| `intake_session` | Conversation before a request exists; contains resident `userId`, owning service identity, optional `requestId` |
| `intake_message` | Resident/AI/responder messages, channel, timestamp, and deduplicated provider event key |
| `request_review` | Optional assessed urgency and assessor/time, acknowledgement actor/time, follow-up deadline/flag |
| `follow_up_timer` | Server-managed one-shot scheduled checks for unacknowledged requests |

Existing `message` rows retain their original request-based `conversationId` meaning. `saveMessage` remains available for that legacy human-to-human path. Use **`startIntake` → `saveIntakeMessage` → `completeIntake`** for Photon/AI outreach. New intake messages are read through `visibleIntakeMessages`, not `myMessages`. No historical messages are moved or reinterpreted.

The publishing administrator grants the service identity the **`ai`** role through `set_access`. This grants intake-integration capabilities plus permission to send as AI and assess its own intake requests. Plain `integration` identities cannot send as AI or assess urgency. Responders/admin can assess any active request and acknowledge it. The `ai` credential belongs only in the trusted service, never the mobile app. The service must still verify provider webhooks; this backend stores messages but does not call the AI/SMS provider itself.

1. The service calls `startIntake({ externalId, userId, name, phone })`. Use a stable thread key. Supply an existing `userId`, or `undefined` to create an SMS-only resident. Subscribe to `visibleIntakeSessions` to receive the resulting `id` and `userId`. Repeating the same key under the same caller identity reuses the session without creating another resident. Different thread keys can still create different resident records; automatic phone/account merging is not implemented.
2. Call `saveIntakeMessage({ sessionId, externalId, senderKind, recipientKind, channel, content })`. `senderKind` is `resident`, `ai`, or `responder`; AI/responders address `resident`, and residents address `ai` or `responder`. Use a provider event ID (or stable app-generated operation ID) as `externalId`. Same caller/session/key/payload is a no-op; conflicting payloads are rejected. The service can record inbound SMS as the resident. A resident app can send only as itself. A responder must have a registered profile. Messages can precede the request.
3. Call `completeIntake({ sessionId, disasterId, needs, latitude, longitude, reportedUrgent })`. It atomically creates a request and links it to the session; retries reuse that link. Read `requestId` from the session subscription. This is a one-time completion, not an update API.
4. The owning AI identity or a responder calls `assessRequestUrgency({ requestId, urgent })`. Read the result from `visibleRequestReviews`.

Sessions/messages are visible to the resident, responders/admin, and the currently authorized owning integration. Another integration cannot read or mutate them. Photon should create the session under the service identity, including when linking an existing app resident. Resident-created sessions are not automatically assigned to an AI service. Sender and recipient kinds describe routing within the session; all authorized session viewers can read its messages.

**Urgency:** the original `assistance_request.urgent` remains a **reported** flag for backward compatibility. It never becomes a trusted assessment automatically. `request_review.assessedUrgent === undefined` means **unassessed**; `false` means assessed non-urgent. Missing review metadata on a legacy row also means unassessed. The dashboard must show reported urgency separately and use review metadata for assessed priority.

**Acknowledgement:** `acknowledgeRequest({ requestId })` records the first human responder/admin acknowledgement and clears `followUpRequired`. Assignment or AI assessment is not acknowledgement. New requests receive a one-shot deadline, normally 30 minutes after creation. Set database environment `FOLLOW_UP_SECONDS` to an integer 1–604800 to change deadlines for subsequently initialized reviews. The scheduled reducer flags active, still-unacknowledged requests; it cannot be invoked by ordinary clients. Resolved/cancelled requests do not produce alerts. This flags dashboard rows; it does not send push/SMS notifications.

**Matching:** subscribe to the authorized parameterized view, for example:

```typescript
const matches = connection.subscriptionBuilder().subscribe(
  "SELECT * FROM find_matching_resources(1, 'water', 20, 25)"
);
// Args: request ID, resource kind, units required, maximum distance in km (1–500).
// Read connection.db.findMatchingResources.iter(), then sort by distanceKm for rendering.
// Unsubscribe the old query when changing filters; query results share one cache.
// matches.unsubscribe();
```

Matching returns up to 20 nearest available resources with sufficient unreserved capacity. Each row contains `resource` and `distanceKm`. Access is limited to responders/admin or the request's owning AI service. Distance is straight-line, not a routing/road-access estimate. Pass a structured kind/quantity derived from the UI or AI; free-text needs are not automatically parsed. Subscription/cache row order is not guaranteed, so sort the returned rows on the client. Recommendations do not reserve stock; `assignResource` still checks capacity atomically. Use allowlisted kinds and validated numeric arguments when constructing SQL.

**Consumables:** resolving a request now subtracts fulfilled food/water quantities from total capacity while releasing their reservation. Cancellation and explicit release restore reserved availability without consuming stock. Other resource kinds release reservations as before. Previously resolved allocations are not retroactively deducted.

### Updating your already-published database

No Maincloud deployment is performed by these code changes. The migration was rehearsed against a populated local database using the previous schema: all nine original table snapshots remained identical after publishing and repeated metadata initialization.

From `backend/`, using the same administrator identity that originally published the module:

```powershell
spacetime publish YOUR-PUBLISHED-DATABASE --server maincloud --module-path spacetimedb --no-config --delete-data=never
spacetime call YOUR-PUBLISHED-DATABASE initialize_request_reviews --server maincloud --no-config
```

The first command only adds tables/views/reducers and updates logic; it does not delete the existing residents, requests, messages, resources or assignments. Review the migration plan; if it proposes unexpected changes, stop. The second command creates missing request-review metadata and timers without rewriting existing requests; it is safe to repeat. Existing reported urgency is preserved, assessed urgency starts unassessed, and acknowledgement starts empty. Old active requests whose creation time is already past the deadline will be flagged promptly. No prior acknowledgement can be inferred from the old data. New requests initialize metadata automatically.

Existing access grants and admin identity remain unchanged. Grant the service `ai` access explicitly (this replaces its previous single role):

```powershell
spacetime call YOUR-PUBLISHED-DATABASE set_access '"SERVICE_IDENTITY_HEX"' '"ai"' --server maincloud --no-config
```

Do not reseed or use a delete-data flag that allows deletion. Commit/share the regenerated bindings and updated `client/connect.ts`; old APIs remain, but frontend teammates need the new bindings/views for these features. Data preservation was tested against this repository's prior schema, not inspected against your live database. See the official [automatic migration rules](https://spacetimedb.com/docs/databases/automatic-migrations/).

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

The seed requires administrator authorization and database environment `ENABLE_DEV_SEED=true`. It is disabled by default, atomic, and rejects repeat calls. It creates one Richardson tornado, ten fictional residents without login identities or phone numbers, ten requests, five fictional organizations and twenty resources (four each of hotel, trailer, vehicle, food and water), plus the updated demo tables described above. Coordinates are invented Richardson-area points, not verified pickup addresses. Internal flags identify demo records; display labels use ordinary names. Capacities use beds, seats, meal parcels and liters; shelter is also a supported resource kind.

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
| `set_access` | Admin grants responder/integration/ai/none |
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

Allocation checks, capacity update, assignment insertion and request update commit in one transaction; failures roll back. Concurrent assignments cannot overbook. Remaining capacity is `capacity - allocated`. Disabling availability blocks new reservations without cancelling existing ones. Resolving/cancelling requests atomically closes active assignments; resolution also deducts fulfilled food/water from capacity. Terminal requests cannot reopen.

For the legacy `saveMessage` API, `conversationId` is the assistance request ID. Messages must connect that resident and an authorized responder/admin profile. App clients cannot spoof senders or write SMS. The legacy adapter requires resident/request IDs from an operator. Prefer the new intake API above: the owning service discovers IDs through its scoped session subscription and handles pre-request AI messaging. This module stores messages; it does not deliver SMS. A trusted adapter must verify provider webhook signatures and handle delivery. Integration-created residents are not automatically linked to later app accounts.

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
