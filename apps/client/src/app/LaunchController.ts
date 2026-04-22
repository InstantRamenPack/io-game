import type { AppElements } from "@client/app/AppElements.ts";
import type { HudController } from "@client/app/HudController.ts";
import type { LobbyHudController } from "@client/app/LobbyHudController.ts";
import type { ChatController } from "@client/app/ChatController.ts";
import type { MenuController } from "@client/app/MenuController.ts";
import type { AuthController } from "@client/auth/Auth.ts";
import type { GameClient } from "@client/client/GameClient.ts";
import type { ClientRuntimeConfig } from "@shared/config/ClientRuntimeConfig.ts";
import type { GameConfig } from "@shared/config/GameConfig.ts";

/**
 * Exposes the small public surface of the launch-lifecycle controller.
 * Most behavior in this module is event binding, but runtime-config
 * application is intentionally returned so `main.ts` can hand it to the auth
 * initializer without duplicating parsing logic.
 */
type LaunchController = {
  /**
   * Applies the runtime configuration loaded from the server to the client
   * runtime. The method updates protocol/tick settings and world bounds while
   * validating that the incoming values are finite and usable.
   */
  applyRuntimeConfig(runtimeConfig: ClientRuntimeConfig): void;
};

type LaunchControllerOptions = {
  elements: AppElements;
  gameClient: GameClient;
  gameConfig: GameConfig;
  authController: AuthController;
  menuController: MenuController;
  hudController: HudController;
  chatController: ChatController;
  lobbyHudController: LobbyHudController;
  resolvePlayerName: () => string;
};

/**
 * Wires together launch-button behavior, auth-driven shell transitions, and
 * websocket lifecycle updates. This keeps `main.ts` focused on composition
 * while one dedicated controller owns the browser-side "launch a session"
 * story end to end.
 */
export function createLaunchController({
  elements,
  gameClient,
  gameConfig,
  authController,
  menuController,
  hudController,
  chatController,
  lobbyHudController,
  resolvePlayerName,
}: LaunchControllerOptions): LaunchController {
  function applyGameplayShellState(connected: boolean): void {
    if (elements.gameRoot) {
      elements.gameRoot.hidden = !connected;
    }
    if (elements.chatRoot) {
      elements.chatRoot.hidden = !connected;
    }

    hudController.setVisible(connected);
    chatController.setVisible(connected);
    lobbyHudController.setVisible(connected);

    if (elements.launchBtn) {
      const button = elements.launchBtn as HTMLButtonElement;
      button.textContent = connected ? "Connected" : "Deploy";
      button.disabled = connected;
    }
  }

  function enterSessionUi(): void {
    applyGameplayShellState(true);
    menuController.showGameScreen();
    hudController.refreshUi();
  }

  function exitSessionUi(options: {
    connectionErrorMessage?: string;
    refreshGateOnly?: boolean;
  }): void {
    hudController.reset();
    applyGameplayShellState(false);

    if (options.connectionErrorMessage && elements.accountGateText) {
      elements.accountGateText.textContent = options.connectionErrorMessage;
    }

    if (options.refreshGateOnly) {
      menuController.refreshGateUi();
    } else {
      menuController.showMenuScreen();
    }
    hudController.refreshUi();
  }

  elements.launchBtn?.addEventListener("click", () => {
    if (authController.getState().authMode === "none") {
      authController.activateGuest();
    }

    const button = elements.launchBtn as HTMLButtonElement;
    button.textContent = "Connecting...";
    button.disabled = true;

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
    const token = authController.getLaunchToken();
    const playerName = resolvePlayerName();

    if (!elements.gameRoot) {
      if (elements.accountGateText) {
        elements.accountGateText.textContent = "Game root is unavailable.";
      }
      button.textContent = "Deploy";
      button.disabled = false;
      return;
    }

    void gameClient
      .initRenderer(elements.gameRoot)
      .then(() => {
        gameClient.start(wsUrl, {
          googleIdToken: token,
          playerName,
        });
      })
      .catch((error) => {
        if (elements.accountGateText) {
          elements.accountGateText.textContent =
            "Renderer unavailable. Deploy was not started.";
        }
        button.textContent = "Deploy";
        button.disabled = false;
        console.error("Failed to initialize renderer:", error);
      });
  });

  elements.accountBtn?.addEventListener("click", () => {
    const authState = authController.getState();
    if (authState.authMode === "google") {
      return;
    }
    if (!authState.initialized) {
      return;
    }
    if (!elements.googleSignInTarget?.hidden) {
      return;
    }
    authController.promptGoogleSignIn();
  });

  authController.onChange((authState) => {
    if (
      (authState.authMode === "google" || authState.authMode === "guest") &&
      menuController.getMode() === "account"
    ) {
      menuController.setMode("play");
    }
    menuController.refreshGateUi();
  });

  gameClient.onSessionReady(() => {
    enterSessionUi();
  });

  gameClient.networkClient.onClose(() => {
    exitSessionUi({});
  });

  gameClient.networkClient.onError((message) => {
    if (authController.handleNetworkError(message)) {
      menuController.setMode("account");
    }

    const connectionErrorMessage =
      message === "socket_error"
        ? "Connection failed before gameplay started. Check the server and refresh."
        : undefined;
    exitSessionUi({
      connectionErrorMessage,
      refreshGateOnly: true,
    });
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
