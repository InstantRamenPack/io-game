import type { AppElements } from "@client/app/AppElements.ts";
import type { GameClient } from "@client/client/GameClient.ts";
import type { SessionUiController } from "@client/app/session/SessionUiController.ts";
import type {
  GameCompleteMessage,
  GameOverMessage,
} from "@shared/net/protocol.ts";

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
  const kickerEl = elements.gameOverKicker;
  const titleEl = elements.gameOverTitle;
  const durationEl = elements.gameOverDuration;
  const wavesEl = elements.gameOverWaves;
  const returnBtn = elements.gameOverReturnBtn;
  const playAgainBtn = elements.gameOverPlayAgainBtn;
  const homeBtn = elements.gameOverHomeBtn;

  let suppressNextClose = false;

  function showWin(msg: GameCompleteMessage): void {
    if (kickerEl) kickerEl.textContent = "Extraction Complete";
    if (titleEl) {
      titleEl.textContent = "YOUR TEAM ESCAPED";
      titleEl.className = "game-over-title game-over-title--win";
    }
    if (durationEl) {
      durationEl.textContent = formatClock(
        Math.floor(msg.gameDurationMs / 1000),
      );
    }
    if (wavesEl) wavesEl.textContent = String(msg.wavesCompleted);
    if (playAgainBtn) playAgainBtn.hidden = false;
    if (overlay) overlay.hidden = false;
  }

  function showLose(msg: GameOverMessage): void {
    if (kickerEl) kickerEl.textContent = "All Players Down";
    if (titleEl) {
      titleEl.textContent = "YOU WERE OVERWHELMED";
      titleEl.className = "game-over-title game-over-title--lose";
    }
    if (durationEl) {
      durationEl.textContent = formatClock(
        Math.floor(msg.gameDurationMs / 1000),
      );
    }
    if (wavesEl) wavesEl.textContent = String(msg.wavesCompleted);
    if (playAgainBtn) playAgainBtn.hidden = false;
    if (overlay) overlay.hidden = false;
  }

  function hide(): void {
    if (overlay) overlay.hidden = true;
  }

  function returnToMenu(): void {
    hide();
    suppressNextClose = true;
    gameClient.stop();
    sessionUiController.showMenu();
  }

  function returnToLobby(): void {
    hide();
    sessionUiController.showPlaying();
    gameClient.clearMovementSuppressions();
    gameClient.requestLeaveLobby();
  }

  function playAgain(): void {
    hide();
    sessionUiController.showPlaying();
    gameClient.clearMovementSuppressions();
    gameClient.requestJoinLobby();
  }

  returnBtn?.addEventListener("click", returnToLobby);
  playAgainBtn?.addEventListener("click", playAgain);
  homeBtn?.addEventListener("click", returnToMenu);

  gameClient.onGameCompleted((msg) => {
    suppressNextClose = true;
    showWin(msg);
  });

  gameClient.onGameOver((msg) => {
    suppressNextClose = true;
    showLose(msg);
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
