import { beforeAll, describe, expect, test } from "bun:test";
import type seedrandom from "seedrandom";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { Enemy } from "@server/entities/Enemy.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { getItemContent } from "@shared/content/catalog.ts";
import { makeResourceId } from "@shared/ids/ResourceId.ts";
import { isRecipeBlueprintLocked } from "@shared/content/catalog.ts";
import {
  bootstrapTestRegistries,
  connectTestClient,
  makeRuntime,
  spawnEnemy,
  tick,
} from "@tests/helpers/worldFixtures.ts";

const armorTier1Id = makeResourceId("item", "armor_t1");
const armorTier4Id = makeResourceId("item", "armor_t4");

describe("armor system", () => {
  beforeAll(bootstrapTestRegistries);

  test("equipped armor reduces incoming damage and tier 4 reflects chip damage", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    const enemy = spawnEnemy(runtime, "drifter", player.x + 20, player.y);
    expect(enemy).toBeInstanceOf(Enemy);

    player.inventory.addStackable(armorTier4Id, 1);
    const slotIndex = player.inventory.hotbarSlots.findIndex(
      (slot) => slot?.kind === "buildable" && slot.typeId === armorTier4Id,
    );
    expect(slotIndex).toBeGreaterThanOrEqual(0);
    runtime.handleAction("client-1", {
      t: "action",
      seq: 1,
      action: "selectHotbar",
      index: slotIndex,
    });
    runtime.handleAction("client-1", {
      t: "action",
      seq: 2,
      action: "attack",
      theta: 0,
    });
    tick(runtime, 1);

    const hpBefore = player.hp;
    const enemyHpBefore = enemy.hp;
    new DamageEffect(100).apply(runtime.world, enemy, player);
    expect(player.hp).toBeCloseTo(hpBefore - 65, 5);
    expect(enemy.hp).toBeLessThan(enemyHpBefore);
  });

  test("drop action can drop equipped armor when selected hotbar slot is empty", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);

    player.inventory.addStackable(armorTier1Id, 1);
    const armorSlotIndex = player.inventory.hotbarSlots.findIndex(
      (slot) => slot?.kind === "buildable" && slot.typeId === armorTier1Id,
    );
    expect(armorSlotIndex).toBeGreaterThanOrEqual(0);
    runtime.handleAction("client-1", {
      t: "action",
      seq: 1,
      action: "selectHotbar",
      index: armorSlotIndex,
    });
    runtime.handleAction("client-1", {
      t: "action",
      seq: 2,
      action: "attack",
      theta: 0,
    });
    tick(runtime, 1);

    const emptySlotIndex = player.inventory.hotbarSlots.findIndex(
      (slot) => slot === null,
    );
    expect(emptySlotIndex).toBeGreaterThanOrEqual(0);
    runtime.handleAction("client-1", {
      t: "action",
      seq: 3,
      action: "selectHotbar",
      index: emptySlotIndex,
    });
    runtime.handleAction("client-1", {
      t: "action",
      seq: 4,
      action: "drop",
      dropWholeStack: true,
    });
    tick(runtime, 1);

    const pickups = runtime.world.entities
      .all()
      .filter((entity): entity is ItemEntity => entity instanceof ItemEntity);
    const armorPickup = pickups.find(
      (pickup) => pickup.contents.countType(armorTier1Id) > 0,
    );
    expect(armorPickup).toBeDefined();
  });

  test("armor can be moved between dedicated armor slot and hotbar", () => {
    const { runtime } = makeRuntime();
    const { player } = connectTestClient(runtime);
    player.inventory.addStackable(armorTier1Id, 1);
    const armorSlotIndex = player.inventory.hotbarSlots.findIndex(
      (slot) => slot?.kind === "buildable" && slot.typeId === armorTier1Id,
    );
    expect(armorSlotIndex).toBeGreaterThanOrEqual(0);

    runtime.handleAction("client-1", {
      t: "action",
      seq: 1,
      action: "armorMove",
      armorMove: {
        fromSource: "hotbar",
        fromIndex: armorSlotIndex,
        toSource: "armor",
        toIndex: 0,
      },
    });
    tick(runtime, 1);
    expect(player.toSnapshot().armorTypeId).toBe(armorTier1Id);

    runtime.handleAction("client-1", {
      t: "action",
      seq: 2,
      action: "armorMove",
      armorMove: {
        fromSource: "armor",
        fromIndex: 0,
        toSource: "hotbar",
        toIndex: armorSlotIndex,
      },
    });
    tick(runtime, 1);
    expect(player.toSnapshot().armorTypeId).toBeUndefined();
  });

  test("enemies can spawn with armor and can drop it on death", () => {
    const { runtime } = makeRuntime();
    const rngValues = [0.01, 0.0, 0.0, 0.0, 0.0];
    runtime.world.randomNumberGenerator = Object.assign(
      (() => rngValues.shift() ?? 0) as seedrandom.PRNG,
      {
        double: () => rngValues.shift() ?? 0,
        int32: () => 0,
        quick: () => rngValues.shift() ?? 0,
      },
    );

    const enemy = spawnEnemy(runtime, "drifter", 100, 100);
    expect(enemy).toBeInstanceOf(Enemy);
    if (!(enemy instanceof Enemy)) {
      throw new Error("expected spawned enemy");
    }
    const enemySnapshot = enemy.toSnapshot();
    expect(enemySnapshot.armorTypeId).toBeDefined();

    enemy.hp = 0;
    enemy.handleDeath(runtime.world);
    const pickups = runtime.world.entities
      .all()
      .filter((entity): entity is ItemEntity => entity instanceof ItemEntity);
    const droppedArmor = pickups.some(
      (pickup) => (pickup.toSnapshot().inventory?.resources ?? []).length > 0,
    );
    expect(droppedArmor).toBe(true);
  });

  test("armor recipes are sequential and blueprint-gated", () => {
    expect(isRecipeBlueprintLocked(makeResourceId("item", "armor_t1"))).toBe(
      false,
    );
    expect(isRecipeBlueprintLocked(makeResourceId("item", "armor_t2"))).toBe(
      true,
    );
    expect(isRecipeBlueprintLocked(makeResourceId("item", "armor_t3"))).toBe(
      true,
    );
    expect(isRecipeBlueprintLocked(makeResourceId("item", "armor_t4"))).toBe(
      true,
    );

    const t2 = getItemContent(makeResourceId("item", "armor_t2"));
    const t3 = getItemContent(makeResourceId("item", "armor_t3"));
    const t4 = getItemContent(makeResourceId("item", "armor_t4"));
    expect(t2?.recipe?.costs.some((cost) => cost.typeId === armorTier1Id)).toBe(
      true,
    );
    expect(
      t3?.recipe?.costs.some(
        (cost) => cost.typeId === makeResourceId("item", "armor_t2"),
      ),
    ).toBe(true);
    expect(
      t4?.recipe?.costs.some(
        (cost) => cost.typeId === makeResourceId("item", "armor_t3"),
      ),
    ).toBe(true);
  });
});
