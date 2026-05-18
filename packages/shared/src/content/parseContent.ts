import {
  type EffectContent,
  EffectContentSchema,
  type EntityContent,
  EntityContentSchema,
  type EntityKind,
  type ItemContent,
  ItemContentSchema,
} from "@shared/content/schema.ts";
import { makeResourceId, type ResourceId } from "@shared/ids/ResourceId.ts";
import type { JsonValue } from "@shared/json.ts";

type ItemContentEntry = readonly [ResourceId, ItemContent];
type EntityContentEntry = readonly [ResourceId, EntityContent];
type EffectContentEntry = readonly [ResourceId, EffectContent];

type SafeParseSuccess<T> = { success: true; data: T };
type SafeParseFailure = { success: false; error: { message: string } };
type SafeParseResult<T> = SafeParseSuccess<T> | SafeParseFailure;
type ParsedContentSchema<T> = {
  safeParse(rawContent: JsonValue): SafeParseResult<T>;
};

function makeParsedContentEntry<T>(
  contentKind: "item" | "entity" | "effect",
  typeId: ResourceId,
  rawContent: JsonValue,
  schema: ParsedContentSchema<T>,
): readonly [ResourceId, T] {
  const parsedContent = schema.safeParse(rawContent);
  if (!parsedContent.success) {
    throw new Error(
      `Invalid ${contentKind} content for ${typeId}: ${parsedContent.error.message}`,
    );
  }
  return [typeId, parsedContent.data] as const;
}

export function makeParsedItemContentEntry(
  resourceName: string,
  rawContent: JsonValue,
): ItemContentEntry {
  const typeId = makeResourceId("item", resourceName);
  const entry = makeParsedContentEntry(
    "item",
    typeId,
    rawContent,
    ItemContentSchema,
  );
  if (entry[1].weapon && entry[1].rarityTier === undefined) {
    throw new Error(
      `Invalid item content for ${typeId}: weapon items must define rarityTier.`,
    );
  }
  if (entry[1].buildsEntityTypeId && entry[1].rarityTier === undefined) {
    throw new Error(
      `Invalid item content for ${typeId}: buildable items must define rarityTier.`,
    );
  }
  return entry;
}

export function makeParsedEntityContentEntry(
  kind: EntityKind,
  resourceName: string,
  rawContent: JsonValue,
): EntityContentEntry {
  const typeId = makeResourceId(kind, resourceName);
  const entry = makeParsedContentEntry(
    "entity",
    typeId,
    rawContent,
    EntityContentSchema,
  );
  if (kind === "enemy") {
    if (entry[1].rarityTier === undefined) {
      throw new Error(
        `Invalid entity content for ${typeId}: enemies must define rarityTier.`,
      );
    }
    if (entry[1].deathLoot === undefined) {
      throw new Error(
        `Invalid entity content for ${typeId}: enemies must define deathLoot.`,
      );
    }
  }
  return entry;
}

export function makeParsedEffectContentEntry(
  resourceName: string,
  rawContent: JsonValue,
): EffectContentEntry {
  const typeId = makeResourceId("effect", resourceName);
  return makeParsedContentEntry(
    "effect",
    typeId,
    rawContent,
    EffectContentSchema,
  );
}
