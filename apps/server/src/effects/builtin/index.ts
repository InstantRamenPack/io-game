import { BleedingEffect } from "@server/effects/builtin/BleedingEffect.ts";
import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { KnockbackEffect } from "@server/effects/builtin/KnockbackEffect.ts";
import { StunnedEffect } from "@server/effects/builtin/StunnedEffect.ts";

export { BleedingEffect } from "@server/effects/builtin/BleedingEffect.ts";
export { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
export { KnockbackEffect } from "@server/effects/builtin/KnockbackEffect.ts";
export { StunnedEffect } from "@server/effects/builtin/StunnedEffect.ts";

export const builtinEffectTypes = [
  BleedingEffect,
  DamageEffect,
  KnockbackEffect,
  StunnedEffect,
] as const;
