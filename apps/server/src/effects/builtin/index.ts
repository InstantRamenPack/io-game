import { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
import { KnockbackEffect } from "@server/effects/builtin/KnockbackEffect.ts";

export { DamageEffect } from "@server/effects/builtin/DamageEffect.ts";
export { KnockbackEffect } from "@server/effects/builtin/KnockbackEffect.ts";

export const builtinEffectTypes = [DamageEffect, KnockbackEffect] as const;
