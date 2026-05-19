import type { AppElements } from "@client/app/AppElements.ts";
import type { HudController } from "@client/app/HudController.ts";
import type { LobbyHudController } from "@client/app/LobbyHudController.ts";
import type { ChatController } from "@client/app/ChatController.ts";
import type { MenuController } from "@client/app/MenuController.ts";
import type { SessionUiController } from "@client/app/session/SessionUiController.ts";
import type { GameClient } from "@client/client/GameClient.ts";
import type { ClientRuntimeConfig } from "@shared/config/ClientRuntimeConfig.ts";
import type { GameConfig } from "@shared/config/GameConfig.ts";

type LaunchController = {
  applyRuntimeConfig(runtimeConfig: ClientRuntimeConfig): void;
};

type LaunchControllerOptions = {
  elements: AppElements;
  gameClient: GameClient;
  gameConfig: GameConfig;
  menuController: MenuController;
  sessionUiController: SessionUiController;
  hudController: HudController;
  chatController: ChatController;
  lobbyHudController: LobbyHudController;
  resolvePlayerName: () => string;
};

export function createLaunchController({
  elements,
  gameClient,
  gameConfig,
  menuController,
  sessionUiController,
  hudController,
  chatController,
  lobbyHudController,
  resolvePlayerName,
}: LaunchControllerOptions): LaunchController {
  function applyGameplayShellState(connected: boolean): void {
    hudController.setVisible(connected);
    chatController.setVisible(connected);
    lobbyHudController.setVisible(connected);

    if (elements.launchBtn) {
      const button = elements.launchBtn as HTMLButtonElement;
      button.textContent = connected ? "Connected" : "Play";
      button.disabled = connected;
    }
  }

  function enterSessionUi(): void {
    applyGameplayShellState(true);
    menuController.showGameScreen();
    hudController.refreshUi();
  }

  function exitSessionUi(options: { connectionErrorMessage?: string }): void {
    hudController.reset();
    applyGameplayShellState(false);
    menuController.showMenuScreen();
    if (options.connectionErrorMessage) {
      console.error(options.connectionErrorMessage);
    }
    hudController.refreshUi();
  }

  elements.launchBtn?.addEventListener("click", () => {
    if (
      elements.playerNameInput &&
      !elements.playerNameInput.reportValidity()
    ) {
      return;
    }

    const playerName = resolvePlayerName();
    if (!playerName) {
      return;
    }

    const button = elements.launchBtn as HTMLButtonElement;
    button.textContent = "Connecting...";
    button.disabled = true;
    sessionUiController.showConnecting();

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}/ws`;

    if (!elements.gameRoot) {
      button.textContent = "Play";
      button.disabled = false;
      return;
    }

    void gameClient
      .initRenderer(elements.gameRoot)
      .then(() => {
        gameClient.start(wsUrl, { playerName });
      })
      .catch((error) => {
        button.textContent = "Play";
        button.disabled = false;
        console.error("Failed to initialize renderer:", error);
      });
  });

  gameClient.onSessionReady(() => {
    enterSessionUi();
  });

  gameClient.networkClient.onClose(() => {
    exitSessionUi({});
  });

  gameClient.networkClient.onError((message) => {
    if (!isFatalNetworkError(message)) {
      return;
    }

    const connectionErrorMessage =
      message === "socket_error"
        ? "Connection failed before gameplay started. Check the server and refresh."
        : undefined;
    exitSessionUi({ connectionErrorMessage });
  });

  return {
    applyRuntimeConfig(runtimeConfig: ClientRuntimeConfig): void {
      gameConfig.compatHash = runtimeConfig.compatHash;
      gameClient.setTickRate(runtimeConfig.tickRate);
      gameClient.setWorldSize(runtimeConfig.worldSize);
      gameClient.setInterpolationConfig(runtimeConfig.interpolation);
    },
  };
}

function isFatalNetworkError(message: string): boolean {
  return (
    message === "socket_error" ||
    message === "compat_mismatch" ||
    message === "server_full" ||
    message === "name_required" ||
    message === "name_taken" ||
    message === "hello_required"
  );
}
