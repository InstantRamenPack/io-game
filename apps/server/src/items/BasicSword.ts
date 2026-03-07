import { MeleeWeapon } from "./MeleeWeapon.ts";

/**
 * Basic sword melee weapon.
 */
export class BasicSword extends MeleeWeapon {
  constructor(id: number) {
    super(
      id,
      25, // damage
      2, // fireRate (attacks per second)
      50, // range
      ["knockback"], // hitEffects
      30 // meleeRange
    );
  }
}