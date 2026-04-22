import bleedingEffectJson from "@shared/content/effect/bleeding.json";
import confusionEffectJson from "@shared/content/effect/confusion.json";
import damageEffectJson from "@shared/content/effect/damage.json";
import fracturedEffectJson from "@shared/content/effect/fractured.json";
import knockbackEffectJson from "@shared/content/effect/knockback.json";
import stunnedEffectJson from "@shared/content/effect/stunned.json";
import { makeParsedEffectContentEntry } from "@shared/content/parseContent.ts";

export const effectContentEntries = [
  makeParsedEffectContentEntry("bleeding", bleedingEffectJson),
  makeParsedEffectContentEntry("confusion", confusionEffectJson),
  makeParsedEffectContentEntry("damage", damageEffectJson),
  makeParsedEffectContentEntry("fractured", fracturedEffectJson),
  makeParsedEffectContentEntry("knockback", knockbackEffectJson),
  makeParsedEffectContentEntry("stunned", stunnedEffectJson),
] as const;
