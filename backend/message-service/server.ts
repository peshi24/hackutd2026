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
    const incomingText = message.content.text;
    console.log(`[Disaster SMS Received] From ${message.sender?.id}: "${incomingText}"`);

    const replyText = await getDisasterResponse(incomingText);
    // Reply instantly back to the sender
    await message.reply(replyText);
  }
}
