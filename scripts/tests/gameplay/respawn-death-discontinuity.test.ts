import { beforeAll, describe, expect, test } from "bun:test";
import {
  bootstrapTestRegistries,
  connectTestClient,
  makeRuntime,
  tick,
} from "../helpers/worldFixtures.ts";

describe("respawn/death discontinuity", () => {
  beforeAll(bootstrapTestRegistries);

  test("death clears input/action state and disables collision", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    runtime.handleAction("client-1", {
      t: "action",
      seq: 1,
      action: "selectHotbar",
      index: 0,
    });
    tick(runtime, 1);
    expect(player.getQueuedActionCount()).toBe(0);

    runtime.handleAction("client-1", {
      t: "action",
      seq: 2,
      action: "selectHotbar",
      index: 0,
    });
    player.handleDeath(runtime.world);
    expect(player.getQueuedActionCount()).toBe(0);
    expect(player.collisionMode).toBe("none");
  });

  test("respawn restores collision mode and resets movement", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    player.vx = 100;
    player.vy = -50;
    player.handleDeath(runtime.world);
    runtime.handleRespawn("client-1");
    expect(player.alive).toBe(true);
    expect(player.collisionMode).toBe("dynamic");
    expect(player.vx).toBe(0);
    expect(player.vy).toBe(0);
  });

  test("respawn position stays within world bounds", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    player.handleDeath(runtime.world);
    runtime.handleRespawn("client-1");
    expect(player.x).toBeGreaterThanOrEqual(0);
    expect(player.y).toBeGreaterThanOrEqual(0);
    expect(player.x).toBeLessThanOrEqual(runtime.world.gameConfig.worldSize.w);
    expect(player.y).toBeLessThanOrEqual(runtime.world.gameConfig.worldSize.h);
  });

  test("duplicate respawn while alive has no effect", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    const startX = player.x;
    const startY = player.y;
    runtime.handleRespawn("client-1");
    expect(player.x).toBe(startX);
    expect(player.y).toBe(startY);
  });
});
