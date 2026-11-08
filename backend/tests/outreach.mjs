import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
const { DbConnection, tables } = createRequire(import.meta.url)(
  "../.test-client/module_bindings/index.js",
);
const uri = process.env.SPACETIME_TEST_URI ?? "http://127.0.0.1:3107";
const database = process.env.SPACETIME_TEST_DATABASE;
if (!database || !["127.0.0.1", "localhost"].includes(new URL(uri).hostname))
  throw new Error("Local test database required");
const clients = [];
function grant(identity, role) {
  const result = spawnSync(
    process.env.SPACETIME_CLI ?? "spacetime",
    [
      "call",
      database,
      "set_access",
      JSON.stringify(identity.toHexString()),
      JSON.stringify(role),
      "--server",
      uri,
      "--no-config",
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
}
function connect() {
  return new Promise((resolve, reject) => {
    const c = DbConnection.builder()
      .withUri(uri)
      .withDatabaseName(database)
      .onConnect((conn, identity) => resolve({ conn, identity }))
      .onConnectError((_ctx, e) => reject(e))
      .build();
    clients.push(c);
  });
}
function subscribe(c, queries) {
  return new Promise((resolve, reject) =>
    c
      .subscriptionBuilder()
      .onApplied(resolve)
      .onError((ctx) => reject(ctx.event))
      .subscribe(queries),
  );
}
async function until(predicate) {
  for (let i = 0; i < 150; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(predicate(), "Expected subscription update");
}
const rows = (c, name) => [...c.conn.db[name].iter()];
try {
  const staff = await connect(),
    service = await connect(),
    other = await connect();
  grant(staff.identity, "responder");
  grant(service.identity, "ai");
  grant(other.identity, "ai");
  const views = [
    tables.disaster,
    tables.myProfile,
    tables.visibleUserLocations,
    tables.myOutreachPreference,
    tables.visibleBroadcasts,
    tables.visibleBroadcastDeliveries,
    tables.visibleIntakeSessions,
    tables.visibleIntakeMessages,
  ];
  for (const c of [staff, service, other]) await subscribe(c.conn, views);
  const residents = [];
  for (let i = 0; i < 5; i++) {
    const c = await connect();
    residents.push(c);
    await c.conn.reducers.registerUser({
      name: `Outreach resident ${i}`,
      phone: i === 4 ? "invalid" : `+1202555010${i}`,
    });
    await subscribe(c.conn, views);
    if (i !== 3)
      await c.conn.reducers.updateMyLocation({
        latitude: i === 1 ? 0 : 32.9483,
        longitude: i === 1 ? 0 : -96.7299,
        source: "app",
      });
    if (i !== 2) await c.conn.reducers.setMySmsOptIn({ smsOptIn: true });
  }
  const resident = residents[0];
  await until(() => rows(resident, "visibleUserLocations").length === 1);
  assert.equal(rows(other, "visibleUserLocations").length, 0);
  for (const name of [
    "user_location",
    "outreach_preference",
    "broadcast",
    "broadcast_delivery",
  ])
    await assert.rejects(subscribe(resident.conn, [`SELECT * FROM ${name}`]));
  await assert.rejects(
    resident.conn.reducers.updateMyLocation({
      latitude: 91,
      longitude: 0,
      source: "app",
    }),
  );
  await staff.conn.reducers.createDisaster({
    name: "Outreach test event",
    kind: "tornado",
    latitude: 32.9483,
    longitude: -96.7299,
    simulated: true,
  });
  await until(() =>
    rows(staff, "disaster").some((d) => d.name === "Outreach test event"),
  );
  const disasterId = rows(staff, "disaster").find(
    (d) => d.name === "Outreach test event",
  ).id;
  const args = {
    externalId: "outreach-one",
    disasterId,
    radiusKm: 5,
    maxLocationAgeHours: 24,
    content: "TEST: Do you need help?",
    serviceIdentity: service.identity,
  };
  await assert.rejects(resident.conn.reducers.queueBroadcast(args));
  await staff.conn.reducers.queueBroadcast(args);
  await staff.conn.reducers.queueBroadcast(args);
  await assert.rejects(
    staff.conn.reducers.queueBroadcast({
      ...args,
      content: "Conflicting retry",
    }),
  );
  await until(() => rows(service, "visibleBroadcastDeliveries").length === 1);
  assert.equal(rows(resident, "visibleBroadcastDeliveries").length, 0);
  assert.equal(rows(other, "visibleBroadcastDeliveries").length, 0);
  const deliveryId = rows(service, "visibleBroadcastDeliveries")[0].id;
  await assert.rejects(
    other.conn.reducers.claimBroadcastDelivery({ deliveryId }),
  );
  const claims = await Promise.allSettled([
    service.conn.reducers.claimBroadcastDelivery({ deliveryId }),
    service.conn.reducers.claimBroadcastDelivery({ deliveryId }),
  ]);
  assert.equal(claims.filter((r) => r.status === "fulfilled").length, 1);
  await until(
    () => rows(service, "visibleBroadcastDeliveries")[0].status === "sending",
  );
  assert.ok(rows(service, "visibleBroadcastDeliveries")[0].sessionId);
  await service.conn.reducers.finishBroadcastDelivery({
    deliveryId,
    attempt: 1,
    error: "Definite provider rejection",
    providerMessageId: undefined,
  });
  await staff.conn.reducers.retryBroadcastDelivery({ deliveryId });
  await service.conn.reducers.claimBroadcastDelivery({ deliveryId });
  await assert.rejects(
    service.conn.reducers.finishBroadcastDelivery({
      deliveryId,
      attempt: 1,
      providerMessageId: "stale",
      error: undefined,
    }),
  );
  const success = {
    deliveryId,
    attempt: 2,
    providerMessageId: "test-provider-1",
    error: undefined,
  };
  await service.conn.reducers.finishBroadcastDelivery(success);
  await service.conn.reducers.finishBroadcastDelivery(success);
  await assert.rejects(
    staff.conn.reducers.retryBroadcastDelivery({ deliveryId }),
  );
  await until(
    () =>
      rows(resident, "visibleIntakeMessages").filter(
        (m) => m.content === args.content,
      ).length === 1,
  );
  await staff.conn.reducers.queueBroadcast({
    ...args,
    externalId: "outreach-optout",
  });
  await until(() => rows(service, "visibleBroadcastDeliveries").length === 2);
  const queued = rows(service, "visibleBroadcastDeliveries").find(
    (d) => d.status === "queued",
  );
  await resident.conn.reducers.setMySmsOptIn({ smsOptIn: false });
  await service.conn.reducers.claimBroadcastDelivery({ deliveryId: queued.id });
  await until(() =>
    rows(service, "visibleBroadcastDeliveries").some(
      (d) => d.id === queued.id && d.status === "skipped",
    ),
  );
  await resident.conn.reducers.clearMyLocation();
  await until(() => rows(resident, "visibleUserLocations").length === 0);
  const sessionId = rows(service, "visibleBroadcastDeliveries").find(
    (d) => d.id === deliveryId,
  ).sessionId;
  await assert.rejects(
    other.conn.reducers.updateIntakeLocation({
      sessionId,
      latitude: 32,
      longitude: -96,
    }),
  );
  await service.conn.reducers.updateIntakeLocation({
    sessionId,
    latitude: 32.9483,
    longitude: -96.7299,
  });
  await service.conn.reducers.setIntakeSmsOptIn({ sessionId, smsOptIn: true });
  await until(() => rows(resident, "visibleUserLocations").length === 1);
  grant(service.identity, "none");
  await until(() => rows(service, "visibleBroadcastDeliveries").length === 0);
  await assert.rejects(
    service.conn.reducers.claimBroadcastDelivery({ deliveryId }),
  );
  console.log(
    "PASS outreach: private locations, area targeting, opt-in, deduplication, atomic claims, retry attempts, intake logging, opt-out recheck, revocation",
  );
} finally {
  for (const c of clients) c.disconnect();
}
