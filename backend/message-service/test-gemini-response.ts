// chat-openai.ts  (OpenAI only)
// Goal: consistent reply time.
//   1. send the request right away
//   2. if no answer after HEDGE_MS, send a duplicate (same model, or OPENAI_MODEL_2 if set)
//   3. first answer wins, the rest are aborted
//   4. if nothing answers by DEADLINE_MS, send a useful canned SMS
//
// Setup:  npm i openai
// Env:    OPENAI_API_KEY   (required)
//         OPENAI_MODEL     (required; use a NON-reasoning model)
//         OPENAI_MODEL_2   (optional; used for the 2nd hedge instead of repeating the first)
//         OPENAI_SERVICE_TIER (optional; only set if your account supports it, e.g. "priority")
//         HEDGE_MS (default 1500), DEADLINE_MS (default 6000)
//
// Find valid model IDs:  npx tsx chat-openai.ts --list-models

import OpenAI from "openai";

const HEDGE_MS = Number(process.env.HEDGE_MS ?? 1500);
const DEADLINE_MS = Number(process.env.DEADLINE_MS ?? 6000);
const MAX_HISTORY = 20; // keep even so history always starts on a user turn

export const FALLBACK_MESSAGE =
  "Your request is logged and help is being coordinated. Reply with your needs: " +
  "1) Evacuation 2) Medical 3) Food/Water 4) Shelter. If life-threatening, call 911.";

const SYSTEM_PROMPT = `
# ROLE AND PURPOSE
You are State Farm's Emergency Response AI, deployed during natural disasters. Your purpose is to assess life safety, gather critical needs, provide location-based aid info, and triage users for emergency dispatch.

# TONE & STYLE RULES
1. Extremely concise: Keep responses under 2-3 short sentences whenever possible. Disasters cause cognitive overload; users need fast, clear information.
2. Calm, clear, and reassuring: Validate their situation without using empty filler or overly verbose corporate empathy.
3. Plain language: Use short words and clear structure. Avoid complex jargon.

# TASK FLOW & RULES

## STEP 1: SAFETY & IMMEDIATE AID
- Ask if the user is safe right now.
- If immediate care is needed, present nearest available aid locations using supplied context data.
- Determine if the user can reach the aid independently.

## STEP 2: DISPATCH & NEED ASSESSMENT (If trapped or unable to travel)
- Confirm dispatch of emergency help.
- Identify the exact list of immediate core needs: Evacuation, Medical/Medication, Food/Water, Shelter/Hotel, Transport.
- Keep follow-up confirmations tight (e.g., "Understood. You need evacuation, food, and medication refills.").

## STEP 3: PROVIDE ETA & SAFETY INSTRUCTIONS
- Give a clear estimated time of arrival (ETA) or queue status.
- Provide 1 brief, actionable safety instruction relevant to their state (e.g., stay on high ground, keep phone on low-power mode).

## STEP 4: ROUTING & TRIAGE (Human Escalation)
- Check connectivity/signal metadata if available.
- If the user shows high panic/distress AND cell signal is stable: Seamlessly offer or trigger a live phone transfer to a State Farm / Emergency agent.
- If signal is weak: Keep them on low-bandwidth text messaging.

# OUTPUT REQUIREMENTS
Reply with ONLY the SMS text to send to the user. No JSON, no markdown, no preamble.
`;

// ---------- client ----------

// maxRetries: 0 is important. The SDK silently retries 429/5xx/timeouts with backoff by default,
// which can look like random long waits. We do our own hedging instead.
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 0,
  timeout: DEADLINE_MS,
});

const OPENAI_API_KEY="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"

const MODEL = process.env.OPENAI_MODEL;
const MODEL_2 = process.env.OPENAI_MODEL_2 ?? MODEL;
const SERVICE_TIER = process.env.OPENAI_SERVICE_TIER;

if (!process.argv.includes("--list-models") && (!OPENAI_API_KEY || !MODEL)) {
  throw new Error("Set OPENAI_API_KEY and OPENAI_MODEL (run with --list-models to see options).");
}

type Turn = { role: "user" | "assistant"; text: string };

const histories = new Map<string, Turn[]>();
const notesByUser = new Map<string, string>(); // swap for your Notes DB

async function callModel(model: string, history: Turn[], signal: AbortSignal): Promise<string> {
  const res = await client.chat.completions.create(
    {
      model,
      max_completion_tokens: 200,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...history.map((t) => ({ role: t.role, content: t.text })),
      ],
      ...(SERVICE_TIER ? { service_tier: SERVICE_TIER as any } : {}),
    },
    { signal }
  );
  return res.choices[0]?.message?.content ?? "";
}

// Attempt order: primary now, then a duplicate every HEDGE_MS.
const attempts = [
  { label: `${MODEL}#1`, model: MODEL! },
  { label: `${MODEL_2}#2`, model: MODEL_2! },
  { label: `${MODEL}#3`, model: MODEL! },
];

// ---------- hedged request ----------

function hedged(history: Turn[]): Promise<{ text: string; label: string; ms: number }> {
  return new Promise((resolve, reject) => {
    const ctrls = attempts.map(() => new AbortController());
    const started = attempts.map(() => false);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let settled = false;
    let failed = 0;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      timers.forEach(clearTimeout);
      ctrls.forEach((c) => c.abort()); // cancel the losers
      fn();
    };

    const startNext = () => {
      const i = started.indexOf(false);
      if (i !== -1) start(i);
    };

    const start = (i: number) => {
      if (settled || started[i]) return;
      started[i] = true;
      const t0 = performance.now();

      const onFail = (reason: unknown) => {
        if (settled) return;
        const msg = (reason as any)?.status ?? (reason as any)?.message ?? reason;
        console.warn(`[${attempts[i].label}] failed after ${(performance.now() - t0).toFixed(0)}ms:`, msg);
        failed++;
        if (failed === attempts.length) finish(() => reject(new Error("all attempts failed")));
        else startNext(); // a failure starts the next attempt immediately
      };

      callModel(attempts[i].model, history, ctrls[i].signal)
        .then((raw) => {
          if (settled) return;
          const text = raw.trim();
          if (!text) return onFail("empty response");
          finish(() => resolve({ text, label: attempts[i].label, ms: performance.now() - t0 }));
        })
        .catch(onFail);
    };

    start(0);
    for (let i = 1; i < attempts.length; i++) {
      timers.push(setTimeout(() => start(i), i * HEDGE_MS));
    }
    timers.push(setTimeout(() => finish(() => reject(new Error(`deadline ${DEADLINE_MS}ms`))), DEADLINE_MS));
  });
}

// ---------- notes (off the reply path) ----------

async function updateNotes(userId: string, userText: string, reply: string) {
  const prev = notesByUser.get(userId) ?? "";
  const res = await client.chat.completions.create({
    model: MODEL!,
    max_completion_tokens: 250,
    messages: [
      {
        role: "user",
        content:
          `Previous notes:\n${prev}\n\nUser said: ${userText}\nWe replied: ${reply}\n\n` +
          `Return updated notes as a terse summary: safety status, location, needs, rejected options, flags.`,
      },
    ],
  });
  notesByUser.set(userId, res.choices[0]?.message?.content?.trim() || prev);
  // TODO: persist to your Notes DB here
}

// ---------- public API ----------

export interface DisasterResponse {
  user_message: string;
  session_notes: string;
}

export async function getDisasterResponse(
  userId: string,
  userText: string,
  additionalContext: Record<string, unknown> = {}
): Promise<DisasterResponse> {
  const input = Object.keys(additionalContext).length
    ? `[CONTEXT: ${JSON.stringify(additionalContext)}]\nUser Message: ${userText}`
    : userText;

  const prior = histories.get(userId) ?? [];
  const history: Turn[] = [...prior, { role: "user", text: input }];
  const t0 = performance.now();

  try {
    const { text, label, ms } = await hedged(history);
    console.log(`[reply] ${label} won in ${ms.toFixed(0)}ms (total ${(performance.now() - t0).toFixed(0)}ms)`);

    const assistantTurn: Turn = { role: "assistant", text };            // <-- changed
    histories.set(userId, [...history, assistantTurn].slice(-MAX_HISTORY)); // <-- changed

    updateNotes(userId, userText, text).catch(console.error); // not awaited
    return { user_message: text, session_notes: notesByUser.get(userId) ?? "" };
  } catch (err: any) {
    console.error(`[reply] FALLBACK after ${(performance.now() - t0).toFixed(0)}ms:`, err.message);

    const fallbackTurn: Turn = { role: "assistant", text: FALLBACK_MESSAGE };   // <-- changed
    histories.set(userId, [...history, fallbackTurn].slice(-MAX_HISTORY));      // <-- changed

    return { user_message: FALLBACK_MESSAGE, session_notes: notesByUser.get(userId) ?? "" };
  }
}

// Call at server start (and optionally every ~60s) so the first real request
// doesn't pay for connection setup.
export async function warmup() {
  await callModel(MODEL!, [{ role: "user", text: "ping" }], AbortSignal.timeout(DEADLINE_MS)).catch(() => {});
}

// ---------- helper: list models ----------

if (process.argv.includes("--list-models")) {
  const page = await client.models.list();
  for await (const m of page) console.log(m.id);
}