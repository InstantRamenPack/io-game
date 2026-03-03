import type { InputCommand } from "@shared/net/protocol.ts";
import { Entity } from "@server/entities/Entity.ts";
import type { World } from "@server/world/World.ts";

/** Authoritative player entity driven by latest buffered input. */
export class Player extends Entity {
  name: string;
  inputBuffer: InputCommand[] = [];
  moveSpeed = 180;

  /** Creates a player entity with default movement tuning. */
  constructor(id: number, name = "player") {
    super(id, "player");
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
