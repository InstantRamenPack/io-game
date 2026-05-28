import { requireEntityContent } from "@shared/content/catalog.ts";
import type { EquippedItemSnapshot } from "@shared/net/snapshots.ts";
import { createMeleeWeaponHitEffects } from "@server/combat/effectFactories.ts";
import { StabMeleeWeapon } from "@server/items/StabMeleeWeapon.ts";

/**
 * Default fallback melee weapon used when the selected hotbar slot is empty.
 */
export class Fists extends StabMeleeWeapon {
  public static override readonly kind = "player" as const;
  public static override readonly resourceName = "unarmed";
  public static readonly unarmedTypeId = "player:unarmed" as const;

  constructor() {
    const weaponContent = Fists.getUnarmedAttackContent();
    super(
      weaponContent.cooldownTicks,
      weaponContent.range,
      createMeleeWeaponHitEffects(weaponContent),
      weaponContent.jabWidth,
    );
  }

  public override toEquippedItemSnapshot(): EquippedItemSnapshot {
    return {
      typeId: Fists.unarmedTypeId,
      attackStyle: "jab",
      cooldownTicksRemaining: this.cooldownTicks,
    };
  }

  protected override getAttackStyleForEvent(): "jab" {
    return "jab";
  }

  private static getUnarmedAttackContent() {
    const unarmedAttack =
      requireEntityContent("player:base").player?.unarmedAttack;
    if (!unarmedAttack) {
      throw new Error("Missing player unarmedAttack content.");
    }
    return unarmedAttack;
  }
}
