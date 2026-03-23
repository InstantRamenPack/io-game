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
  public activeEffects = ["Fortified", "Well Fed"];

  public constructor(id: number, name = "player") {
    super(id);
    this.name = name;
    this.inventory = new Inventory();
    this.radius = 16;
    this.collisionMode = "dynamic";
    this.hp = 100;
    this.maxHp = 100;
  }

  public enqueueInput(inputCommand: InputCommand): void {
    this.inputBuffer.push(inputCommand);
    if (this.inputBuffer.length > 10) {
      this.inputBuffer.shift();
    }
  }

  public override tick(world: World): void {
    super.tick(world);
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
      hp: this.hp ?? 0,
      maxHp: this.maxHp ?? 0,
      inventory: this.inventory.toSnapshot(),
      activeEffects: [...this.activeEffects],
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
    if (!itemEntry?.buildingTypeId) {
      return;
    }

    if (Math.hypot(targetX - this.x, targetY - this.y) > 160) {
      return;
    }

    const buildingEntry = entityTypeRegistry.get(itemEntry.buildingTypeId);
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

    if (
      targetX - building.radius < 0 ||
      targetY - building.radius < 0 ||
      targetX + building.radius > world.gameConfig.worldSize.w ||
      targetY + building.radius > world.gameConfig.worldSize.h
    ) {
      return;
    }

    for (const entity of world.entities.all()) {
      if (entity.id === this.id || entity.collisionMode === "none") {
        continue;
      }
      if (
        Math.abs(entity.x - targetX) < entity.radius + building.radius &&
        Math.abs(entity.y - targetY) < entity.radius + building.radius
      ) {
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
    this.inventory.addStackable("item:tower", 2);
    this.inventory.addStackable("item:windmill", 1);
    this.inventory.addStackable("item:crafting_station", 1);
  }
}
