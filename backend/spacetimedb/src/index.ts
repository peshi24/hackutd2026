import {
  schema,
  table,
  t,
  SenderError,
  type InferSchema,
  type ReducerCtx,
} from "spacetimedb/server";

const user = table(
  {
    name: "user",
    indexes: [
      { accessor: "identity", algorithm: "btree", columns: ["identity"] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    identity: t.option(t.identity()),
    name: t.string(),
    phone: t.option(t.string()),
    role: t.string(),
    fictional: t.bool(),
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
  },
  {
    env: { ENABLE_DEV_SEED: t.string().optional() },
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
}
function integration(ctx: Ctx) {
  if (ctx.db.access.identity.find(ctx.sender)?.role !== "integration")
    fail("Trusted integration required");
}
function text(value: string, max: number) {
  const result = value.trim();
  if (!result || result.length > max)
    fail(`Text must contain 1-${max} characters`);
  return result;
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
  const row = [...ctx.db.user.identity.filter(ctx.sender)][0];
  if (!row) fail("Register a profile first");
  return row;
}
function release(ctx: Ctx, requestId: bigint) {
  for (const a of ctx.db.resourceAssignment.requestId.filter(requestId)) {
    if (!a.active) continue;
    const r = ctx.db.resource.id.find(a.resourceId);
    if (!r || r.allocated < a.quantity) fail("Allocation invariant violated");
    ctx.db.resource.id.update({ ...r, allocated: r.allocated - a.quantity });
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
    if (!["responder", "integration", "none"].includes(args.role))
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
    if ([...ctx.db.user.identity.filter(ctx.sender)].length)
      fail("Profile already exists");
    ctx.db.user.insert({
      id: 0n,
      identity: ctx.sender,
      name: text(args.name, 100),
      phone: args.phone === undefined ? undefined : text(args.phone, 32),
      role:
        ctx.db.access.identity.find(ctx.sender)?.role === "responder"
          ? "responder"
          : "resident",
      fictional: false,
    });
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
export const createAssistanceRequest = db.reducer(
  {
    userId: t.option(t.u64()),
    disasterId: t.u64(),
    needs: t.string(),
    latitude: t.f64(),
    longitude: t.f64(),
    urgent: t.bool(),
  },
  (ctx, args) => {
    coordinates(args.latitude, args.longitude);
    let userId: bigint;
    if (args.userId !== undefined) {
      integration(ctx);
      userId = args.userId;
    } else userId = currentUser(ctx).id;
    if (!ctx.db.user.id.find(userId)) fail("Resident not found");
    if (!ctx.db.disaster.id.find(args.disasterId)?.active)
      fail("Active disaster required");
    ctx.db.assistanceRequest.insert({
      ...args,
      id: 0n,
      userId,
      needs: text(args.needs, 2000),
      status: "open",
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    });
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
      release(ctx, r.id);
    ctx.db.assistanceRequest.id.update({
      ...r,
      status: args.status,
      updatedAt: ctx.timestamp,
    });
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

export const myProfile = db.view(
  { public: true },
  t.array(user.rowType),
  (ctx) => [...ctx.db.user.identity.filter(ctx.sender)],
);
export const visibleUsers = db.view(
  { public: true },
  t.array(user.rowType),
  (ctx) =>
    ctx.db.settings.id.find(1)?.admin.equals(ctx.sender) ||
    ctx.db.access.identity.find(ctx.sender)?.role === "responder"
      ? [...ctx.db.user.iter()]
      : [],
);
export const visibleRequests = db.view(
  { public: true },
  t.array(assistanceRequest.rowType),
  (ctx) => {
    if (
      ctx.db.settings.id.find(1)?.admin.equals(ctx.sender) ||
      ctx.db.access.identity.find(ctx.sender)?.role === "responder"
    )
      return [...ctx.db.assistanceRequest.iter()];
    const u = [...ctx.db.user.identity.filter(ctx.sender)][0];
    return u ? [...ctx.db.assistanceRequest.userId.filter(u.id)] : [];
  },
);
export const visibleResources = db.view(
  { public: true },
  t.array(resource.rowType),
  (ctx) =>
    ctx.db.settings.id.find(1)?.admin.equals(ctx.sender) ||
    ctx.db.access.identity.find(ctx.sender)?.role === "responder"
      ? [...ctx.db.resource.iter()]
      : [],
);
export const visibleAssignments = db.view(
  { public: true },
  t.array(resourceAssignment.rowType),
  (ctx) => {
    if (
      ctx.db.settings.id.find(1)?.admin.equals(ctx.sender) ||
      ctx.db.access.identity.find(ctx.sender)?.role === "responder"
    )
      return [...ctx.db.resourceAssignment.iter()];
    const u = [...ctx.db.user.identity.filter(ctx.sender)][0];
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
    const u = [...ctx.db.user.identity.filter(ctx.sender)][0];
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
    name: "SIMULATION ONLY: Richardson tornado",
    kind: "tornado",
    latitude: 32.9483,
    longitude: -96.7299,
    active: true,
    simulated: true,
    createdAt: ctx.timestamp,
  });
  const needs = [
    "Temporary hotel room",
    "Trailer shelter",
    "Accessible transportation",
    "Food parcels",
    "Drinking water",
  ];
  for (let i = 0; i < 10; i++) {
    const u = ctx.db.user.insert({
      id: 0n,
      identity: undefined,
      name: `Fictional Resident ${i + 1}`,
      phone: undefined,
      role: "resident",
      fictional: true,
    });
    ctx.db.assistanceRequest.insert({
      id: 0n,
      userId: u.id,
      disasterId: d.id,
      needs: `SIMULATED: ${needs[i % 5]}`,
      latitude: 32.94 + i * 0.001,
      longitude: -96.75 + i * 0.002,
      urgent: i % 3 === 0,
      status: "open",
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    });
  }
  const kinds = ["hotel", "trailer", "vehicle", "food", "water"];
  const capacities = [12, 4, 8, 200, 500];
  const units = ["beds", "beds", "seats", "meal parcels", "liters"];
  for (let i = 0; i < 5; i++) {
    const org = ctx.db.organization.insert({
      id: 0n,
      name: `Fictional Richardson Relief ${i + 1}`,
      description: "SIMULATION ONLY. Not a real provider or pickup location.",
      fictional: true,
    });
    for (let j = 0; j < 4; j++) {
      const k = (i * 4 + j) % 5;
      ctx.db.resource.insert({
        id: 0n,
        organizationId: org.id,
        kind: kinds[k],
        name: `SIMULATED ${kinds[k]} ${i * 4 + j + 1}`,
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
});
