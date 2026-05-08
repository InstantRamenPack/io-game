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
  const spectateHud = elements.spectateHud;
  const spectateHudName = elements.spectateHudName;
  let releaseDeathSuppression: (() => void) | undefined;

  const setSuppressed = (suppressed: boolean): void => {
    if (suppressed) {
      releaseDeathSuppression ??=
        gameClient.acquireMovementSuppression("death");
    } else {
      releaseDeathSuppression?.();
      releaseDeathSuppression = undefined;
    }
  };

  const setVisible = (visible: boolean): void => {
    // Death overlay is only shown in playground/lobby — match mode uses spectate HUD
    const inMatch = gameClient.isInActiveMatch();
    if (overlay) {
      overlay.hidden = !visible || inMatch;
    }
    setSuppressed(visible);
  };

  const syncSpectateHud = (isDead: boolean): void => {
    if (!spectateHud) return;
    const inMatch = gameClient.isInActiveMatch();
    const show = isDead && inMatch;
    spectateHud.hidden = !show;
    if (show && spectateHudName) {
      const name = gameClient.getSpectateTargetName();
      spectateHudName.textContent = name ?? "...";
    }
  };

  const sync = (): void => {
    if (!gameClient.isSessionReady()) {
      setVisible(false);
      syncSpectateHud(false);
      return;
    }

    const isAlive = gameClient.isLocalPlayerAlive();
    const dead = isAlive === false;
    setVisible(dead);
    syncSpectateHud(dead);

    if (dead) {
      sessionUiController.showDead();
    } else {
      sessionUiController.showPlaying();
    }
  };

  // Playground respawn button — only functional outside active matches
  respawnBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    respawnBtn.blur();
    gameClient.clearMovementSuppressions();
    setVisible(false);
    syncSpectateHud(false);
    sessionUiController.showPlaying();
    gameClient.requestRespawn();
  });

  return {
    sync,
    setVisible,
  };
}
