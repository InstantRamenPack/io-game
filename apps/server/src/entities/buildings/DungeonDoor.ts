import { Building } from "@server/entities/Building.ts";
import { Player } from "@server/entities/Player.ts";
import type { World } from "@server/world/World.ts";
import { resolveHitboxRects } from "@shared/geometry/hitbox.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

const UNLOCK_PADDING = 56;
const DUNGEON_KEY_TYPE_ID = "item:dungeon_key" as ResourceId;

export class DungeonDoor extends Building {
  public static override readonly resourceName = "dungeon_door";

  constructor(id: number, tier = 1, ownerId?: number) {
    super(id, tier, ownerId);
  }

  public override tick(world: World): void {
    super.tick(world);
    if (!this.alive || !world.entities.has(this.id)) {
      return;
    }

    const bounds = this.getWorldBounds();
    for (const candidate of world.spatial.queryBox(
      bounds.minX - UNLOCK_PADDING,
      bounds.minY - UNLOCK_PADDING,
      bounds.maxX + UNLOCK_PADDING,
      bounds.maxY + UNLOCK_PADDING,
    )) {
      if (!(candidate instanceof Player) || !candidate.alive) {
        continue;
      }
      if (!this.isPlayerTouchingDoor(candidate)) {
        continue;
      }
      if (
        !candidate.inventory.consumeTypes([
          { typeId: DUNGEON_KEY_TYPE_ID, amount: 1 },
        ])
      ) {
        continue;
      }
      this.alive = false;
      world.despawn(this.id);
      return;
    }
  }

  private isPlayerTouchingDoor(player: Player): boolean {
    const doorRects = resolveHitboxRects(this.x, this.y, this.hitboxes);
    const playerRects = resolveHitboxRects(player.x, player.y, player.hitboxes);
    return doorRects.some((doorRect) =>
      playerRects.some(
        (playerRect) =>
          playerRect.maxX >= doorRect.minX - UNLOCK_PADDING &&
          playerRect.minX <= doorRect.maxX + UNLOCK_PADDING &&
          playerRect.maxY >= doorRect.minY - UNLOCK_PADDING &&
          playerRect.minY <= doorRect.maxY + UNLOCK_PADDING,
      ),
    );
  }
}
