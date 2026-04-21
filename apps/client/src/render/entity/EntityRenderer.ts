import type { ClientEntity } from "@client/net/ClientEntity.ts";

export type EntityRendererOptions = {
  debugHitbox?: boolean;
  debugInterpolationMode?: number;
};

export type EntityPresentationState = {
  x: number;
  y: number;
  rotation: number;
};

export type EntityRenderer = {
  sync(entity: ClientEntity, presentation?: EntityPresentationState): void;
  update(
    deltaMs: number,
    entity: ClientEntity,
    presentation?: EntityPresentationState,
  ): void;
  playAttackAnimation(entity: ClientEntity): void;
  triggerDamageFlash(durationMs?: number): void;
  destroy(): void;
};
