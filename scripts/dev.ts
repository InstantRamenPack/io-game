const backendTarget = "http://127.0.0.1:3000";
const debugTickRateArg = process.argv.find((arg) =>
  arg.startsWith("--DEBUG_TICK_RATE="),
);
const enableDebugHitbox =
  process.argv.includes("--DEBUG_HITBOX") ||
  process.env.VITE_DEBUG_HITBOX === "1";
const debugInterpolationArg = process.argv.find(
  (arg) =>
    arg === "--DEBUG_INTERPOLATION" || arg.startsWith("--DEBUG_INTERPOLATION="),
);
const bunExecutable = process.execPath;
const sharedEnv = { ...process.env };

function parseDebugTickRate(arg: string | undefined): string | undefined {
  if (!arg) {
    return undefined;
  }

  const rawTickRate = arg.slice("--DEBUG_TICK_RATE=".length);
  const parsedTickRate = Number(rawTickRate);
  if (!Number.isFinite(parsedTickRate) || parsedTickRate <= 0) {
    console.error(
      `[dev] invalid --DEBUG_TICK_RATE value "${rawTickRate}". Expected a positive number.`,
    );
    process.exit(1);
  }

  return String(Math.floor(parsedTickRate));
}

const debugTickRate = parseDebugTickRate(debugTickRateArg);

function parseDebugInterpolationMode(
  arg: string | undefined,
): string | undefined {
  if (!arg) {
    return process.env.VITE_DEBUG_INTERPOLATION;
  }

  if (arg === "--DEBUG_INTERPOLATION") {
    return "1";
  }

  const rawMode = arg.slice("--DEBUG_INTERPOLATION=".length);
  if (rawMode === "1" || rawMode === "2") {
    return rawMode;
  }

  console.error(
    `[dev] invalid --DEBUG_INTERPOLATION value "${rawMode}". Expected 1 or 2.`,
  );
  process.exit(1);
}

const debugInterpolationMode = parseDebugInterpolationMode(
  debugInterpolationArg,
);

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
    ...(debugTickRate ? { TICK_RATE: debugTickRate } : {}),
  },
);
const clientProcess = spawnChild(
  "client",
  [bunExecutable, "run", "dev:client"],
  {
    ...sharedEnv,
    VITE_BACKEND_TARGET: backendTarget,
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
