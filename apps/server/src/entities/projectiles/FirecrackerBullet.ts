import { requireProjectileContent } from "@shared/content/catalog.ts";
import type { ProjectileContent } from "@shared/content/schema.ts";
import { createProjectileDefinitionForType } from "@server/combat/contentAdapters.ts";
import type { Entity } from "@server/entities/Entity.ts";
import {
  Projectile,
  type ProjectileDefinition,
  type ProjectileSpawnConfig,
} from "@server/entities/Projectile.ts";
import { requireGameTypeEntry } from "@server/registry/registries.ts";
import { isProjectileCtor } from "@server/runtime/ctorGuards.ts";
import type { World } from "@server/world/World.ts";

export class FirecrackerBullet extends Projectile {
  public static override readonly resourceName = "firecracker_bullet";
  public static readonly definition: ProjectileDefinition =
    createProjectileDefinitionForType("projectile:firecracker_bullet");
  private readonly split: NonNullable<ProjectileContent["split"]>;

  private hitEnemy = false;
  private hasSplit = false;

  constructor(id: number, config: ProjectileSpawnConfig) {
    super(id, config);
    const split = requireProjectileContent(FirecrackerBullet.typeId).split;
    if (!split) {
      throw new Error(
        `Missing projectile split tuning for ${FirecrackerBullet.typeId}.`,
      );
    }
    this.split = split;
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

    const projectileEntry = requireGameTypeEntry(
      this.split.projectileTypeId,
      "entity",
    );
    if (projectileEntry.kind !== "projectile") {
      throw new Error(
        `Expected split projectile entity type for ${this.split.projectileTypeId}.`,
      );
    }
    if (!isProjectileCtor(projectileEntry.ctor)) {
      throw new Error(
        `Expected split projectile constructor for ${this.split.projectileTypeId}.`,
      );
    }

    const baseAngle = Math.atan2(this.directionY, this.directionX);
    const splitArcRad = (this.split.arcDeg * Math.PI) / 180;
    const startAngle =
      this.split.projectileCount === 1
        ? baseAngle
        : baseAngle - splitArcRad / 2;
    const step =
      this.split.projectileCount === 1
        ? 0
        : splitArcRad / (this.split.projectileCount - 1);
    for (let i = 0; i < this.split.projectileCount; i += 1) {
      const angle = startAngle + step * i;
      world.spawn(
        new projectileEntry.ctor(world.allocEntityId(), {
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
