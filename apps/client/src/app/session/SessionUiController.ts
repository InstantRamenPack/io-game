import type { AppElements } from "@client/app/AppElements.ts";
import {
  isDeadSession,
  isGameplaySession,
} from "@client/app/session/sessionUiSelectors.ts";

export type SessionUiMode = "menu" | "connecting" | "playing" | "dead";

export type SessionUiState = {
  mode: SessionUiMode;
};

export type SessionUiController = {
  getState(): SessionUiState;
  setMode(mode: SessionUiMode): void;
  showMenu(): void;
  showConnecting(): void;
  showPlaying(): void;
  showDead(): void;
};

export function createSessionUiController(
  elements: AppElements,
): SessionUiController {
  let state: SessionUiState = { mode: "menu" };

  const syncDom = (state: SessionUiState): void => {
    const showMenu = state.mode === "menu" || state.mode === "connecting";
    elements.menuRoot.hidden = !showMenu;
    elements.menuRoot.dataset.sessionMode = state.mode;
    elements.gameRoot.hidden = false;
    elements.gameRoot.classList.toggle(
      "is-menu-backdrop",
      state.mode === "menu" || state.mode === "connecting",
    );
    elements.chatRoot.hidden = !isGameplaySession(state);
    elements.chatRoot.style.pointerEvents = isDeadSession(state) ? "none" : "";
  };

  function setMode(mode: SessionUiMode): void {
    if (state.mode === mode) {
      return;
    }
    state = { mode };
    syncDom(state);
  }

  syncDom(state);

  return {
    getState: () => state,
    setMode(mode): void {
      setMode(mode);
    },
    showMenu(): void {
      setMode("menu");
    },
    showConnecting(): void {
      setMode("connecting");
    },
    showPlaying(): void {
      setMode("playing");
    },
    showDead(): void {
      setMode("dead");
    },
  };
}
