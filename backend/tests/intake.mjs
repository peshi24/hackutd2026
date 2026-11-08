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
  const r = spawnSync(
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
  assert.equal(r.status, 0, r.stderr);
}
async function connect() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Connect timeout")),
      10000,
    );
    const c = DbConnection.builder()
      .withUri(uri)
      .withDatabaseName(database)
      .onConnect((conn, identity) => {
        clearTimeout(timeout);
        resolve({ conn, identity });
      })
      .onConnectError((_ctx, error) => {
        clearTimeout(timeout);
        reject(error);
      })
      .build();
    clients.push(c);
  });
}
async function subscribe(c, queries) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Subscription timeout")),
      10000,
    );
    c.subscriptionBuilder()
      .onApplied(() => {
        clearTimeout(timeout);
        resolve();
      })
      .onError((ctx) => {
        clearTimeout(timeout);
        reject(ctx.event);
      })
      .subscribe(queries);
  });
}
async function until(predicate) {
  for (let i = 0; i < 160; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(predicate(), "Expected live update or scheduled follow-up");
}
try {
  const ai = await connect(),
    otherAi = await connect(),
    resident = await connect(),
    responder = await connect();
  grant(ai.identity, "ai");
  grant(otherAi.identity, "ai");
  grant(responder.identity, "responder");
  await resident.conn.reducers.registerUser({
    name: "Intake test resident",
    phone: undefined,
  });
  await responder.conn.reducers.registerUser({
    name: "Intake test responder",
    phone: undefined,
  });
  const views = [
    tables.disaster,
    tables.visibleIntakeSessions,
    tables.visibleIntakeMessages,
    tables.visibleRequestReviews,
  ];
  await subscribe(ai.conn, views);
  await subscribe(otherAi.conn, views);
  await subscribe(resident.conn, [
    ...views,
    tables.myProfile,
    tables.visibleRequests,
  ]);
  await subscribe(responder.conn, [
    ...views,
    tables.visibleResources,
    tables.visibleUsers,
  ]);
  for (const table of [
    "intake_session",
    "intake_message",
    "request_review",
    "follow_up_timer",
  ]) {
    await assert.rejects(subscribe(resident.conn, [`SELECT * FROM ${table}`]));
  }
  const userId = [...resident.conn.db.myProfile.iter()][0].id;
  const input = {
    externalId: "outreach-1",
    userId,
    name: "unused",
    phone: undefined,
  };
  await ai.conn.reducers.startIntake(input);
  await ai.conn.reducers.startIntake(input);
  await until(() => ai.conn.db.visibleIntakeSessions.count() === 1n);
  const session = [...ai.conn.db.visibleIntakeSessions.iter()][0];
  assert.equal(session.requestId, undefined);
  assert.equal(otherAi.conn.db.visibleIntakeSessions.count(), 0n);
  const aiMessage = {
    sessionId: session.id,
    externalId: "sms-1",
    senderKind: "ai",
    recipientKind: "resident",
    channel: "sms",
    content: "Photon: what help do you need?",
  };
  await ai.conn.reducers.saveIntakeMessage(aiMessage);
  await ai.conn.reducers.saveIntakeMessage(aiMessage);
  await until(() => resident.conn.db.visibleIntakeMessages.count() === 1n);
  assert.equal(ai.conn.db.visibleIntakeMessages.count(), 1n);
  await assert.rejects(
    ai.conn.reducers.saveIntakeMessage({
      ...aiMessage,
      content: "Different payload with same key",
    }),
  );
  await assert.rejects(
    resident.conn.reducers.saveIntakeMessage({ ...aiMessage, channel: "app" }),
  );
  await assert.rejects(otherAi.conn.reducers.saveIntakeMessage(aiMessage));
  await resident.conn.reducers.saveIntakeMessage({
    sessionId: session.id,
    externalId: "app-1",
    senderKind: "resident",
    recipientKind: "ai",
    channel: "app",
    content: "I need water",
  });
  await until(() => ai.conn.db.visibleIntakeMessages.count() === 2n);
  await ai.conn.reducers.saveIntakeMessage({
    ...aiMessage,
    externalId: "sms-inbound-2",
    senderKind: "resident",
    recipientKind: "ai",
    content: "An SMS reply before request creation",
  });
  await until(() => ai.conn.db.visibleIntakeMessages.count() === 3n);
  const disasterId = [...ai.conn.db.disaster.iter()][0].id;
  const completion = {
    sessionId: session.id,
    disasterId,
    needs: "Water",
    latitude: 32.95,
    longitude: -96.73,
    urgencyScore: 4,
  };
  await ai.conn.reducers.completeIntake(completion);
  await ai.conn.reducers.completeIntake(completion);
  await until(
    () =>
      [...ai.conn.db.visibleIntakeSessions.iter()][0].requestId !== undefined,
  );
  const requestId = [...ai.conn.db.visibleIntakeSessions.iter()][0].requestId;
  await until(() => resident.conn.db.visibleRequests.count() === 1n);
  assert.equal([...resident.conn.db.visibleRequests.iter()][0].urgencyScore, 4);
  await until(() =>
    [...ai.conn.db.visibleRequestReviews.iter()].some(
      (r) => r.requestId === requestId,
    ),
  );
  const review = () =>
    [...ai.conn.db.visibleRequestReviews.iter()].find(
      (r) => r.requestId === requestId,
    );
  assert.equal(review().urgencyScore, 4);
  await assert.rejects(
    resident.conn.reducers.assessRequestUrgency({ requestId, urgencyScore: 5 }),
  );
  await assert.rejects(
    otherAi.conn.reducers.assessRequestUrgency({ requestId, urgencyScore: 5 }),
  );
  grant(ai.identity, "integration");
  await assert.rejects(
    ai.conn.reducers.assessRequestUrgency({ requestId, urgencyScore: 5 }),
  );
  await assert.rejects(
    ai.conn.reducers.saveIntakeMessage({
      ...aiMessage,
      externalId: "spoof-plain-integration",
    }),
  );
  grant(ai.identity, "ai");
  await ai.conn.reducers.assessRequestUrgency({ requestId, urgencyScore: 2 });
  await until(() => review()?.urgencyScore === 2);
  assert.ok(review().assessedBy.equals(ai.identity));
  await until(() => review()?.followUpRequired === true);
  await assert.rejects(
    resident.conn.reducers.acknowledgeRequest({ requestId }),
  );
  await responder.conn.reducers.acknowledgeRequest({ requestId });
  await until(
    () => review()?.acknowledgedAt !== undefined && !review().followUpRequired,
  );
  const acknowledged = review().acknowledgedAt.microsSinceUnixEpoch;
  await responder.conn.reducers.acknowledgeRequest({ requestId });
  assert.equal(review().acknowledgedAt.microsSinceUnixEpoch, acknowledged);

  // Scoped matching exposes candidates only to staff or this intake's AI.
  const query = `SELECT * FROM find_matching_resources(${requestId}, 'water', 1, 100)`;
  await subscribe(ai.conn, [query]);
  await subscribe(resident.conn, [query]);
  await subscribe(otherAi.conn, [query]);
  assert.equal(resident.conn.db.findMatchingResources.count(), 0n);
  assert.equal(otherAi.conn.db.findMatchingResources.count(), 0n);
  const matches = [...ai.conn.db.findMatchingResources.iter()];
  assert.ok(matches.length > 0);
  assert.ok(
    matches.every(
      (m) =>
        m.resource.kind === "water" &&
        m.resource.available &&
        m.distanceKm <= 100,
    ),
  );
  const chosen = [...matches].sort((a, b) => a.distanceKm - b.distanceKm)[0]
    .resource;
  await responder.conn.reducers.updateResourceAvailability({
    resourceId: chosen.id,
    capacity: chosen.capacity,
    available: false,
  });
  await until(
    () =>
      ![...ai.conn.db.findMatchingResources.iter()].some(
        (m) => m.resource.id === chosen.id,
      ),
  );
  await responder.conn.reducers.updateResourceAvailability({
    resourceId: chosen.id,
    capacity: chosen.capacity,
    available: true,
  });
  await responder.conn.reducers.assignResource({
    requestId,
    resourceId: chosen.id,
    quantity: 10,
  });
  await responder.conn.reducers.updateRequestStatus({
    requestId,
    status: "resolved",
  });
  await until(
    () =>
      [...responder.conn.db.visibleResources.iter()].find(
        (r) => r.id === chosen.id,
      )?.capacity ===
      chosen.capacity - 10,
  );
  assert.equal(
    [...responder.conn.db.visibleResources.iter()].find(
      (r) => r.id === chosen.id,
    ).allocated,
    0,
  );
  await until(() => ai.conn.db.findMatchingResources.count() === 0n);

  // Autonomous SMS-only intake discovers its created resident ID and deduplicates starts.
  const countBefore = responder.conn.db.visibleUsers.count();
  await ai.conn.reducers.startIntake({
    externalId: "sms-only-2",
    userId: undefined,
    name: "SMS-only test",
    phone: "+1-202-555-0101",
  });
  await ai.conn.reducers.startIntake({
    externalId: "sms-only-2",
    userId: undefined,
    name: "SMS-only test",
    phone: "+1-202-555-0101",
  });
  await until(() => ai.conn.db.visibleIntakeSessions.count() === 2n);
  await until(
    () => responder.conn.db.visibleUsers.count() === countBefore + 1n,
  );
  const smsSession = [...ai.conn.db.visibleIntakeSessions.iter()].find(
    (s) => s.id !== session.id,
  );
  assert.ok(smsSession.userId > 0n);
  await assert.rejects(
    resident.conn.reducers.completeIntake({
      ...completion,
      sessionId: smsSession.id,
    }),
  );
  await ai.conn.reducers.completeIntake({
    ...completion,
    sessionId: smsSession.id,
  });
  await until(
    () =>
      [...ai.conn.db.visibleIntakeSessions.iter()].find(
        (s) => s.id === smsSession.id,
      )?.requestId !== undefined,
  );
  const secondRequestId = [...ai.conn.db.visibleIntakeSessions.iter()].find(
    (s) => s.id === smsSession.id,
  ).requestId;
  await responder.conn.reducers.acknowledgeRequest({
    requestId: secondRequestId,
  });
  await until(
    () =>
      [...ai.conn.db.visibleRequestReviews.iter()].find(
        (r) => r.requestId === secondRequestId,
      )?.acknowledgedAt !== undefined,
  );
  await new Promise((resolve) => setTimeout(resolve, 2500));
  assert.equal(
    [...ai.conn.db.visibleRequestReviews.iter()].find(
      (r) => r.requestId === secondRequestId,
    ).followUpRequired,
    false,
  );
  const food = [...responder.conn.db.visibleResources.iter()].find(
    (r) => r.kind === "food",
  );
  await responder.conn.reducers.assignResource({
    requestId: secondRequestId,
    resourceId: food.id,
    quantity: 5,
  });
  await responder.conn.reducers.updateRequestStatus({
    requestId: secondRequestId,
    status: "cancelled",
  });
  await until(
    () =>
      [...responder.conn.db.visibleResources.iter()].find(
        (r) => r.id === food.id,
      )?.allocated === 0,
  );
  assert.equal(
    [...responder.conn.db.visibleResources.iter()].find((r) => r.id === food.id)
      .capacity,
    food.capacity,
  );
  grant(ai.identity, "none");
  await until(
    () =>
      ai.conn.db.visibleIntakeSessions.count() === 0n &&
      ai.conn.db.visibleIntakeMessages.count() === 0n,
  );
  await assert.rejects(
    ai.conn.reducers.saveIntakeMessage({ ...aiMessage, externalId: "revoked" }),
  );
  console.log(
    "PASS: pre-request AI/SMS intake, scoped reads, spoof prevention, retries, autonomous ID discovery, assessed urgency, scheduled follow-up, acknowledgement, matching and consumed water.",
  );
} finally {
  for (const client of clients) client.disconnect();
}
