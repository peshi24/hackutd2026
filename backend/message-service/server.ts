import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";

console.log("Loaded Project ID:", process.env.PHOTON_PROJECT_ID);

const app = await Spectrum({
  projectId: process.env.PHOTON_PROJECT_ID!,
  projectSecret: process.env.PHOTON_PROJECT_SECRET!,
  providers: [imessage.config()],
});

console.log("Photon Spectrum agent running...");

for await (const [space, message] of app.messages) {
  if (message.content.type === "text") {
    console.log(`[Disaster SMS Received] From ${message.sender?.id}: "${message.content.text}"`);

    // Reply instantly back to the sender
    await message.reply("State Farm Aid: We received your request. Are you looking for (1) Hotels, (2) Aid Trailers, or (3) Transport?");
  }
}
