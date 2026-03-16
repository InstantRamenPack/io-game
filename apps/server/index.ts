import { GameConfig } from "@shared/config/GameConfig.ts";
import { WsServer } from "@server/net/WsServer.ts";
import { GameServer } from "@server/server/GameServer.ts";
import { AuthService } from "@server/services/AuthService.ts";
import { existsSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";

const clientDistRoot = resolve(import.meta.dir, "../client/dist");
const clientIndexPath = join(clientDistRoot, "index.html");

/**
 * Resolves a request pathname to a file under the built client root.
 * @param urlPath Request pathname from the browser.
 * @returns Absolute path when it stays within the built client root.
 */
function resolveClientAssetPath(urlPath: string): string | null {
  const relativePath = urlPath.replace(/^\/+/, "");
  const resolvedPath = resolve(clientDistRoot, relativePath);
  const withinRoot =
    resolvedPath === clientDistRoot ||
    resolvedPath.startsWith(`${clientDistRoot}${sep}`);
  return withinRoot ? resolvedPath : null;
}

/**
 * Serves a built client asset when the request maps to a file in dist.
 * @param urlPath Request pathname from the browser.
 * @returns Response for an existing built asset.
 */
function renderClientAsset(urlPath: string): Response | null {
  const assetPath = resolveClientAssetPath(urlPath);
  if (!assetPath || !existsSync(assetPath) || !statSync(assetPath).isFile()) {
    return null;
  }
  return new Response(Bun.file(assetPath));
}

/**
 * Boots the Bun HTTP server, WebSocket endpoint, and authoritative game loop.
 * @returns Nothing. Process lifetime is owned by Bun after the server starts.
 */
export function main(): void {
  if (!existsSync(clientIndexPath)) {
    throw new Error(
      "Built client bundle not found. Run `bun run build:client` before starting the server.",
    );
  }

  const gameConfig = GameConfig.load();
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const tlsCertPath = process.env.TLS_CERT_PATH;
  const tlsKeyPath = process.env.TLS_KEY_PATH;
  const authService = new AuthService(googleClientId);
  const networkServer = new WsServer();
  const gameServer = new GameServer(gameConfig, networkServer, authService);
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

      const clientAsset = renderClientAsset(url.pathname);
      if (clientAsset) {
        return clientAsset;
      }

      return new Response(Bun.file(clientIndexPath));
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
