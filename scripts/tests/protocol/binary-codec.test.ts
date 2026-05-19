import { describe, expect, test } from "bun:test";
import {
  encodeClientToServerMessage,
  encodeServerToClientMessage,
  parseClientToServerMessage,
  parseServerToClientMessage,
} from "@shared/net/protocol.ts";
import {
  makeEnemySnapshot,
  makePlayerSnapshot,
  makeSnapshot,
} from "@tests/helpers/snapshotFixtures.ts";

describe("binary protocol codec", () => {
  test("bitpacked input round-trips within angle quantization tolerance", () => {
    const input = {
      t: "input",
      seq: 42,
      clientTimeMs: 1234,
      theta: 1.2345,
      movement: { up: true, down: false, left: true, right: false },
    } as const;

    const encoded = encodeClientToServerMessage(input);
    const decoded = parseClientToServerMessage(encoded);

    expect(encoded.byteLength).toBeLessThan(JSON.stringify(input).length * 0.5);
    expect(decoded?.t).toBe("input");
    if (decoded?.t === "input") {
      expect(decoded.seq).toBe(input.seq);
      expect(decoded.clientTimeMs).toBe(input.clientTimeMs);
      expect(decoded.movement).toEqual(input.movement);
      expect(decoded.theta).toBeCloseTo(input.theta, 4);
    }
  });

  test("compact snapshot round-trips and beats JSON baseline by at least 50%", () => {
    const snapshot = makeSnapshot(
      25,
      [
        makePlayerSnapshot(1, 100.123, 200.456),
        makeEnemySnapshot(2, 140.2, 260.8),
        makeEnemySnapshot(3, 144.5, 261.1),
        makeEnemySnapshot(4, 148.9, 262.3),
      ],
      { full: false, removedEntityIds: [99, 100] },
    );
    const message = { t: "snapshot", snapshot } as const;

    const jsonBytes = JSON.stringify(message).length;
    const encoded = encodeServerToClientMessage(message);
    const decoded = parseServerToClientMessage(encoded);

    expect(encoded.byteLength).toBeLessThanOrEqual(jsonBytes * 0.5);
    expect(decoded?.t).toBe("snapshot");
    if (decoded?.t === "snapshot") {
      expect(decoded.snapshot.tick).toBe(snapshot.tick);
      expect(decoded.snapshot.full).toBe(false);
      expect(decoded.snapshot.entities.length).toBe(snapshot.entities.length);
      expect(decoded.snapshot.removedEntityIds).toEqual([99, 100]);
      expect(decoded.snapshot.entities[0]?.x).toBeCloseTo(100.1, 1);
      expect(decoded.snapshot.entities[0]?.y).toBeCloseTo(200.5, 1);
    }
  });

  test("corrupt binary payloads fail closed", () => {
    expect(parseClientToServerMessage(new Uint8Array([0xff, 0x00]))).toBeNull();
    expect(parseServerToClientMessage(new Uint8Array([0xff, 0x00]))).toBeNull();
  });
});
