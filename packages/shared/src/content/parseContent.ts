import {
  EntityContentSchema,
  ItemContentSchema,
  type EntityContent,
  type EntityKind,
  type ItemContent,
} from "@shared/content/schema.ts";
import {
  makeResourceId,
  type ResourceId,
} from "@shared/ids/ResourceId.ts";

export type ItemContentEntry = readonly [ResourceId, ItemContent];
export type EntityContentEntry = readonly [ResourceId, EntityContent];

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
