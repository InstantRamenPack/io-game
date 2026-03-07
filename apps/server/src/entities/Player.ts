import type { InputCommand } from "@shared/net/protocol.ts";
import { Entity } from "@server/entities/Entity.ts";
import type { World } from "@server/world/World.ts";
import { Inventory } from "@server/items/Inventory.ts";

/** Authoritative player entity driven by latest buffered input. */
export class Player extends Entity {
  name: string;
  inputBuffer: InputCommand[] = [];
  moveSpeed = 180;


  /** Creates a player entity with default movement tuning. */
  constructor(id: number, name = "player") {
    // allocate inventory in base class
    super(id, "player", new Inventory(20));
    this.name = name;
    this.radius = 14;
  }

  /** Buffers a client input command for processing on tick. */
  enqueueInput(inputCommand: InputCommand): void {
    this.inputBuffer.push(inputCommand);
    if (this.inputBuffer.length > 10) {
      this.inputBuffer.shift();
    }
  }

  /** Converts player state into a snapshot, including name and inherited inventory. */
  override toSnapshot(): import("@shared/net/snapshots.ts").EntitySnapshot {
    const snap = super.toSnapshot();
    snap.data = snap.data || {};
    snap.data.name = this.name;
    return snap;
  }

  /** Applies the most recent buffered input to movement velocity. */
  applyInputForTick(_world: World, _tick: number): void {
    const latestInputCommand = this.inputBuffer[this.inputBuffer.length - 1];
    if (!latestInputCommand) {
      this.vx = 0;
      this.vy = 0;
      return;
    }

    this.vx = latestInputCommand.moveX * this.moveSpeed;
    this.vy = latestInputCommand.moveY * this.moveSpeed;
  }
}
