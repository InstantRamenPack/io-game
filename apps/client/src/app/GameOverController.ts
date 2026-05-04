import type { AppElements } from "@client/app/AppElements.ts";
import type { GameClient } from "@client/client/GameClient.ts";
import type { SessionUiController } from "@client/app/session/SessionUiController.ts";
import type { GameCompleteMessage } from "@shared/net/protocol.ts";

type GameOverControllerOptions = {
  elements: AppElements;
  gameClient: GameClient;
  sessionUiController: SessionUiController;
};

export function createGameOverController({
  elements,
  gameClient,
  sessionUiController,
}: GameOverControllerOptions): void {
  const overlay = elements.gameOverOverlay;
  const durationEl = elements.gameOverDuration;
  const wavesEl = elements.gameOverWaves;
  const returnBtn = elements.gameOverReturnBtn;

  let suppressNextClose = false;

  function show(msg: GameCompleteMessage): void {
    if (durationEl) {
      durationEl.textContent = formatClock(
        Math.floor(msg.gameDurationMs / 1000),
      );
    }
    if (wavesEl) {
      wavesEl.textContent = String(msg.wavesCompleted);
    }
    if (overlay) {
      overlay.hidden = false;
    }
  }

  function hide(): void {
    if (overlay) {
      overlay.hidden = true;
    }
  }

  returnBtn?.addEventListener("click", () => {
    hide();
    suppressNextClose = true;
    gameClient.stop();
    sessionUiController.showMenu();
  });

  gameClient.onGameCompleted((msg) => {
    suppressNextClose = true;
    show(msg);
  });

  gameClient.networkClient.onClose(() => {
    if (suppressNextClose) {
      suppressNextClose = false;
      return;
    }
    hide();
  });
}

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
