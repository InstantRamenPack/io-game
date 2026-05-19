import type { LobbyStateMessage } from "@shared/net/protocol.ts";

type LobbyStateWithoutServerNow = Omit<LobbyStateMessage, "serverNowMs">;

export class LobbyStateCache {
  private readonly serializedStateWithoutNowByClientId = new Map<
    string,
    string
  >();

  public shouldSend(
    clientId: string,
    state: LobbyStateMessage,
    force: boolean,
  ): boolean {
    const fingerprint = this.serializeWithoutServerNow(state);
    if (
      !force &&
      this.serializedStateWithoutNowByClientId.get(clientId) === fingerprint
    ) {
      return false;
    }
    this.serializedStateWithoutNowByClientId.set(clientId, fingerprint);
    return true;
  }

  public clear(clientId: string): void {
    this.serializedStateWithoutNowByClientId.delete(clientId);
  }

  public clearAll(): void {
    this.serializedStateWithoutNowByClientId.clear();
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
