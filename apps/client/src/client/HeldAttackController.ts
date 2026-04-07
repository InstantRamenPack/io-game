import { getWeaponContent } from "@shared/content/catalog.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";

export type LocalWeaponState = {
  typeId: ResourceId;
  cooldownTicksRemaining?: number;
  ammoInMag?: number;
  reloadTicksRemaining?: number;
};

type HeldAttackControllerOptions = {
  tickRate: () => number;
};

export class HeldAttackController {
  private holdAttackCooldownUntilMs = 0;
  private readonly tickRate: () => number;

  constructor(options: HeldAttackControllerOptions) {
    this.tickRate = options.tickRate;
  }

  public reset(): void {
    this.holdAttackCooldownUntilMs = 0;
  }

  public canSendHeldAttack(
    nowMs: number,
    activeWeapon: LocalWeaponState,
  ): boolean {
    if (nowMs < this.holdAttackCooldownUntilMs) {
      return false;
    }
    return this.canLikelyExecuteAttack(activeWeapon);
  }

  public canLikelyExecuteAttack(activeWeapon: LocalWeaponState): boolean {
    if (
      typeof activeWeapon.cooldownTicksRemaining === "number" &&
      activeWeapon.cooldownTicksRemaining > 0
    ) {
      return false;
    }
    if (
      typeof activeWeapon.reloadTicksRemaining === "number" &&
      activeWeapon.reloadTicksRemaining > 0
    ) {
      return false;
    }
    if (
      typeof activeWeapon.ammoInMag === "number" &&
      activeWeapon.ammoInMag <= 0
    ) {
      return false;
    }
    return true;
  }

  public onAttackSent(nowMs: number, activeWeapon: LocalWeaponState): void {
    const weaponContent = getWeaponContent(activeWeapon.typeId);
    if (!weaponContent) {
      return;
    }

    const cooldownDurationMs =
      (weaponContent.cooldownTicks * 1000) / this.tickRate();
    this.holdAttackCooldownUntilMs = nowMs + Math.max(1, cooldownDurationMs);
  }
}
