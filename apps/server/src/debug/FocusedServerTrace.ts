import type { GameConfig } from "@shared/config/GameConfig.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { Player } from "@server/entities/Player.ts";
import type { World } from "@server/world/World.ts";

type FocusedTracePhase =
  | "tick_start"
  | "after_entity_tick"
  | "after_integrate"
  | "after_collision"
  | "after_after_movement"
  | "tick_end";

type FocusedTracePayload = Record<string, unknown>;

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
  collisionMode: Entity["collisionMode"];
  moveVx: number;
  moveVy: number;
  impulseVx: number;
  impulseVy: number;
  inputBufferLength?: number;
  activeEffects: Array<{
    typeId: string;
    ticksRemaining: number;
    sourceId?: number;
    speedMultiplier?: number;
    preventsAction?: boolean;
  }>;
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

export type FocusedTraceSnapshot = {
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

  public matchesEntity(entity: Entity): boolean {
    if (!this.enabled) {
      return false;
    }
    if (this.configuredEntityId !== null) {
      return entity.id === this.configuredEntityId;
    }
    return entity instanceof Player && entity.name === this.configuredPlayerName;
  }

  public recordWorldPhase(world: World, phase: FocusedTracePhase): void {
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
    world: World,
    event: string,
    entity: Entity,
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

  private resolveTrackedEntity(world: World): Entity | null {
    const trackedEntity =
      this.configuredEntityId !== null
        ? (world.get(this.configuredEntityId) ?? null)
        : (world.entities
            .all()
            .find(
              (candidate): candidate is Player =>
                candidate instanceof Player &&
                candidate.name === this.configuredPlayerName,
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

  private noteResolvedEntity(world: World, entity: Entity): void {
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

  private describeEntity(entity: Entity): FocusedTraceEntityState {
    const velocityComponents = entity.getDebugVelocityComponents();
    const ctor = entity.constructor as typeof Entity & {
      readonly kind?: string;
    };
    const baseState: FocusedTraceEntityState = {
      id: entity.id,
      typeId: entity.typeId,
      className: entity.constructor.name,
      kind: ctor.kind ?? null,
      x: entity.x,
      y: entity.y,
      vx: entity.vx,
      vy: entity.vy,
      hp: entity.hp,
      maxHp: entity.maxHp,
      alive: entity.alive,
      collisionMode: entity.collisionMode,
      moveVx: velocityComponents.moveVx,
      moveVy: velocityComponents.moveVy,
      impulseVx: velocityComponents.impulseVx,
      impulseVy: velocityComponents.impulseVy,
      activeEffects: entity.activeEffects.map((effect) => ({
        typeId: effect.typeId,
        ticksRemaining: effect.ticksRemaining,
        sourceId: effect.sourceId,
        speedMultiplier: effect.speedMultiplier,
        preventsAction: effect.preventsAction,
      })),
    };

    if (entity instanceof Player) {
      baseState.name = entity.name;
      baseState.inputBufferLength = entity.inputBuffer.length;
    }

    return baseState;
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
