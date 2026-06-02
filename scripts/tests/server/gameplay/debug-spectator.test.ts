import { beforeAll, describe, expect, test } from "bun:test";
import {
  getBlueprintLockedRecipeTypeIds,
  getItemContent,
} from "@shared/content/catalog.ts";
import { makeResourceId } from "@shared/ids/ResourceId.ts";
import { Hub } from "@server/entities/buildings/Hub.ts";
import { Player } from "@server/entities/Player.ts";
import {
  bootstrapTestRegistries,
  connectTestClient,
  makeRuntime,
  spawnWall,
  tick,
} from "@tests/helpers/worldFixtures.ts";

const hunkItemId = makeResourceId("item", "hunk");
const heavyPistolItemId = makeResourceId("item", "heavy_pistol");

describe("debug spectator player", () => {
  beforeAll(bootstrapTestRegistries);

  test("debug player is faster and uses noclip collision mode", () => {
    const normal = new Player(1, "player");
    const debug = new Player(2, "debug");

    expect(debug.moveSpeed).toBeGreaterThan(normal.moveSpeed);
    expect(debug.collisionMode).toBe("none");
  });

  test("debug player can still build", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime, "client-1", "debug");

    expect(
      runtime.antiCheatValidator.validateAction(
        {
          t: "action",
          seq: 1,
          action: "build",
          build: { x: player.x, y: player.y },
        },
        player,
        runtime.world,
      ),
    ).toBe(true);
  });

  test("debug player still moves from input intent", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime, "client-1", "debug");
    const startX = player.x;

    runtime.handleInputIntent("client-1", {
      t: "input",
      seq: 1,
      theta: 0,
      movement: { up: false, down: false, left: false, right: true },
    });
    runtime.world.step();
    runtime.world.step();

    expect(player.x).toBeGreaterThan(startX);
  });

  test("debug player ignores collision while moving", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime, "client-1", "debug");
    spawnWall(runtime, player.x + 8, player.y);
    const startX = player.x;

    for (let step = 0; step < 8; step += 1) {
      runtime.handleInputIntent("client-1", {
        t: "input",
        seq: step + 1,
        theta: 0,
        movement: { up: false, down: false, left: false, right: true },
      });
      runtime.world.step();
    }

    expect(player.x).toBeGreaterThan(startX + 8);
  });

  test("debug player is invincible", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime, "client-1", "debug");
    const hpBefore = player.hp;

    player.applyDamage(runtime.world, 9999, 999);

    expect(player.hp).toBe(hpBefore);
    expect(player.alive).toBe(true);
  });

  test("debug player starts with all blueprint recipes unlocked", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime, "client-1", "debug");

    for (const recipeTypeId of getBlueprintLockedRecipeTypeIds()) {
      expect(player.inventory.isRecipeUnlocked(recipeTypeId)).toBe(true);
    }
  });

  test("debug player crafting does not consume hunk", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime, "client-1", "debug");
    const station = new Hub(runtime.world.allocEntityId());
    station.x = player.x;
    station.y = player.y;
    runtime.world.spawn(station);
    tick(runtime, 1);

    const hunksBefore = player.inventory.getResourceCount(hunkItemId);
    expect(hunksBefore).toBeGreaterThan(0);

    player.craft(runtime.world, heavyPistolItemId);
    expect(player.inventory.countType(heavyPistolItemId)).toBe(1);
    expect(player.inventory.getResourceCount(hunkItemId)).toBe(hunksBefore);

    const recipeHunkCost =
      getItemContent(heavyPistolItemId)?.recipe?.costs.find(
        (cost) => cost.typeId === hunkItemId,
      )?.amount ?? 0;
    expect(recipeHunkCost).toBeGreaterThan(0);
  });
});
