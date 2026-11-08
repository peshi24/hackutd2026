import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const windows = process.platform === "win32";
const installed = join(
  process.env.LOCALAPPDATA ?? "",
  "SpacetimeDB",
  "spacetime.exe",
);
const cli =
  process.env.SPACETIME_CLI ??
  (windows && existsSync(installed) ? installed : "spacetime");
const mode = process.argv[2] ?? "dev";
if (!["dev", "test"].includes(mode)) throw new Error("Expected dev or test");
const server = "http://127.0.0.1:3107";
const database =
  mode === "test" ? `hackutd-test-${Date.now()}` : "hackutd-disaster-dev";
const env = {
  ...process.env,
  ENABLE_DEV_SEED: "true",
  SPACETIME_CLI: cli,
  SPACETIME_TEST_URI: server,
  SPACETIME_TEST_DATABASE: database,
  ...(mode === "test" ? { FOLLOW_UP_SECONDS: "2" } : {}),
};
const children = new Set();
let stopping = false;

function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.pid) continue;
    if (windows)
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    else child.kill("SIGTERM");
  }
}
process.on("SIGINT", () => {
  stop();
  process.exit(130);
});
process.on("SIGTERM", () => {
  stop();
  process.exit(143);
});
process.on("exit", stop);

function launch(command, args, stdio = "inherit") {
  const child = spawn(command, args, {
    cwd: root,
    env,
    stdio,
    windowsHide: true,
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}
function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = launch(command, args);
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} exited with ${code}`)),
    );
  });
}
function ping() {
  return (
    spawnSync(cli, ["server", "ping", server], {
      cwd: root,
      env,
      stdio: "ignore",
      windowsHide: true,
      timeout: 2000,
    }).status === 0
  );
}

try {
  const version = spawnSync(cli, ["--version"], {
    cwd: root,
    stdio: "ignore",
    windowsHide: true,
  });
  if (version.status !== 0)
    throw new Error(
      "Install the SpacetimeDB CLI: https://spacetimedb.com/install",
    );
  if (!existsSync(join(root, "spacetimedb/node_modules/typescript"))) {
    throw new Error(
      "Run npm ci and npm ci --prefix spacetimedb once before starting.",
    );
  }
  if (!ping()) {
    console.log("Starting local SpacetimeDB on port 3107...");
    const child = launch(
      cli,
      [
        "start",
        "--listen-addr",
        "127.0.0.1:3107",
        "--data-dir",
        join(root, ".spacetime"),
        "--non-interactive",
      ],
      "ignore",
    );
    let startupError;
    child.once("error", (error) => {
      startupError = error;
    });
    for (let i = 0; i < 40 && !ping(); i++) {
      if (startupError) throw startupError;
      if (child.exitCode !== null)
        throw new Error(
          "Local server could not start. Check port 3107 and directory permissions.",
        );
      await delay(250);
    }
    if (!ping()) throw new Error("Local server startup timed out.");
  } else console.log("Reusing local SpacetimeDB on port 3107.");

  await run(cli, [
    "publish",
    database,
    "--server",
    server,
    "--module-path",
    "spacetimedb",
    "--no-config",
    "--delete-data=never",
    "--yes=skip-login",
  ]);
  if (mode === "test") {
    await run(process.execPath, [
      "node_modules/typescript/bin/tsc",
      "-p",
      "client/tsconfig.test.json",
    ]);
    await run(process.execPath, ["tests/integration.mjs"]);
    await run(process.execPath, ["tests/intake.mjs"]);
    await run(process.execPath, ["tests/outreach.mjs"]);
  } else {
    const seed = spawnSync(
      cli,
      ["call", database, "seed_development", "--server", server, "--no-config"],
      {
        cwd: root,
        env,
        encoding: "utf8",
        windowsHide: true,
      },
    );
    if (
      seed.status !== 0 &&
      !`${seed.stdout}${seed.stderr}`.includes(
        "Development data already seeded",
      )
    ) {
      throw new Error(seed.stderr || seed.stdout || "Seeding failed");
    }
    console.log(
      `Development database: ${database}\nServer: ${server}\nDemo data ready. Watching for changes; Ctrl+C to stop.`,
    );
    await run(cli, [
      "call",
      database,
      "initialize_request_reviews",
      "--server",
      server,
      "--no-config",
    ]);
    await run(cli, [
      "call",
      database,
      "seed_updated_development",
      "--server",
      server,
      "--no-config",
    ]);
    await run(cli, [
      "dev",
      database,
      "--server",
      server,
      "--module-path",
      "spacetimedb",
      "--module-bindings-path",
      "client/module_bindings",
      "--client-lang",
      "typescript",
      "--server-only",
      "--no-config",
      "--delete-data=never",
      "--yes",
    ]);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  stop();
}
