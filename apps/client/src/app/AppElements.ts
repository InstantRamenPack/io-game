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
  lobbyHudRoot: HTMLElement | null;
  lobbyHudStatus: HTMLElement | null;
  lobbyHudMeta: HTMLElement | null;
  lobbyJoinBtn: HTMLButtonElement | null;
  lobbyLeaveBtn: HTMLButtonElement | null;
  lobbyCodeInput: HTMLInputElement | null;
  lobbyCodeJoinBtn: HTMLButtonElement | null;
  trainingGroundBanner: HTMLElement | null;
  gameStartPrompt: HTMLElement | null;
  matchCoreHud: HTMLElement | null;
  playerNameInput: HTMLInputElement | null;
  deathOverlay: HTMLElement | null;
  respawnBtn: HTMLButtonElement | null;
  spectateHud: HTMLElement | null;
  spectateHudName: HTMLElement | null;
  gameOverOverlay: HTMLElement | null;
  gameOverKicker: HTMLElement | null;
  gameOverTitle: HTMLElement | null;
  gameOverDuration: HTMLElement | null;
  gameOverWaves: HTMLElement | null;
  gameOverReturnBtn: HTMLButtonElement | null;
  gameOverPlayAgainBtn: HTMLButtonElement | null;
  gameOverHomeBtn: HTMLButtonElement | null;
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
    lobbyHudRoot: document.getElementById("lobby-hud-root"),
    lobbyHudStatus: document.getElementById("lobby-hud-status"),
    lobbyHudMeta: document.getElementById("lobby-hud-meta"),
    lobbyJoinBtn: document.getElementById(
      "lobby-join-btn",
    ) as HTMLButtonElement | null,
    lobbyLeaveBtn: document.getElementById(
      "lobby-leave-btn",
    ) as HTMLButtonElement | null,
    lobbyCodeInput: document.getElementById(
      "lobby-code-input",
    ) as HTMLInputElement | null,
    lobbyCodeJoinBtn: document.getElementById(
      "lobby-code-join-btn",
    ) as HTMLButtonElement | null,
    trainingGroundBanner: document.getElementById("training-ground-banner"),
    gameStartPrompt: document.getElementById("game-start-prompt"),
    matchCoreHud: document.getElementById("match-core-hud"),
    playerNameInput: document.getElementById(
      "player-name-input",
    ) as HTMLInputElement | null,
    deathOverlay: document.getElementById("death-overlay"),
    respawnBtn: document.getElementById(
      "respawn-btn",
    ) as HTMLButtonElement | null,
    spectateHud: document.getElementById("spectate-hud"),
    spectateHudName: document.getElementById("spectate-hud-name"),
    gameOverOverlay: document.getElementById("game-over-overlay"),
    gameOverKicker: document.getElementById("game-over-kicker"),
    gameOverTitle: document.getElementById("game-over-title"),
    gameOverDuration: document.getElementById("game-over-duration"),
    gameOverWaves: document.getElementById("game-over-waves"),
    gameOverReturnBtn: document.getElementById(
      "game-over-return-btn",
    ) as HTMLButtonElement | null,
    gameOverPlayAgainBtn: document.getElementById(
      "game-over-play-again-btn",
    ) as HTMLButtonElement | null,
    gameOverHomeBtn: document.getElementById(
      "game-over-home-btn",
    ) as HTMLButtonElement | null,
  };
}
