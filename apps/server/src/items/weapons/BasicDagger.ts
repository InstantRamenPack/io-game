import { StabMeleeWeapon } from "@server/items/StabMeleeWeapon.ts";

/**
 * Fast short-range stabbing weapon with low damage.
 */
export class BasicDagger extends StabMeleeWeapon {
  public static override readonly resourceName = "basic_dagger";
}
