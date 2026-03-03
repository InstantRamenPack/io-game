import type { EntitySnapshot, WorldSnapshot } from "@shared/net/snapshots.ts";

/** Performs linear interpolation for numeric snapshot fields. */
function interpolateLinear(
  startValue: number,
  endValue: number,
  interpolationFactor: number,
): number {
  return startValue + (endValue - startValue) * interpolationFactor;
}

/** Samples interpolated render-state entities from buffered snapshots. */
export class Interpolator {
  bufferTicks: number;

  /** Creates an interpolator with a target buffer length in ticks. */
  constructor(bufferTicks: number) {
    this.bufferTicks = bufferTicks;
  }

  /** Updates interpolation buffer size in ticks. */
  setBufferTicks(bufferTickCount: number): void {
    this.bufferTicks = Math.max(0, Math.floor(bufferTickCount));
  }

  /** Returns interpolated entity states for the requested render tick. */
  sample(
    history: WorldSnapshot[],
    renderTick: number,
  ): Map<number, EntitySnapshot> {
    const outputEntities = new Map<number, EntitySnapshot>();
    if (history.length === 0) {
      return outputEntities;
    }

    const firstSnapshot = history[0] as WorldSnapshot;
    const lastSnapshot = history[history.length - 1] as WorldSnapshot;
    if (renderTick <= firstSnapshot.tick) {
      for (const entitySnapshot of firstSnapshot.entities) {
        outputEntities.set(entitySnapshot.id, entitySnapshot);
      }
      return outputEntities;
    }
    if (renderTick >= lastSnapshot.tick) {
      for (const entitySnapshot of lastSnapshot.entities) {
        outputEntities.set(entitySnapshot.id, entitySnapshot);
      }
      return outputEntities;
    }

    let startSnapshot = firstSnapshot;
    let endSnapshot = lastSnapshot;

    for (
      let historyIndex = 0;
      historyIndex < history.length - 1;
      historyIndex += 1
    ) {
      const leftSnapshot = history[historyIndex] as WorldSnapshot;
      const rightSnapshot = history[historyIndex + 1] as WorldSnapshot;
      if (leftSnapshot.tick <= renderTick && renderTick <= rightSnapshot.tick) {
        startSnapshot = leftSnapshot;
        endSnapshot = rightSnapshot;
        break;
      }
    }

    const tickDelta = endSnapshot.tick - startSnapshot.tick;
    const interpolationFactorUnclamped =
      tickDelta <= 0 ? 0 : (renderTick - startSnapshot.tick) / tickDelta;
    const interpolationFactor = Math.max(
      0,
      Math.min(1, interpolationFactorUnclamped),
    );

    const entitiesByIdFromEndSnapshot = new Map<number, EntitySnapshot>();
    for (const entityFromEndSnapshot of endSnapshot.entities) {
      entitiesByIdFromEndSnapshot.set(
        entityFromEndSnapshot.id,
        entityFromEndSnapshot,
      );
    }

    const emittedEntityIds = new Set<number>();
    for (const entityFromStartSnapshot of startSnapshot.entities) {
      const entityFromEndSnapshot = entitiesByIdFromEndSnapshot.get(
        entityFromStartSnapshot.id,
      );
      if (!entityFromEndSnapshot) {
        outputEntities.set(entityFromStartSnapshot.id, entityFromStartSnapshot);
        emittedEntityIds.add(entityFromStartSnapshot.id);
        continue;
      }

      outputEntities.set(entityFromStartSnapshot.id, {
        ...entityFromEndSnapshot,
        x: interpolateLinear(
          entityFromStartSnapshot.x,
          entityFromEndSnapshot.x,
          interpolationFactor,
        ),
        y: interpolateLinear(
          entityFromStartSnapshot.y,
          entityFromEndSnapshot.y,
          interpolationFactor,
        ),
        rotation: interpolateLinear(
          entityFromStartSnapshot.rotation,
          entityFromEndSnapshot.rotation,
          interpolationFactor,
        ),
      });
      emittedEntityIds.add(entityFromStartSnapshot.id);
    }

    for (const entityFromEndSnapshot of endSnapshot.entities) {
      if (!emittedEntityIds.has(entityFromEndSnapshot.id)) {
        outputEntities.set(entityFromEndSnapshot.id, entityFromEndSnapshot);
      }
    }

    return outputEntities;
  }
}
