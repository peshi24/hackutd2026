import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [database, file, server = "maincloud"] = process.argv.slice(2);
if (!database || !file)
  throw new Error(
    "Usage: node scripts/prepopulate-accounts.mjs DATABASE accounts.local.json [SERVER]",
  );
const accounts = JSON.parse(readFileSync(file, "utf8"));
if (!Array.isArray(accounts) || !accounts.length)
  throw new Error("Expected a non-empty array of accounts");
// Validate every entry before issuing any writes.
for (const account of accounts) {
  if (
    typeof account.email !== "string" ||
    typeof account.name !== "string" ||
    !["resident", "responder"].includes(account.role) ||
    (account.phone !== undefined && typeof account.phone !== "string") ||
    (account.userId !== undefined &&
      (typeof account.userId !== "string" || !/^\d+$/.test(account.userId)))
  ) {
    throw new Error(
      "Each account needs email, name, resident/responder role, optional phone, and optional userId as a decimal string",
    );
  }
}
const installed = join(
  process.env.LOCALAPPDATA ?? "",
  "SpacetimeDB",
  "spacetime.exe",
);
const cli =
  process.env.SPACETIME_CLI ??
  (process.platform === "win32" && existsSync(installed)
    ? installed
    : "spacetime");
for (const [index, account] of accounts.entries()) {
  const result = spawnSync(
    cli,
    [
      "call",
      database,
      "prepopulate_demo_account",
      account.userId === undefined
        ? '{"none":[]}'
        : `{"some":${BigInt(account.userId)}}`,
      JSON.stringify(account.email),
      JSON.stringify(account.name),
      JSON.stringify(account.role),
      account.phone === undefined
        ? '{"none":[]}'
        : JSON.stringify({ some: account.phone }),
      "--server",
      server,
      "--no-config",
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.status !== 0)
    throw new Error(
      `Account ${index + 1} failed: ${result.stderr || result.stdout || result.error}`,
    );
  console.log(`Prepared account ${index + 1}/${accounts.length}`);
}
