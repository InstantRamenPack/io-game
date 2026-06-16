import type { AppElements } from "@client/app/AppElements.ts";
import type { HudController } from "@client/app/HudController.ts";
import type { LobbyHudController } from "@client/app/LobbyHudController.ts";
import type { ChatController } from "@client/app/ChatController.ts";
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
  sessionUiController,
  hudController,
  chatController,
  lobbyHudController,
  resolvePlayerName,
}: LaunchControllerOptions): LaunchController {
  function clearNameError(): void {
    elements.playerNameError.hidden = true;
    elements.playerNameError.textContent = "";
  }

  function showNameError(message: string): void {
    elements.playerNameError.hidden = false;
    elements.playerNameError.textContent = message;
  }
  function applyGameplayShellState(connected: boolean): void {
    hudController.setVisible(connected);
    chatController.setVisible(connected);
    lobbyHudController.setVisible(connected);

    elements.launchBtn.textContent = connected ? "Connected" : "Play";
    elements.launchBtn.disabled = connected;
  }

  function enterSessionUi(): void {
    applyGameplayShellState(true);
    sessionUiController.showPlaying();
    hudController.refreshUi();
  }

  function exitSessionUi(options: { connectionErrorMessage?: string }): void {
    hudController.reset();
    applyGameplayShellState(false);
    sessionUiController.showMenu();
    if (options.connectionErrorMessage) {
      console.error(options.connectionErrorMessage);
    }
    hudController.refreshUi();
  }

  elements.launchBtn.addEventListener("click", () => {
    clearNameError();
    if (!elements.playerNameInput.reportValidity()) {
      return;
    }

    const playerName = resolvePlayerName();
    if (!playerName) {
      showNameError("Enter a valid name.");
      return;
    }

    const button = elements.launchBtn;
    button.textContent = "Connecting...";
    button.disabled = true;
    sessionUiController.showConnecting();

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}/ws`;

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
    if (message === "name_required") {
      showNameError("Enter a valid name.");
      return;
    }
    if (message === "name_taken") {
      showNameError("That name is already in use.");
      return;
    }
    if (message === "invalid_name") {
      showNameError("Invalid name. Use 1-20 letters/numbers/spaces.");
      return;
    }
    if (!isFatalNetworkError(message)) {
      return;
    }

    const connectionErrorMessage =
      message === "socket_error"
        ? "Connection failed before gameplay started. Check the server and refresh."
        : undefined;
    exitSessionUi({ connectionErrorMessage });
  });

  elements.playerNameInput?.addEventListener("input", () => {
    clearNameError();
  });

  return {
    applyRuntimeConfig(runtimeConfig: ClientRuntimeConfig): void {
      gameConfig.compatHash = runtimeConfig.compatHash;
      gameClient.setTickRate(runtimeConfig.tickRate);
      gameClient.setSimulationSpeedMultiplier(
        runtimeConfig.simulationSpeedMultiplier,
      );
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
