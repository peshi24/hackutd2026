import {
  schema,
  table,
  t,
  SenderError,
  type InferSchema,
  type ReducerCtx,
} from "spacetimedb/server";
import { ScheduleAt, Timestamp } from "spacetimedb";
const user = table(
  {
    name: "user",
    indexes: [
      { accessor: "identity", algorithm: "btree", columns: ["identity"] },
      { accessor: "email", algorithm: "btree", columns: ["email"] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    identity: t.option(t.identity()),
    name: t.string(),
    phone: t.option(t.string()),
    role: t.string(),
    fictional: t.bool(),
    email: t.string().default(""),
  },
);
const access = table(
  { name: "access" },
  { identity: t.identity().primaryKey(), role: t.string() },
);
const settings = table(
  { name: "settings" },
  { id: t.u8().primaryKey(), admin: t.identity(), seeded: t.bool() },
);
const disaster = table(
  { name: "disaster", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    name: t.string(),
    kind: t.string(),
    latitude: t.f64(),
    longitude: t.f64(),
    active: t.bool(),
    simulated: t.bool(),
    createdAt: t.timestamp(),
  },
);
const assistanceRequest = table(
  { name: "assistance_request" },
  {
    id: t.u64().primaryKey().autoInc(),
    userId: t.u64().index("btree"),
    disasterId: t.u64(),
    needs: t.string(),
    latitude: t.f64(),
    longitude: t.f64(),
    urgent: t.bool(),
    status: t.string(),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
    urgencyScore: t.u8().default(3),
    queuePosition: t.u32().default(0),
  },
);
const message = table(
  { name: "message" },
  {
    id: t.u64().primaryKey().autoInc(),
    senderId: t.u64(),
    recipientId: t.u64(),
    conversationId: t.u64().index("btree"),
    channel: t.string(),
    content: t.string(),
    createdAt: t.timestamp(),
  },
);
const organization = table(
  { name: "organization", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    name: t.string(),
    description: t.string(),
    fictional: t.bool(),
  },
);
const resource = table(
  { name: "resource" },
  {
    id: t.u64().primaryKey().autoInc(),
    organizationId: t.u64(),
    kind: t.string(),
    name: t.string(),
    latitude: t.f64(),
    longitude: t.f64(),
    capacity: t.u32(),
    allocated: t.u32(),
    available: t.bool(),
    unit: t.string(),
    fictional: t.bool(),
  },
);
const resourceAssignment = table(
  {
    name: "resource_assignment",
    indexes: [
      {
        accessor: "byRequestResource",
        algorithm: "btree",
        columns: ["requestId", "resourceId"],
      },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    requestId: t.u64().index("btree"),
    resourceId: t.u64(),
    quantity: t.u32(),
    active: t.bool(),
    assignedBy: t.identity(),
    createdAt: t.timestamp(),
  },
);
// Additive tables: existing request/message rows and IDs stay unchanged.
const intakeSession = table(
  { name: "intake_session" },
  {
    id: t.string().primaryKey(),
    userId: t.u64().index("btree"),
    owner: t.identity().index("btree"),
    requestId: t.option(t.u64()),
    createdAt: t.timestamp(),
  },
);
const intakeMessage = table(
  { name: "intake_message" },
  {
    id: t.string().primaryKey(),
    sessionId: t.string().index("btree"),
    senderKind: t.string(),
    senderUserId: t.option(t.u64()),
    recipientKind: t.string(),
    channel: t.string(),
    content: t.string(),
    createdAt: t.timestamp(),
  },
);
const requestReview = table(
  { name: "request_review" },
  {
    requestId: t.u64().primaryKey(),
    assessedUrgent: t.option(t.bool()),
    assessedBy: t.option(t.identity()),
    assessedAt: t.option(t.timestamp()),
    acknowledgedBy: t.option(t.identity()),
    acknowledgedAt: t.option(t.timestamp()),
    followUpAt: t.timestamp(),
    followUpRequired: t.bool(),
    urgencyScore: t.u8().default(3),
  },
);
const followUpTimer = table(
  { name: "follow_up_timer" },
  {
    id: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    requestId: t.u64(),
  },
);
const userLocation = table(
  { name: "user_location" },
  {
    userId: t.u64().primaryKey(),
    latitude: t.f64(),
    longitude: t.f64(),
    source: t.string(),
    updatedAt: t.timestamp(),
  },
);
const outreachPreference = table(
  { name: "outreach_preference" },
  {
    userId: t.u64().primaryKey(),
    smsOptIn: t.bool(),
    updatedAt: t.timestamp(),
  },
);
const broadcast = table(
  { name: "broadcast" },
  {
    id: t.string().primaryKey(),
    disasterId: t.u64(),
    latitude: t.f64(),
    longitude: t.f64(),
    radiusKm: t.u32(),
    maxLocationAgeHours: t.u32(),
    content: t.string(),
    serviceIdentity: t.identity(),
    createdBy: t.identity(),
    createdAt: t.timestamp(),
  },
);
const broadcastDelivery = table(
  { name: "broadcast_delivery" },
  {
    id: t.string().primaryKey(),
    broadcastId: t.string().index("btree"),
    userId: t.u64(),
    phone: t.string(),
    sessionId: t.option(t.string()),
    status: t.string(),
    attempt: t.u32(),
    providerMessageId: t.option(t.string()),
    error: t.option(t.string()),
    updatedAt: t.timestamp(),
  },
);
const db = schema(
  {
    user,
    access,
    settings,
    disaster,
    assistanceRequest,
    message,
    organization,
    resource,
    resourceAssignment,
    intakeSession,
    intakeMessage,
    requestReview,
    followUpTimer,
    userLocation,
    outreachPreference,
    broadcast,
    broadcastDelivery,
  },
  {
    env: {
      ENABLE_DEV_SEED: t.string().optional(),
      FOLLOW_UP_SECONDS: t.string().optional(),
      SPACETIMEAUTH_CLIENT_ID: t.string().optional(),
    },
  },
);
export default db;
type Ctx = ReducerCtx<InferSchema<typeof db>>;
function fail(message: string): never {
  throw new SenderError(message);
}
function admin(ctx: Ctx) {
  if (!ctx.db.settings.id.find(1)?.admin.equals(ctx.sender))
    fail("Administrator required");
}
function responder(ctx: Ctx) {
  if (ctx.db.settings.id.find(1)?.admin.equals(ctx.sender)) return;
  if (ctx.db.access.identity.find(ctx.sender)?.role !== "responder")
    fail("Responder required");
  currentUser(ctx);
}
function integration(ctx: Ctx) {
  if (
    !["integration", "ai"].includes(
      ctx.db.access.identity.find(ctx.sender)?.role ?? "",
    )
  )
    fail("Trusted integration required");
}
function text(value: string, max: number) {
  const result = value.trim();
  if (!result || result.length > max)
    fail(`Text must contain 1-${max} characters`);
  return result;
}
function validateUrgencyScore(score: number) {
  if (!Number.isInteger(score) || score < 1 || score > 5)
    fail("Urgency score must be an integer from 1 to 5");
}
function coordinates(latitude: number, longitude: number) {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    fail("Invalid coordinates");
}
function currentUser(ctx: Ctx) {
  const email = verifiedEmail(ctx);
  const row = accountFor(ctx);
  if (!row || row.email !== email) fail("No account found for this email.");
  return row;
}
function normalizeEmail(email: string) {
  const result = email.trim().toLowerCase();
  if (result.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result))
    fail("Invalid email address");
  return result;
}
function verifiedEmail(ctx: Ctx) {
  const clientId = ctx.env.SPACETIMEAUTH_CLIENT_ID;
  if (!clientId) fail("SpacetimeAuth client ID is not configured");
  const jwt = ctx.senderAuth.jwt;
  if (
    !jwt ||
    jwt.issuer !== "https://auth.spacetimedb.com/oidc" ||
    !jwt.audience.includes(clientId)
  )
    fail("Sign in with NeighborAlert's SpacetimeAuth client");
  if (
    jwt.fullPayload.email_verified !== true ||
    typeof jwt.fullPayload.email !== "string"
  )
    fail("A verified email address is required");
  return normalizeEmail(jwt.fullPayload.email);
}
function accountFor(ctx: ReadCtx) {
  const rows = [...ctx.db.user.identity.filter(ctx.sender)].filter(
    (u) => u.email !== "",
  );
  return rows.length === 1 ? rows[0] : undefined;
}
export const loginExistingUser = db.reducer((ctx) => {
  const email = verifiedEmail(ctx);
  const matches = [...ctx.db.user.email.filter(email)];
  if (matches.length !== 1) fail("No account found for this email.");
  const account = matches[0];
  if (!["resident", "responder"].includes(account.role))
    fail("Account role is not supported");
  if (account.identity && !account.identity.equals(ctx.sender))
    fail("Account is already linked to another identity");
  if (
    [...ctx.db.user.identity.filter(ctx.sender)].some(
      (u) => u.id !== account.id,
    )
  )
    fail("Identity is already linked to another account");
  if (
    ["ai", "integration"].includes(
      ctx.db.access.identity.find(ctx.sender)?.role ?? "",
    )
  )
    fail("Service identities cannot sign in as residents");
  ctx.db.user.id.update({ ...account, identity: ctx.sender });
  ctx.db.access.identity.delete(ctx.sender);
  if (account.role === "responder")
    ctx.db.access.insert({ identity: ctx.sender, role: "responder" });
});
// Administrative data preparation, never part of the login flow. Supplying a
// userId attaches an email to an existing demo resident and preserves its ID.
export const prepopulateDemoAccount = db.reducer(
  {
    userId: t.option(t.u64()),
    email: t.string(),
    name: t.string(),
    role: t.string(),
    phone: t.option(t.string()),
  },
  (ctx, args) => {
    admin(ctx);
    if (ctx.env.ENABLE_DEV_SEED !== "true") fail("Development seed disabled");
    const email = normalizeEmail(args.email);
    if (!["resident", "responder"].includes(args.role))
      fail("Invalid account role");
    const matches = [...ctx.db.user.email.filter(email)];
    const existing =
      args.userId === undefined ? matches[0] : ctx.db.user.id.find(args.userId);
    if (args.userId !== undefined && !existing) fail("User not found");
    if (matches.some((u) => u.id !== existing?.id))
      fail("Email already belongs to another account");
    const values = {
      email,
      name: text(args.name, 100),
      role: args.role,
      phone: args.phone === undefined ? undefined : text(args.phone, 32),
    };
    if (existing) {
      // Never silently move a bound account to a different email/identity.
      if (existing.identity && existing.email !== email)
        fail("Cannot change email on a linked account");
      ctx.db.user.id.update({ ...existing, ...values });
      if (existing.identity) {
        const role = ctx.db.access.identity.find(existing.identity)?.role;
        if (["ai", "integration"].includes(role ?? ""))
          fail("Cannot change a service account");
        ctx.db.access.identity.delete(existing.identity);
        if (args.role === "responder")
          ctx.db.access.insert({
            identity: existing.identity,
            role: "responder",
          });
      }
    } else
      ctx.db.user.insert({
        id: 0n,
        identity: undefined,
        fictional: true,
        ...values,
      });
  },
);
function release(ctx: Ctx, requestId: bigint, fulfilled = false) {
  for (const a of ctx.db.resourceAssignment.requestId.filter(requestId)) {
    if (!a.active) continue;
    const r = ctx.db.resource.id.find(a.resourceId);
    if (!r || r.allocated < a.quantity) fail("Allocation invariant violated");
    ctx.db.resource.id.update({
      ...r,
      allocated: r.allocated - a.quantity,
      capacity:
        fulfilled && ["food", "water"].includes(r.kind)
          ? r.capacity - a.quantity
          : r.capacity,
    });
    ctx.db.resourceAssignment.id.update({ ...a, active: false });
  }
}
export const init = db.init((ctx) => {
  ctx.db.settings.insert({ id: 1, admin: ctx.sender, seeded: false });
});
export const setAccess = db.reducer(
  { identity: t.identity(), role: t.string() },
  (ctx, args) => {
    admin(ctx);
    if (!["responder", "integration", "ai", "none"].includes(args.role))
      fail("Invalid role");
    ctx.db.access.identity.delete(args.identity);
    if (args.role !== "none") ctx.db.access.insert(args);
    for (const u of ctx.db.user.identity.filter(args.identity)) {
      ctx.db.user.id.update({
        ...u,
        role: args.role === "responder" ? "responder" : "resident",
      });
    }
  },
);
export const registerUser = db.reducer(
  { name: t.string(), phone: t.option(t.string()) },
  (ctx, args) => {
    // Retain the wire API for old clients, but never allow self-registration.
    fail("Self-registration is disabled. Sign in to an existing account.");
  },
);
export const registerIntegrationResident = db.reducer(
  { name: t.string(), phone: t.string() },
  (ctx, args) => {
    integration(ctx);
    ctx.db.user.insert({
      id: 0n,
      identity: undefined,
      name: text(args.name, 100),
      phone: text(args.phone, 32),
      email: "",
      role: "resident",
      fictional: false,
    });
  },
);
export const createDisaster = db.reducer(
  { name: t.string(), kind: t.string(), latitude: t.f64(), longitude: t.f64() },
  (ctx, args) => {
    responder(ctx);
    coordinates(args.latitude, args.longitude);
    ctx.db.disaster.insert({
      ...args,
      name: text(args.name, 150),
      kind: text(args.kind, 50),
      id: 0n,
      active: true,
      simulated: false,
      createdAt: ctx.timestamp,
    });
  },
);
export const createOrganization = db.reducer(
  { name: t.string(), description: t.string() },
  (ctx, args) => {
    responder(ctx);
    ctx.db.organization.insert({
      id: 0n,
      name: text(args.name, 150),
      description: text(args.description, 1000),
      fictional: false,
    });
  },
);
// Queue is global across active requests. 0 means not in the queue.
// Equal urgency uses original submission time, then request ID for stability.
function recomputeQueuePositions(ctx: Ctx) {
  const active = [...ctx.db.assistanceRequest.iter()]
    .filter((r) => r.status === "open" || r.status === "in_progress")
    .sort((a, b) =>
      b.urgencyScore - a.urgencyScore ||
      (a.createdAt.microsSinceUnixEpoch < b.createdAt.microsSinceUnixEpoch ? -1 :
       a.createdAt.microsSinceUnixEpoch > b.createdAt.microsSinceUnixEpoch ? 1 :
       a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
  for (const [index, request] of active.entries()) {
    const position = index + 1;
    if (request.queuePosition !== position)
      ctx.db.assistanceRequest.id.update({ ...request, queuePosition: position });
  }
  for (const request of ctx.db.assistanceRequest.iter()) {
    if (request.status !== "open" && request.status !== "in_progress" && request.queuePosition !== 0)
      ctx.db.assistanceRequest.id.update({ ...request, queuePosition: 0 });
  }
}

// Run once after publishing to assign positions to existing requests.
export const initializeQueuePositions = db.reducer((ctx) => {
  admin(ctx);
  recomputeQueuePositions(ctx);
});

export const createAssistanceRequest = db.reducer(
  {
    userId: t.option(t.u64()),
    disasterId: t.u64(),
    needs: t.string(),
    latitude: t.f64(),
    longitude: t.f64(),
    urgencyScore: t.u8(),
  },
  (ctx, args) => {
    coordinates(args.latitude, args.longitude);
    validateUrgencyScore(args.urgencyScore);
    let userId: bigint;
    if (args.userId !== undefined) {
      integration(ctx);
      userId = args.userId;
    } else userId = currentUser(ctx).id;
    if (!ctx.db.user.id.find(userId)) fail("Resident not found");
    if (!ctx.db.disaster.id.find(args.disasterId)?.active)
      fail("Active disaster required");
    const request = ctx.db.assistanceRequest.insert({
      ...args,
      urgent: args.urgencyScore >= 4,
      queuePosition: 0,
      id: 0n,
      userId,
      needs: text(args.needs, 2000),
      status: "open",
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    });
    ensureReview(ctx, request);
    recomputeQueuePositions(ctx);
  },
);
export const updateRequestStatus = db.reducer(
  { requestId: t.u64(), status: t.string() },
  (ctx, args) => {
    responder(ctx);
    const r = ctx.db.assistanceRequest.id.find(args.requestId);
    if (!r) fail("Request not found");
    const transitions: Record<string, string[]> = {
      open: ["in_progress", "cancelled"],
      in_progress: ["resolved", "cancelled"],
      resolved: [],
      cancelled: [],
    };
    if (!transitions[r.status]?.includes(args.status))
      fail("Invalid status transition");
    if (args.status === "resolved" || args.status === "cancelled")
      release(ctx, r.id, args.status === "resolved");
    if (args.status === "resolved" || args.status === "cancelled") {
      const review = ctx.db.requestReview.requestId.find(r.id);
      if (review)
        ctx.db.requestReview.requestId.update({
          ...review,
          followUpRequired: false,
        });
    }
    ctx.db.assistanceRequest.id.update({
      ...r,
      status: args.status,
      updatedAt: ctx.timestamp,
    });
    recomputeQueuePositions(ctx);
  },
);
export const createResource = db.reducer(
  {
    organizationId: t.u64(),
    kind: t.string(),
    name: t.string(),
    latitude: t.f64(),
    longitude: t.f64(),
    capacity: t.u32(),
    unit: t.string(),
  },
  (ctx, args) => {
    responder(ctx);
    coordinates(args.latitude, args.longitude);
    if (!ctx.db.organization.id.find(args.organizationId))
      fail("Organization not found");
    if (
      !["hotel", "trailer", "vehicle", "food", "water", "shelter"].includes(
        args.kind,
      )
    )
      fail("Invalid resource kind");
    if (!args.capacity) fail("Positive capacity required");
    ctx.db.resource.insert({
      ...args,
      name: text(args.name, 150),
      unit: text(args.unit, 40),
      id: 0n,
      allocated: 0,
      available: true,
      fictional: false,
    });
  },
);
export const assignResource = db.reducer(
  { requestId: t.u64(), resourceId: t.u64(), quantity: t.u32() },
  (ctx, args) => {
    responder(ctx);
    const request = ctx.db.assistanceRequest.id.find(args.requestId);
    const r = ctx.db.resource.id.find(args.resourceId);
    if (!request || !["open", "in_progress"].includes(request.status))
      fail("Open request required");
    if (
      !r ||
      !r.available ||
      !args.quantity ||
      args.quantity > r.capacity - r.allocated
    )
      fail("Insufficient available capacity");
    if (
      [
        ...ctx.db.resourceAssignment.byRequestResource.filter([
          args.requestId,
          args.resourceId,
        ]),
      ].some((a) => a.active)
    )
      fail("Resource already assigned to this request");
    // This read/check/write and assignment insert commit together, or all roll back.
    ctx.db.resource.id.update({ ...r, allocated: r.allocated + args.quantity });
    ctx.db.resourceAssignment.insert({
      ...args,
      id: 0n,
      active: true,
      assignedBy: ctx.sender,
      createdAt: ctx.timestamp,
    });
    ctx.db.assistanceRequest.id.update({
      ...request,
      status: "in_progress",
      updatedAt: ctx.timestamp,
    });
  },
);
export const releaseAssignment = db.reducer(
  { assignmentId: t.u64() },
  (ctx, args) => {
    responder(ctx);
    const a = ctx.db.resourceAssignment.id.find(args.assignmentId);
    if (!a?.active) fail("Active assignment required");
    const r = ctx.db.resource.id.find(a.resourceId);
    if (!r || r.allocated < a.quantity) fail("Allocation invariant violated");
    ctx.db.resource.id.update({ ...r, allocated: r.allocated - a.quantity });
    ctx.db.resourceAssignment.id.update({ ...a, active: false });
  },
);
export const updateResourceAvailability = db.reducer(
  { resourceId: t.u64(), capacity: t.u32(), available: t.bool() },
  (ctx, args) => {
    responder(ctx);
    const r = ctx.db.resource.id.find(args.resourceId);
    if (!r) fail("Resource not found");
    if (args.capacity < r.allocated)
      fail("Capacity cannot be below active allocations");
    ctx.db.resource.id.update({
      ...r,
      capacity: args.capacity,
      available: args.available,
    });
  },
);
export const saveMessage = db.reducer(
  {
    conversationId: t.u64(),
    recipientId: t.u64(),
    senderId: t.option(t.u64()),
    channel: t.string(),
    content: t.string(),
  },
  (ctx, args) => {
    if (!["sms", "app"].includes(args.channel)) fail("Invalid channel");
    let senderId: bigint;
    if (args.channel === "sms") {
      integration(ctx);
      if (args.senderId === undefined) fail("SMS sender required");
      senderId = args.senderId;
    } else {
      if (args.senderId !== undefined)
        fail("App sender is derived from identity");
      senderId = currentUser(ctx).id;
    }
    const request = ctx.db.assistanceRequest.id.find(args.conversationId);
    const sender = ctx.db.user.id.find(senderId);
    const recipient = ctx.db.user.id.find(args.recipientId);
    if (!request || !sender || !recipient || senderId === recipient.id)
      fail("Invalid conversation participants");
    const isResponder = (u: typeof sender) =>
      u.identity !== undefined &&
      (ctx.db.settings.id.find(1)?.admin.equals(u.identity) ||
        ctx.db.access.identity.find(u.identity)?.role === "responder");
    if (!(
      (sender.id === request.userId && isResponder(recipient)) ||
      (recipient.id === request.userId && isResponder(sender))
    ))
      fail("Conversation requires request resident and responder");
    ctx.db.message.insert({
      ...args,
      id: 0n,
      senderId,
      content: text(args.content, 4000),
      createdAt: ctx.timestamp,
    });
  },
);
// Preserve the existing public view shape; email is private account lookup data.
const accountProfile = t.row("AccountProfile", {
  id: t.u64().primaryKey(),
  identity: t.option(t.identity()),
  name: t.string(),
  phone: t.option(t.string()),
  role: t.string(),
  fictional: t.bool(),
});
export const myProfile = db.view(
  { public: true },
  t.array(accountProfile),
  (ctx) => {
    const account = accountFor(ctx);
    return account ? [account] : [];
  },
);
export const visibleUsers = db.view(
  { public: true },
  t.array(accountProfile),
  (ctx) => (staff(ctx) ? [...ctx.db.user.iter()] : []),
);
export const visibleRequests = db.view(
  { public: true },
  t.array(assistanceRequest.rowType),
  (ctx) => {
    if (staff(ctx)) return [...ctx.db.assistanceRequest.iter()];
    const u = accountFor(ctx);
    return u ? [...ctx.db.assistanceRequest.userId.filter(u.id)] : [];
  },
);
export const visibleResources = db.view(
  { public: true },
  t.array(resource.rowType),
  (ctx) => (staff(ctx) ? [...ctx.db.resource.iter()] : []),
);
export const visibleAssignments = db.view(
  { public: true },
  t.array(resourceAssignment.rowType),
  (ctx) => {
    if (staff(ctx)) return [...ctx.db.resourceAssignment.iter()];
    const u = accountFor(ctx);
    return u
      ? [...ctx.db.assistanceRequest.userId.filter(u.id)].flatMap((r) => [
          ...ctx.db.resourceAssignment.requestId.filter(r.id),
        ])
      : [];
  },
);
export const myMessages = db.view(
  { public: true },
  t.array(message.rowType),
  (ctx) => {
    const u = accountFor(ctx);
    return u
      ? [...ctx.db.message.iter()].filter(
          (m) => m.senderId === u.id || m.recipientId === u.id,
        )
      : [];
  },
);
export const seedDevelopment = db.reducer((ctx) => {
  admin(ctx);
  if (ctx.env.ENABLE_DEV_SEED !== "true") fail("Development seed disabled");
  const config = ctx.db.settings.id.find(1)!;
  if (config.seeded) fail("Development data already seeded");
  const d = ctx.db.disaster.insert({
    id: 0n,
    name: "Richardson tornado",
    kind: "tornado",
    latitude: 32.9483,
    longitude: -96.7299,
    active: true,
    simulated: true,
    createdAt: ctx.timestamp,
  });
  for (let i = 0; i < 10; i++) {
    const u = ctx.db.user.insert({
      id: 0n,
      identity: undefined,
      name: demoResidentNames[i],
      email: "",
      phone: undefined,
      role: "resident",
      fictional: true,
    });
    validateUrgencyScore(demoRequests[i].urgencyScore);
    const request = ctx.db.assistanceRequest.insert({
      id: 0n,
      userId: u.id,
      disasterId: d.id,
      needs: demoRequests[i].needs,
      latitude: 32.94 + i * 0.001,
      longitude: -96.75 + i * 0.002,
      urgencyScore: demoRequests[i].urgencyScore,
      urgent: demoRequests[i].urgencyScore >= 4,
      queuePosition: 0,
      status: "open",
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    });
    ensureReview(ctx, request);
  }
  recomputeQueuePositions(ctx);
  const kinds = ["hotel", "trailer", "vehicle", "food", "water"];
  const capacities = [12, 4, 8, 200, 500];
  const units = ["beds", "beds", "seats", "meal parcels", "liters"];
  for (let i = 0; i < 5; i++) {
    const org = ctx.db.organization.insert({
      id: 0n,
      name: `Richardson Relief ${i + 1}`,
      description: "Community shelter, transportation, food and water support.",
      fictional: true,
    });
    for (let j = 0; j < 4; j++) {
      const k = (i * 4 + j) % 5;
      ctx.db.resource.insert({
        id: 0n,
        organizationId: org.id,
        kind: kinds[k],
        name: `${kinds[k]} ${i * 4 + j + 1}`,
        latitude: 32.93 + i * 0.003 + j * 0.001,
        longitude: -96.76 + i * 0.004,
        capacity: capacities[k],
        allocated: 0,
        available: true,
        unit: units[k],
        fictional: true,
      });
    }
  }
  ctx.db.settings.id.update({ ...config, seeded: true });
  seedUpdatedTables(ctx);
  // Fresh score-based fixtures need no destructive refresh on a later seed call.
  for (const session of ctx.db.intakeSession.iter()) {
    if (
      session.id !== `demo:intake:${session.userId}` ||
      !session.owner.equals(ctx.databaseIdentity)
    )
      continue;
    const initial = ctx.db.intakeMessage.id.find(`${session.id}:1`);
    if (initial)
      ctx.db.intakeMessage.insert({
        ...initial,
        id: `${session.id}:urgency-v2`,
      });
  }
});
// Scores are fixture data, not an AI classifier.
const demoRequests = [
  {
    urgencyScore: 5,
    needs: "Trapped beneath debris and unable to leave the house",
  },
  {
    urgencyScore: 4,
    needs: "Urgent medication replacement needed after evacuation",
  },
  {
    urgencyScore: 3,
    needs: "Family needs drinking water and food by this evening",
  },
  {
    urgencyScore: 2,
    needs: "Cleanup supplies needed for yard debris this weekend",
  },
  { urgencyScore: 1, needs: "Help filing an insurance claim for roof damage" },
  {
    urgencyScore: 5,
    needs: "Severe injury after tornado; immediate assistance needed",
  },
  {
    urgencyScore: 4,
    needs: "Current shelter has structural damage and is unsafe",
  },
  {
    urgencyScore: 3,
    needs: "Temporary shelter and transportation needed tonight",
  },
  { urgencyScore: 2, needs: "Nonurgent replacement household supplies needed" },
  {
    urgencyScore: 1,
    needs: "Insurance paperwork and general recovery information",
  },
];
const demoResidentNames = [
  "Jordan Parker",
  "Taylor Reed",
  "Morgan Ellis",
  "Casey Brooks",
  "Avery Lane",
  "Riley Hayes",
  "Cameron Blake",
  "Jamie Quinn",
  "Alex Rowan",
  "Drew Bennett",
];
// Repeat-safe demo upgrade; replaces only seed-owned requests once.
export const seedUpdatedDevelopment = db.reducer((ctx) => {
  admin(ctx);
  if (ctx.env.ENABLE_DEV_SEED !== "true") fail("Development seed disabled");
  if (!ctx.db.settings.id.find(1)?.seeded) fail("Run seed_development first");
  refreshDemoRequests(ctx);
  seedUpdatedTables(ctx);
  recomputeQueuePositions(ctx);
});
function seedUpdatedTables(ctx: Ctx) {
  const event = [...ctx.db.disaster.iter()].find(
    (d) =>
      d.simulated &&
      ["Richardson tornado", "SIMULATION ONLY: Richardson tornado"].includes(
        d.name,
      ),
  );
  if (!event) fail("Richardson demo disaster not found");
  if (event.name.startsWith("SIMULATION ONLY:"))
    ctx.db.disaster.id.update({ ...event, name: "Richardson tornado" });
  const broadcastId = "demo:richardson:outreach:v1";
  if (ctx.db.broadcast.id.find(broadcastId)) return;
  const requests = [...ctx.db.assistanceRequest.iter()]
    .filter(
      (r) =>
        r.disasterId === event.id && ctx.db.user.id.find(r.userId)?.fictional,
    )
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .slice(0, 10);
  const content =
    "Richardson relief team: are you safe, and do you need shelter, transportation, food or water?";
  ctx.db.broadcast.insert({
    id: broadcastId,
    disasterId: event.id,
    latitude: event.latitude,
    longitude: event.longitude,
    radiusKm: 5,
    maxLocationAgeHours: 24,
    content,
    serviceIdentity: ctx.databaseIdentity,
    createdBy: ctx.sender,
    createdAt: ctx.timestamp,
  });
  for (const [i, request] of requests.entries()) {
    const resident = ctx.db.user.id.find(request.userId)!;
    if (/^Fictional Resident \d+$/.test(resident.name))
      ctx.db.user.id.update({ ...resident, name: demoResidentNames[i] });
    if (request.needs.startsWith("SIMULATED: "))
      ctx.db.assistanceRequest.id.update({
        ...request,
        needs: request.needs.slice(11),
      });
    if (!ctx.db.userLocation.userId.find(resident.id))
      saveLocation(
        ctx,
        resident.id,
        request.latitude,
        request.longitude,
        "manual",
      );
    if (!ctx.db.outreachPreference.userId.find(resident.id))
      savePreference(ctx, resident.id, true);
    ensureReview(ctx, request);
    const sessionId = `demo:intake:${resident.id}`;
    if (!ctx.db.intakeSession.id.find(sessionId)) {
      ctx.db.intakeSession.insert({
        id: sessionId,
        userId: resident.id,
        owner: ctx.databaseIdentity,
        requestId: request.id,
        createdAt: ctx.timestamp,
      });
      for (const [n, senderKind, messageContent] of [
        [0, "ai", content],
        [1, "resident", request.needs.replace(/^SIMULATED: /, "")],
      ] as const)
        ctx.db.intakeMessage.insert({
          id: `${sessionId}:${n}`,
          sessionId,
          senderKind,
          senderUserId: senderKind === "resident" ? resident.id : undefined,
          recipientKind: senderKind === "ai" ? "resident" : "ai",
          channel: "sms",
          content: messageContent,
          createdAt: ctx.timestamp,
        });
    }
    // Historical fixtures, not work for a real SMS service.
    ctx.db.broadcastDelivery.insert({
      id: `${broadcastId}:${resident.id}`,
      broadcastId,
      userId: resident.id,
      phone: `+120255501${String(i).padStart(2, "0")}`,
      sessionId,
      status: "sent",
      attempt: 1,
      providerMessageId: `demo-provider-${i + 1}`,
      error: undefined,
      updatedAt: ctx.timestamp,
    });
  }
  for (const org of ctx.db.organization.iter()) {
    if (org.fictional && /^Fictional Richardson Relief \d+$/.test(org.name))
      ctx.db.organization.id.update({
        ...org,
        name: org.name.replace(/^Fictional /, ""),
        description:
          "Community shelter, transportation, food and water support.",
      });
  }
  for (const resource of ctx.db.resource.iter()) {
    if (resource.fictional && resource.name.startsWith("SIMULATED "))
      ctx.db.resource.id.update({ ...resource, name: resource.name.slice(10) });
  }
}
// Only the seed-owned sessions identify replaceable demo requests. User/account
// flags alone are insufficient: prepopulated login accounts are also fictional.
function refreshDemoRequests(ctx: Ctx) {
  const sessions = [...ctx.db.intakeSession.iter()]
    .filter(
      (s) =>
        s.id === `demo:intake:${s.userId}` &&
        s.owner.equals(ctx.databaseIdentity),
    )
    .sort((a, b) => (a.userId < b.userId ? -1 : 1));
  if (sessions.length !== demoRequests.length)
    fail(
      "Demo refresh requires all 10 original seed-owned intake sessions; review legacy seed records before retrying",
    );
  for (const [i, session] of sessions.entries()) {
    const marker = `${session.id}:urgency-v2`;
    if (ctx.db.intakeMessage.id.find(marker)) continue;
    const old =
      session.requestId === undefined
        ? undefined
        : ctx.db.assistanceRequest.id.find(session.requestId);
    if (
      !old ||
      old.userId !== session.userId ||
      !ctx.db.user.id.find(old.userId)?.fictional ||
      !ctx.db.disaster.id.find(old.disasterId)?.simulated
    )
      fail("Demo request provenance is incomplete; no requests were replaced");
    const fixture = demoRequests[i % demoRequests.length];
    validateUrgencyScore(fixture.urgencyScore);
    release(ctx, old.id);
    for (const assignment of [
      ...ctx.db.resourceAssignment.requestId.filter(old.id),
    ])
      ctx.db.resourceAssignment.id.delete(assignment.id);
    for (const timer of [...ctx.db.followUpTimer.iter()])
      if (timer.requestId === old.id) ctx.db.followUpTimer.id.delete(timer.id);
    ctx.db.requestReview.requestId.delete(old.id);
    const replacement = ctx.db.assistanceRequest.insert({
      ...old,
      ...fixture,
      queuePosition: 0,
      urgent: fixture.urgencyScore >= 4,
      id: 0n,
      status: "open",
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    });
    // Preserve conversations and their delivery links by retargeting request IDs.
    for (const linked of [...ctx.db.intakeSession.iter()])
      if (linked.requestId === old.id)
        ctx.db.intakeSession.id.update({
          ...linked,
          requestId: replacement.id,
        });
    for (const msg of [...ctx.db.message.conversationId.filter(old.id)])
      ctx.db.message.id.update({ ...msg, conversationId: replacement.id });
    ctx.db.assistanceRequest.id.delete(old.id);
    ensureReview(ctx, replacement);
    ctx.db.intakeMessage.insert({
      id: marker,
      sessionId: session.id,
      senderKind: "resident",
      senderUserId: session.userId,
      recipientKind: "ai",
      channel: "sms",
      content: fixture.needs,
      createdAt: ctx.timestamp,
    });
  }
}
// Assessment timestamps distinguish submitted scores from staff/AI assessments.
function ensureReview(
  ctx: Ctx,
  request: {
    id: bigint;
    createdAt: Timestamp;
    status: string;
    urgencyScore: number;
  },
) {
  if (ctx.db.requestReview.requestId.find(request.id)) return;
  const seconds = Number(ctx.env.FOLLOW_UP_SECONDS ?? "1800");
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 604800)
    fail("FOLLOW_UP_SECONDS must be 1-604800");
  const followUpAt = new Timestamp(
    request.createdAt.microsSinceUnixEpoch + BigInt(seconds) * 1_000_000n,
  );
  ctx.db.requestReview.insert({
    requestId: request.id,
    urgencyScore: request.urgencyScore,
      assessedUrgent: undefined,
    assessedBy: undefined,
    assessedAt: undefined,
    acknowledgedBy: undefined,
    acknowledgedAt: undefined,
    followUpAt,
    followUpRequired: false,
  });
  if (["open", "in_progress"].includes(request.status)) {
    ctx.db.followUpTimer.insert({
      id: 0n,
      requestId: request.id,
      scheduledAt: ScheduleAt.time(followUpAt.microsSinceUnixEpoch),
    });
  }
}
// Required once after upgrading an existing database; safe to call again.
export const initializeRequestReviews = db.reducer((ctx) => {
  admin(ctx);
  for (const request of ctx.db.assistanceRequest.iter())
    ensureReview(ctx, request);
});
export const flagUnacknowledged = db.reducer(
  { onSchedule: followUpTimer },
  { timer: followUpTimer.rowType },
  (ctx, { timer }) => {
    if (!ctx.sender.equals(ctx.databaseIdentity))
      fail("Scheduled execution only");
    const request = ctx.db.assistanceRequest.id.find(timer.requestId);
    const review = ctx.db.requestReview.requestId.find(timer.requestId);
    if (
      request &&
      review &&
      !review.acknowledgedAt &&
      ["open", "in_progress"].includes(request.status) &&
      ctx.timestamp.microsSinceUnixEpoch >=
        review.followUpAt.microsSinceUnixEpoch
    ) {
      ctx.db.requestReview.requestId.update({
        ...review,
        followUpRequired: true,
      });
    }
  },
);
export const acknowledgeRequest = db.reducer(
  { requestId: t.u64() },
  (ctx, { requestId }) => {
    responder(ctx);
    const request = ctx.db.assistanceRequest.id.find(requestId);
    if (!request || !["open", "in_progress"].includes(request.status))
      fail("Active request required");
    ensureReview(ctx, request);
    const review = ctx.db.requestReview.requestId.find(requestId)!;
    if (!review.acknowledgedAt)
      ctx.db.requestReview.requestId.update({
        ...review,
        acknowledgedBy: ctx.sender,
        acknowledgedAt: ctx.timestamp,
        followUpRequired: false,
      });
  },
);
export const assessRequestUrgency = db.reducer(
  { requestId: t.u64(), urgencyScore: t.u8() },
  (ctx, args) => {
    if (ctx.db.access.identity.find(ctx.sender)?.role === "ai") {
      if (
        ![...ctx.db.intakeSession.owner.filter(ctx.sender)].some(
          (s) => s.requestId === args.requestId,
        )
      )
        fail("AI may assess only its intake requests");
    } else responder(ctx);
    const request = ctx.db.assistanceRequest.id.find(args.requestId);
    if (!request || !["open", "in_progress"].includes(request.status))
      fail("Active request required");
    validateUrgencyScore(args.urgencyScore);
    ensureReview(ctx, request);
    ctx.db.assistanceRequest.id.update({
      ...request,
      urgencyScore: args.urgencyScore,
      urgent: args.urgencyScore >= 4,
      updatedAt: ctx.timestamp,
    });
    const review = ctx.db.requestReview.requestId.find(request.id)!;
    ctx.db.requestReview.requestId.update({
      ...review,
      urgencyScore: args.urgencyScore,
      assessedUrgent: args.urgencyScore >= 4,
      assessedBy: ctx.sender,
      assessedAt: ctx.timestamp,
    });
    recomputeQueuePositions(ctx);
  },
);
type ReadCtx = Pick<
  import("spacetimedb/server").ViewCtx<InferSchema<typeof db>>,
  "sender" | "db"
>;
function staff(ctx: ReadCtx) {
  return (
    ctx.db.settings.id.find(1)?.admin.equals(ctx.sender) ||
    (ctx.db.access.identity.find(ctx.sender)?.role === "responder" &&
      !!accountFor(ctx))
  );
}
function sessionsFor(ctx: ReadCtx) {
  if (staff(ctx)) return [...ctx.db.intakeSession.iter()];
  const role = ctx.db.access.identity.find(ctx.sender)?.role;
  const ownSessions = ["integration", "ai"].includes(role ?? "")
    ? [...ctx.db.intakeSession.owner.filter(ctx.sender)]
    : [];
  const u = accountFor(ctx);
  const residentSessions = u
    ? [...ctx.db.intakeSession.userId.filter(u.id)]
    : [];
  return [
    ...new Map(
      [...ownSessions, ...residentSessions].map((s) => [s.id, s]),
    ).values(),
  ];
}
function writableSession(ctx: Ctx, sessionId: string) {
  if (
    !ctx.db.settings.id.find(1)?.admin.equals(ctx.sender) &&
    !["ai", "integration"].includes(
      ctx.db.access.identity.find(ctx.sender)?.role ?? "",
    )
  )
    currentUser(ctx);
  const session = sessionsFor(ctx).find((s) => s.id === sessionId);
  if (!session) fail("Intake session not accessible");
  return session;
}
function saveLocation(
  ctx: Ctx,
  userId: bigint,
  latitude: number,
  longitude: number,
  source: string,
) {
  coordinates(latitude, longitude);
  if (!["app", "manual"].includes(source)) fail("Invalid location source");
  const row = { userId, latitude, longitude, source, updatedAt: ctx.timestamp };
  if (ctx.db.userLocation.userId.find(userId))
    ctx.db.userLocation.userId.update(row);
  else ctx.db.userLocation.insert(row);
}
export const updateMyLocation = db.reducer(
  { latitude: t.f64(), longitude: t.f64(), source: t.string() },
  (ctx, args) =>
    saveLocation(
      ctx,
      currentUser(ctx).id,
      args.latitude,
      args.longitude,
      args.source,
    ),
);
export const clearMyLocation = db.reducer((ctx) => {
  ctx.db.userLocation.userId.delete(currentUser(ctx).id);
});
function savePreference(ctx: Ctx, userId: bigint, smsOptIn: boolean) {
  const row = { userId, smsOptIn, updatedAt: ctx.timestamp };
  if (ctx.db.outreachPreference.userId.find(userId))
    ctx.db.outreachPreference.userId.update(row);
  else ctx.db.outreachPreference.insert(row);
}
export const setMySmsOptIn = db.reducer(
  { smsOptIn: t.bool() },
  (ctx, { smsOptIn }) => {
    savePreference(ctx, currentUser(ctx).id, smsOptIn);
  },
);
// The owning service records information explicitly provided by an SMS resident.
export const updateIntakeLocation = db.reducer(
  { sessionId: t.string(), latitude: t.f64(), longitude: t.f64() },
  (ctx, args) => {
    integration(ctx);
    const session = writableSession(ctx, args.sessionId);
    if (!session.owner.equals(ctx.sender)) fail("Owning integration required");
    saveLocation(ctx, session.userId, args.latitude, args.longitude, "manual");
  },
);
export const setIntakeSmsOptIn = db.reducer(
  { sessionId: t.string(), smsOptIn: t.bool() },
  (ctx, args) => {
    integration(ctx);
    const session = writableSession(ctx, args.sessionId);
    if (!session.owner.equals(ctx.sender)) fail("Owning integration required");
    savePreference(ctx, session.userId, args.smsOptIn);
  },
);
export const visibleUserLocations = db.view(
  { public: true },
  t.array(userLocation.rowType),
  (ctx) => {
    if (staff(ctx)) return [...ctx.db.userLocation.iter()];
    const u = accountFor(ctx);
    const row = u && ctx.db.userLocation.userId.find(u.id);
    return row ? [row] : [];
  },
);
export const myOutreachPreference = db.view(
  { public: true },
  t.array(outreachPreference.rowType),
  (ctx) => {
    const u = accountFor(ctx);
    const row = u && ctx.db.outreachPreference.userId.find(u.id);
    return row ? [row] : [];
  },
);
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = (n: number) => (n * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) *
      Math.cos(rad(lat2)) *
      Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, a))));
}
function eligibleRecipient(
  ctx: ReadCtx,
  userId: bigint,
  area: {
    latitude: number;
    longitude: number;
    radiusKm: number;
    maxLocationAgeHours: number;
  },
  now: Timestamp,
) {
  const u = ctx.db.user.id.find(userId);
  const loc = ctx.db.userLocation.userId.find(userId);
  if (
    !u ||
    u.role !== "resident" ||
    u.fictional ||
    !u.phone ||
    !/^\+[1-9]\d{7,14}$/.test(u.phone) ||
    !ctx.db.outreachPreference.userId.find(userId)?.smsOptIn ||
    !loc
  )
    return false;
  const age = now.microsSinceUnixEpoch - loc.updatedAt.microsSinceUnixEpoch;
  return (
    age >= 0n &&
    age <= BigInt(area.maxLocationAgeHours) * 3_600_000_000n &&
    distanceKm(area.latitude, area.longitude, loc.latitude, loc.longitude) <=
      area.radiusKm
  );
}
export const queueBroadcast = db.reducer(
  {
    externalId: t.string(),
    disasterId: t.u64(),
    radiusKm: t.u32(),
    maxLocationAgeHours: t.u32(),
    content: t.string(),
    serviceIdentity: t.identity(),
  },
  (ctx, args) => {
    responder(ctx);
    const id = JSON.stringify([
      ctx.sender.toHexString(),
      text(args.externalId, 128),
    ]);
    const content = text(args.content, 1600);
    const existing = ctx.db.broadcast.id.find(id);
    if (existing) {
      if (
        existing.disasterId !== args.disasterId ||
        existing.radiusKm !== args.radiusKm ||
        existing.maxLocationAgeHours !== args.maxLocationAgeHours ||
        existing.content !== content ||
        !existing.serviceIdentity.equals(args.serviceIdentity)
      )
        fail("Broadcast key already used with different content");
      return;
    }
    const event = ctx.db.disaster.id.find(args.disasterId);
    if (!event?.active) fail("Active disaster required");
    if (
      args.radiusKm < 1 ||
      args.radiusKm > 500 ||
      args.maxLocationAgeHours < 1 ||
      args.maxLocationAgeHours > 168
    )
      fail("Radius must be 1-500 km and location age 1-168 hours");
    if (ctx.db.access.identity.find(args.serviceIdentity)?.role !== "ai")
      fail("Designated AI service required");
    const row = ctx.db.broadcast.insert({
      id,
      disasterId: event.id,
      latitude: event.latitude,
      longitude: event.longitude,
      radiusKm: args.radiusKm,
      maxLocationAgeHours: args.maxLocationAgeHours,
      content,
      serviceIdentity: args.serviceIdentity,
      createdBy: ctx.sender,
      createdAt: ctx.timestamp,
    });
    for (const loc of ctx.db.userLocation.iter()) {
      if (!eligibleRecipient(ctx, loc.userId, row, ctx.timestamp)) continue;
      ctx.db.broadcastDelivery.insert({
        id: JSON.stringify([id, loc.userId.toString()]),
        broadcastId: id,
        userId: loc.userId,
        phone: ctx.db.user.id.find(loc.userId)!.phone!,
        sessionId: undefined,
        status: "queued",
        attempt: 0,
        providerMessageId: undefined,
        error: undefined,
        updatedAt: ctx.timestamp,
      });
    }
  },
);
function deliveryForService(ctx: Ctx, deliveryId: string) {
  const delivery = ctx.db.broadcastDelivery.id.find(deliveryId);
  if (!delivery) fail("Delivery not found");
  const parent = ctx.db.broadcast.id.find(delivery.broadcastId)!;
  if (
    ctx.db.access.identity.find(ctx.sender)?.role !== "ai" ||
    !parent.serviceIdentity.equals(ctx.sender)
  )
    fail("Designated AI service required");
  return { delivery, parent };
}
export const claimBroadcastDelivery = db.reducer(
  { deliveryId: t.string() },
  (ctx, { deliveryId }) => {
    const { delivery, parent } = deliveryForService(ctx, deliveryId);
    if (delivery.status !== "queued") fail("Delivery is not queued");
    if (
      !ctx.db.disaster.id.find(parent.disasterId)?.active ||
      !eligibleRecipient(ctx, delivery.userId, parent, ctx.timestamp) ||
      ctx.db.user.id.find(delivery.userId)?.phone !== delivery.phone
    ) {
      ctx.db.broadcastDelivery.id.update({
        ...delivery,
        status: "skipped",
        updatedAt: ctx.timestamp,
      });
      return;
    }
    const sessionId = JSON.stringify([
      ctx.sender.toHexString(),
      `broadcast:${delivery.id}`,
    ]);
    if (!ctx.db.intakeSession.id.find(sessionId))
      ctx.db.intakeSession.insert({
        id: sessionId,
        userId: delivery.userId,
        owner: ctx.sender,
        requestId: undefined,
        createdAt: ctx.timestamp,
      });
    ctx.db.broadcastDelivery.id.update({
      ...delivery,
      sessionId,
      status: "sending",
      attempt: delivery.attempt + 1,
      error: undefined,
      updatedAt: ctx.timestamp,
    });
  },
);
export const finishBroadcastDelivery = db.reducer(
  {
    deliveryId: t.string(),
    attempt: t.u32(),
    providerMessageId: t.option(t.string()),
    error: t.option(t.string()),
  },
  (ctx, args) => {
    const { delivery, parent } = deliveryForService(ctx, args.deliveryId);
    if ((args.providerMessageId === undefined) === (args.error === undefined))
      fail("Supply either provider message ID or definite failure");
    const providerMessageId =
      args.providerMessageId === undefined
        ? undefined
        : text(args.providerMessageId, 256);
    const error = args.error === undefined ? undefined : text(args.error, 1000);
    const status = providerMessageId === undefined ? "failed" : "sent";
    if (delivery.attempt !== args.attempt) fail("Stale delivery attempt");
    if (
      delivery.status === status &&
      delivery.providerMessageId === providerMessageId &&
      delivery.error === error
    )
      return;
    if (delivery.status !== "sending" || !delivery.sessionId)
      fail("Claim delivery first");
    ctx.db.broadcastDelivery.id.update({
      ...delivery,
      status,
      providerMessageId,
      error,
      updatedAt: ctx.timestamp,
    });
    if (status === "sent")
      ctx.db.intakeMessage.insert({
        id: JSON.stringify(["broadcast", delivery.id]),
        sessionId: delivery.sessionId,
        senderKind: "ai",
        senderUserId: undefined,
        recipientKind: "resident",
        channel: "sms",
        content: parent.content,
        createdAt: ctx.timestamp,
      });
  },
);
export const retryBroadcastDelivery = db.reducer(
  { deliveryId: t.string() },
  (ctx, { deliveryId }) => {
    responder(ctx);
    const delivery = ctx.db.broadcastDelivery.id.find(deliveryId);
    if (!delivery || delivery.status !== "failed")
      fail("Only definite failures can be retried");
    ctx.db.broadcastDelivery.id.update({
      ...delivery,
      status: "queued",
      updatedAt: ctx.timestamp,
    });
  },
);
function broadcastsFor(ctx: ReadCtx) {
  if (staff(ctx)) return [...ctx.db.broadcast.iter()];
  if (ctx.db.access.identity.find(ctx.sender)?.role !== "ai") return [];
  return [...ctx.db.broadcast.iter()].filter((b) =>
    b.serviceIdentity.equals(ctx.sender),
  );
}
export const visibleBroadcasts = db.view(
  { public: true },
  t.array(broadcast.rowType),
  broadcastsFor,
);
export const visibleBroadcastDeliveries = db.view(
  { public: true },
  t.array(broadcastDelivery.rowType),
  (ctx) =>
    broadcastsFor(ctx).flatMap((b) => [
      ...ctx.db.broadcastDelivery.broadcastId.filter(b.id),
    ]),
);
export const startIntake = db.reducer(
  {
    externalId: t.string(),
    userId: t.option(t.u64()),
    name: t.string(),
    phone: t.option(t.string()),
  },
  (ctx, args) => {
    const id = JSON.stringify([
      ctx.sender.toHexString(),
      text(args.externalId, 128),
    ]);
    const role = ctx.db.access.identity.find(ctx.sender)?.role;
    const trusted = ["integration", "ai"].includes(role ?? "");
    const existing = ctx.db.intakeSession.id.find(id);
    if (existing) {
      writableSession(ctx, id);
      if (args.userId !== undefined && existing.userId !== args.userId)
        fail("Intake key already belongs to another resident");
      return;
    }
    let userId: bigint;
    if (trusted) {
      userId =
        args.userId ??
        ctx.db.user.insert({
          id: 0n,
          identity: undefined,
          name: text(args.name, 100),
          email: "",
          phone: args.phone === undefined ? undefined : text(args.phone, 32),
          role: "resident",
          fictional: false,
        }).id;
      if (!ctx.db.user.id.find(userId)) fail("Resident not found");
    } else {
      userId = currentUser(ctx).id;
      if (args.userId !== undefined && args.userId !== userId)
        fail("Cannot start intake for another resident");
    }
    ctx.db.intakeSession.insert({
      id,
      userId,
      owner: ctx.sender,
      requestId: undefined,
      createdAt: ctx.timestamp,
    });
  },
);
export const saveIntakeMessage = db.reducer(
  {
    sessionId: t.string(),
    externalId: t.string(),
    senderKind: t.string(),
    recipientKind: t.string(),
    channel: t.string(),
    content: t.string(),
  },
  (ctx, args) => {
    const session = writableSession(ctx, args.sessionId);
    const role = ctx.db.access.identity.find(ctx.sender)?.role;
    const ownerIntegration =
      session.owner.equals(ctx.sender) &&
      ["integration", "ai"].includes(role ?? "");
    if (!["app", "sms"].includes(args.channel)) fail("Invalid channel");
    if (args.channel === "sms" && !ownerIntegration)
      fail("SMS requires the intake integration");
    let senderUserId: bigint | undefined;
    if (args.senderKind === "ai") {
      if (!ownerIntegration || role !== "ai")
        fail("AI sender requires the intake AI identity");
      if (args.recipientKind !== "resident")
        fail("AI must address the resident");
    } else if (args.senderKind === "resident") {
      if (!ownerIntegration && currentUser(ctx).id !== session.userId)
        fail("Cannot impersonate resident");
      if (!["ai", "responder"].includes(args.recipientKind))
        fail("Invalid recipient");
      senderUserId = session.userId;
    } else if (args.senderKind === "responder") {
      responder(ctx);
      senderUserId = currentUser(ctx).id;
      if (args.recipientKind !== "resident")
        fail("Responder must address resident");
    } else fail("Invalid sender kind");
    const content = text(args.content, 4000);
    const id = JSON.stringify([
      session.id,
      ctx.sender.toHexString(),
      text(args.externalId, 128),
    ]);
    const existing = ctx.db.intakeMessage.id.find(id);
    if (existing) {
      if (
        existing.content !== content ||
        existing.senderKind !== args.senderKind ||
        existing.recipientKind !== args.recipientKind ||
        existing.channel !== args.channel
      )
        fail("Message key already used with different content");
      return;
    }
    ctx.db.intakeMessage.insert({
      id,
      sessionId: session.id,
      senderKind: args.senderKind,
      senderUserId,
      recipientKind: args.recipientKind,
      channel: args.channel,
      content,
      createdAt: ctx.timestamp,
    });
  },
);
export const completeIntake = db.reducer(
  {
    sessionId: t.string(),
    disasterId: t.u64(),
    needs: t.string(),
    latitude: t.f64(),
    longitude: t.f64(),
    urgencyScore: t.u8(),
  },
  (ctx, args) => {
    validateUrgencyScore(args.urgencyScore);
    const session = writableSession(ctx, args.sessionId);
    if (session.requestId !== undefined) return; // Retry cannot create a second request.
    coordinates(args.latitude, args.longitude);
    if (!ctx.db.disaster.id.find(args.disasterId)?.active)
      fail("Active disaster required");
    const request = ctx.db.assistanceRequest.insert({
      id: 0n,
      userId: session.userId,
      disasterId: args.disasterId,
      needs: text(args.needs, 2000),
      latitude: args.latitude,
      longitude: args.longitude,
      urgencyScore: args.urgencyScore,
      urgent: args.urgencyScore >= 4,
      queuePosition: 0,
      status: "open",
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    });
    ensureReview(ctx, request);
    ctx.db.intakeSession.id.update({ ...session, requestId: request.id });
    recomputeQueuePositions(ctx);
  },
);
export const visibleIntakeSessions = db.view(
  { public: true },
  t.array(intakeSession.rowType),
  (ctx) => sessionsFor(ctx),
);
export const visibleIntakeMessages = db.view(
  { public: true },
  t.array(intakeMessage.rowType),
  (ctx) =>
    sessionsFor(ctx).flatMap((s) => [
      ...ctx.db.intakeMessage.sessionId.filter(s.id),
    ]),
);
export const visibleRequestReviews = db.view(
  { public: true },
  t.array(requestReview.rowType),
  (ctx) => {
    if (staff(ctx)) return [...ctx.db.requestReview.iter()];
    const u = accountFor(ctx);
    const ids = new Set(
      sessionsFor(ctx).flatMap((s) =>
        s.requestId === undefined ? [] : [s.requestId],
      ),
    );
    if (u)
      for (const request of ctx.db.assistanceRequest.userId.filter(u.id))
        ids.add(request.id);
    return [...ids].flatMap((id) => {
      const review = ctx.db.requestReview.requestId.find(id);
      return review ? [review] : [];
    });
  },
);
const matchResult = t.object("ResourceMatchResult", {
  resource: resource.rowType,
  distanceKm: t.f64(),
});
export const findMatchingResources = db.view(
  { public: true },
  {
    requestId: t.u64(),
    kind: t.string(),
    quantity: t.u32(),
    maxDistanceKm: t.u32(),
  },
  t.array(matchResult),
  (ctx, args) => {
    if (
      !staff(ctx) &&
      !(
        ctx.db.access.identity.find(ctx.sender)?.role === "ai" &&
        [...ctx.db.intakeSession.owner.filter(ctx.sender)].some(
          (s) => s.requestId === args.requestId,
        )
      )
    )
      return [];
    const request = ctx.db.assistanceRequest.id.find(args.requestId);
    if (
      !request ||
      !["open", "in_progress"].includes(request.status) ||
      !args.quantity ||
      !args.maxDistanceKm ||
      args.maxDistanceKm > 500
    )
      return [];
    const rad = (n: number) => (n * Math.PI) / 180;
    return [...ctx.db.resource.iter()]
      .filter(
        (r) =>
          r.kind === args.kind &&
          r.available &&
          r.capacity - r.allocated >= args.quantity,
      )
      .map((r) => {
        const a =
          Math.sin(rad(r.latitude - request.latitude) / 2) ** 2 +
          Math.cos(rad(request.latitude)) *
            Math.cos(rad(r.latitude)) *
            Math.sin(rad(r.longitude - request.longitude) / 2) ** 2;
        return {
          resource: r,
          distanceKm:
            6371 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, a)))),
        };
      })
      .filter((r) => r.distanceKm <= args.maxDistanceKm)
      .sort(
        (a, b) =>
          a.distanceKm - b.distanceKm ||
          (a.resource.id < b.resource.id ? -1 : 1),
      )
      .slice(0, 20);
  },
);
export const seedDemoPhoneNumbers = db.reducer((ctx) => {
  admin(ctx);

  const users = [...ctx.db.user.iter()]
    .filter((u) => u.fictional && !u.phone)
    .sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    );

  for (const user of users) {
    const phone = `+1202555${String(1000 + Number(user.id) % 9000).padStart(4, "0")}`;

    ctx.db.user.id.update({
      ...user,
      phone,
    });
  }
});