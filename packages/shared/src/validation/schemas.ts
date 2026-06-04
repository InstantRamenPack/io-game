import interactionsRaw from "@shared/config/interactions.json";

const HOTBAR_SLOT_COUNT = interactionsRaw.hotbarSlotCount;
const MAX_HOTBAR_INDEX = HOTBAR_SLOT_COUNT - 1;
const MAX_CHAT_MESSAGE_LENGTH = interactionsRaw.maxChatMessageLength;
import {
  RESOURCE_ID_PATTERN,
  assertResourceId,
} from "@shared/ids/ResourceId.ts";
import { z } from "zod";

export const FiniteNumberSchema = z.number().finite();
export const PositiveFiniteNumberSchema = FiniteNumberSchema.positive();
export const NonNegativeFiniteNumberSchema = FiniteNumberSchema.nonnegative();

export const NonNegativeIntSchema = z.number().int().nonnegative();
export const PositiveIntSchema = z.number().int().positive();

export const EntityIdSchema = NonNegativeIntSchema;
export const HotbarIndexSchema = z.number().int().min(0).max(MAX_HOTBAR_INDEX);
export const ChatTextSchema = z.string().min(1).max(MAX_CHAT_MESSAGE_LENGTH);

export const ResourceIdSchema = z
  .string()
  .regex(RESOURCE_ID_PATTERN)
  .transform((typeId) => assertResourceId(typeId));

export function makeFixedLengthArraySchema<TSchema extends z.ZodTypeAny>(
  itemSchema: TSchema,
  length: number,
) {
  return z.array(itemSchema).length(length);
}

export const HotbarSlotArrayLength = HOTBAR_SLOT_COUNT;
