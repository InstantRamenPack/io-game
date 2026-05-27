import { createProjectileDefinitionForType } from "@server/combat/contentAdapters.ts";
import type { Entity } from "@server/entities/Entity.ts";
import {
  Projectile,
  type ProjectileDefinition,
  type ProjectileSpawnConfig,
} from "@server/entities/Projectile.ts";
import { SmallFirecrackerBullet } from "@server/entities/projectiles/SmallFirecrackerBullet.ts";
import type { World } from "@server/world/World.ts";

const SPLIT_PROJECTILE_COUNT = 5;
const SPLIT_ARC_RAD = Math.PI / 3;

export class FirecrackerBullet extends Projectile {
  public static override readonly resourceName = "firecracker_bullet";
  public static readonly definition: ProjectileDefinition =
    createProjectileDefinitionForType("projectile:firecracker_bullet");

  private hitEnemy = false;
  private hasSplit = false;

  constructor(id: number, config: ProjectileSpawnConfig) {
    super(id, config);
  }

  public override resolvePostStep(world: World): boolean {
    const remainingRangeBefore = this.remainingRange;
    const shouldDespawn = super.resolvePostStep(world);
    const exhaustedRange = remainingRangeBefore > 0 && this.remainingRange <= 0;
    if ((this.hitEnemy || exhaustedRange) && !this.hasSplit) {
      this.hasSplit = true;
      this.spawnSplitProjectiles(world);
    }
    return shouldDespawn;
  }

  protected override applyImpact(world: World, target: Entity): void {
    this.hitEnemy = true;
    super.applyImpact(world, target);
  }

  private spawnSplitProjectiles(world: World): void {
    if (this.ownerId === undefined) {
      return;
    }

    const baseAngle = Math.atan2(this.directionY, this.directionX);
    const startAngle = baseAngle - SPLIT_ARC_RAD / 2;
    const step = SPLIT_ARC_RAD / (SPLIT_PROJECTILE_COUNT - 1);
    for (let i = 0; i < SPLIT_PROJECTILE_COUNT; i += 1) {
      const angle = startAngle + step * i;
      world.spawn(
        new SmallFirecrackerBullet(world.allocEntityId(), {
          ownerId: this.ownerId,
          x: this.x,
          y: this.y,
          directionX: Math.cos(angle),
          directionY: Math.sin(angle),
          rotation: angle,
        }),
      );
    }
  }
}
