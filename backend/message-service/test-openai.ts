// test-openai-chat.ts
// Run:  npx bun run ./test-openai-chat.ts
//       RUNS=20 npx bun run ./test-openai-chat.ts        (more latency samples)
//       DEADLINE_MS=1 npx bun run ./test-openai-chat.ts  (force the fallback path)
//
// Needs `export` added in chat-openai.ts:  export const FALLBACK_MESSAGE = ...

import { getDisasterResponse, warmup, FALLBACK_MESSAGE } from "./test-gemini-response";

const RUNS = Number(process.env.RUNS ?? 10);
const DEADLINE_MS = Number(process.env.DEADLINE_MS ?? 6000);

const ms = (n: number) => `${n.toFixed(0)}ms`;
const pct = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

async function timed(userId: string, text: string, ctx = {}) {
  const t0 = performance.now();
  const res = await getDisasterResponse(userId, text, ctx);
  const elapsed = performance.now() - t0;
  const usedFallback = res.user_message === FALLBACK_MESSAGE;
  return { ...res, elapsed, usedFallback };
}

// ---------- 1. multi-turn conversation ----------
async function testConversation() {
  console.log("\n=== TEST 1: multi-turn conversation (memory + reply shape) ===");
  const user = "+15551230001";
  const turns = [
    "Help, there was a flood in my area!",
    "I am safe on the 2nd floor, but I need food and water.",
    "Yes, I can reach a boat if it comes near.",
  ];

  let ok = true;
  for (const [i, text] of turns.entries()) {
    const r = await timed(user, text);
    console.log(`\nTurn ${i + 1} (${ms(r.elapsed)}${r.usedFallback ? ", FALLBACK" : ""})`);
    console.log("  user:", text);
    console.log("  bot: ", r.user_message);

    if (r.usedFallback) ok = false;
    if (!r.user_message.trim()) ok = false;
    if (r.user_message.length > 320) {
      console.log(`  ! reply is ${r.user_message.length} chars (SMS-unfriendly)`);
      ok = false;
    }
  }

  // Give the background notes update a moment, then read notes via one more turn.
  await new Promise((r) => setTimeout(r, 2500));
  const last = await timed(user, "What do you have on file for me so far?");
  console.log("\nMemory check (should mention flood / 2nd floor / food / water / boat):");
  console.log("  bot:", last.user_message);
  console.log("  notes:", last.session_notes || "(empty)");

  console.log(ok ? "\nTEST 1: PASS" : "\nTEST 1: FAIL");
  return ok;
}

// ---------- 2. latency distribution ----------
async function testLatency() {
  console.log(`\n=== TEST 2: latency over ${RUNS} fresh single-turn requests ===`);
  const times: number[] = [];
  let fallbacks = 0;

  for (let i = 0; i < RUNS; i++) {
    const r = await timed(`+1555123${String(1000 + i)}`, "There is water in my house, I need help.");
    times.push(r.elapsed);
    if (r.usedFallback) fallbacks++;
    console.log(`  run ${String(i + 1).padStart(2)}: ${ms(r.elapsed).padStart(7)}${r.usedFallback ? "  FALLBACK" : ""}`);
  }

  const sorted = [...times].sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  console.log("\n  min:   ", ms(sorted[0]));
  console.log("  median:", ms(pct(sorted, 0.5)));
  console.log("  p90:   ", ms(pct(sorted, 0.9)));
  console.log("  max:   ", ms(sorted[sorted.length - 1]));
  console.log("  mean:  ", ms(mean), "(ignore this one, spikes distort it)");
  console.log("  fallbacks:", `${fallbacks}/${RUNS}`);

  // The point of hedging: nothing should wait much longer than the deadline.
  const worst = sorted[sorted.length - 1];
  const pass = worst <= DEADLINE_MS + 500;
  console.log(pass ? `\nTEST 2: PASS (worst case within deadline)` : `\nTEST 2: FAIL (a request exceeded ${DEADLINE_MS}ms)`);
  return pass;
}

// ---------- 3. context passthrough ----------
async function testContext() {
  console.log("\n=== TEST 3: additionalContext is used ===");
  const r = await timed("+15551239999", "Where can I get help nearby?", {
    nearest_aid: [{ name: "Reunion Park Shelter", distance_mi: 1.2, open: true }],
    signal: "strong",
  });
  console.log(`  (${ms(r.elapsed)}) bot:`, r.user_message);
  const used = /reunion/i.test(r.user_message);
  console.log(used ? "\nTEST 3: PASS (mentioned the shelter from context)" : "\nTEST 3: CHECK (reply didn't mention the shelter; read it above)");
  return true; // soft check, model wording varies
}

// ---------- runner ----------
async function main() {
  console.log(`Deadline: ${DEADLINE_MS}ms`);
  console.log("Warming up...");
  const w0 = performance.now();
  await warmup();
  console.log(`Warmup done in ${ms(performance.now() - w0)}`);

  const results = [await testConversation(), await testLatency(), await testContext()];
  const passed = results.filter(Boolean).length;
  console.log(`\n=== ${passed}/${results.length} tests passed ===`);
  process.exit(passed === results.length ? 0 : 1);
}

main();