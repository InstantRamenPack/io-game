/**
 * Enumerates the top-level menu tabs available on the landing screen.
 * The UI uses these values both for screen-title selection and for
 * `aria-current` synchronization on the left-side button list.
 */
export type MenuMode = "play" | "loadout" | "settings" | "account";

/**
 * Collects every DOM node that the client entrypoint manipulates directly.
 * Centralizing this lookup keeps the rest of the app working with one typed
 * structure rather than repeating ad hoc `document.getElementById(...)` calls
 * throughout unrelated controller modules.
 */
export type AppElements = {
  titleEl: HTMLElement | null;
  sideButtons: HTMLButtonElement[];
  launchBtn: HTMLElement | null;
  accountGate: HTMLElement | null;
  accountGateText: HTMLElement | null;
  accountBtn: HTMLElement | null;
  googleSignInTarget: HTMLElement | null;
  menuRoot: HTMLElement | null;
  gameRoot: HTMLElement | null;
  chatRoot: HTMLElement | null;
  chatLines: HTMLElement | null;
  chatInput: HTMLInputElement | null;
  chatSuggestions: HTMLElement | null;
  playerNameInput: HTMLInputElement | null;
  deathOverlay: HTMLElement | null;
  respawnBtn: HTMLButtonElement | null;
};

/**
 * Resolves all DOM handles used by the browser client exactly once.
 * The returned object is intentionally permissive (`null` is allowed) so the
 * controllers can degrade gracefully when a specific host element is missing.
 */
export function getAppElements(): AppElements {
  return {
    titleEl: document.getElementById("menu-title"),
    sideButtons: Array.from(
      document.querySelectorAll<HTMLButtonElement>(".side-menu button"),
    ),
    launchBtn: document.getElementById("launch-btn"),
    accountGate: document.getElementById("account-gate"),
    accountGateText: document.getElementById("account-gate-text"),
    accountBtn: document.getElementById("account-btn"),
    googleSignInTarget: document.getElementById("google-signin-target"),
    menuRoot: document.querySelector<HTMLElement>('[data-screen="menu"]'),
    gameRoot: document.getElementById("game-root"),
    chatRoot: document.getElementById("chat-root"),
    chatLines: document.getElementById("chat-lines"),
    chatInput: document.getElementById("chat-input") as HTMLInputElement | null,
    chatSuggestions: document.getElementById("chat-suggestions"),
    playerNameInput: document.getElementById(
      "player-name-input",
    ) as HTMLInputElement | null,
    deathOverlay: document.getElementById("death-overlay"),
    respawnBtn: document.getElementById(
      "respawn-btn",
    ) as HTMLButtonElement | null,
  };
}
