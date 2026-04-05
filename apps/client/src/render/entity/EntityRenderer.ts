import type { ClientEntity } from "@client/net/ClientEntity.ts";

export type EntityRendererOptions = {
  debugHitbox?: boolean;
  debugInterpolationMode?: number;
};

export type EntityRenderer = {
  sync(entity: ClientEntity): void;
  update(deltaMs: number, entity: ClientEntity): void;
  playAttackAnimation(entity: ClientEntity): void;
  triggerDamageFlash(durationMs?: number): void;
  destroy(): void;
};
