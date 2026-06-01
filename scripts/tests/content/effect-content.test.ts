import { describe, expect, test } from "bun:test";
import { requireEffectContent } from "@shared/content/catalog.ts";
import bleedingJson from "@shared/content/effect/bleeding.json";
import confusionJson from "@shared/content/effect/confusion.json";
import fracturedJson from "@shared/content/effect/fractured.json";
import knockbackJson from "@shared/content/effect/knockback.json";
import stunnedJson from "@shared/content/effect/stunned.json";

describe("effect content", () => {
  test("status effect defaults are authored in effect JSON for balance editing", () => {
    expect(requireEffectContent("effect:bleeding")).toEqual(bleedingJson);
    expect(requireEffectContent("effect:confusion")).toEqual(confusionJson);
    expect(requireEffectContent("effect:fractured")).toEqual(fracturedJson);
    expect(requireEffectContent("effect:knockback")).toEqual(knockbackJson);
    expect(requireEffectContent("effect:stunned")).toEqual(stunnedJson);
  });
});
