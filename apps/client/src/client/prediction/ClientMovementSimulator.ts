import type { ClientEntity } from "@client/net/ClientEntity.ts";
import type { InputMovement } from "@shared/net/protocol.ts";

export type ClientMovementSimulationInput = {
  movement: InputMovement;
  theta: number;
  deltaMs: number;
};

export class ClientMovementSimulator {
  public simulateLocalPlayer(
    player: ClientEntity,
    input: ClientMovementSimulationInput,
  ): void {
    player.rotation = input.theta;

    const desired = this.computeDesiredVelocity(player, input.movement);
    const tickScale = input.deltaMs / (1000 / 20);

    player.vx = desired.x;
    player.vy = desired.y;

    // TODO: reuse a client-side spatial/static collision query so prediction
    // clips against known buildings/structures like the server.
    player.x += desired.x * tickScale;
    player.y += desired.y * tickScale;
  }

  private computeDesiredVelocity(
    player: ClientEntity,
    movement: InputMovement,
  ): { x: number; y: number } {
    let moveX = 0;
    let moveY = 0;

    if (movement.left) moveX -= 1;
    if (movement.right) moveX += 1;
    if (movement.up) moveY -= 1;
    if (movement.down) moveY += 1;

    const magnitude = Math.hypot(moveX, moveY);
    if (magnitude <= Number.EPSILON) {
      return { x: 0, y: 0 };
    }

    const speed = player.moveSpeed ?? 15;

    return {
      x: (moveX / magnitude) * speed,
      y: (moveY / magnitude) * speed,
    };
  }
}
