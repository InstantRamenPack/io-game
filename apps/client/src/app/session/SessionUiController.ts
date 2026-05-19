import type { AppElements } from "@client/app/AppElements.ts";
import {
  type SessionUiMode,
  type SessionUiState,
  SessionUiStore,
} from "@client/app/session/SessionUiStore.ts";
import {
  isDeadSession,
  isGameplaySession,
} from "@client/app/session/sessionUiSelectors.ts";

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
  store = new SessionUiStore(),
): SessionUiController {
  const syncDom = (state: SessionUiState): void => {
    const showMenu = state.mode === "menu" || state.mode === "connecting";
    if (elements.menuRoot) {
      elements.menuRoot.hidden = !showMenu;
      elements.menuRoot.dataset.sessionMode = state.mode;
    }
    if (elements.gameRoot) {
      elements.gameRoot.hidden = false;
      elements.gameRoot.classList.toggle(
        "is-menu-backdrop",
        state.mode === "menu" || state.mode === "connecting",
      );
    }
    if (elements.chatRoot) {
      elements.chatRoot.hidden = !isGameplaySession(state);
      elements.chatRoot.style.pointerEvents = isDeadSession(state)
        ? "none"
        : "";
    }
  };

  store.onChange(syncDom);
  syncDom(store.getState());

  return {
    getState: () => store.getState(),
    setMode(mode): void {
      store.setMode(mode);
    },
    showMenu(): void {
      store.setMode("menu");
    },
    showConnecting(): void {
      store.setMode("connecting");
    },
    showPlaying(): void {
      store.setMode("playing");
    },
    showDead(): void {
      store.setMode("dead");
    },
  };
}
