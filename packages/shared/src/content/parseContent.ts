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
  const parsed = makeParsedContentEntry(
    "entity",
    typeId,
    rawContent,
    EntityContentSchema,
  );
  if (kind === "structure") {
    validateStructureTileQuantization(typeId, parsed[1]);
  }
  return parsed;
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

const STRUCTURE_TILE_SIZE = 16;

function validateStructureTileQuantization(
  typeId: ResourceId,
  content: EntityContent,
): void {
  const profiles = content.hitboxProfiles;
  if (!profiles) {
    throw new Error(
      `Structure ${typeId} must declare hitboxProfiles for tile quantization.`,
    );
  }

  for (const [profileName, rects] of Object.entries(profiles)) {
    for (const rect of rects) {
      const widthTiles = rect.width / STRUCTURE_TILE_SIZE;
      const heightTiles = rect.height / STRUCTURE_TILE_SIZE;
      const offsetXTiles = rect.offsetX / STRUCTURE_TILE_SIZE;
      const offsetYTiles = rect.offsetY / STRUCTURE_TILE_SIZE;
      if (
        !Number.isInteger(widthTiles) ||
        !Number.isInteger(heightTiles) ||
        widthTiles <= 0 ||
        heightTiles <= 0 ||
        !Number.isInteger(offsetXTiles) ||
        !Number.isInteger(offsetYTiles)
      ) {
        throw new Error(
          `Structure ${typeId} profile=${profileName} has non-${STRUCTURE_TILE_SIZE}px tile-aligned hitbox.`,
        );
      }
    }
  }
}
