const backendTarget = "http://127.0.0.1:3000";
const enableDebugHitbox =
  process.argv.includes("--DEBUG_HITBOX") ||
  process.env.VITE_DEBUG_HITBOX === "1";
const enableDebugInterpolation =
  process.argv.includes("--DEBUG_INTERPOLATION") ||
  process.env.VITE_DEBUG_INTERPOLATION === "1";
const bunExecutable = process.execPath;
const sharedEnv = { ...process.env };

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
  },
);
const clientProcess = spawnChild(
  "client",
  [bunExecutable, "run", "dev:client"],
  {
    ...sharedEnv,
    VITE_BACKEND_TARGET: backendTarget,
    ...(enableDebugHitbox ? { VITE_DEBUG_HITBOX: "1" } : {}),
    ...(enableDebugInterpolation ? { VITE_DEBUG_INTERPOLATION: "1" } : {}),
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
