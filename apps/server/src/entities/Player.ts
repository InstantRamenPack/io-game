import type { InputCommand } from "@shared/net/protocol.ts";
import { Entity } from "@server/entities/Entity.ts";
import { Weapon } from "@server/items/Weapon.ts";
import type { World } from "@server/world/World.ts";
import { Inventory } from "@server/items/Inventory.ts";

/**
 * Authoritative player entity driven by buffered client input.
 * The player owns movement tuning and any per-player runtime state.
 */
export class Player extends Entity {
  static readonly typeId = "player:base" as const;

  name: string;
  // The buffer currently feeds latest-input movement, but it is retained so
  // future actions can preserve tick/sequence ordering for reconciliation.
  inputBuffer: InputCommand[] = [];
  moveSpeed = 180;
  /**
   * Creates a player entity with default movement tuning.
   * @param id Stable runtime entity id.
   * @param name Display/player name.
   */
  constructor(id: number, name = "player") {
    // allocate inventory in base class
    super(id, Player.typeId, new Inventory(20));
    this.name = name;
    this.radius = 14;
    this.collisionMode = "dynamic";
    this.hp = 100;
    this.maxHp = 100;
  }

  /**
   * Buffers a client input command for later processing on the server tick.
   * @param inputCommand Input command received from the client.
   */
  enqueueInput(inputCommand: InputCommand): void {
    this.inputBuffer.push(inputCommand);
    if (this.inputBuffer.length > 10) {
      this.inputBuffer.shift();
    }
  }

  override tick(world: World): void {
    super.tick(world);
    for (const slot of this.inventory?.slots ?? []) {
      slot?.item.tick(world);
    }
  }

  /** Converts player state into a snapshot, including name and inherited inventory. */
  override toSnapshot(): import("@shared/net/snapshots.ts").EntitySnapshot {
    const snap = super.toSnapshot();
    snap.name = this.name;
    return snap;
  }

  /**
   * Applies the most recent buffered input to movement velocity.
   * @param _world World being simulated.
   * @param _tick Current world tick.
   */
  applyInputForTick(_world: World, _tick: number): void {
    const latestInputCommand = this.inputBuffer[this.inputBuffer.length - 1];
    if (!latestInputCommand) {
      this.setMovementVelocity(0, 0);
      return;
    }

    this.setMovementVelocity(
      latestInputCommand.moveX * this.moveSpeed,
      latestInputCommand.moveY * this.moveSpeed,
    );
  }

  /**
   * Returns the currently equipped weapon when the active slot contains one.
   * @returns Equipped weapon instance or undefined.
   */
  getActiveWeapon(): Weapon | undefined {
    const activeStack = this.inventory?.getActive();
    return activeStack?.item instanceof Weapon ? activeStack.item : undefined;
  }
}
