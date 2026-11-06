import { expect, test } from "bun:test";
import { LobbyStateCache } from "@server/server/matchmaking/LobbyStateCache.ts";
import type { LobbyStateMessage } from "@shared/net/protocol.ts";

test("lost lobby transitions recover by wall-clock refresh even at low TPS", () => {
  const cache = new LobbyStateCache();
  const state: LobbyStateMessage = {
    t: "lobby_state",
    inLobby: true,
    isHost: true,
    playerCount: 1,
    maxPlayers: 5,
    serverNowMs: 1000,
    startedAtMs: null,
  };
  expect(cache.shouldSend("a", state, false)).toBe(true);
  state.startedAtMs = 1200;
  state.serverNowMs = 1200;
  expect(cache.shouldSend("a", state, false)).toBe(true); // Simulate dropping this packet.
  for (const now of [1700, 2200, 5700]) {
    state.serverNowMs = now;
    expect(cache.shouldSend("a", state, false)).toBe(false);
  }
  state.serverNowMs = 6200;
  expect(cache.shouldSend("a", state, false)).toBe(true);
  expect(cache.shouldSend("a", state, false)).toBe(false);
  expect(cache.shouldSend("a", state, true)).toBe(true);
  expect(cache.shouldSend("b", state, false)).toBe(true);
  cache.clear("a");
  expect(cache.shouldSend("a", state, false)).toBe(true);
  state.serverNowMs = 100; // Clock correction must not suppress updates forever.
  expect(cache.shouldSend("a", state, false)).toBe(true);
  cache.clearAll();
  expect(cache.shouldSend("b", state, false)).toBe(true);
});
