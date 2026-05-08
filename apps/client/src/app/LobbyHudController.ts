import type { AppElements } from "@client/app/AppElements.ts";
import type { GameClient } from "@client/client/GameClient.ts";
import type { LobbyStateMessage } from "@shared/net/protocol.ts";

export type LobbyHudController = {
  setVisible: (visible: boolean) => void;
};

type LobbyHudControllerOptions = {
  elements: AppElements;
  gameClient: GameClient;
};

export function createLobbyHudController({
  elements,
  gameClient,
}: LobbyHudControllerOptions): LobbyHudController {
  const root = elements.lobbyHudRoot;
  const statusEl = elements.lobbyHudStatus;
  const metaEl = elements.lobbyHudMeta;
  const joinBtn = elements.lobbyJoinBtn;
  const leaveBtn = elements.lobbyLeaveBtn;
  const codeInput = elements.lobbyCodeInput;
  const joinCodeBtn = elements.lobbyCodeJoinBtn;
  const gameStartPrompt = elements.gameStartPrompt;
  const matchCoreHud = elements.matchCoreHud;
  const trainingGroundBanner = elements.trainingGroundBanner;

  if (
    !root ||
    !statusEl ||
    !metaEl ||
    !joinBtn ||
    !leaveBtn ||
    !codeInput ||
    !joinCodeBtn
  ) {
    return {
      setVisible: () => undefined,
    };
  }

  let isVisible = false;
  let lastState: LobbyStateMessage | undefined;
  let lastStartedAtMs: number | null = null;
  let promptHideTimeout: number | undefined;
  let serverTimeOffsetMs = 0;

  const showGameStartPrompt = (): void => {
    if (!gameStartPrompt || !isVisible) {
      return;
    }
    gameStartPrompt.hidden = false;
    if (promptHideTimeout !== undefined) {
      window.clearTimeout(promptHideTimeout);
    }
    promptHideTimeout = window.setTimeout(() => {
      gameStartPrompt.hidden = true;
      promptHideTimeout = undefined;
    }, 3000);
  };

  const render = (): void => {
    if (!isVisible) {
      return;
    }
    const state = gameClient.getLobbyState() ?? lastState;
    if (!state || !state.inLobby) {
      root.hidden = !isVisible;
      statusEl.textContent = "No lobby queue selected";
      metaEl.textContent = "Join an open lobby or enter a code.";
      leaveBtn.disabled = true;
      if (matchCoreHud) {
        matchCoreHud.hidden = true;
      }
      if (trainingGroundBanner) {
        trainingGroundBanner.hidden = !isVisible;
      }
      lastStartedAtMs = null;
      return;
    }

    lastState = state;
    const nowMs = Date.now() + serverTimeOffsetMs;
    const ageSeconds =
      state.createdAtMs === undefined
        ? 0
        : Math.max(0, Math.floor((nowMs - state.createdAtMs) / 1000));
    const inStartedMatch =
      state.startedAtMs !== null && state.startedAtMs !== undefined;

    if (trainingGroundBanner) {
      trainingGroundBanner.hidden = !isVisible || inStartedMatch;
    }

    if (inStartedMatch) {
      root.hidden = true;
      if (matchCoreHud) {
        const elapsedSeconds = Math.max(
          0,
          Math.floor((nowMs - (state.startedAtMs ?? nowMs)) / 1000),
        );
        matchCoreHud.textContent = `CORE | ${
          state.lobbyCode ?? "UNKNOWN"
        } | ${formatClock(elapsedSeconds)}`;
        matchCoreHud.hidden = !isVisible;
      }
      return;
    }

    root.hidden = !isVisible;
    if (matchCoreHud) {
      matchCoreHud.hidden = true;
    }

    let countdownText = "Waiting for 2 players";
    if (state.startedAtMs !== null && state.startedAtMs !== undefined) {
      countdownText = "Game started";
    } else if (
      state.countdownEndsAtMs !== null &&
      state.countdownEndsAtMs !== undefined
    ) {
      const countdownSeconds = Math.max(
        0,
        Math.ceil((state.countdownEndsAtMs - nowMs) / 1000),
      );
      countdownText = `Starting in ${countdownSeconds}s`;
    }

    statusEl.textContent = `Lobby ${state.lobbyCode ?? "UNKNOWN"} • ${state.playerCount}/${state.maxPlayers}`;
    metaEl.textContent = `Queue age ${ageSeconds}s • ${countdownText}`;
    leaveBtn.disabled = false;
  };

  joinBtn.addEventListener("click", () => {
    gameClient.requestJoinLobby();
  });

  leaveBtn.addEventListener("click", () => {
    gameClient.requestLeaveLobby();
  });

  const joinByCode = (): void => {
    const lobbyCode = codeInput.value.trim().toUpperCase();
    if (!lobbyCode) {
      return;
    }
    gameClient.requestJoinLobbyByCode(lobbyCode);
    codeInput.value = "";
  };

  joinCodeBtn.addEventListener("click", joinByCode);
  codeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      joinByCode();
    }
  });

  gameClient.onLobbyStateUpdated((state) => {
    serverTimeOffsetMs = state.serverNowMs - Date.now();
    const startedAtMs = state.startedAtMs ?? null;
    if (startedAtMs !== null && startedAtMs !== lastStartedAtMs) {
      showGameStartPrompt();
    }
    lastStartedAtMs = startedAtMs;
    lastState = state;
    render();
  });

  window.setInterval(() => {
    render();
  }, 250);

  return {
    setVisible(visible: boolean): void {
      isVisible = visible;
      root.hidden = !visible;
      if (matchCoreHud) {
        matchCoreHud.hidden = true;
      }
      if (!visible && gameStartPrompt) {
        gameStartPrompt.hidden = true;
      }
      if (!visible && trainingGroundBanner) {
        trainingGroundBanner.hidden = true;
      }
      if (!visible && promptHideTimeout !== undefined) {
        window.clearTimeout(promptHideTimeout);
        promptHideTimeout = undefined;
      }
      render();
    },
  };
}

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0",
  )}`;
}
