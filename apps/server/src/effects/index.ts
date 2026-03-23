import { builtinEffectTypes } from "@server/effects/builtin/index.ts";

export { Effect } from "@server/effects/Effect.ts";
export { DamageEffect, KnockbackEffect } from "@server/effects/builtin/index.ts";

export const effectTypes = [...builtinEffectTypes] as const;
