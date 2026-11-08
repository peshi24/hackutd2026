import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { getDisasterResponse } from "./chat";

console.log("Loaded Project ID:", process.env.PHOTON_PROJECT_ID);

const app = await Spectrum({
  projectId: process.env.PHOTON_PROJECT_ID!,
  projectSecret: process.env.PHOTON_PROJECT_SECRET!,
  providers: [imessage.config()],
});

console.log("Photon Spectrum agent running...");

for await (const [space, message] of app.messages) {
  if (message.content.type === "text") {
    const userId = message.sender?.id ?? "unknown_user";
    const incomingText = message.content.text;
    
    console.log(`[SMS Received] From ${userId}: "${incomingText}"`);

    // TODO: Save incoming message to your Messages Database here

    // Get response and notes from the persistent per-user Gemini session
    const { user_message, session_notes } = await getDisasterResponse(userId, incomingText);

    // TODO: Save outgoing 'user_message' to your Messages Database here
    // TODO: Upsert/save 'session_notes' into your Notes Database for this user session

    // Reply back to the user over SMS
    await message.reply(user_message);
    console.log(`[SMS Sent] To ${userId}: "${user_message}" | [Notes Updated]: ${session_notes}`);
  }
}
