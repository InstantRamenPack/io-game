import type { EntitySnapshot, WorldSnapshot } from "@shared/net/snapshots.ts";

export type ExtrapolationSettings = {
  maxPredictionMs: number;
  correctionRate: number;
  snapDistance: number;
};

function cloneEntity(entity: EntitySnapshot): EntitySnapshot {
  return {
    ...entity,
    data: entity.data ? { ...entity.data } : undefined,
  };
}

/**
 * Samples smooth render-state entities by extrapolating authoritative velocity
 * and reconciling toward predicted targets over time.
 */
export class Extrapolator {
  private latestSnapshot?: WorldSnapshot;
  private snapshotReceivedAtMs?: number;
  private authoritativeEntities = new Map<number, EntitySnapshot>();
  private renderEntities = new Map<number, EntitySnapshot>();

  constructor(private readonly settings: ExtrapolationSettings) {}

  /**
   * Replaces the authoritative snapshot and updates tracked render entities.
   * Existing render positions are preserved so corrections can be smoothed.
   * @param snapshot Latest authoritative world snapshot.
   * @param receivedAtMs Local monotonic time when the snapshot arrived.
   */
  pushSnapshot(snapshot: WorldSnapshot, receivedAtMs: number): void {
    this.latestSnapshot = snapshot;
    this.snapshotReceivedAtMs = receivedAtMs;

    const nextAuthoritativeEntities = new Map<number, EntitySnapshot>();
    const nextRenderEntities = new Map<number, EntitySnapshot>();

    for (const snapshotEntity of snapshot.entities) {
      const authoritativeEntity = cloneEntity(snapshotEntity);
      nextAuthoritativeEntities.set(authoritativeEntity.id, authoritativeEntity);

      const existingRenderEntity = this.renderEntities.get(authoritativeEntity.id);
      if (!existingRenderEntity) {
        nextRenderEntities.set(authoritativeEntity.id, authoritativeEntity);
        continue;
      }

      nextRenderEntities.set(authoritativeEntity.id, {
        ...authoritativeEntity,
        x: existingRenderEntity.x,
        y: existingRenderEntity.y,
        rotation: existingRenderEntity.rotation,
      });
    }

    this.authoritativeEntities = nextAuthoritativeEntities;
    this.renderEntities = nextRenderEntities;
  }

  /**
   * Clears both authoritative and render-state entities.
   */
  clear(): void {
    this.latestSnapshot = undefined;
    this.snapshotReceivedAtMs = undefined;
    this.authoritativeEntities.clear();
    this.renderEntities.clear();
  }

  /**
   * Returns smoothed extrapolated entities for the current render frame.
   * @param renderTimeMs Local monotonic render timestamp.
   * @param deltaMs Frame delta in milliseconds.
   * @returns Render-state entities keyed by id.
   */
  sample(renderTimeMs: number, deltaMs: number): Map<number, EntitySnapshot> {
    if (!this.latestSnapshot || this.snapshotReceivedAtMs === undefined) {
      return new Map<number, EntitySnapshot>();
    }

    const clampedPredictionMs = Math.max(
      0,
      Math.min(
        this.settings.maxPredictionMs,
        renderTimeMs - this.snapshotReceivedAtMs,
      ),
    );
    const predictionSeconds = clampedPredictionMs / 1000;
    const deltaSeconds = Math.max(0, deltaMs / 1000);
    const correctionAlpha =
      deltaSeconds <= 0
        ? 0
        : 1 - Math.exp(-this.settings.correctionRate * deltaSeconds);

    for (const [entityId, authoritativeEntity] of this.authoritativeEntities) {
      const renderEntity =
        this.renderEntities.get(entityId) ?? cloneEntity(authoritativeEntity);
      const targetX =
        authoritativeEntity.x + authoritativeEntity.vx * predictionSeconds;
      const targetY =
        authoritativeEntity.y + authoritativeEntity.vy * predictionSeconds;
      const deltaX = targetX - renderEntity.x;
      const deltaY = targetY - renderEntity.y;
      const errorDistance = Math.hypot(deltaX, deltaY);

      if (errorDistance >= this.settings.snapDistance) {
        renderEntity.x = targetX;
        renderEntity.y = targetY;
      } else {
        renderEntity.x += deltaX * correctionAlpha;
        renderEntity.y += deltaY * correctionAlpha;
      }

      renderEntity.vx = authoritativeEntity.vx;
      renderEntity.vy = authoritativeEntity.vy;
      renderEntity.rotation = authoritativeEntity.rotation;
      renderEntity.kind = authoritativeEntity.kind;
      renderEntity.radius = authoritativeEntity.radius;
      renderEntity.hp = authoritativeEntity.hp;
      renderEntity.maxHp = authoritativeEntity.maxHp;
      renderEntity.ownerId = authoritativeEntity.ownerId;
      renderEntity.data = authoritativeEntity.data
        ? { ...authoritativeEntity.data }
        : undefined;

      this.renderEntities.set(entityId, renderEntity);
    }

    return new Map(
      Array.from(this.renderEntities.entries(), ([entityId, entity]) => [
        entityId,
        cloneEntity(entity),
      ]),
    );
  }
}
