import { schema, table, t } from 'spacetimedb/server';

// 1. Define tables using SpacetimeDB's schema builder
const session = table(
  { name: 'sessions', public: true },
  {
    senderId: t.string().primaryKey(),
    disasterType: t.string(),
    activeState: t.string(),
    lastUpdated: t.u64(),
  }
);

const message = table(
  { name: 'messages', public: true },
  {
    messageId: t.string().primaryKey(),
    senderId: t.string(),
    direction: t.string(), // 'inbound' | 'outbound'
    content: t.string(),
    timestamp: t.u64(),
  }
);

const keyNote = table(
  { name: 'key_notes', public: true },
  {
    noteId: t.string().primaryKey(),
    senderId: t.string(),
    category: t.string(),
    note: t.string(),
    loggedAt: t.u64(),
  }
);

// 2. Export the database schema bundle
const dbSchema = schema({ session, message, keyNote });
export default dbSchema;

// 3. Define Reducers to safely mutate database state
export const logMessage = dbSchema.reducer(
  {
    messageId: t.string(),
    senderId: t.string(),
    direction: t.string(),
    content: t.string(),
  },
  (ctx, args) => {
    ctx.db.message.insert({
      messageId: args.messageId,
      senderId: args.senderId,
      direction: args.direction,
      content: args.content,
      timestamp: BigInt(Date.now()),
    });
  }
);

export const addKeyNote = dbSchema.reducer(
  {
    noteId: t.string(),
    senderId: t.string(),
    category: t.string(),
    note: t.string(),
  },
  (ctx, args) => {
    ctx.db.keyNote.insert({
      noteId: args.noteId,
      senderId: args.senderId,
      category: args.category,
      note: args.note,
      loggedAt: BigInt(Date.now()),
    });
  }
);