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
const clientHost = process.env.VITE_HOST ?? "0.0.0.0";
const backendTarget =
  process.env.VITE_BACKEND_TARGET ?? `http://127.0.0.1:${serverPort}`;
const bunExecutable = process.execPath;
const sharedEnv = { ...process.env };
const clientArgs = process.argv.slice(2);

function ensureViteHostArg(args: string[], host: string): string[] {
  if (args.some((arg) => arg === "--host" || arg.startsWith("--host="))) {
    return args;
  }

  return ["--host", host, ...args];
}

const debugTickRate = process.env.TICK_RATE ?? process.env.DEBUG_TICK_RATE;
const debugInterpolationMode =
  process.env.VITE_DEBUG_INTERPOLATION ?? process.env.DEBUG_INTERPOLATION;
const enableDebugHitbox =
  (process.env.VITE_DEBUG_HITBOX ?? process.env.DEBUG_HITBOX) === "1";

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
    serverProcess.kill();
    clientProcess.kill();
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
