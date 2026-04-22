import type { SessionUiState } from "@client/app/session/SessionUiStore.ts";

export function isGameplaySession(state: SessionUiState): boolean {
  return state.mode === "playing" || state.mode === "dead";
}

export function isPlayingSession(state: SessionUiState): boolean {
  return state.mode === "playing";
}

export function isDeadSession(state: SessionUiState): boolean {
  return state.mode === "dead";
}

export function isMenuSession(state: SessionUiState): boolean {
  return state.mode === "menu";
}

export function isConnectingSession(state: SessionUiState): boolean {
  return state.mode === "connecting";
}
