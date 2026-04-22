import type { ClientWorld } from "@client/net/ClientWorld.ts";
import type { WorldPresentationEvent } from "@client/net/presentation/WorldPresentationEvent.ts";
import type { EntityPresentationState } from "@client/render/entity/EntityRenderer.ts";

export interface WorldPresentationSink {
  reset(): void;
  setPlayerEntityId(entityId: number | undefined): void;
  syncWorld(world: ClientWorld): void;
  update(deltaMs: number, world: ClientWorld): void;
  setPresentationOverride(
    entityId: number,
    presentation: EntityPresentationState | null,
  ): void;
  playAttackAnimation(entityId: number | undefined, world: ClientWorld): void;
  applyEvents(events: readonly WorldPresentationEvent[]): void;
}
