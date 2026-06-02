import {
  doesResolvedRectIntersectOrientedBox,
  doesResolvedRectIntersectSweepArc,
} from "@shared/geometry/collision.ts";
import { expandHitboxBounds } from "@shared/geometry/hitbox.ts";
import type { SwingComboWeaponContent } from "@shared/content/schema.ts";
import {
  KATANA_COMBO_LENGTH,
  KATANA_STAB_STEP_INDEX,
  shouldResetKatanaCombo,
} from "@shared/gameplay/katanaCombo.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { KnockbackEffect } from "@server/effects/builtin/KnockbackEffect.ts";
import { MeleeWeapon } from "@server/items/MeleeWeapon.ts";
import { requireSwingWeaponRuntime } from "@server/combat/contentAdapters.ts";
import type { World } from "@server/world/World.ts";

type KatanaAttackMode = "sweep" | "stab";

/**
 * Three-hit melee combo weapon: two sweep attacks, then a stronger stab finisher.
 * The combo only continues while attack inputs stay within the authored chain window.
 */
export class Katana extends MeleeWeapon {
  public static override readonly resourceName = "katana";

  private comboStep = 0;
  private lastAttackTick: number | null = null;
  private readonly authoredCooldownTicks: number;
  private readonly comboContent: SwingComboWeaponContent;
  private readonly sweepArcDegrees: number;
  private readonly sweepDamageEffect: DamageEffect;
  private readonly stabDamageEffect: DamageEffect;
  private readonly knockbackEffect: KnockbackEffect | null;

  constructor() {
    const weaponContent = requireSwingWeaponRuntime(Katana.typeId);
    const comboContent = weaponContent.combo;
    if (!comboContent) {
      throw new Error(`Katana weapon content is missing combo tuning.`);
    }
    super(weaponContent.cooldownTicks, weaponContent.range, []);
    this.authoredCooldownTicks = weaponContent.cooldownTicks;
    this.comboContent = comboContent;
    this.sweepArcDegrees = weaponContent.sweepArcDeg;
    this.sweepDamageEffect = new DamageEffect(weaponContent.damage);
    this.stabDamageEffect = new DamageEffect(
      weaponContent.damage * comboContent.stabDamageMultiplier,
    );
    this.knockbackEffect =
      weaponContent.knockback > 0
        ? new KnockbackEffect(weaponContent.knockback)
        : null;
  }

  public override hit(world: World, owner: Entity, theta: number): boolean {
    if (
      shouldResetKatanaCombo(
        this.comboContent,
        this.authoredCooldownTicks,
        this.lastAttackTick,
        world.tick,
      )
    ) {
      this.comboStep = 0;
    }

    const didSwing = super.hit(world, owner, theta);
    if (didSwing) {
      this.lastAttackTick = world.tick;
      this.comboStep = (this.comboStep + 1) % KATANA_COMBO_LENGTH;
    }
    return didSwing;
  }

  protected override getAttackReach(
    owner: Entity,
    aim: {
      directionX: number;
      directionY: number;
      angle: number;
    },
  ): number {
    const authoredRange =
      this.getAttackMode() === "stab"
        ? this.comboContent.stabRange
        : this.range;
    return (
      owner.getHitboxDirectionalExtent(aim.directionX, aim.directionY) +
      authoredRange
    );
  }

  protected override isTargetInAttackShape(
    owner: Entity,
    target: Entity,
    aim: {
      directionX: number;
      directionY: number;
      angle: number;
    },
  ): boolean {
    return this.getAttackMode() === "stab"
      ? this.isTargetInStabShape(owner, target, aim)
      : this.isTargetInSweepShape(owner, target, aim);
  }

  protected override getAttackQueryBounds(
    owner: Entity,
    aim: {
      directionX: number;
      directionY: number;
      angle: number;
    },
  ): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } {
    if (this.getAttackMode() !== "stab") {
      const bounds = expandHitboxBounds(
        owner.getWorldBounds(),
        this.range,
        this.range,
      );
      return {
        minX: bounds.minX,
        minY: bounds.minY,
        maxX: bounds.maxX,
        maxY: bounds.maxY,
      };
    }

    const attackLength = this.getAttackReach(owner, aim);
    const halfWidth = this.comboContent.stabWidth / 2;
    const perpendicularX = -aim.directionY;
    const perpendicularY = aim.directionX;
    const endX = owner.x + aim.directionX * attackLength;
    const endY = owner.y + aim.directionY * attackLength;
    const corners = [
      {
        x: owner.x + perpendicularX * halfWidth,
        y: owner.y + perpendicularY * halfWidth,
      },
      {
        x: owner.x - perpendicularX * halfWidth,
        y: owner.y - perpendicularY * halfWidth,
      },
      {
        x: endX + perpendicularX * halfWidth,
        y: endY + perpendicularY * halfWidth,
      },
      {
        x: endX - perpendicularX * halfWidth,
        y: endY - perpendicularY * halfWidth,
      },
    ];

    return {
      minX: Math.min(...corners.map((corner) => corner.x)),
      minY: Math.min(...corners.map((corner) => corner.y)),
      maxX: Math.max(...corners.map((corner) => corner.x)),
      maxY: Math.max(...corners.map((corner) => corner.y)),
    };
  }

  protected override applyHitEffects(
    world: World,
    owner: Entity,
    target: Entity,
  ): void {
    const damageEffect =
      this.getAttackMode() === "stab"
        ? this.stabDamageEffect
        : this.sweepDamageEffect;
    damageEffect.apply(world, owner, target);
    this.knockbackEffect?.apply(world, owner, target);
  }

  private getAttackMode(): KatanaAttackMode {
    return this.comboStep === KATANA_STAB_STEP_INDEX ? "stab" : "sweep";
  }

  private isTargetInSweepShape(
    owner: Entity,
    target: Entity,
    aim: {
      directionX: number;
      directionY: number;
      angle: number;
    },
  ): boolean {
    const maxDistance = this.getAttackReach(owner, aim);
    const halfArcRadians = (this.sweepArcDegrees * Math.PI) / 360;

    for (const rect of target.getWorldHitboxes()) {
      if (
        doesResolvedRectIntersectSweepArc(
          rect,
          owner.x,
          owner.y,
          aim.angle,
          aim.directionX,
          aim.directionY,
          maxDistance,
          halfArcRadians,
        )
      ) {
        return true;
      }
    }

    return false;
  }

  private isTargetInStabShape(
    owner: Entity,
    target: Entity,
    aim: {
      directionX: number;
      directionY: number;
      angle: number;
    },
  ): boolean {
    const attackLength = this.getAttackReach(owner, aim);
    const attackCenterX = owner.x + aim.directionX * (attackLength / 2);
    const attackCenterY = owner.y + aim.directionY * (attackLength / 2);

    for (const rect of target.getWorldHitboxes()) {
      if (
        doesResolvedRectIntersectOrientedBox(
          rect,
          attackCenterX,
          attackCenterY,
          aim.directionX,
          aim.directionY,
          attackLength / 2,
          this.comboContent.stabWidth / 2,
        )
      ) {
        return true;
      }
    }

    return false;
  }
}
