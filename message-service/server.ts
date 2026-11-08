/*
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

const generateDisasterResponse = async (incomingText: string, senderPhone?: string): Promise<string> => {
  const query = incomingText.toLowerCase();

  // Example of handling complex multi-step choices or keywords
  if (query.includes("1") || query.includes("hotel")) {
    return "State Farm Aid: You selected Hotels. Please reply with your current zip code or city so we can find available lodging near you.";
  } else if (query.includes("2") || query.includes("aid")) {
    return "State Farm Aid: You selected Aid Trailers. Food, water, and emergency kits are stationed at community centers. Reply 'LOC' for the nearest site.";
  } else if (query.includes("3") || query.includes("transport")) {
    return "State Farm Aid: You selected Transport. Please reply with the number of people needing evacuation assistance.";
  }

  // Default menu if input is unrecognized
  return "State Farm Aid: We received your request. Are you looking for (1) Hotels, (2) Aid Trailers, or (3) Transport?";
};


for await (const [space, message] of app.messages) {
  if (message.content.type !== "text") continue;

  console.log(
    `[Disaster SMS Received] From ${message.sender?.id}: "${message.content.text}"`,
  );

  const text = message.content.text.trim();

  const incomingText = message.content.text.trim();
  const senderPhone = message.sender?.id;

  if (!incomingText) continue;

  try {
    await connection.reducers.saveMessage({
      conversationId,
      recipientId,
      senderId,
      channel: "sms",
      content: text,
    });

    await message.reply("State Farm Aid: We received your request. Are you looking for (1) Hotels, (2) Aid Trailers, or (3) Transport?",);
    const replyText = await generateDisasterResponse(incomingText, senderPhone);

    // 3. Send response back to user
    await message.reply(replyText);
  } catch (error) {
    console.error("Failed to save SMS message:", error);
    await message.reply(
      "State Farm Aid: We received your message, but we could not save it to the case system right now.",
    );
  }
}
*/