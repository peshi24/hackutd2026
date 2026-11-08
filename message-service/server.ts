import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { DbConnection } from "../backend/client/module_bindings";

const uri = process.env.SPACETIME_URI ?? "http://127.0.0.1:3000";
const database = process.env.SPACETIME_DB ?? "local";
const token = process.env.SPACETIME_TOKEN;
const conversationId = process.env.SPACETIME_CONVERSATION_ID
  ? BigInt(process.env.SPACETIME_CONVERSATION_ID)
  : 1n;
const recipientId = process.env.SPACETIME_RECIPIENT_ID
  ? BigInt(process.env.SPACETIME_RECIPIENT_ID)
  : 1n;
const senderId = process.env.SPACETIME_SENDER_ID
  ? BigInt(process.env.SPACETIME_SENDER_ID)
  : 1n;

const connection = DbConnection.builder()
  .withUri(uri)
  .withDatabaseName(database)
  .withToken(token)
  .withAutomaticReconnect()
  .build();

console.log("Connected to SpacetimeDB backend");

const app = await Spectrum({
  projectId: process.env.PHOTON_PROJECT_ID!,
  projectSecret: process.env.PHOTON_PROJECT_SECRET!,
  providers: [imessage.config()],
});

console.log("Photon Spectrum agent running...");

for await (const [space, message] of app.messages) {
  if (message.content.type !== "text") continue;

  console.log(
    `[Disaster SMS Received] From ${message.sender?.id}: "${message.content.text}"`,
  );

  const text = message.content.text.trim();
  if (!text) continue;

  try {
    await connection.reducers.saveMessage({
      conversationId,
      recipientId,
      senderId,
      channel: "sms",
      content: text,
    });

    await message.reply(
      "State Farm Aid: We received your request. Are you looking for (1) Hotels, (2) Aid Trailers, or (3) Transport?",
    );
  } catch (error) {
    console.error("Failed to save SMS message:", error);
    await message.reply(
      "State Farm Aid: We received your message, but we could not save it to the case system right now.",
    );
  }
}
