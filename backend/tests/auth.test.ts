import { describe, expect, it } from "vitest";
import { ConnectionId, Timestamp } from "spacetimedb";
import {
  createModuleTestHarness,
  TestAuth,
} from "spacetimedb/server/test-utils";
import db, * as m from "../spacetimedb/src/index";

let nextConnection = 1n;
const clientId = "neighboralert-test-client";
function principal(sub: string, claims: Record<string, unknown> = {}) {
  return TestAuth.fromJwtPayload(
    JSON.stringify({
      iss: "https://auth.spacetimedb.com/oidc",
      sub,
      aud: clientId,
      email: `${sub}@example.com`,
      email_verified: true,
      ...claims,
    }),
    new ConnectionId(nextConnection++),
  );
}
const owner = principal("publisher", { iss: "localhost" });
function setup() {
  const test = createModuleTestHarness(db, m);
  const run = (
    auth: TestAuth,
    body: Parameters<typeof test.withReducerTx>[1],
  ) =>
    test.withReducerTx(auth, (ctx) =>
      body({
        ...ctx,
        senderAuth: ctx.senderAuth,
        databaseIdentity: ctx.databaseIdentity,
        env: {
          SPACETIMEAUTH_CLIENT_ID: clientId,
          ENABLE_DEV_SEED: "true",
          FOLLOW_UP_SECONDS: "1800",
        },
      }),
    );
  run(owner, (ctx) => m.init(ctx, {}));
  function prepopulate(email: string, role = "resident") {
    run(owner, (ctx) =>
      m.prepopulateDemoAccount(ctx, {
        userId: undefined,
        email,
        role,
        name: email,
        phone: undefined,
      }),
    );
    return [...test.db.user.iter()].find(
      (u) => u.email === email.trim().toLowerCase(),
    )!;
  }
  return { test, run, prepopulate };
}

describe("existing-account authentication", () => {
  it("links a verified email without inserting a user, and permits repeated login", () => {
    const { test, run, prepopulate } = setup();
    const account = prepopulate(" Alice@Example.com ");
    const alice = principal("alice", { email: "ALICE@example.com" });
    expect(m.myProfile(test.viewContext(alice), {})).toEqual([]);
    run(alice, (ctx) => m.loginExistingUser(ctx, {}));
    run(alice, (ctx) => m.loginExistingUser(ctx, {}));
    expect([...test.db.user.iter()]).toHaveLength(1);
    expect(
      test.db.user.id
        .find(account.id)
        ?.identity?.equals(test.viewContext(alice).sender),
    ).toBe(true);
    expect(m.myProfile(test.viewContext(alice), {})[0]?.id).toBe(account.id);
    run(alice, (ctx) =>
      m.updateMyLocation(ctx, {
        latitude: 32.9,
        longitude: -96.7,
        source: "app",
      }),
    );
  });
  it("denies unknown emails and prevents self-registration or prepopulation", () => {
    const { test, run, prepopulate } = setup();
    prepopulate("alice@example.com");
    const unknown = principal("unknown");
    expect(() => run(unknown, (ctx) => m.loginExistingUser(ctx, {}))).toThrow(
      "No account found for this email.",
    );
    expect(() =>
      run(unknown, (ctx) =>
        m.registerUser(ctx, { name: "Intruder", phone: undefined }),
      ),
    ).toThrow("Self-registration is disabled");
    expect(() =>
      run(unknown, (ctx) =>
        m.prepopulateDemoAccount(ctx, {
          userId: undefined,
          email: "unknown@example.com",
          name: "Intruder",
          role: "responder",
          phone: undefined,
        }),
      ),
    ).toThrow("Administrator required");
    expect(() =>
      run(unknown, (ctx) =>
        m.updateMyLocation(ctx, { latitude: 0, longitude: 0, source: "app" }),
      ),
    ).toThrow("No account found");
    expect(m.visibleUsers(test.viewContext(unknown), {})).toEqual([]);
    expect(m.visibleRequests(test.viewContext(unknown), {})).toEqual([]);
    expect([...test.db.user.iter()]).toHaveLength(1);
  });
  it.each([
    { iss: "https://attacker.example" },
    { aud: "other-client" },
    { email_verified: false },
    { email_verified: "true" },
    { email: null },
  ])("rejects invalid authentication claims: %j", (claims) => {
    const { test, run, prepopulate } = setup();
    prepopulate("alice@example.com");
    const auth = principal("alice", claims);
    expect(() => run(auth, (ctx) => m.loginExistingUser(ctx, {}))).toThrow();
    expect(() => run(auth, (ctx) => m.loginExistingUser(ctx, {}))).toThrow();
    expect([...test.db.user.iter()][0].identity).toBeUndefined();
  });
  it("fails closed without the client ID", () => {
    const { test, prepopulate } = setup();
    prepopulate("alice@example.com");
    expect(() =>
      test.withReducerTx(principal("alice"), (ctx) =>
        m.loginExistingUser({ ...ctx, env: {} }, {}),
      ),
    ).toThrow("not configured");
  });
  it("does not rebind an account or let one identity take another account", () => {
    const { test, run, prepopulate } = setup();
    const alice = prepopulate("alice@example.com");
    prepopulate("bob@example.com");
    run(principal("alice"), (ctx) => m.loginExistingUser(ctx, {}));
    expect(() =>
      run(principal("different-sub", { email: "alice@example.com" }), (ctx) =>
        m.loginExistingUser(ctx, {}),
      ),
    ).toThrow("already linked");
    expect(() =>
      run(principal("alice", { email: "bob@example.com" }), (ctx) =>
        m.loginExistingUser(ctx, {}),
      ),
    ).toThrow("already linked");
    expect(() =>
      run(principal("alice", { aud: "wrong" }), (ctx) =>
        m.loginExistingUser(ctx, {}),
      ),
    ).toThrow();
    expect(test.db.user.id.find(alice.id)?.email).toBe("alice@example.com");
  });
  it("uses stored roles, ignores token roles, and respects demotion on later logins", () => {
    const { test, run, prepopulate } = setup();
    prepopulate("alice@example.com");
    prepopulate("bob@example.com", "responder");
    const alice = principal("alice", { roles: ["admin", "responder"] });
    const bob = principal("bob");
    for (const a of [alice, bob]) run(a, (ctx) => m.loginExistingUser(ctx, {}));
    expect(() =>
      run(alice, (ctx) =>
        m.createOrganization(ctx, { name: "No", description: "No" }),
      ),
    ).toThrow("Responder required");
    run(bob, (ctx) =>
      m.createOrganization(ctx, { name: "Relief", description: "Help" }),
    );
    run(owner, (ctx) =>
      m.setAccess(ctx, {
        identity: test.viewContext(bob).sender,
        role: "none",
      }),
    );
    run(bob, (ctx) => m.loginExistingUser(ctx, {}));
    expect(() =>
      run(bob, (ctx) =>
        m.createOrganization(ctx, { name: "No", description: "No" }),
      ),
    ).toThrow("Responder required");
    expect(m.visibleUsers(test.viewContext(bob), {})).toEqual([]);
  });
  it("rejects duplicate emails and preserves existing demo IDs", () => {
    const { test, run, prepopulate } = setup();
    run(owner, (ctx) => m.seedDevelopment(ctx, {}));
    const demo = [...test.db.user.iter()][0];
    run(owner, (ctx) =>
      m.prepopulateDemoAccount(ctx, {
        userId: demo.id,
        email: "alice@example.com",
        name: demo.name,
        role: "resident",
        phone: undefined,
      }),
    );
    const other = prepopulate("other@example.com");
    expect(() =>
      run(owner, (ctx) =>
        m.prepopulateDemoAccount(ctx, {
          userId: other.id,
          email: "alice@example.com",
          name: "Other",
          role: "resident",
          phone: undefined,
        }),
      ),
    ).toThrow("Email already belongs");
    run(principal("alice"), (ctx) => m.loginExistingUser(ctx, {}));
    expect(m.myProfile(test.viewContext(principal("alice")), {})[0].id).toBe(
      demo.id,
    );
    expect(
      m.visibleRequests(test.viewContext(principal("alice")), {}).length,
    ).toBeGreaterThan(0);
  });
  it("preserves AI intake, SMS writes and urgency assessment without human login", () => {
    const { test, run } = setup();
    run(owner, (ctx) => m.seedDevelopment(ctx, {}));
    const ai = principal("service", {
      iss: "localhost",
      email_verified: false,
    });
    const serviceIdentity = test.viewContext(ai).sender;
    run(owner, (ctx) =>
      m.setAccess(ctx, { identity: serviceIdentity, role: "ai" }),
    );
    run(ai, (ctx) =>
      m.startIntake(ctx, {
        externalId: "sms-1",
        userId: undefined,
        name: "SMS resident",
        phone: "+12025550100",
      }),
    );
    const session = m.visibleIntakeSessions(test.viewContext(ai), {})[0];
    run(ai, (ctx) =>
      m.saveIntakeMessage(ctx, {
        sessionId: session.id,
        externalId: "m1",
        senderKind: "ai",
        recipientKind: "resident",
        channel: "sms",
        content: "Do you need help?",
      }),
    );
    const disasterId = [...test.db.disaster.iter()][0].id;
    run(ai, (ctx) =>
      m.completeIntake(ctx, {
        sessionId: session.id,
        disasterId,
        needs: "Water",
        latitude: 32.94,
        longitude: -96.74,
        urgencyScore: 3,
      }),
    );
    const requestId = test.db.intakeSession.id.find(session.id)!.requestId!;
    run(ai, (ctx) =>
      m.assessRequestUrgency(ctx, { requestId, urgencyScore: 5 }),
    );
    expect(test.db.requestReview.requestId.find(requestId)?.urgencyScore).toBe(
      5,
    );
    run(owner, (ctx) =>
      m.setAccess(ctx, { identity: serviceIdentity, role: "none" }),
    );
    expect(() =>
      run(ai, (ctx) =>
        m.updateIntakeLocation(ctx, {
          sessionId: session.id,
          latitude: 32.94,
          longitude: -96.74,
        }),
      ),
    ).toThrow();
    expect(m.visibleIntakeSessions(test.viewContext(ai), {})).toEqual([]);
  });
  it("keeps allocation rollback and scheduled review guards working", () => {
    const { test, run } = setup();
    run(owner, (ctx) => m.seedDevelopment(ctx, {}));
    const requests = [...test.db.assistanceRequest.iter()];
    const r = [...test.db.resource.iter()][0];
    run(owner, (ctx) =>
      m.assignResource(ctx, {
        requestId: requests[0].id,
        resourceId: r.id,
        quantity: r.capacity,
      }),
    );
    expect(() =>
      run(owner, (ctx) =>
        m.assignResource(ctx, {
          requestId: requests[1].id,
          resourceId: r.id,
          quantity: 1,
        }),
      ),
    ).toThrow("Insufficient");
    expect([...test.db.resourceAssignment.iter()]).toHaveLength(1);
    const timer = [...test.db.followUpTimer.iter()].find(
      (t) => t.requestId === requests[1].id,
    )!;
    expect(() =>
      run(owner, (ctx) => m.flagUnacknowledged(ctx, { timer })),
    ).toThrow("Scheduled execution only");
    test.clock.set(new Timestamp(2_000_000_000n));
    run(TestAuth.internal(), (ctx) => m.flagUnacknowledged(ctx, { timer }));
    expect(
      test.db.requestReview.requestId.find(requests[1].id)?.followUpRequired,
    ).toBe(true);
  });
});

describe("urgency scores and demo refresh", () => {
  it("requires valid intake scores and lets only the owning AI assess", () => {
    const { test, run } = setup();
    run(owner, (ctx) => m.seedDevelopment(ctx, {}));
    const ai = principal("scoring-ai");
    const otherAi = principal("other-scoring-ai");
    for (const service of [ai, otherAi]) {
      const identity = test.viewContext(service).sender;
      run(owner, (ctx) => m.setAccess(ctx, { identity, role: "ai" }));
    }
    run(ai, (ctx) =>
      m.startIntake(ctx, {
        externalId: "score-test",
        userId: undefined,
        name: "SMS test",
        phone: undefined,
      }),
    );
    const session = m.visibleIntakeSessions(test.viewContext(ai), {})[0];
    const disasterId = [...test.db.disaster.iter()][0].id;
    const args = {
      sessionId: session.id,
      disasterId,
      needs: "Insurance claim",
      latitude: 32.94,
      longitude: -96.74,
      urgencyScore: 1,
    };
    for (const urgencyScore of [0, 6, 1.5]) {
      expect(() =>
        run(ai, (ctx) => m.completeIntake(ctx, { ...args, urgencyScore })),
      ).toThrow();
      expect(() =>
        run(ai, (ctx) =>
          m.createAssistanceRequest(ctx, {
            ...args,
            userId: session.userId,
            urgencyScore,
          }),
        ),
      ).toThrow();
    }
    run(ai, (ctx) => m.completeIntake(ctx, args));
    const requestId = test.db.intakeSession.id.find(session.id)!.requestId!;
    expect(test.db.assistanceRequest.id.find(requestId)?.urgencyScore).toBe(1);
    expect(() =>
      run(otherAi, (ctx) =>
        m.assessRequestUrgency(ctx, { requestId, urgencyScore: 5 }),
      ),
    ).toThrow("AI may assess only its intake requests");
    run(ai, (ctx) =>
      m.assessRequestUrgency(ctx, { requestId, urgencyScore: 4 }),
    );
    expect(test.db.assistanceRequest.id.find(requestId)?.urgencyScore).toBe(4);
    expect(test.db.requestReview.requestId.find(requestId)?.urgencyScore).toBe(
      4,
    );
  });
  it("validates scores, preserves authorization, and synchronizes assessments", () => {
    const { test, run } = setup();
    run(owner, (ctx) => m.seedDevelopment(ctx, {}));
    const request = [...test.db.assistanceRequest.iter()][0];
    for (const urgencyScore of [0, 6, 1.5, NaN]) {
      expect(() =>
        run(owner, (ctx) =>
          m.assessRequestUrgency(ctx, { requestId: request.id, urgencyScore }),
        ),
      ).toThrow();
    }
    expect(() =>
      run(principal("stranger"), (ctx) =>
        m.assessRequestUrgency(ctx, { requestId: request.id, urgencyScore: 5 }),
      ),
    ).toThrow();
    for (const urgencyScore of [1, 2, 3, 4, 5]) {
      run(owner, (ctx) =>
        m.assessRequestUrgency(ctx, { requestId: request.id, urgencyScore }),
      );
      expect(test.db.assistanceRequest.id.find(request.id)?.urgencyScore).toBe(
        urgencyScore,
      );
      expect(
        test.db.requestReview.requestId.find(request.id)?.urgencyScore,
      ).toBe(urgencyScore);
    }
  });
  it("refreshes only seed-owned requests once and preserves references and capacity", () => {
    const { test, run } = setup();
    run(owner, (ctx) => m.seedDevelopment(ctx, {}));
    // Model the pre-score seed version, which has no upgrade markers.
    run(owner, (ctx) => {
      for (const msg of [...ctx.db.intakeMessage.iter()])
        if (msg.id.endsWith(":urgency-v2"))
          ctx.db.intakeMessage.id.delete(msg.id);
    });
    const before = [...test.db.assistanceRequest.iter()];
    const resource = [...test.db.resource.iter()][0];
    // Another request for the same fictional resident is not a seed-owned request.
    run(owner, (ctx) =>
      ctx.db.assistanceRequest.insert({
        ...before[0],
        id: 0n,
        needs: "Keep this request",
      }),
    );
    run(owner, (ctx) =>
      m.assignResource(ctx, {
        requestId: before[0].id,
        resourceId: resource.id,
        quantity: 1,
      }),
    );
    run(owner, (ctx) => m.seedUpdatedDevelopment(ctx, {}));
    const ids = [...test.db.assistanceRequest.iter()].map((r) => r.id);
    run(owner, (ctx) => m.seedUpdatedDevelopment(ctx, {}));
    expect([...test.db.assistanceRequest.iter()].map((r) => r.id)).toEqual(ids);
    expect(ids).toHaveLength(11);
    expect(before.every((r) => !test.db.assistanceRequest.id.find(r.id))).toBe(
      true,
    );
    expect(
      [...test.db.assistanceRequest.iter()].some(
        (r) => r.needs === "Keep this request",
      ),
    ).toBe(true);
    expect(
      new Set([...test.db.assistanceRequest.iter()].map((r) => r.urgencyScore))
        .size,
    ).toBe(5);
    expect(test.db.resource.id.find(resource.id)?.allocated).toBe(0);
    expect(test.db.user.count()).toBe(10n);
    expect(test.db.disaster.count()).toBe(1n);
    expect(test.db.resource.count()).toBe(20n);
    for (const session of test.db.intakeSession.iter())
      expect(
        test.db.assistanceRequest.id.find(session.requestId!),
      ).toBeDefined();
    for (const review of test.db.requestReview.iter())
      expect(test.db.assistanceRequest.id.find(review.requestId)).toBeDefined();
    for (const timer of test.db.followUpTimer.iter())
      expect(test.db.assistanceRequest.id.find(timer.requestId)).toBeDefined();
  });
});

it("does not reset fresh score fixtures or guess missing demo provenance", () => {
  const { test, run } = setup();
  run(owner, (ctx) => m.seedDevelopment(ctx, {}));
  const request = [...test.db.assistanceRequest.iter()][0];
  const resource = [...test.db.resource.iter()][0];
  run(owner, (ctx) =>
    m.assignResource(ctx, {
      requestId: request.id,
      resourceId: resource.id,
      quantity: 1,
    }),
  );
  run(owner, (ctx) => m.seedUpdatedDevelopment(ctx, {}));
  expect(test.db.assistanceRequest.id.find(request.id)?.status).toBe(
    "in_progress",
  );
  expect(test.db.resource.id.find(resource.id)?.allocated).toBe(1);
  const session = [...test.db.intakeSession.iter()][0];
  run(owner, (ctx) => ctx.db.intakeSession.id.delete(session.id));
  expect(() => run(owner, (ctx) => m.seedUpdatedDevelopment(ctx, {}))).toThrow(
    "all 10 original",
  );
  expect(test.db.assistanceRequest.count()).toBe(10n);
  expect(test.db.resource.id.find(resource.id)?.allocated).toBe(1);
});
