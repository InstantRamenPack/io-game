import type { AppElements } from "@client/app/AppElements.ts";
import type { GameClient } from "@client/client/GameClient.ts";

type DeathController = {
  sync: () => void;
  setVisible: (visible: boolean) => void;
};

export function createDeathController({
  elements,
  gameClient,
}: {
  elements: AppElements;
  gameClient: GameClient;
}): DeathController {
  const overlay = elements.deathOverlay;
  const respawnBtn = elements.respawnBtn;

  if (!overlay || !respawnBtn) {
    return {
      sync: () => undefined,
      setVisible: () => undefined,
    };
  }

  const setVisible = (visible: boolean): void => {
    overlay.hidden = !visible;
    if (elements.chatRoot) {
      elements.chatRoot.style.pointerEvents = visible ? "none" : "";
    }
    gameClient.setMovementSuppressed(visible);
  };

  const sync = (): void => {
    const gameplayVisible = elements.menuRoot?.style.display === "none";
    if (!gameClient.isSessionReady() || !gameplayVisible) {
      setVisible(false);
      return;
    }

    const isAlive = gameClient.isLocalPlayerAlive();
    setVisible(isAlive === false);
  };

  respawnBtn.addEventListener("click", () => {
    gameClient.requestRespawn();
  });

  return {
    sync,
    setVisible,
  };
}
