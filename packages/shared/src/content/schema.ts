import { RESOURCE_ID_PATTERN, type ResourceId } from "@shared/ids/ResourceId.ts";
import { z } from "zod";

export const ENTITY_KINDS = [
  "player",
  "enemy",
  "building",
  "projectile",
  "pickup",
] as const;

export type EntityKind = (typeof ENTITY_KINDS)[number];

const ResourceIdSchema = z
  .string()
  .regex(RESOURCE_ID_PATTERN)
  .transform((typeId) => typeId as ResourceId);

export const ItemRequirementSchema = z.object({
  typeId: ResourceIdSchema,
  amount: z.number().int().positive(),
});

export const ItemRecipeContentSchema = z.object({
  hint: z.string().min(1).optional(),
  outputAmount: z.number().int().positive().default(1),
  costs: z.array(ItemRequirementSchema).min(1),
});

export const ItemContentSchema = z.object({
  label: z.string().min(1),
  recipe: ItemRecipeContentSchema.optional(),
  buildsEntityTypeId: ResourceIdSchema.optional(),
});

export const EntityContentSchema = z.object({
  label: z.string().min(1),
});

export const EffectContentSchema = z.object({
  label: z.string().min(1),
});

export type ItemRequirement = z.infer<typeof ItemRequirementSchema>;
export type ItemRecipeContent = z.infer<typeof ItemRecipeContentSchema>;
export type ItemContent = z.infer<typeof ItemContentSchema>;
export type EntityContent = z.infer<typeof EntityContentSchema>;
export type EffectContent = z.infer<typeof EffectContentSchema>;
