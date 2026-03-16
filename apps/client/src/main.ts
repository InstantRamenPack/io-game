import "./index.css";
import {
  AuthController,
  createAuthGateViewState,
  type RuntimeConfig,
} from "@client/auth/Auth.ts";
import { GameClient } from "@client/client/GameClient.ts";
import { DEBUG_HITBOX, DEBUG_INTERPOLATION } from "@client/debug.ts";
import { GameConfig } from "@shared/config/GameConfig.ts";

type MenuMode = "play" | "loadout" | "settings" | "account";

const titles: Record<MenuMode, string> = {
  play: "OUTBREAK SECTOR",
  loadout: "LOADOUT",
  settings: "SETTINGS",
  account: "ACCOUNT",
};

let currentMode: MenuMode = "play";
const PLAYER_NAME_STORAGE_KEY = "zombs-player-name";

const titleEl = document.getElementById("menu-title");
const sideButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>(".side-menu button"),
);
const launchBtn = document.getElementById("launch-btn");
const accountGate = document.getElementById("account-gate");
const accountGateText = document.getElementById("account-gate-text");
const accountBtn = document.getElementById("account-btn");
const googleSignInTarget = document.getElementById("google-signin-target");
const menuRoot = document.querySelector<HTMLElement>('[data-screen="menu"]');
const gameRoot = document.getElementById("game-root");
const playerNameInput = document.getElementById(
  "player-name-input",
) as HTMLInputElement | null;

const gameConfig = new GameConfig();
const gameClient = new GameClient(gameConfig, {
  debugHitbox: DEBUG_HITBOX,
  debugInterpolation: DEBUG_INTERPOLATION,
});
const authController = new AuthController();
gameClient.bindInput(window);

function createDefaultPlayerName(): string {
  return `Player-${Math.floor(100 + Math.random() * 900)}`;
}

function loadInitialPlayerName(): string {
  const storedPlayerName = window.localStorage
    .getItem(PLAYER_NAME_STORAGE_KEY)
    ?.trim();
  return storedPlayerName || createDefaultPlayerName();
}

function resolvePlayerName(): string {
  const rawPlayerName = playerNameInput?.value ?? "";
  const trimmedPlayerName = rawPlayerName.trim();
  const nextPlayerName = trimmedPlayerName || createDefaultPlayerName();
  window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, nextPlayerName);
  if (playerNameInput) {
    playerNameInput.value = nextPlayerName;
  }
  return nextPlayerName;
}

if (playerNameInput) {
  playerNameInput.value = loadInitialPlayerName();
}

function syncGoogleSignInButton(): void {
  if (!accountBtn || !googleSignInTarget) {
    return;
  }

  const fallbackButton = accountBtn as HTMLButtonElement;
  const shouldShowGoogleButton = authController.canRenderGoogleButton();

  fallbackButton.hidden = shouldShowGoogleButton;
  googleSignInTarget.hidden = !shouldShowGoogleButton;

  if (shouldShowGoogleButton) {
    authController.renderGoogleButton(googleSignInTarget);
  }
}

function refreshGateUi(): void {
  if (!launchBtn || !accountGate || !accountGateText || !accountBtn) {
    return;
  }

  const authState = authController.getState();
  const gateView = createAuthGateViewState(authState);
  const deployButton = launchBtn as HTMLButtonElement;
  const createButton = accountBtn as HTMLButtonElement;

  accountGate.classList.toggle("ok", gateView.showReadyState);
  accountGateText.textContent = gateView.gateText;
  createButton.textContent = gateView.accountButtonText;
  createButton.disabled = gateView.accountButtonDisabled;
  deployButton.disabled = gateView.deployButtonDisabled;

  syncGoogleSignInButton();
}

function updateMode(mode: MenuMode): void {
  currentMode = mode;
  if (titleEl) {
    titleEl.textContent = titles[mode];
  }
  sideButtons.forEach((button) => {
    button.setAttribute(
      "aria-current",
      button.dataset.view === mode ? "true" : "false",
    );
  });
}

sideButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const requested = button.dataset.view as MenuMode | undefined;
    if (!requested) {
      return;
    }
    updateMode(requested);
  });
});

launchBtn?.addEventListener("click", () => {
  if (authController.getState().authMode === "none") {
    authController.activateGuest();
  }

  const button = launchBtn as HTMLButtonElement;
  button.textContent = "Connecting...";
  button.disabled = true;
  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
  const token = authController.getLaunchToken();
  const playerName = resolvePlayerName();

  if (!gameRoot) {
    if (accountGateText) {
      accountGateText.textContent = "Game root is unavailable.";
    }
    button.textContent = "Deploy";
    button.disabled = false;
    return;
  }

  void gameClient
    .initRenderer(gameRoot)
    .then(() => {
      gameClient.start(wsUrl, {
        googleIdToken: token,
        playerName,
      });
    })
    .catch(() => {
      if (accountGateText) {
        accountGateText.textContent =
          "Renderer failed to load. Check network and refresh.";
      }
      button.textContent = "Deploy";
      button.disabled = false;
    });
});

accountBtn?.addEventListener("click", () => {
  const authState = authController.getState();
  if (authState.authMode === "google") {
    return;
  }
  if (!authState.initialized) {
    return;
  }
  if (!googleSignInTarget?.hidden) {
    return;
  }
  authController.promptGoogleSignIn();
});

authController.onChange((authState) => {
  if (
    (authState.authMode === "google" || authState.authMode === "guest") &&
    currentMode === "account"
  ) {
    updateMode("play");
  }
  refreshGateUi();
});

gameClient.networkClient.onOpen(() => {
  if (gameRoot) {
    gameRoot.hidden = false;
  }
  if (menuRoot) {
    menuRoot.style.display = "none";
  }
  if (launchBtn) {
    const button = launchBtn as HTMLButtonElement;
    button.textContent = "Connected";
    button.disabled = true;
  }
});

gameClient.networkClient.onClose(() => {
  if (launchBtn) {
    const button = launchBtn as HTMLButtonElement;
    button.textContent = "Deploy";
    button.disabled = false;
  }
  if (gameRoot) {
    gameRoot.hidden = true;
  }
  if (menuRoot) {
    menuRoot.style.display = "";
  }
});

gameClient.networkClient.onError((message) => {
  if (authController.handleNetworkError(message)) {
    updateMode("account");
  }

  if (message === "socket_error" && accountGateText) {
    accountGateText.textContent =
      "Connection failed before gameplay started. Check the server and refresh.";
  }

  if (launchBtn) {
    const button = launchBtn as HTMLButtonElement;
    button.textContent = "Deploy";
    button.disabled = false;
  }
  refreshGateUi();
});

refreshGateUi();
void authController.initialize((runtimeConfig: RuntimeConfig) => {
  if (
    typeof runtimeConfig.protocolVersion === "number" &&
    Number.isFinite(runtimeConfig.protocolVersion)
  ) {
    gameConfig.protocolVersion = runtimeConfig.protocolVersion;
  }

  if (
    runtimeConfig.worldSize &&
    Number.isFinite(runtimeConfig.worldSize.w) &&
    Number.isFinite(runtimeConfig.worldSize.h) &&
    runtimeConfig.worldSize.w > 0 &&
    runtimeConfig.worldSize.h > 0
  ) {
    gameClient.setWorldSize({
      w: runtimeConfig.worldSize.w,
      h: runtimeConfig.worldSize.h,
    });
  }
});
