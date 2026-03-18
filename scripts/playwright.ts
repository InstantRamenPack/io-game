import { once } from "node:events";
import { createServer } from "node:net";

async function findFreePort(usedPorts: Set<number>): Promise<number> {
  while (true) {
    const server = createServer();
    server.unref();
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    const port =
      address && typeof address !== "string" ? address.port : undefined;

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    if (port !== undefined && !usedPorts.has(port)) {
      usedPorts.add(port);
      return port;
    }
  }
}

async function main(): Promise<void> {
  const usedPorts = new Set<number>();
  const serverPort = await findFreePort(usedPorts);
  const clientPort = await findFreePort(usedPorts);
  const baseURL = `http://127.0.0.1:${clientPort}`;

  console.log(
    `[playwright] using client port ${clientPort} and server port ${serverPort}`,
  );

  const testProcess = Bun.spawn({
    cmd: ["npx", "playwright", "test", ...process.argv.slice(2)],
    cwd: process.cwd(),
    env: {
      ...process.env,
      PLAYWRIGHT_BASE_URL: baseURL,
      PLAYWRIGHT_CLIENT_PORT: String(clientPort),
      PLAYWRIGHT_SERVER_PORT: String(serverPort),
    },
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });

  process.exit(await testProcess.exited);
}

await main();
