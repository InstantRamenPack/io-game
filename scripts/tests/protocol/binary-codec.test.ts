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
import type { WorldSnapshot } from "@shared/net/snapshots.ts";

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

  test("compact map markers preserve village risk and tier metadata", () => {
    const snapshot = {
      ...makeSnapshot(26, [makePlayerSnapshot(1, 100, 200)], { full: true }),
      map: {
        seed: 1337,
        sectorSize: 4096,
        centerSectorId: "sector_1_1",
        extractionSectorId: "sector_0_0",
        dungeonSectorId: "sector_2_2",
        dungeonBounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
        militarySectorId: "sector_0_1",
        forestSectorId: "sector_1_0",
        sectors: [],
        features: [],
        markers: [
          {
            id: "sector_0_0_village_0",
            label: "Fortified Village",
            archetype: "extraction",
            importance: "major",
            discoveredByDefault: true,
            x: 1200,
            y: 1300,
            risk: "boss",
            tier: "epic",
          },
          {
            id: "sector_0_1_village_0",
            label: "Village",
            archetype: "military",
            importance: "major",
            discoveredByDefault: false,
            x: 2400,
            y: 2600,
            risk: "medium",
            tier: "uncommon",
          },
        ],
      },
    } satisfies WorldSnapshot;
    const encoded = encodeServerToClientMessage({ t: "snapshot", snapshot });
    const decoded = parseServerToClientMessage(encoded);

    expect(decoded?.t).toBe("snapshot");
    if (decoded?.t === "snapshot") {
      expect(decoded.snapshot.map?.markers).toEqual(snapshot.map.markers);
    }
  });

  test("corrupt binary payloads fail closed", () => {
    expect(parseClientToServerMessage(new Uint8Array([0xff, 0x00]))).toBeNull();
    expect(parseServerToClientMessage(new Uint8Array([0xff, 0x00]))).toBeNull();
  });
});
