import type { AppElements } from "@client/app/AppElements.ts";
import type { SessionUiController } from "@client/app/session/SessionUiController.ts";
import type { GameClient } from "@client/client/GameClient.ts";

type DeathController = {
  sync: () => void;
  setVisible: (visible: boolean) => void;
};

export function createDeathController({
  elements,
  gameClient,
  sessionUiController,
}: {
  elements: AppElements;
  gameClient: GameClient;
  sessionUiController: SessionUiController;
}): DeathController {
  const overlay = elements.deathOverlay;
  const respawnBtn = elements.respawnBtn;
  let releaseDeathSuppression: (() => void) | undefined;

  if (!overlay || !respawnBtn) {
    return {
      sync: () => undefined,
      setVisible: () => undefined,
    };
  }

  const setVisible = (visible: boolean): void => {
    overlay.hidden = !visible;
    if (visible) {
      releaseDeathSuppression ??=
        gameClient.acquireMovementSuppression("death");
      return;
    }
    releaseDeathSuppression?.();
    releaseDeathSuppression = undefined;
  };

  const sync = (): void => {
    if (!gameClient.isSessionReady()) {
      setVisible(false);
      return;
    }

    const isAlive = gameClient.isLocalPlayerAlive();
    const dead = isAlive === false;
    setVisible(dead);
    if (dead) {
      sessionUiController.showDead();
    } else {
      sessionUiController.showPlaying();
    }
  };

  respawnBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    respawnBtn.blur();
    gameClient.clearMovementSuppressions();
    // Clear death-gate suppression immediately so controls can't stay stuck
    // behind overlay state if the respawn snapshot arrives late.
    setVisible(false);
    sessionUiController.showPlaying();
    gameClient.requestRespawn();
  });

  return {
    sync,
    setVisible,
  };
}
