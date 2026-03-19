const PLAYER_NAME_STORAGE_KEY = "zombs-player-name";

/**
 * Creates the fallback player name used when the user has never typed one and
 * no previous value exists in local storage. The function intentionally keeps
 * the format simple so the same name can be regenerated consistently in tests.
 */
function createDefaultPlayerName(): string {
  return `Player-${Math.floor(100 + Math.random() * 900)}`;
}

/**
 * Loads the player name from browser storage and falls back to a generated
 * anonymous label when no saved value exists. This helper keeps persistence
 * logic out of the UI controllers so they can treat the input as plain state.
 */
export function loadInitialPlayerName(): string {
  const storedPlayerName = window.localStorage
    .getItem(PLAYER_NAME_STORAGE_KEY)
    ?.trim();
  return storedPlayerName || createDefaultPlayerName();
}

/**
 * Seeds the visible player-name input with the persisted or generated value
 * that will be used for the next launch. Calling this during startup keeps the
 * text field and the underlying launch logic synchronized from the start.
 */
export function hydratePlayerNameInput(input: HTMLInputElement | null): void {
  if (!input) {
    return;
  }

  input.value = loadInitialPlayerName();
}

/**
 * Normalizes the player name entered by the user, persists it to local
 * storage, and mirrors the normalized result back into the input element.
 * The return value is always non-empty so launch code does not need separate
 * validation or fallback behavior.
 */
export function resolvePlayerName(input: HTMLInputElement | null): string {
  const rawPlayerName = input?.value ?? "";
  const trimmedPlayerName = rawPlayerName.trim();
  const nextPlayerName = trimmedPlayerName || createDefaultPlayerName();
  window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, nextPlayerName);

  if (input) {
    input.value = nextPlayerName;
  }

  return nextPlayerName;
}
