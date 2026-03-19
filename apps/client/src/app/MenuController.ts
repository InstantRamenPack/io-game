import type { AppElements, MenuMode } from "@client/app/AppElements.ts";
import {
  createAuthGateViewState,
  type AuthController,
} from "@client/auth/Auth.ts";

const TITLES: Record<MenuMode, string> = {
  play: "OUTBREAK SECTOR",
  loadout: "LOADOUT",
  settings: "SETTINGS",
  account: "ACCOUNT",
};

/**
 * Describes the API for the landing-menu and auth-gate controller. This
 * controller owns menu tab state, gate text/button state, and the Google
 * sign-in button host, but deliberately knows nothing about gameplay HUD or
 * networking internals.
 */
export type MenuController = {
  /**
   * Returns the currently selected landing-menu tab.
   */
  getMode(): MenuMode;
  /**
   * Updates the visible landing-menu tab and synchronizes the menu title and
   * `aria-current` state on the side buttons.
   */
  setMode(mode: MenuMode): void;
  /**
   * Re-renders the authentication gate from the latest auth-controller state.
   */
  refreshGateUi(): void;
  /**
   * Hides the landing menu and reveals the gameplay shell.
   */
  showGameScreen(): void;
  /**
   * Shows the landing menu again after a disconnect or failed launch.
   */
  showMenuScreen(): void;
};

type MenuControllerOptions = {
  elements: AppElements;
  authController: AuthController;
};

/**
 * Creates the controller responsible for the non-gameplay shell UI. It owns
 * the landing-menu mode state, auth gate rendering, and menu button bindings
 * so those page concerns do not stay embedded in the browser entrypoint.
 */
export function createMenuController({
  elements,
  authController,
}: MenuControllerOptions): MenuController {
  let currentMode: MenuMode = "play";

  function syncGoogleSignInButton(): void {
    if (!elements.accountBtn || !elements.googleSignInTarget) {
      return;
    }

    const fallbackButton = elements.accountBtn as HTMLButtonElement;
    const shouldShowGoogleButton = authController.canRenderGoogleButton();

    fallbackButton.hidden = shouldShowGoogleButton;
    elements.googleSignInTarget.hidden = !shouldShowGoogleButton;

    if (shouldShowGoogleButton) {
      authController.renderGoogleButton(elements.googleSignInTarget);
    }
  }

  function refreshGateUi(): void {
    if (
      !elements.launchBtn ||
      !elements.accountGate ||
      !elements.accountGateText ||
      !elements.accountBtn
    ) {
      return;
    }

    const authState = authController.getState();
    const gateView = createAuthGateViewState(authState);
    const deployButton = elements.launchBtn as HTMLButtonElement;
    const createButton = elements.accountBtn as HTMLButtonElement;

    elements.accountGate.classList.toggle("ok", gateView.showReadyState);
    elements.accountGateText.textContent = gateView.gateText;
    createButton.textContent = gateView.accountButtonText;
    createButton.disabled = gateView.accountButtonDisabled;
    deployButton.disabled = gateView.deployButtonDisabled;

    syncGoogleSignInButton();
  }

  function setMode(mode: MenuMode): void {
    currentMode = mode;
    if (elements.titleEl) {
      elements.titleEl.textContent = TITLES[mode];
    }

    elements.sideButtons.forEach((button) => {
      button.setAttribute(
        "aria-current",
        button.dataset.view === mode ? "true" : "false",
      );
    });
  }

  elements.sideButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const requested = button.dataset.view as MenuMode | undefined;
      if (!requested) {
        return;
      }

      setMode(requested);
    });
  });

  setMode(currentMode);

  return {
    getMode: () => currentMode,
    setMode,
    refreshGateUi,
    showGameScreen(): void {
      if (elements.menuRoot) {
        elements.menuRoot.style.display = "none";
      }
    },
    showMenuScreen(): void {
      if (elements.menuRoot) {
        elements.menuRoot.style.display = "";
      }
    },
  };
}
