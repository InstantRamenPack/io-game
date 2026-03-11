import { GameConfig } from "@shared/config/GameConfig.ts";
import { WsServer } from "@server/net/WsServer.ts";
import { GameServer } from "@server/server/GameServer.ts";
import { AuthService } from "@server/services/AuthService.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const homeHtmlTemplatePath = join(import.meta.dir, "../client/index.html");
const homeHtmlTemplate = readFileSync(homeHtmlTemplatePath, "utf8");
const clientMainSourcePath = join(import.meta.dir, "../client/src/main.ts");
const clientMainSource = readFileSync(clientMainSourcePath, "utf8");
const browserTranspiler = new Bun.Transpiler({
  loader: "ts",
  target: "browser",
});
const clientMainModule = browserTranspiler.transformSync(clientMainSource);

/**
 * Renders the client HTML shell.
 * This stays as a helper so server startup keeps the response generation concerns local.
 * @returns HTML served for the browser entrypoint.
 */
function renderHomeHtml(): string {
  return homeHtmlTemplate;
}

/**
 * Boots the Bun HTTP server, WebSocket endpoint, and authoritative game loop.
 * @returns Nothing. Process lifetime is owned by Bun after the server starts.
 */
export function main(): void {
  const gameConfig = GameConfig.load();
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const tlsCertPath = process.env.TLS_CERT_PATH;
  const tlsKeyPath = process.env.TLS_KEY_PATH;
  const authService = new AuthService(googleClientId);
  const networkServer = new WsServer();
  const gameServer = new GameServer(gameConfig, networkServer, authService);
  const homeHtml = renderHomeHtml();
  gameServer.start();

  const port = Number(process.env.PORT ?? 3000);
  if ((tlsCertPath && !tlsKeyPath) || (!tlsCertPath && tlsKeyPath)) {
    throw new Error(
      "TLS_CERT_PATH and TLS_KEY_PATH must both be set to enable HTTPS.",
    );
  }
  const tls =
    tlsCertPath && tlsKeyPath
      ? {
          cert: Bun.file(tlsCertPath),
          key: Bun.file(tlsKeyPath),
        }
      : undefined;
  const protocol = tls ? "https" : "http";

  Bun.serve<{ clientId: string }>({
    port,
    ...(tls ? { tls } : {}),
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

      if (url.pathname === "/runtime-config") {
        return new Response(
          JSON.stringify({
            googleClientId: googleClientId ?? null,
            protocolVersion: GameConfig.DEFAULT_PROTOCOL_VERSION,
            worldSize: gameConfig.worldSize,
          }),
          {
            headers: {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store",
            },
          },
        );
      }

      if (url.pathname === "/src/main.ts") {
        return new Response(clientMainModule, {
          headers: { "content-type": "text/javascript; charset=utf-8" },
        });
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
  console.log(`server listening on ${protocol}://localhost:${port}`);
}

main();
