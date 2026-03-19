import {
  getItemDefinition,
  getRecipeDefinition,
  isStructureItemDefinition,
} from "@shared/content/index.ts";
import type { RecipeId } from "@shared/content/types.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { InputCommand } from "@shared/net/protocol.ts";
import { Entity } from "@server/entities/Entity.ts";
import { Weapon } from "@server/items/Weapon.ts";
import type { World } from "@server/world/World.ts";
import { Inventory } from "@server/items/Inventory.ts";
import { ItemStack } from "@server/items/ItemStack.ts";
import type { Item } from "@server/items/Item.ts";
import {
  FoodItem,
  StoneItem,
  WoodItem,
} from "@server/items/resources/Materials.ts";
import {
  CraftingStationItem,
  TowerItem,
  WallItem,
  WindmillItem,
} from "@server/items/resources/StructureItems.ts";
import {
  entityTypeRegistry,
  itemTypeRegistry,
} from "@server/registry/registries.ts";
import type { PlayerSnapshot } from "@shared/net/snapshots.ts";
import type { Building } from "@server/entities/Building.ts";

/**
 * Authoritative player entity driven by buffered client input.
 * The player owns movement tuning and any per-player runtime state.
 */
export class Player extends Entity {
  public static readonly typeId = "player:base" as const;

  public name: string;
  // The buffer currently feeds latest-input movement, but it is retained so
  // future actions can preserve tick/sequence ordering for reconciliation.
  public inputBuffer: InputCommand[] = [];
  // Distance moved per simulation tick at full input.
  public moveSpeed = 15;
  public activeEffects = ["Fortified", "Well Fed"];
  /**
   * Creates a player entity with default movement tuning.
   * @param id Stable runtime entity id.
   * @param name Display/player name.
   */
  public constructor(id: number, name = "player") {
    // allocate inventory in base class
    super(id, Player.typeId, new Inventory(20));
    this.name = name;
    this.radius = 16;
    this.collisionMode = "dynamic";
    this.hp = 100;
    this.maxHp = 100;
  }

  /**
   * Buffers a client input command for later processing on the server tick.
   * @param inputCommand Input command received from the client.
   */
  public enqueueInput(inputCommand: InputCommand): void {
    this.inputBuffer.push(inputCommand);
    if (this.inputBuffer.length > 10) {
      this.inputBuffer.shift();
    }
  }

  public override tick(world: World): void {
    super.tick(world);
    for (const slot of this.inventory?.slots ?? []) {
      slot?.item.tick(world);
    }
    this.applyBufferedInputs(world);
  }

  /** Converts player state into a snapshot, including name and inherited inventory. */
  public override toSnapshot(): PlayerSnapshot {
    const snapshot = super.toSnapshot();
    return {
      ...snapshot,
      kind: "player",
      name: this.name,
      hp: this.hp ?? 0,
      maxHp: this.maxHp ?? 0,
      inventory: this.inventory?.toSnapshot() ?? [],
      activeSlot: this.inventory?.activeIndex ?? 0,
      activeEffects: [...this.activeEffects],
      moveSpeed: this.moveSpeed,
    };
  }

  /**
   * Applies the most recent buffered input to movement velocity.
   * @param world World being simulated.
   */
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

      if (inputCommand.selectSlot !== undefined) {
        this.inventory?.setActive(inputCommand.selectSlot);
      }

      if (inputCommand.attack) {
        this.getActiveWeapon()?.fire(
          world,
          this,
          inputCommand.attack.x,
          inputCommand.attack.y,
        );
      } else if (inputCommand.craft) {
        this.craft(world, inputCommand.craft.recipeId as RecipeId);
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

  /**
   * Returns the currently equipped weapon when the active slot contains one.
   * @returns Equipped weapon instance or undefined.
   */
  public getActiveWeapon(): Weapon | undefined {
    const activeStack = this.inventory?.getActive();
    return activeStack?.item instanceof Weapon ? activeStack.item : undefined;
  }

  public craft(world: World, recipeId: RecipeId): void {
    if (!this.inventory) {
      return;
    }

    const recipe = getRecipeDefinition(recipeId);
    if (!recipe) {
      return;
    }

    if (!this.inventory.hasTypes(recipe.costs)) {
      return;
    }

    const OutputCtor = itemTypeRegistry.get(recipe.outputItemTypeId) as
      | (new (id: number) => Item)
      | undefined;
    if (!OutputCtor) {
      return;
    }

    const outputStack = new ItemStack(
      new OutputCtor(world.allocItemId()),
      recipe.outputAmount,
    );
    if (!this.inventory.canAdd(outputStack)) {
      return;
    }

    this.inventory.consumeTypes(recipe.costs);
    this.inventory.add(outputStack);
  }

  public placeStructure(
    world: World,
    itemTypeId: ResourceId,
    targetX: number,
    targetY: number,
  ): void {
    if (!this.inventory) {
      return;
    }

    const definition = getItemDefinition(itemTypeId);
    if (!isStructureItemDefinition(definition)) {
      return;
    }

    if (Math.hypot(targetX - this.x, targetY - this.y) > 160) {
      return;
    }

    const BuildingCtor = entityTypeRegistry.get(definition.buildingTypeId) as
      | (new (id: number) => Building)
      | undefined;
    if (!BuildingCtor) {
      return;
    }

    const building = new BuildingCtor(world.allocEntityId());
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

  public seedStarterInventory(allocateItemId: () => number): void {
    if (!this.inventory) {
      return;
    }

    const starterStacks = [
      new ItemStack(new WoodItem(allocateItemId()), 120),
      new ItemStack(new StoneItem(allocateItemId()), 80),
      new ItemStack(new FoodItem(allocateItemId()), 6),
      new ItemStack(new WallItem(allocateItemId()), 8),
      new ItemStack(new TowerItem(allocateItemId()), 2),
      new ItemStack(new WindmillItem(allocateItemId()), 1),
      new ItemStack(new CraftingStationItem(allocateItemId()), 1),
    ];

    for (const stack of starterStacks) {
      this.inventory.add(stack);
    }
  }
}
