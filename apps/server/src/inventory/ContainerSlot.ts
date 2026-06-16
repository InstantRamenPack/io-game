import type { ResourceId } from "@shared/ids/ResourceId.ts";

export type ContainerSlot =
  | { kind: "buildable"; typeId: ResourceId; count: number }
  | { kind: "weapon"; typeId: ResourceId }
  | null;
