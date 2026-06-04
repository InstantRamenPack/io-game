import { beforeAll, describe, expect, test } from "bun:test";
import {
  getItemContent,
  getEntityContent,
  isRecipeBlueprintLocked,
} from "@shared/content/catalog.ts";
import {
  TESLA_SHOCK_DAMAGE,
  TESLA_SHOCK_RADIUS,
  TESLA_WAVE_SPEED_PX_PER_TICK,
} from "@shared/gameplay/teslaShock.ts";
import { makeResourceId, type ResourceId } from "@shared/ids/ResourceId.ts";
import type { NetEvent } from "@shared/net/events.ts";
import type { Enemy } from "@server/entities/Enemy.ts";
import { Tesla } from "@server/entities/buildings/Tesla.ts";
import { entityTypeRegistry } from "@server/registry/registries.ts";
import { getItemLikeTypeEntry } from "@server/registry/itemLikeRegistry.ts";
import {
  bootstrapTestRegistries,
  connectTestClient,
  makeRuntime,
  spawnEnemy,
  tick,
} from "@tests/helpers/worldFixtures.ts";

const teslaItemTypeId = makeResourceId("item", "tesla");
const teslaBuildingTypeId = makeResourceId("building", "tesla");
const teslaBlueprintTypeId = makeResourceId("blueprint", "tesla");
const hunkItemTypeId = makeResourceId("item", "hunk");
const stunnedEffectTypeId = makeResourceId("effect", "stunned");

describe("tesla building", () => {
  beforeAll(bootstrapTestRegistries);

  test("tesla is an epic blueprint-locked 150 hunk buildable with 100 hp", () => {
    const item = getItemContent(teslaItemTypeId);
    const building = getEntityContent(teslaBuildingTypeId);
    const blueprint = getItemContent(teslaBlueprintTypeId);

    expect(item?.rarityTier).toBe("epic");
    expect(item?.buildsEntityTypeId).toBe(teslaBuildingTypeId);
    expect(item?.recipe?.costs).toContainEqual({
      typeId: hunkItemTypeId,
      amount: 150,
    });
    expect(item?.rendering.assetPath).toBe("/buildable/tesla.png");
    expect(building?.maxHp).toBe(100);
    expect(blueprint?.unlocksRecipeTypeId).toBe(teslaItemTypeId);
    expect(isRecipeBlueprintLocked(teslaItemTypeId)).toBe(true);
    expect(getItemLikeTypeEntry(teslaItemTypeId)).toBeDefined();
    expect(entityTypeRegistry.get(teslaBuildingTypeId)).toBeDefined();
  });

  test("tesla shocks an enemy once when the expanding ring reaches them", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    const tesla = new Tesla(runtime.world.allocEntityId(), 1, player.id);
    tesla.x = player.x + 64;
    tesla.y = player.y;
    runtime.world.spawn(tesla);

    const enemy = spawnEnemy(runtime, "shoota", tesla.x + 20, tesla.y) as Enemy;
    const startingHp = enemy.hp;
    const maxTicksBeforeHit = Math.ceil(
      TESLA_SHOCK_RADIUS / TESLA_WAVE_SPEED_PX_PER_TICK,
    );
    let ticksUntilHit = -1;

    for (let ticks = 0; ticks < maxTicksBeforeHit; ticks += 1) {
      tick(runtime, 1);
      if (enemy.hp < startingHp) {
        ticksUntilHit = ticks + 1;
        break;
      }
    }

    expect(ticksUntilHit).toBeGreaterThan(1);
    expect(enemy.hp).toBe(startingHp - TESLA_SHOCK_DAMAGE);
    const stunnedEffect = enemy.activeEffects.find(
      (effect) => effect.typeId === stunnedEffectTypeId,
    );
    expect(stunnedEffect?.ticksRemaining).toBe(19);
    expect(stunnedEffect?.preventsAction).toBe(true);

    tick(runtime, 1);

    expect(enemy.hp).toBe(startingHp - TESLA_SHOCK_DAMAGE);
  });

  test("tesla emits a tesla_shock event when a shock wave starts", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    const tesla = new Tesla(runtime.world.allocEntityId(), 1, player.id);
    tesla.x = player.x + 64;
    tesla.y = player.y;
    runtime.world.spawn(tesla);

    spawnEnemy(runtime, "shoota", tesla.x + 36, tesla.y);

    runtime.world.step();

    const shockEvents = runtime.world.events
      .toArray()
      .filter(
        (event): event is Extract<NetEvent, { type: "tesla_shock" }> =>
          event.type === "tesla_shock",
      );
    expect(shockEvents).toHaveLength(1);
    expect(shockEvents[0]?.payload.sourceId).toBe(tesla.id);
    expect(shockEvents[0]?.payload.radius).toBe(TESLA_SHOCK_RADIUS);
  });
});
