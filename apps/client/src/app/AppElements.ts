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
  hudRoot: HTMLElement | null;
  worldStat: HTMLElement | null;
  worldDetail: HTMLElement | null;
  resourceStrip: HTMLElement | null;
  effectStrip: HTMLElement | null;
  hotbarList: HTMLElement | null;
  placementPanel: HTMLElement | null;
  buildList: HTMLElement | null;
  buildHint: HTMLElement | null;
  craftingPanel: HTMLElement | null;
  craftingList: HTMLElement | null;
  craftingHint: HTMLElement | null;
  playerNameInput: HTMLInputElement | null;
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
    hudRoot: document.getElementById("hud-root"),
    worldStat: document.getElementById("world-stat"),
    worldDetail: document.getElementById("world-detail"),
    resourceStrip: document.getElementById("resource-strip"),
    effectStrip: document.getElementById("effect-strip"),
    hotbarList: document.getElementById("hotbar-list"),
    placementPanel: document.getElementById("placement-panel"),
    buildList: document.getElementById("build-list"),
    buildHint: document.getElementById("build-hint"),
    craftingPanel: document.getElementById("crafting-panel"),
    craftingList: document.getElementById("crafting-list"),
    craftingHint: document.getElementById("crafting-hint"),
    playerNameInput: document.getElementById(
      "player-name-input",
    ) as HTMLInputElement | null,
  };
}
