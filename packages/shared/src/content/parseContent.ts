import {
  EntityContentSchema,
  EffectContentSchema,
  ItemContentSchema,
  type EntityContent,
  type EntityKind,
  type EffectContent,
  type ItemContent,
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
  return makeParsedContentEntry("item", typeId, rawContent, ItemContentSchema);
}

export function makeParsedEntityContentEntry(
  kind: EntityKind,
  resourceName: string,
  rawContent: JsonValue,
): EntityContentEntry {
  const typeId = makeResourceId(kind, resourceName);
  return makeParsedContentEntry(
    "entity",
    typeId,
    rawContent,
    EntityContentSchema,
  );
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
