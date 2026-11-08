import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
const { DbConnection, tables } = createRequire(import.meta.url)(
  "../.test-client/module_bindings/index.js",
);
const uri = process.env.SPACETIME_TEST_URI;
const database = process.env.SPACETIME_TEST_DATABASE;
if (
  !uri ||
  !database ||
  !["127.0.0.1", "localhost"].includes(new URL(uri).hostname)
)
  throw new Error("Disposable local database required");
function call(reducer, args = []) {
  const result = spawnSync(
    process.env.SPACETIME_CLI ?? "spacetime",
    [
      "call",
      database,
      reducer,
      ...args.map((x) => JSON.stringify(x)),
      "--server",
      uri,
      "--no-config",
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
}
const clients = [];
async function connect(token) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Connection timed out")),
      10000,
    );
    const c = DbConnection.builder()
      .withUri(uri)
      .withDatabaseName(database)
      .withToken(token)
      .onConnect((conn) => {
        clearTimeout(timer);
        resolve(conn);
      })
      .onConnectError((_ctx, e) => {
        clearTimeout(timer);
        reject(e);
      })
      .onDisconnect((_ctx, e) => {
        clearTimeout(timer);
        reject(e ?? new Error("Connection denied"));
      })
      .build();
    clients.push(c);
  });
}
async function subscribe(c, queries) {
  return new Promise((resolve, reject) =>
    c
      .subscriptionBuilder()
      .onApplied(resolve)
      .onError((ctx) => reject(ctx.event))
      .subscribe(queries),
  );
}
try {
  call("seed_development");
  call("seed_updated_development");
  // Admission must fail before a local anonymous identity can access data.
  await assert.rejects(connect(undefined));
  const response = await fetch(`${uri}/v1/identity`, { method: "POST" });
  assert.ok(response.ok);
  const service = await response.json();
  call("set_access", [service.identity, "ai"]);
  const c = await connect(service.token);
  await subscribe(c, [
    tables.visibleIntakeSessions,
    tables.visibleIntakeMessages,
  ]);
  await assert.rejects(subscribe(c, ["SELECT * FROM user"]));
  await assert.rejects(
    c.reducers.registerUser({ name: "No signup", phone: undefined }),
  );
  await assert.rejects(c.reducers.loginExistingUser({}));
  await c.reducers.startIntake({
    externalId: "auth-smoke-sms",
    userId: undefined,
    name: "SMS resident",
    phone: "+12025550100",
  });
  for (let i = 0; i < 100 && c.db.visibleIntakeSessions.count() !== 1n; i++)
    await new Promise((resolve) => setTimeout(resolve, 25));
  const session = [...c.db.visibleIntakeSessions.iter()][0];
  assert.ok(session);
  await c.reducers.saveIntakeMessage({
    sessionId: session.id,
    externalId: "event1",
    senderKind: "ai",
    recipientKind: "resident",
    channel: "sms",
    content: "Do you need help?",
  });
  for (let i = 0; i < 100 && c.db.visibleIntakeMessages.count() !== 1n; i++)
    await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(c.db.visibleIntakeMessages.count(), 1n);
  call("set_access", [service.identity, "none"]);
  for (let i = 0; i < 100 && c.db.visibleIntakeSessions.count() !== 0n; i++)
    await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(c.db.visibleIntakeSessions.count(), 0n);
  await assert.rejects(
    c.reducers.startIntake({
      externalId: "revoked",
      userId: undefined,
      name: "No",
      phone: undefined,
    }),
  );
  console.log(
    "PASS local auth: anonymous admission denied, signup disabled, private tables denied, AI/SMS intake and live revocation preserved",
  );
} finally {
  for (const c of clients) c.disconnect();
}
