/**
 * Collects every DOM node that the client entrypoint manipulates directly.
 * Centralizing this lookup keeps the rest of the app working with one typed
 * structure rather than repeating ad hoc `document.getElementById(...)` calls
 * throughout unrelated controller modules.
 */
export type AppElements = {
  launchBtn: HTMLButtonElement;
  menuRoot: HTMLElement;
  gameRoot: HTMLElement;
  chatRoot: HTMLElement;
  chatLines: HTMLElement;
  chatInput: HTMLInputElement;
  chatSuggestions: HTMLElement;
  lobbyHudRoot: HTMLElement;
  lobbyHudStatus: HTMLElement;
  lobbyHudMeta: HTMLElement;
  lobbyJoinBtn: HTMLButtonElement;
  lobbyStartBtn: HTMLButtonElement;
  lobbyLeaveBtn: HTMLButtonElement;
  lobbyCodeInput: HTMLInputElement;
  lobbyCodeJoinBtn: HTMLButtonElement;
  gameStartPrompt: HTMLElement;
  matchCoreHud: HTMLElement;
  playerNameInput: HTMLInputElement;
  playerNameError: HTMLElement;
  deathOverlay: HTMLElement;
  respawnBtn: HTMLButtonElement;
  spectateHud: HTMLElement;
  spectateHudName: HTMLElement;
  gameOverOverlay: HTMLElement;
  gameOverKicker: HTMLElement;
  gameOverTitle: HTMLElement;
  gameOverDuration: HTMLElement;
  gameOverWaves: HTMLElement;
  gameOverReturnBtn: HTMLButtonElement;
  gameOverPlayAgainBtn: HTMLButtonElement;
  gameOverHomeBtn: HTMLButtonElement;
};

function requireElement<TElement extends HTMLElement>(
  selector: string,
  resolve: () => Element | null,
): TElement {
  const element = resolve();
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing app element: ${selector}`);
  }
  return element as TElement;
}

function byId<TElement extends HTMLElement>(id: string): TElement {
  return requireElement<TElement>(`#${id}`, () => document.getElementById(id));
}

export function getAppElements(): AppElements {
  return {
    launchBtn: byId("launch-btn"),
    menuRoot: requireElement('[data-screen="menu"]', () =>
      document.querySelector('[data-screen="menu"]'),
    ),
    gameRoot: byId("game-root"),
    chatRoot: byId("chat-root"),
    chatLines: byId("chat-lines"),
    chatInput: byId("chat-input"),
    chatSuggestions: byId("chat-suggestions"),
    lobbyHudRoot: byId("lobby-hud-root"),
    lobbyHudStatus: byId("lobby-hud-status"),
    lobbyHudMeta: byId("lobby-hud-meta"),
    lobbyJoinBtn: byId("lobby-join-btn"),
    lobbyStartBtn: byId("lobby-start-btn"),
    lobbyLeaveBtn: byId("lobby-leave-btn"),
    lobbyCodeInput: byId("lobby-code-input"),
    lobbyCodeJoinBtn: byId("lobby-code-join-btn"),
    gameStartPrompt: byId("game-start-prompt"),
    matchCoreHud: byId("match-core-hud"),
    playerNameInput: byId("player-name-input"),
    playerNameError: byId("player-name-error"),
    deathOverlay: byId("death-overlay"),
    respawnBtn: byId("respawn-btn"),
    spectateHud: byId("spectate-hud"),
    spectateHudName: byId("spectate-hud-name"),
    gameOverOverlay: byId("game-over-overlay"),
    gameOverKicker: byId("game-over-kicker"),
    gameOverTitle: byId("game-over-title"),
    gameOverDuration: byId("game-over-duration"),
    gameOverWaves: byId("game-over-waves"),
    gameOverReturnBtn: byId("game-over-return-btn"),
    gameOverPlayAgainBtn: byId("game-over-play-again-btn"),
    gameOverHomeBtn: byId("game-over-home-btn"),
  };
}
