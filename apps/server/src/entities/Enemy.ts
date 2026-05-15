import { GoalControlledEntity } from "@server/entities/GoalControlledEntity.ts";
import {
  getEnemyDeathHunkDropAmount,
  HUNK_ITEM_TYPE_ID,
  shouldDropAllDeathWeapons,
} from "@server/content/serverContentCapabilities.ts";
import { requireHitboxEntityBaselineContent } from "@server/entities/entityBaselineContent.ts";
import type { Goal } from "@server/goals/Goal.ts";
import { WanderGoal } from "@server/goals/builtin/WanderGoal.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { Inventory } from "@server/items/Inventory.ts";
import type { Weapon } from "@server/items/Weapon.ts";
import { grantItemEntryByAcquisitionRules } from "@server/items/acquisition/granting.ts";
import { itemTypeRegistry } from "@server/registry/registries.ts";
import type { EnemySnapshot } from "@shared/net/snapshots.ts";
import { getWeaponContent } from "@shared/content/catalog.ts";
import type { World } from "@server/world/World.ts";

type EnemyConfig = {
  weapons?: Weapon[];
  goals?: readonly Goal<Enemy>[];
};

const EQUIPPED_WEAPON_DROP_CHANCE = 0.25;

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
    inventory.addStackable(HUNK_ITEM_TYPE_ID, getEnemyDeathHunkDropAmount(rng));

    const equippedWeapon = this.weapons[0];
    if (equippedWeapon) {
      const weaponContent = getWeaponContent(equippedWeapon.typeId);
      const magItemTypeId =
        weaponContent?.attackStyle === "shoot"
          ? weaponContent.magItemTypeId
          : undefined;
      if (magItemTypeId) {
        inventory.addStackable(magItemTypeId, 1 + Math.floor(rng() * 2));
      }
    }

    const shouldDropAllWeapons = shouldDropAllDeathWeapons(this.typeId);
    const shouldDropEquippedWeapon =
      shouldDropAllWeapons || rng() < EQUIPPED_WEAPON_DROP_CHANCE;
    if (shouldDropEquippedWeapon) {
      for (const weapon of shouldDropAllWeapons
        ? this.weapons
        : this.weapons.slice(0, 1)) {
        const itemEntry = itemTypeRegistry.get(weapon.typeId);
        if (itemEntry) {
          grantItemEntryByAcquisitionRules(inventory, itemEntry, 1);
        }
      }
    }

    const pickup = new ItemEntity(world.allocEntityId(), inventory);
    pickup.x = this.x;
    pickup.y = this.y;
    world.spawn(pickup);
  }
}
