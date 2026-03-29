import { doResolvedRectSetsOverlap } from "@shared/geometry/collision.ts";
import { makeHitboxRect } from "@shared/geometry/hitbox.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { PlayerSnapshot } from "@shared/net/snapshots.ts";
import type { InputCommand } from "@shared/net/protocol.ts";
import type { Building } from "@server/entities/Building.ts";
import { Entity } from "@server/entities/Entity.ts";
import { Inventory } from "@server/items/Inventory.ts";
import { Weapon } from "@server/items/Weapon.ts";
import {
  entityTypeRegistry,
  itemTypeRegistry,
} from "@server/registry/registries.ts";
import type { World } from "@server/world/World.ts";

/**
 * Authoritative player entity driven by buffered client input.
 * The player owns movement tuning and any per-player runtime state.
 */
export class Player extends Entity {
  public static readonly kind = "player" as const;
  public static override readonly resourceName = "base";

  public name: string;
  public inventory: Inventory;
  public inputBuffer: InputCommand[] = [];
  public moveSpeed = 15;
  public activeEffects: Array<{ typeId: ResourceId; ticksRemaining: number }> =
    [];

  constructor(id: number, name = "player") {
    super(id, { maxHp: 100 });
    this.name = name;
    this.inventory = new Inventory();
    this.setHitboxProfiles({ default: [makeHitboxRect(32, 32)] });
    this.collisionMode = "dynamic";
  }

  public enqueueInput(inputCommand: InputCommand): void {
    this.inputBuffer.push(inputCommand);
    if (this.inputBuffer.length > 10) {
      this.inputBuffer.shift();
    }
  }

  public override tick(world: World): void {
    super.tick(world);
    this.tickActiveEffects();
    for (const weapon of this.inventory.weapons) {
      weapon.tick(world);
    }
    this.applyBufferedInputs(world);
  }

  public override toSnapshot(): PlayerSnapshot {
    const snapshot = super.toSnapshot();
    return {
      ...snapshot,
      kind: "player",
      name: this.name,
      inventory: this.inventory.toSnapshot(),
      activeEffects: this.activeEffects.map((effect) => ({ ...effect })),
      moveSpeed: this.moveSpeed,
    };
  }

  public applyBufferedInputs(world: World): void {
    let nextMoveX = 0;
    let nextMoveY = 0;
    let sawMovement = false;

    while (this.inputBuffer.length > 0) {
      const inputCommand = this.inputBuffer.shift();
      if (!inputCommand) {
        continue;
      }

      nextMoveX = inputCommand.moveX;
      nextMoveY = inputCommand.moveY;
      sawMovement = true;

      if (inputCommand.selectWeaponIndex !== undefined) {
        this.inventory.setActiveWeaponIndex(inputCommand.selectWeaponIndex);
      }

      if (inputCommand.attack) {
        this.getActiveWeapon()?.hit(
          world,
          this,
          inputCommand.attack.x,
          inputCommand.attack.y,
        );
      } else if (inputCommand.craft) {
        this.craft(world, inputCommand.craft.itemTypeId as ResourceId);
      } else if (inputCommand.build) {
        this.placeStructure(
          world,
          inputCommand.build.itemTypeId as ResourceId,
          inputCommand.build.x,
          inputCommand.build.y,
        );
      }
    }

    if (!sawMovement) {
      this.setMovementVelocity(0, 0);
      return;
    }

    this.setMovementVelocity(
      nextMoveX * this.moveSpeed,
      nextMoveY * this.moveSpeed,
    );
  }

  public getActiveWeapon(): Weapon | undefined {
    return this.inventory.getActiveWeapon();
  }

  private tickActiveEffects(): void {
    if (this.activeEffects.length === 0) {
      return;
    }

    this.activeEffects = this.activeEffects.flatMap((effect) => {
      if (effect.ticksRemaining <= 1) {
        return [];
      }

      return [
        {
          typeId: effect.typeId,
          ticksRemaining: effect.ticksRemaining - 1,
        },
      ];
    });
  }

  public override handleDeath(world: World): void {
    this.hp = this.maxHp;
    this.x = world.gameConfig.worldSize.w / 2;
    this.y = world.gameConfig.worldSize.h / 2;
    this.resetVelocity();
  }

  public craft(world: World, itemTypeId: ResourceId): void {
    const outputEntry = itemTypeRegistry.get(itemTypeId);
    const recipe = outputEntry?.content.recipe;
    if (!outputEntry || !recipe) {
      return;
    }

    if (!this.inventory.hasTypes(recipe.costs)) {
      return;
    }

    this.inventory.consumeTypes(recipe.costs);
    if (outputEntry.ctor.prototype instanceof Weapon) {
      for (let count = 0; count < recipe.outputAmount; count += 1) {
        this.inventory.addWeapon(new outputEntry.ctor() as Weapon);
      }
      return;
    }

    this.inventory.addStackable(itemTypeId, recipe.outputAmount);
  }

  public placeStructure(
    world: World,
    itemTypeId: ResourceId,
    targetX: number,
    targetY: number,
  ): void {
    const itemEntry = itemTypeRegistry.get(itemTypeId);
    const buildingTypeId = itemEntry?.content.buildsEntityTypeId;
    if (!buildingTypeId) {
      return;
    }

    if (Math.hypot(targetX - this.x, targetY - this.y) > 160) {
      return;
    }

    const buildingEntry = entityTypeRegistry.get(buildingTypeId);
    if (!buildingEntry) {
      return;
    }

    type BuildableCtor = new (
      id: number,
      label: string,
      tier?: number,
      ownerId?: number,
    ) => Building;
    const BuildingCtor = buildingEntry.ctor as unknown as BuildableCtor;

    const building = new BuildingCtor(
      world.allocEntityId(),
      buildingEntry.content.label,
    );
    building.x = targetX;
    building.y = targetY;
    building.ownerId = this.id;
    const buildingBounds = building.getWorldBounds();

    if (
      buildingBounds.minX < 0 ||
      buildingBounds.minY < 0 ||
      buildingBounds.maxX > world.gameConfig.worldSize.w ||
      buildingBounds.maxY > world.gameConfig.worldSize.h
    ) {
      return;
    }

    for (const entity of world.spatial.queryBox(
      buildingBounds.minX,
      buildingBounds.minY,
      buildingBounds.maxX,
      buildingBounds.maxY,
    )) {
      if (entity.id === this.id || entity.collisionMode === "none") {
        continue;
      }
      if (this.doHitboxesOverlap(building, entity)) {
        return;
      }
    }

    if (!this.inventory.consumeTypes([{ typeId: itemTypeId, amount: 1 }])) {
      return;
    }

    world.spawn(building);
  }

  public seedStarterInventory(): void {
    this.inventory.addStackable("item:wood", 120);
    this.inventory.addStackable("item:stone", 80);
    this.inventory.addStackable("item:food", 6);
    this.inventory.addStackable("item:wall", 8);
    this.inventory.addStackable("item:cannon", 2);
    this.inventory.addStackable("item:crafting_station", 1);
  }

  private doHitboxesOverlap(leftEntity: Entity, rightEntity: Entity): boolean {
    return doResolvedRectSetsOverlap(
      leftEntity.getWorldHitboxes(),
      rightEntity.getWorldHitboxes(),
    );
  }
}
