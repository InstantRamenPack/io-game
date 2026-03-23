import damageEffectJson from "@shared/content/effect/damage.json";
import knockbackEffectJson from "@shared/content/effect/knockback.json";
import { makeParsedEffectContentEntry } from "@shared/content/parseContent.ts";

export const effectContentEntries = [
  makeParsedEffectContentEntry("damage", damageEffectJson),
  makeParsedEffectContentEntry("knockback", knockbackEffectJson),
] as const;
