// test-chat.ts
/*import { getDisasterResponse } from "./chat";

async function runTest() {
  const mockUserId = "+15551234567";

  console.log("\n--- Turn 1: Initial Contact ---");
  const turn1 = await getDisasterResponse(mockUserId, "Help, there was a flood in my area!");
  console.log("User Message:", turn1.user_message);
  console.log("Session Notes:", turn1.session_notes);

  console.log("\n--- Turn 2: Providing Details (Testing Memory) ---");
  const turn2 = await getDisasterResponse(mockUserId, "I am safe on the 2nd floor, but I need food and water.");
  console.log("User Message:", turn2.user_message);
  console.log("Session Notes:", turn2.session_notes);

  console.log("\n--- Turn 3: Answering Next Question ---");
  const turn3 = await getDisasterResponse(mockUserId, "Yes, I can reach a boat if it comes near.");
  console.log("User Message:", turn3.user_message);
  console.log("Session Notes:", turn3.session_notes);
}

runTest(); */
// test-chat.ts
import OpenAI from "openai";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({
  path: path.resolve(process.cwd(), ".env"),
});

console.log("API key loaded:", Boolean(process.env.OPENAI_API_KEY));

import {
  getDisasterResponse,
  resetDisasterSession,
} from "./chat";

console.log(
  "API key loaded:",
  Boolean(process.env.OPENAI_API_KEY)
);

async function runTest() {
  const mockUserId = "hackathon-demo-user-001";

  // Start with a clean session
  resetDisasterSession(mockUserId);

  try {
    console.log("\n========================================");
    console.log(" DISASTER RESPONSE AI - TEST");
    console.log("========================================");

    console.log("\n--- Turn 1: Initial Contact ---");

    const turn1 = await getDisasterResponse(
      mockUserId,
      "Help, there was a flood in my area!"
    );

    console.log("User Message:", turn1.user_message);
    console.log("Session Notes:", turn1.session_notes);

    console.log("\n--- Turn 2: Providing Details (Testing Memory) ---");

    const turn2 = await getDisasterResponse(
      mockUserId,
      "I am safe on the 2nd floor, but I need food and water."
    );

    console.log("User Message:", turn2.user_message);
    console.log("Session Notes:", turn2.session_notes);

    console.log("\n--- Turn 3: Answering Next Question ---");

    const turn3 = await getDisasterResponse(
      mockUserId,
      "Yes, I can reach a boat if it comes near."
    );

    console.log("User Message:", turn3.user_message);
    console.log("Session Notes:", turn3.session_notes);

    console.log("\n--- Test Complete ---");
    console.log("All three conversation turns completed.");

  } catch (error) {
    console.error("\nTest failed:", error);
    process.exitCode = 1;
  } finally {
    resetDisasterSession(mockUserId);
  }
}

runTest();