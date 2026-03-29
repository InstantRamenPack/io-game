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

export type ItemContentEntry = readonly [ResourceId, ItemContent];
export type EntityContentEntry = readonly [ResourceId, EntityContent];
export type EffectContentEntry = readonly [ResourceId, EffectContent];

export function makeParsedItemContentEntry(
  resourceName: string,
  rawContent: unknown,
): ItemContentEntry {
  const typeId = makeResourceId("item", resourceName);
  const parsedContent = ItemContentSchema.safeParse(rawContent);
  if (!parsedContent.success) {
    throw new Error(
      `Invalid item content for ${typeId}: ${parsedContent.error.message}`,
    );
  }
  return [typeId, parsedContent.data] as const;
}

export function makeParsedEntityContentEntry(
  kind: EntityKind,
  resourceName: string,
  rawContent: unknown,
): EntityContentEntry {
  const typeId = makeResourceId(kind, resourceName);
  const parsedContent = EntityContentSchema.safeParse(rawContent);
  if (!parsedContent.success) {
    throw new Error(
      `Invalid entity content for ${typeId}: ${parsedContent.error.message}`,
    );
  }
  return [typeId, parsedContent.data] as const;
}

export function makeParsedEffectContentEntry(
  resourceName: string,
  rawContent: unknown,
): EffectContentEntry {
  const typeId = makeResourceId("effect", resourceName);
  const parsedContent = EffectContentSchema.safeParse(rawContent);
  if (!parsedContent.success) {
    throw new Error(
      `Invalid effect content for ${typeId}: ${parsedContent.error.message}`,
    );
  }
  return [typeId, parsedContent.data] as const;
}
