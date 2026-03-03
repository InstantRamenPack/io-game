import { GameConfig } from "@shared/config/GameConfig.ts";
import { GameClient } from "@client/client/GameClient.ts";

/** Bootstraps the browser client and exposes deterministic debug hooks. */
export function main(): void {
  const gameConfig = GameConfig.load();
  const gameClient = new GameClient(gameConfig);
  gameClient.inputManager.bind(window);

  const webSocketProtocol = location.protocol === "https:" ? "wss" : "ws";
  const webSocketUrl = `${webSocketProtocol}://${location.host}/ws`;
  gameClient.start(webSocketUrl);

  const stateOutputElement = document.createElement("pre");
  stateOutputElement.id = "client-state";
  stateOutputElement.style.whiteSpace = "pre-wrap";
  document.body.appendChild(stateOutputElement);

  let lastFrameTimeMS = performance.now();
  const renderFrame = () => {
    const currentFrameTimeMS = performance.now();
    const deltaMs = currentFrameTimeMS - lastFrameTimeMS;
    lastFrameTimeMS = currentFrameTimeMS;
    gameClient.update(deltaMs);

    const latestSnapshot = gameClient.worldState.getLatest();
    stateOutputElement.textContent = JSON.stringify(
      {
        connected:
          !!gameClient.networkClient.socket &&
          gameClient.networkClient.socket.readyState === WebSocket.OPEN,
        latestTick: latestSnapshot?.tick ?? 0,
        entities: latestSnapshot?.entities.length ?? 0,
      },
      null,
      2,
    );

    requestAnimationFrame(renderFrame);
  };

  requestAnimationFrame(renderFrame);

  (
    window as Window & {
      render_game_to_text?: () => string;
      advanceTime?: (ms: number) => void;
    }
  ).render_game_to_text = () => {
    const latestSnapshot = gameClient.worldState.getLatest();
    return JSON.stringify({
      mode: latestSnapshot ? "connected" : "connecting",
      latestTick: latestSnapshot?.tick ?? 0,
      entities: latestSnapshot?.entities ?? [],
      note: "origin is top-left, +x right, +y down",
    });
  };

  (
    window as Window & { advanceTime?: (deltaMsRequested: number) => void }
  ).advanceTime = (deltaMsRequested: number) => {
    const fixedStepMs = 1000 / gameConfig.tickRate;
    const stepCount = Math.max(1, Math.round(deltaMsRequested / fixedStepMs));
    for (let stepIndex = 0; stepIndex < stepCount; stepIndex += 1) {
      gameClient.update(fixedStepMs);
    }
  };
}

if (typeof window !== "undefined") {
  main();
}
