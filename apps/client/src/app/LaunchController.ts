import type { AppElements } from "@client/app/AppElements.ts";
import type { HudController } from "@client/app/HudController.ts";
import type { MenuController } from "@client/app/MenuController.ts";
import type { RuntimeStatusController } from "@client/app/RuntimeStatusController.ts";
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
export type LaunchController = {
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
  runtimeStatusController: RuntimeStatusController;
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
  runtimeStatusController,
  resolvePlayerName,
}: LaunchControllerOptions): LaunchController {
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
      .catch(() => {
        if (elements.accountGateText) {
          elements.accountGateText.textContent =
            "Renderer unavailable. Continuing without canvas output.";
        }
        gameClient.start(wsUrl, {
          googleIdToken: token,
          playerName,
        });
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
    if (elements.gameRoot) {
      elements.gameRoot.hidden = false;
    }
    hudController.setVisible(true);

    runtimeStatusController.start();
    menuController.showGameScreen();

    if (elements.launchBtn) {
      const button = elements.launchBtn as HTMLButtonElement;
      button.textContent = "Connected";
      button.disabled = true;
    }

    hudController.refreshUi();
  });

  gameClient.networkClient.onClose(() => {
    runtimeStatusController.stop();
    hudController.reset();

    if (elements.launchBtn) {
      const button = elements.launchBtn as HTMLButtonElement;
      button.textContent = "Deploy";
      button.disabled = false;
    }
    if (elements.gameRoot) {
      elements.gameRoot.hidden = true;
    }
    hudController.setVisible(false);

    menuController.showMenuScreen();
    hudController.refreshUi();
  });

  gameClient.networkClient.onError((message) => {
    runtimeStatusController.stop();
    if (authController.handleNetworkError(message)) {
      menuController.setMode("account");
    }

    hudController.reset();

    if (message === "socket_error" && elements.accountGateText) {
      elements.accountGateText.textContent =
        "Connection failed before gameplay started. Check the server and refresh.";
    }

    if (elements.launchBtn) {
      const button = elements.launchBtn as HTMLButtonElement;
      button.textContent = "Deploy";
      button.disabled = false;
    }
    hudController.setVisible(false);

    menuController.refreshGateUi();
    hudController.refreshUi();
  });

  return {
    applyRuntimeConfig(runtimeConfig: ClientRuntimeConfig): void {
      gameConfig.protocolVersion = runtimeConfig.protocolVersion;
      gameClient.setTickRate(runtimeConfig.tickRate);
      gameClient.setWorldSize(runtimeConfig.worldSize);
    },
  };
}
