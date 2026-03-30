import bleedingEffectJson from "@shared/content/effect/bleeding.json";
import damageEffectJson from "@shared/content/effect/damage.json";
import knockbackEffectJson from "@shared/content/effect/knockback.json";
import stunnedEffectJson from "@shared/content/effect/stunned.json";
import { makeParsedEffectContentEntry } from "@shared/content/parseContent.ts";

export const effectContentEntries = [
  makeParsedEffectContentEntry("bleeding", bleedingEffectJson),
  makeParsedEffectContentEntry("damage", damageEffectJson),
  makeParsedEffectContentEntry("knockback", knockbackEffectJson),
  makeParsedEffectContentEntry("stunned", stunnedEffectJson),
] as const;
