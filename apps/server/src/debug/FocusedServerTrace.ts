import type { GameConfig } from "@shared/config/GameConfig.ts";
import type { ActionMessage } from "@shared/net/protocol.ts";
import type { JsonObject } from "@shared/json.ts";
import {
  getResourceNamespace,
  type ResourceId,
} from "@shared/ids/ResourceId.ts";

type FocusedTracePhase =
  | "tick_start"
  | "after_entity_tick"
  | "after_integrate"
  | "after_collision"
  | "after_after_movement"
  | "tick_end";

type FocusedTracePayload = JsonObject;

type FocusedTraceCollisionMode = "none" | "dynamic" | "static";

type FocusedTraceVelocityComponents = {
  desiredVx: number;
  desiredVy: number;
  driveVx: number;
  driveVy: number;
  momentumVx: number;
  momentumVy: number;
};

type FocusedTraceEntityState = {
  id: number;
  typeId: string;
  className: string;
  kind: string | null;
  name?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  collisionMode: FocusedTraceCollisionMode;
  desiredVx: number;
  desiredVy: number;
  driveVx: number;
  driveVy: number;
  momentumVx: number;
  momentumVy: number;
  queuedActionCount?: number;
  activeEffects: Array<{
    typeId: string;
    ticksRemaining: number;
    sourceId?: number;
    speedMultiplier?: number;
    preventsAction?: boolean;
  }>;
};

type FocusedTraceEntityView = {
  id: number;
  typeId: ResourceId;
  constructor: {
    name: string;
  };
  name?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  collisionMode: FocusedTraceCollisionMode;
  activeEffects: Array<{
    typeId: ResourceId;
    ticksRemaining: number;
    sourceId?: number;
    speedMultiplier?: number;
    preventsAction?: boolean;
  }>;
  getDebugVelocityComponents(): FocusedTraceVelocityComponents;
  toSnapshot(): {
    kind: string;
  };
  queuedActions?: readonly ActionMessage[];
  getQueuedActionCount?(): number;
};

type FocusedTraceWorldView = {
  tick: number;
  get(id: number): FocusedTraceEntityView | undefined;
  entities: {
    all(): Iterable<FocusedTraceEntityView>;
  };
};

type FocusedTraceEntry = {
  wallTimeMs: number;
  tick: number;
  kind: "phase" | "event";
  phase?: FocusedTracePhase;
  event?: string;
  target: {
    configuredEntityId: number | null;
    configuredPlayerName: string | null;
    resolvedEntityId: number | null;
  };
  entity?: FocusedTraceEntityState;
  details?: FocusedTracePayload;
};

type FocusedTraceSnapshot = {
  enabled: boolean;
  target: FocusedTraceEntry["target"];
  entries: FocusedTraceEntry[];
};

/**
 * Emits a narrow JSONL trace for one authoritative entity so server-side movement
 * discontinuities can be attributed to a specific phase.
 */
export class FocusedServerTrace {
  public readonly enabled: boolean;

  private readonly configuredEntityId: number | null;
  private readonly configuredPlayerName: string | null;
  private readonly entries: FocusedTraceEntry[] = [];
  private readonly maxEntries = 4000;
  private resolvedEntityId: number | null = null;

  constructor(gameConfig: GameConfig) {
    this.configuredEntityId = gameConfig.debug.focusedTrace.entityId;
    this.configuredPlayerName =
      gameConfig.debug.focusedTrace.playerName.length > 0
        ? gameConfig.debug.focusedTrace.playerName
        : null;
    this.enabled =
      this.configuredEntityId !== null || this.configuredPlayerName !== null;
    if (!this.enabled) {
      return;
    }

    console.log("[focused-trace] enabled in memory");
    this.writeEntry({
      wallTimeMs: Date.now(),
      tick: 0,
      kind: "event",
      event: "session_start",
      target: this.makeTargetMetadata(),
    });
  }

  public getSnapshot(): FocusedTraceSnapshot {
    return {
      enabled: this.enabled,
      target: this.makeTargetMetadata(),
      entries: this.entries.slice(),
    };
  }

  public clear(): void {
    this.entries.length = 0;
    this.resolvedEntityId = null;
  }

  public matchesEntity(entity: FocusedTraceEntityView): boolean {
    if (!this.enabled) {
      return false;
    }
    if (this.configuredEntityId !== null) {
      return entity.id === this.configuredEntityId;
    }
    return this.isConfiguredPlayer(entity);
  }

  public recordWorldPhase(
    world: FocusedTraceWorldView,
    phase: FocusedTracePhase,
  ): void {
    if (!this.enabled) {
      return;
    }

    const trackedEntity = this.resolveTrackedEntity(world);
    if (!trackedEntity) {
      return;
    }

    this.writeEntry({
      wallTimeMs: Date.now(),
      tick: world.tick,
      kind: "phase",
      phase,
      target: this.makeTargetMetadata(),
      entity: this.describeEntity(trackedEntity),
    });
  }

  public recordEntityEvent(
    world: FocusedTraceWorldView,
    event: string,
    entity: FocusedTraceEntityView,
    details: FocusedTracePayload = {},
  ): void {
    if (!this.matchesEntity(entity)) {
      return;
    }

    this.noteResolvedEntity(world, entity);
    this.writeEntry({
      wallTimeMs: Date.now(),
      tick: world.tick,
      kind: "event",
      event,
      target: this.makeTargetMetadata(),
      entity: this.describeEntity(entity),
      details,
    });
  }

  private resolveTrackedEntity(
    world: FocusedTraceWorldView,
  ): FocusedTraceEntityView | null {
    const trackedEntity =
      this.configuredEntityId !== null
        ? (world.get(this.configuredEntityId) ?? null)
        : (Array.from(world.entities.all()).find((candidate) =>
            this.isConfiguredPlayer(candidate),
          ) ?? null);

    if (trackedEntity) {
      this.noteResolvedEntity(world, trackedEntity);
      return trackedEntity;
    }

    if (this.resolvedEntityId !== null) {
      this.writeEntry({
        wallTimeMs: Date.now(),
        tick: world.tick,
        kind: "event",
        event: "focus_lost",
        target: this.makeTargetMetadata(),
        details: {
          previousEntityId: this.resolvedEntityId,
        },
      });
      this.resolvedEntityId = null;
    }

    return null;
  }

  private noteResolvedEntity(
    world: FocusedTraceWorldView,
    entity: FocusedTraceEntityView,
  ): void {
    if (entity.id === this.resolvedEntityId) {
      return;
    }

    this.resolvedEntityId = entity.id;
    this.writeEntry({
      wallTimeMs: Date.now(),
      tick: world.tick,
      kind: "event",
      event: "focus_acquired",
      target: this.makeTargetMetadata(),
      entity: this.describeEntity(entity),
    });
  }

  private describeEntity(
    entity: FocusedTraceEntityView,
  ): FocusedTraceEntityState {
    const velocityComponents = entity.getDebugVelocityComponents();
    const baseState: FocusedTraceEntityState = {
      id: entity.id,
      typeId: entity.typeId,
      className: entity.constructor.name,
      kind: this.getEntityKind(entity),
      x: entity.x,
      y: entity.y,
      vx: entity.vx,
      vy: entity.vy,
      hp: entity.hp,
      maxHp: entity.maxHp,
      alive: entity.alive,
      collisionMode: entity.collisionMode,
      desiredVx: velocityComponents.desiredVx,
      desiredVy: velocityComponents.desiredVy,
      driveVx: velocityComponents.driveVx,
      driveVy: velocityComponents.driveVy,
      momentumVx: velocityComponents.momentumVx,
      momentumVy: velocityComponents.momentumVy,
      activeEffects: entity.activeEffects.map((effect) => ({
        typeId: effect.typeId,
        ticksRemaining: effect.ticksRemaining,
        sourceId: effect.sourceId,
        speedMultiplier: effect.speedMultiplier,
        preventsAction: effect.preventsAction,
      })),
    };

    if (this.isConfiguredPlayer(entity)) {
      baseState.name = entity.name;
      baseState.queuedActionCount =
        entity.getQueuedActionCount?.() ?? entity.queuedActions?.length;
    }

    return baseState;
  }

  private getEntityKind(entity: FocusedTraceEntityView): string {
    return getResourceNamespace(entity.typeId);
  }

  private isConfiguredPlayer(
    entity: FocusedTraceEntityView,
  ): entity is FocusedTraceEntityView & {
    name: string;
    queuedActions?: readonly ActionMessage[];
  } {
    return (
      this.configuredPlayerName !== null &&
      this.getEntityKind(entity) === "player" &&
      entity.name === this.configuredPlayerName
    );
  }

  private makeTargetMetadata(): FocusedTraceEntry["target"] {
    return {
      configuredEntityId: this.configuredEntityId,
      configuredPlayerName: this.configuredPlayerName,
      resolvedEntityId: this.resolvedEntityId,
    };
  }

  private writeEntry(entry: FocusedTraceEntry): void {
    if (!this.enabled) {
      return;
    }
    this.entries.push(entry);
    const overflow = this.entries.length - this.maxEntries;
    if (overflow > 0) {
      this.entries.splice(0, overflow);
    }
  }
}
