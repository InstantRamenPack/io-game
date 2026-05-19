const PLAYER_NAME_STORAGE_KEY = "zombs-player-name";

/**
 * Loads the player name from browser storage. First-time players start with an
 * empty field so they must choose their own visible lobby name.
 */
function loadInitialPlayerName(): string {
  return window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY)?.trim() ?? "";
}

/**
 * Seeds the visible player-name input with the persisted value that will be
 * used for the next launch.
 */
export function hydratePlayerNameInput(input: HTMLInputElement | null): void {
  if (!input) {
    return;
  }

  input.value = loadInitialPlayerName();
}

/**
 * Normalizes the player name entered by the user, persists non-empty names to
 * local storage, and mirrors the normalized result back into the input element.
 */
export function resolvePlayerName(input: HTMLInputElement | null): string {
  const rawPlayerName = input?.value ?? "";
  const nextPlayerName = rawPlayerName.trim();
  if (nextPlayerName) {
    window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, nextPlayerName);
  }

  if (input) {
    input.value = nextPlayerName;
  }

  return nextPlayerName;
}
