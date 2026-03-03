import { GameConfig } from "@shared/config/GameConfig.ts";
import { WsServer } from "@server/net/WsServer.ts";
import { GameServer } from "@server/server/GameServer.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const homeHtmlTemplatePath = join(import.meta.dir, "../client/index.html");
const homeHtmlTemplate = readFileSync(homeHtmlTemplatePath, "utf8");

/** Renders the client template with runtime protocol and cadence values. */
function renderHomeHtml(
  protocolVersion: number,
  inputIntervalMs: number,
): string {
  return homeHtmlTemplate
    .replaceAll("__PROTOCOL_VERSION__", String(protocolVersion))
    .replaceAll("__INPUT_INTERVAL_MS__", String(inputIntervalMs));
}

/** Boots the Bun HTTP/WebSocket server and authoritative game loop. */
export function main(): void {
  const gameConfig = GameConfig.load();
  const networkServer = new WsServer();
  const gameServer = new GameServer(gameConfig, networkServer);
  const inputIntervalMs = Math.max(1, Math.floor(1000 / gameConfig.tickRate));
  const homeHtml = renderHomeHtml(gameConfig.protocolVersion, inputIntervalMs);
  gameServer.start();

  const port = Number(process.env.PORT ?? 3000);

  Bun.serve<{ clientId: string }>({
    port,
    fetch(req, server) {
      const url = new URL(req.url);

      if (url.pathname === "/ws") {
        const clientId = crypto.randomUUID();
        const ok = server.upgrade(req, { data: { clientId } });
        if (ok) {
          return;
        }
        return new Response("websocket upgrade failed", { status: 400 });
      }

      if (url.pathname === "/healthz") {
        return new Response("ok");
      }

      return new Response(homeHtml, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    },
    websocket: {
      open(webSocket) {
        networkServer.handleOpen(webSocket);
      },
      message(webSocket, messageData) {
        networkServer.handleMessage(webSocket, messageData);
      },
      close(webSocket) {
        networkServer.handleClose(webSocket);
      },
    },
  });

  // eslint-disable-next-line no-console
  console.log(`server listening on http://localhost:${port}`);
}

main();
