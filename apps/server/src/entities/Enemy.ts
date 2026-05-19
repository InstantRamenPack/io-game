import { GoalControlledEntity } from "@server/entities/GoalControlledEntity.ts";
import {
  getEnemyDeathLootConfig,
  getEnemyDeathMagDropCount,
  getEnemyDeathHunkDropAmount,
  HUNK_ITEM_TYPE_ID,
  requireWeaponRarityTier,
  shouldDropEnemyWeapon,
} from "@server/content/serverContentCapabilities.ts";
import { requireHitboxEntityBaselineContent } from "@server/entities/entityBaselineContent.ts";
import type { Goal } from "@server/goals/Goal.ts";
import { WanderGoal } from "@server/goals/builtin/WanderGoal.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { Inventory } from "@server/items/Inventory.ts";
import type { Weapon } from "@server/items/Weapon.ts";
import { itemTypeRegistry } from "@server/registry/registries.ts";
import type { EnemySnapshot } from "@shared/net/snapshots.ts";
import { getWeaponContent } from "@shared/content/catalog.ts";
import type { World } from "@server/world/World.ts";

type EnemyConfig = {
  weapons?: Weapon[];
  goals?: readonly Goal<Enemy>[];
};

/**
 * Hostile entity with goal-driven targeting and movement state.
 */
export class Enemy extends GoalControlledEntity {
  public static readonly kind = "enemy" as const;

  /**
   * Creates a hostile entity with caller-provided combat and movement defaults.
   * @param id Stable runtime entity id.
   * @param config Enemy tuning and goal stack.
   */
  constructor(id: number, config: EnemyConfig) {
    const content = requireHitboxEntityBaselineContent(
      (new.target as typeof Enemy).typeId,
    );
    super(id, { maxHp: content.maxHp, moveSpeed: content.moveSpeed });
    this.weapons = [...(config.weapons ?? [])];
    this.damageMultiplier = content.combat.damageMultiplier;
    this.registerGoals([...(config.goals ?? []), new WanderGoal<Enemy>(100)]);
    this.collisionMode = content.collisionMode;
    this.setHitboxProfiles(
      content.hitboxProfiles,
      content.activeHitboxProfile ?? "default",
    );
  }

  public override toSnapshot(): EnemySnapshot {
    const snapshot = super.toSnapshot();
    return {
      ...snapshot,
      kind: "enemy",
      targetId: this.targetId,
      equippedItem: this.weapons[0]?.toEquippedItemSnapshot(this),
    };
  }

  public override hasInfiniteReloadMags(): boolean {
    return true;
  }

  public override handleDeath(world: World): void {
    this.spawnDeathLoot(world);
    this.alive = false;
    world.despawn(this.id);
  }

  private spawnDeathLoot(world: World): void {
    const inventory = new Inventory();
    const rng = world.randomNumberGenerator;
    const lootConfig = getEnemyDeathLootConfig(this.typeId);
    inventory.addStackable(
      HUNK_ITEM_TYPE_ID,
      getEnemyDeathHunkDropAmount(lootConfig.rarityTier, rng),
    );

    const rangedWeaponForMags = this.weapons.find(
      (weapon) => getWeaponContent(weapon.typeId)?.attackStyle === "shoot",
    );
    if (rangedWeaponForMags) {
      const weaponContent = getWeaponContent(rangedWeaponForMags.typeId);
      const magItemTypeId =
        weaponContent?.attackStyle === "shoot"
          ? weaponContent.magItemTypeId
          : undefined;
      if (magItemTypeId) {
        const magCount = getEnemyDeathMagDropCount(lootConfig.rarityTier, rng);
        if (magCount > 0) {
          inventory.addStackable(magItemTypeId, magCount);
        }
      }
    }

    for (const weapon of this.weapons) {
      requireWeaponRarityTier(weapon.typeId);
    }

    if (
      this.weapons.length > 0 &&
      shouldDropEnemyWeapon(lootConfig.rarityTier, rng)
    ) {
      const selectedWeapon =
        this.weapons[Math.floor(rng() * this.weapons.length)];
      if (!selectedWeapon) {
        return;
      }
      const itemEntry = itemTypeRegistry.get(selectedWeapon.typeId);
      if (itemEntry) {
        inventory.grantItemCtor(itemEntry.ctor, 1);
      }
    }

    const pickup = new ItemEntity(world.allocEntityId(), inventory);
    pickup.x = this.x;
    pickup.y = this.y;
    world.spawn(pickup);
  }
}
