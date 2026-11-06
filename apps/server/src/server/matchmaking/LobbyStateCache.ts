import type { LobbyStateMessage } from "@shared/net/protocol.ts";

type LobbyStateWithoutServerNow = Omit<LobbyStateMessage, "serverNowMs">;
const LOBBY_STATE_REFRESH_MS = 5_000;

export class LobbyStateCache {
  private readonly stateByClientId = new Map<
    string,
    { fingerprint: string; sentAtMs: number }
  >();

  public shouldSend(
    clientId: string,
    state: LobbyStateMessage,
    force: boolean,
  ): boolean {
    const fingerprint = this.serializeWithoutServerNow(state);
    const previous = this.stateByClientId.get(clientId);
    const elapsedMs = state.serverNowMs - (previous?.sentAtMs ?? 0);
    if (
      !force &&
      previous?.fingerprint === fingerprint &&
      elapsedMs >= 0 &&
      elapsedMs < LOBBY_STATE_REFRESH_MS
    ) {
      return false;
    }
    // A dropped control message must not leave the lobby UI stale indefinitely.
    this.stateByClientId.set(clientId, {
      fingerprint,
      sentAtMs: state.serverNowMs,
    });
    return true;
  }

  public clear(clientId: string): void {
    this.stateByClientId.delete(clientId);
  }

  public clearAll(): void {
    this.stateByClientId.clear();
  }

  private serializeWithoutServerNow(state: LobbyStateMessage): string {
    const stateWithoutNow: LobbyStateWithoutServerNow = {
      t: state.t,
      inLobby: state.inLobby,
      isHost: state.isHost,
      lobbyCode: state.lobbyCode,
      playerCount: state.playerCount,
      maxPlayers: state.maxPlayers,
      createdAtMs: state.createdAtMs,
      countdownEndsAtMs: state.countdownEndsAtMs,
      startedAtMs: state.startedAtMs,
    };
    return JSON.stringify(stateWithoutNow);
  }
}
