import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const {
  DbConnection,
  tables,
} = require("../.test-client/module_bindings/index.js");
const uri = process.env.SPACETIME_TEST_URI ?? "http://127.0.0.1:3107";
const database = process.env.SPACETIME_TEST_DATABASE;
if (!database || !["127.0.0.1", "localhost"].includes(new URL(uri).hostname))
  throw new Error(
    "Set SPACETIME_TEST_DATABASE to a fresh local database. Remote tests forbidden.",
  );
function call(name, args = [], success = true) {
  const r = spawnSync(
    process.env.SPACETIME_CLI ?? "spacetime",
    [
      "call",
      "--no-config",
      "--server",
      uri,
      database,
      name,
      ...args.map((x) => JSON.stringify(x)),
    ],
    { encoding: "utf8" },
  );
  if (success && r.status !== 0) throw new Error(r.stderr || r.stdout);
  if (!success) assert.notEqual(r.status, 0);
}
const connections = [];
async function connect() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Connection timeout")),
      15000,
    );
    const c = DbConnection.builder()
      .withUri(uri)
      .withDatabaseName(database)
      .onConnect((conn, identity) => {
        clearTimeout(timer);
        resolve({ conn, identity });
      })
      .onConnectError((_ctx, e) => {
        clearTimeout(timer);
        reject(e);
      })
      .build();
    connections.push(c);
  });
}
async function subscribe(conn, queries) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Subscription timeout")),
      15000,
    );
    conn
      .subscriptionBuilder()
      .onApplied(() => {
        clearTimeout(timer);
        resolve();
      })
      .onError((ctx) => {
        clearTimeout(timer);
        reject(ctx.event);
      })
      .subscribe(queries);
  });
}
async function until(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.ok(predicate(), "Expected live update");
}
try {
  call("seed_development");
  call("seed_development", [], false);
  call("seed_updated_development");
  call("seed_updated_development");
  const resident = await connect();
  await resident.conn.reducers.registerUser({
    name: "Test Resident",
    phone: undefined,
  });
  await subscribe(resident.conn, [
    tables.myProfile,
    tables.visibleRequests,
    tables.visibleResources,
    tables.visibleUsers,
    tables.myMessages,
    tables.visibleUserLocations,
    tables.visibleIntakeSessions,
    tables.visibleIntakeMessages,
    tables.visibleRequestReviews,
    tables.visibleBroadcasts,
    tables.visibleBroadcastDeliveries,
    tables.disaster,
  ]);
  assert.equal(resident.conn.db.visibleRequests.count(), 0n);
  assert.equal(resident.conn.db.visibleUsers.count(), 0n);
  assert.equal(resident.conn.db.visibleResources.count(), 0n);
  await assert.rejects(
    resident.conn.reducers.createOrganization({
      name: "Unauthorized",
      description: "Test",
    }),
  );
  await assert.rejects(subscribe(resident.conn, ["SELECT * FROM user"]));
  const a = await connect();
  const b = await connect();
  call("set_access", [a.identity.toHexString(), "responder"]);
  call("set_access", [b.identity.toHexString(), "responder"]);
  await a.conn.reducers.registerUser({
    name: "Test Responder",
    phone: undefined,
  });
  await subscribe(a.conn, [
    tables.visibleRequests,
    tables.visibleResources,
    tables.visibleAssignments,
    tables.visibleUsers,
    tables.organization,
    tables.disaster,
    tables.myProfile,
    tables.myMessages,
  ]);
  assert.equal(a.conn.db.visibleRequests.count(), 10n);
  assert.equal(a.conn.db.visibleUsers.count(), 12n);
  assert.equal(a.conn.db.visibleResources.count(), 20n);
  assert.equal(a.conn.db.organization.count(), 5n);
  assert.equal(a.conn.db.disaster.count(), 1n);
  await subscribe(a.conn, [
    tables.visibleUserLocations,
    tables.visibleIntakeSessions,
    tables.visibleIntakeMessages,
    tables.visibleRequestReviews,
    tables.visibleBroadcasts,
    tables.visibleBroadcastDeliveries,
  ]);
  assert.equal(a.conn.db.visibleUserLocations.count(), 10n);
  assert.equal(a.conn.db.visibleIntakeSessions.count(), 10n);
  assert.equal(a.conn.db.visibleIntakeMessages.count(), 20n);
  assert.equal(a.conn.db.visibleRequestReviews.count(), 10n);
  assert.equal(a.conn.db.visibleBroadcasts.count(), 1n);
  assert.equal(a.conn.db.visibleBroadcastDeliveries.count(), 10n);
  assert.ok(
    [...a.conn.db.visibleBroadcastDeliveries.iter()].every(
      (d) => d.status === "sent",
    ),
  );
  assert.ok(
    [...a.conn.db.visibleRequests.iter()].every(
      (r) => !r.needs.includes("SIMULATED"),
    ),
  );
  assert.equal([...a.conn.db.disaster.iter()][0].name, "Richardson tornado");
  await assert.rejects(resident.conn.reducers.seedUpdatedDevelopment({}));
  const requests = [...a.conn.db.visibleRequests.iter()];
  const resource = [...a.conn.db.visibleResources.iter()][0];
  const outcomes = await Promise.allSettled([
    a.conn.reducers.assignResource({
      requestId: requests[0].id,
      resourceId: resource.id,
      quantity: resource.capacity,
    }),
    b.conn.reducers.assignResource({
      requestId: requests[1].id,
      resourceId: resource.id,
      quantity: resource.capacity,
    }),
  ]);
  assert.equal(outcomes.filter((o) => o.status === "fulfilled").length, 1);
  await until(
    () =>
      [...a.conn.db.visibleResources.iter()].find((r) => r.id === resource.id)
        ?.allocated === resource.capacity,
  );
  assert.equal(a.conn.db.visibleAssignments.count(), 1n);
  const assignment = [...a.conn.db.visibleAssignments.iter()][0];
  await assert.rejects(
    a.conn.reducers.updateResourceAvailability({
      resourceId: resource.id,
      capacity: resource.capacity - 1,
      available: true,
    }),
  );
  await assert.rejects(
    a.conn.reducers.assignResource({
      requestId: assignment.requestId,
      resourceId: resource.id,
      quantity: 1,
    }),
  );
  assert.equal(a.conn.db.visibleAssignments.count(), 1n);
  await a.conn.reducers.updateRequestStatus({
    requestId: assignment.requestId,
    status: "resolved",
  });
  await until(
    () =>
      [...a.conn.db.visibleResources.iter()].find((r) => r.id === resource.id)
        ?.allocated === 0,
  );
  assert.equal([...a.conn.db.visibleAssignments.iter()][0].active, false);
  const disaster = [...resident.conn.db.disaster.iter()][0];
  await resident.conn.reducers.createAssistanceRequest({
    userId: undefined,
    disasterId: disaster.id,
    needs: "Test water request",
    latitude: 32.95,
    longitude: -96.73,
    urgencyScore: 5,
  });
  await until(() => resident.conn.db.visibleRequests.count() === 1n);
  const ownRequest = [...resident.conn.db.visibleRequests.iter()][0];
  const responderId = [...a.conn.db.myProfile.iter()][0].id;
  await resident.conn.reducers.saveMessage({
    conversationId: ownRequest.id,
    recipientId: responderId,
    senderId: undefined,
    channel: "app",
    content: "Test message",
  });
  await until(() => a.conn.db.myMessages.count() === 1n);
  await assert.rejects(
    resident.conn.reducers.saveMessage({
      conversationId: ownRequest.id,
      recipientId: responderId,
      senderId: ownRequest.userId,
      channel: "sms",
      content: "Spoofed SMS",
    }),
  );
  await assert.rejects(
    resident.conn.reducers.setAccess({
      identity: resident.identity,
      role: "responder",
    }),
  );
  call("set_access", [b.identity.toHexString(), "integration"]);
  await b.conn.reducers.registerIntegrationResident({
    name: "Test SMS Resident",
    phone: "+1-202-555-0100",
  });
  await until(() => a.conn.db.visibleUsers.count() === 13n);
  const smsUser = [...a.conn.db.visibleUsers.iter()].find(
    (u) => u.name === "Test SMS Resident",
  );
  await b.conn.reducers.createAssistanceRequest({
    userId: smsUser.id,
    disasterId: disaster.id,
    needs: "SMS water request",
    latitude: 32.95,
    longitude: -96.73,
    urgencyScore: 2,
  });
  await until(() => a.conn.db.visibleRequests.count() === 12n);
  const smsRequest = [...a.conn.db.visibleRequests.iter()].find(
    (r) => r.userId === smsUser.id,
  );
  await b.conn.reducers.saveMessage({
    conversationId: smsRequest.id,
    recipientId: responderId,
    senderId: smsUser.id,
    channel: "sms",
    content: "Inbound test SMS",
  });
  await until(() => a.conn.db.myMessages.count() === 2n);
  call("set_access", [a.identity.toHexString(), "none"]);
  await until(
    () =>
      a.conn.db.visibleResources.count() === 0n &&
      a.conn.db.visibleUsers.count() === 0n,
  );
  await assert.rejects(
    a.conn.reducers.assignResource({
      requestId: requests[1].id,
      resourceId: resource.id,
      quantity: 1,
    }),
  );
  console.log(
    "PASS: seed counts/idempotency, privacy, authorization/revocation, concurrent allocation, rollback, release, resident isolation, messages and trusted SMS.",
  );
} finally {
  for (const c of connections) c.disconnect();
}
