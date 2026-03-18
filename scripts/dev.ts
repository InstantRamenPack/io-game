import { parseArgs } from "node:util";

function parseIntegerEnv(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (rawValue === undefined) {
    return fallback;
  }

  const parsedValue = Number(rawValue);
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    console.error(
      `[dev] invalid ${name} value "${rawValue}". Expected a positive integer.`,
    );
    process.exit(1);
  }

  return parsedValue;
}

const serverPort = parseIntegerEnv("PORT", 3000);
const clientPort = parseIntegerEnv("VITE_PORT", 5173);
const clientHost = process.env.VITE_HOST ?? "127.0.0.1";
const backendTarget =
  process.env.VITE_BACKEND_TARGET ?? `http://127.0.0.1:${serverPort}`;
const bunExecutable = process.execPath;
const sharedEnv = { ...process.env };
const cliArgs = process.argv.slice(2);
const normalizedCliArgs = cliArgs.map((arg) =>
  arg === "--DEBUG_INTERPOLATION" ? "--DEBUG_INTERPOLATION=1" : arg,
);
const parsedArgs = parseArgs({
  args: normalizedCliArgs,
  options: {
    DEBUG_HITBOX: {
      type: "boolean",
    },
    DEBUG_INTERPOLATION: {
      type: "string",
    },
    DEBUG_TICK_RATE: {
      type: "string",
    },
  },
  allowPositionals: true,
  strict: false,
  tokens: true,
});
const consumedCustomArgIndexes = new Set<number>();
for (const token of parsedArgs.tokens ?? []) {
  if (token.kind !== "option") {
    continue;
  }

  if (
    token.name !== "DEBUG_HITBOX" &&
    token.name !== "DEBUG_INTERPOLATION" &&
    token.name !== "DEBUG_TICK_RATE"
  ) {
    continue;
  }

  consumedCustomArgIndexes.add(token.index);
  if (token.value !== undefined && !token.inlineValue) {
    consumedCustomArgIndexes.add(token.index + 1);
  }
}
const clientArgs = normalizedCliArgs.filter(
  (_, index) => !consumedCustomArgIndexes.has(index),
);

function ensureViteHostArg(args: string[], host: string): string[] {
  if (args.some((arg) => arg === "--host" || arg.startsWith("--host="))) {
    return args;
  }

  return ["--host", host, ...args];
}

function getStringArgValue(
  value: string | boolean | undefined,
): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseDebugTickRate(
  rawTickRate: string | undefined,
): string | undefined {
  if (rawTickRate === undefined) {
    return undefined;
  }

  const parsedTickRate = Number(rawTickRate);
  if (!Number.isFinite(parsedTickRate) || parsedTickRate <= 0) {
    console.error(
      `[dev] invalid --DEBUG_TICK_RATE value "${rawTickRate}". Expected a positive number.`,
    );
    process.exit(1);
  }

  return String(Math.floor(parsedTickRate));
}

const debugTickRate = parseDebugTickRate(
  getStringArgValue(parsedArgs.values.DEBUG_TICK_RATE),
);

function parseDebugInterpolationMode(
  rawMode: string | undefined,
): string | undefined {
  if (rawMode === undefined) {
    return process.env.VITE_DEBUG_INTERPOLATION;
  }

  if (rawMode === "1" || rawMode === "2") {
    return rawMode;
  }

  console.error(
    `[dev] invalid --DEBUG_INTERPOLATION value "${rawMode}". Expected 1 or 2.`,
  );
  process.exit(1);
}

const debugInterpolationMode = parseDebugInterpolationMode(
  getStringArgValue(parsedArgs.values.DEBUG_INTERPOLATION),
);
const enableDebugHitbox =
  parsedArgs.values.DEBUG_HITBOX === true ||
  process.env.VITE_DEBUG_HITBOX === "1";

function spawnChild(
  name: "server" | "client",
  command: string[],
  env: Record<string, string | undefined>,
): Bun.Subprocess {
  return Bun.spawn({
    cmd: command,
    cwd: process.cwd(),
    env,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "inherit",
  });
}

async function pipeOutput(
  stream: ReadableStream<Uint8Array> | undefined | null,
  prefix: string,
  write: (message: string) => void,
): Promise<void> {
  if (!stream) {
    return;
  }

  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let buffered = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffered += decoder.decode(value, { stream: true });
    let newlineIndex = buffered.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffered.slice(0, newlineIndex).replace(/\r$/, "");
      buffered = buffered.slice(newlineIndex + 1);
      write(`${prefix}${line}`);
      newlineIndex = buffered.indexOf("\n");
    }
  }

  buffered += decoder.decode();

  if (buffered.length > 0) {
    write(`${prefix}${buffered.replace(/\r$/, "")}`);
  }
}

const serverProcess = spawnChild(
  "server",
  [bunExecutable, "run", "apps/server/index.ts"],
  {
    ...sharedEnv,
    DISABLE_TLS: "1",
    PORT: String(serverPort),
    REQUIRE_CLIENT_DIST: "0",
    ...(debugTickRate ? { TICK_RATE: debugTickRate } : {}),
  },
);
const clientProcess = spawnChild(
  "client",
  [
    bunExecutable,
    "run",
    "dev:client",
    "--",
    ...ensureViteHostArg(clientArgs, clientHost),
  ],
  {
    ...sharedEnv,
    VITE_BACKEND_TARGET: backendTarget,
    VITE_HOST: clientHost,
    VITE_PORT: String(clientPort),
    ...(enableDebugHitbox ? { VITE_DEBUG_HITBOX: "1" } : {}),
    ...(debugInterpolationMode
      ? { VITE_DEBUG_INTERPOLATION: debugInterpolationMode }
      : {}),
  },
);

const serverStdout =
  typeof serverProcess.stdout === "number" ? undefined : serverProcess.stdout;
const serverStderr =
  typeof serverProcess.stderr === "number" ? undefined : serverProcess.stderr;
const clientStdout =
  typeof clientProcess.stdout === "number" ? undefined : clientProcess.stdout;
const clientStderr =
  typeof clientProcess.stderr === "number" ? undefined : clientProcess.stderr;

void pipeOutput(serverStdout, "[server] ", console.log);
void pipeOutput(serverStderr, "[server] ", console.error);
void pipeOutput(clientStdout, "[client] ", console.log);
void pipeOutput(clientStderr, "[client] ", console.error);

let shuttingDown = false;

async function shutdown(exitCode: number): Promise<never> {
  if (!shuttingDown) {
    shuttingDown = true;
    try {
      serverProcess.kill();
    } catch {
      // process already exited
    }
    try {
      clientProcess.kill();
    } catch {
      // process already exited
    }
  }

  await Promise.allSettled([serverProcess.exited, clientProcess.exited]);
  process.exit(exitCode);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdown(signal === "SIGINT" ? 130 : 143);
  });
}

const firstExit = await Promise.race([
  serverProcess.exited.then((exitCode) => ({ name: "server", exitCode })),
  clientProcess.exited.then((exitCode) => ({ name: "client", exitCode })),
]);

if (!shuttingDown) {
  const normalizedExitCode = firstExit.exitCode !== 0 ? firstExit.exitCode : 1;
  console.error(
    `[dev] ${firstExit.name} exited unexpectedly with code ${firstExit.exitCode ?? "unknown"}`,
  );
  await shutdown(normalizedExitCode);
}
