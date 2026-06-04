import type { ResourceId } from "@shared/ids/ResourceId.ts";

export type ContainerSlot =
  | { kind: "buildable"; typeId: ResourceId; count: number }
  | { kind: "weapon"; typeId: ResourceId }
  | null;

/** @deprecated Use ContainerSlot */
export type ChestSlot = ContainerSlot;
