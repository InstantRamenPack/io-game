# PLAN.md — Zombs.io‑style .io game (TypeScript + Bun + WebSockets + PixiJS)

This document is the **single source of truth** for building a **zombs.io clone** with:

- **Server:** Bun runtime (TypeScript) using `bun.serve()` + WebSocket upgrade
- **Client:** Browser TypeScript with **PixiJS** renderer
- **Networking:** Server‑authoritative simulation; clients send **inputs**, server sends **snapshots + events**
- **Gameplay:** Gather → craft → build/upgrade → survive enemy **waves** (walls, towers, traps, generators)

It is written so an agent can implement the app end‑to‑end.

---

## 0) Non‑goals (keep scope sane)

- No client-authoritative combat or placement
- No heavy pathfinding initially (simple steering first)
- No persistence / DB initially (session-only)
- No binary protocol initially (start with JSON; optimize after gameplay feels good)

---

## 1) Architecture at a glance

### 1.1 Authoritative simulation
- Server runs a **fixed tick loop** (e.g., 20 TPS).
- Client renders using requestAnimationFrame and displays an **interpolated** state behind the server tick.

### 1.2 Networking contract
- **Client → Server:** `InputCommand` (movement/aim/actions/build/craft)
- **Server → Client:** `WorldSnapshot` (replicated entity states) + `NetEvent[]` (discrete events)

### 1.3 Where logic lives
- **Server owns all gameplay rules**: damage, building legality, crafting validation, wave spawning, AI.
- Client is presentation-only: renders, plays VFX, sends inputs.

---

## 2) Repo layout

```txt
repo/
  apps/
    server/
      src/
        index.ts
        server/
          GameServer.ts
          clock.ts
        net/
          WsServer.ts
          SnapshotManager.ts
          AntiCheatValidator.ts
        world/
          World.ts
          EntityStore.ts
          SpatialIndex.ts
          Collision.ts
          EventBus.ts
        ai/
          Goal.ts
          GoalSelector.ts
          GoalContext.ts
          goals/
            TargetNearestGoal.ts
            GoToPositionGoal.ts
            GoToTargetGoal.ts
            WanderGoal.ts
            MeleeAttackGoal.ts
            ShootAtGoal.ts
        entities/
          Entity.ts
          Player.ts
          Enemy.ts
          Projectile.ts
          Pickup.ts
          Building.ts
          ResourceNode.ts
        systems/
          System.ts
          InputSystem.ts
          MovementSystem.ts
          CollisionSystem.ts
          AISystem.ts
          ProjectileSystem.ts
          CombatSystem.ts
          StatusSystem.ts
          InventorySystem.ts
          BuildingSystem.ts
          ResourceSystem.ts
          CraftingSystem.ts
          WaveSystem.ts
        gameplay/
          Health.ts
          Inventory.ts
          ItemStack.ts
          Wallet.ts
          Weapon.ts
          RangedWeapon.ts
          MeleeWeapon.ts
        effects/
          Effect.ts
          StatusEffect.ts
          StatusContainer.ts
          EffectRegistry.ts
          builtin/
            BurnEffect.ts
            SlowEffect.ts
            KnockbackEffect.ts
        services/
          AuthService.ts

    client/
      src/
        main.ts
        client/
          GameClient.ts
        net/
          WsClient.ts
          Interpolator.ts
          ClientWorldState.ts
        input/
          InputManager.ts
        render/
          PixiRenderer.ts
          SpriteStore.ts
          SpriteFactory.ts
          Camera.ts
          Hud.ts
          assets.ts
        fx/
          EffectVfxRegistry.ts
          BurnVfx.ts

  packages/
    shared/
      src/
        config/
          GameConfig.ts
        math/
          Vec2.ts
          Rng.ts
          IdGenerator.ts
        defs/
          EntityKinds.ts
          ItemDef.ts
          WeaponDef.ts
          ProjectileDef.ts
          StructureDef.ts
          RecipeDef.ts
          WaveDef.ts
        net/
          protocol.ts
          snapshots.ts
          events.ts
          codec-json.ts
        util/
          ringbuffer.ts

  tsconfig.base.json
  package.json
  bunfig.toml
```

---

## 3) Build & run assumptions

### 3.1 TypeScript path alias
Use a base tsconfig with:

- `@shared/*` → `packages/shared/src/*`

### 3.2 Server — WebSockets via `bun.serve()`
- `apps/server/src/index.ts` creates server:

- Route `GET /ws` upgrades to websocket via `server.upgrade(req, { data })`
- `WsServer` wraps Bun’s websocket callbacks:
  - `open(ws)`
  - `message(ws, message)`
  - `close(ws, code, reason)`

### 3.3 Client
- Bundle however you like.
- Connect to `ws(s)://<host>/ws`.

---

## 4) Timing

### 4.1 Ticks
- Tick rate: `GameConfig.tickRate` (default 20)
- Fixed delta: `dtMs = 1000 / tickRate`

### 4.2 Snapshots
- Snapshot rate: `GameConfig.snapshotRate` (default 10–20)
- Snapshots include `tick`, `timeMs`, `entities[]`, `events[]`

### 4.3 Client interpolation
- Client renders at: `renderTick = latestServerTick - bufferTicks`
- `bufferTicks` default: 2–4

---

## 5) Minecraft-like goal-based AI

Instead of writing one big AI function, enemies use **Goals (Objectives)**, similar to Minecraft’s `Goal` / `GoalSelector`:

- A **Goal** is a small behavior module (e.g., “wander”, “go to target”, “melee attack”).
- A **GoalSelector** evaluates goals each tick and runs the best eligible set.
- Goals declare which **controls** they need (`move`, `look`, `attack`) so conflicting goals don’t run together.

This style scales well as you add enemy types and behaviors.

### 5.1 Goal lifecycle
Each Goal implements:

- `canStart(ctx)` — is it eligible now?
- `start(ctx)` — initialize state when chosen
- `tick(ctx, dtMs)` — run behavior each tick
- `shouldContinue(ctx)` — keep running or stop?
- `stop(ctx)` — cleanup when replaced/ended

### 5.2 Example enemy goal stack (zombie)
Typical goal stack for a wave zombie:

1. `TargetNearestGoal` (look for player/building target)
2. `GoToTargetGoal` (move toward target)
3. `MeleeAttackGoal` (attack when in range)
4. `WanderGoal` (idle movement when no target)

---

## 6) Networking protocol (v1 JSON)

### 6.1 Message envelope
All messages are JSON objects with a `t` field:

- `t: "hello" | "input" | "snapshot" | "ping" | "pong" | "error"`

### 6.2 Versioning
Include `protocolVersion` in `hello`.
Reject mismatches early.

---

## 7) Data-driven defs (zombs content)

For MVP, keep defs as TypeScript objects; later load JSON.

- Items: wood, stone, food, gold
- Weapons: bow, pistol, rifle, sword, pickaxe
- Structures: wall, spike, tower, windmill, crafting station
- Recipes: ammo, arrows, upgrades
- Waves: enemy composition per wave

Server validates all actions using defs.

---

# 8) Class reference (ALL classes)

Conventions:
- Server entity classes never reference Pixi.
- Client never instantiates server runtime entities; it uses snapshots.
- Methods that mutate `World` are called from systems (or goal ticks) only.

For each class below:
- Paste the **class JSDoc** above the class.
- Paste the **method JSDoc** above each method.

---

## 8A) packages/shared

### `GameConfig` — `packages/shared/src/config/GameConfig.ts`

```ts
/**
 * Global tuning parameters shared by server and client.
 * Defines tick/snapshot rates, world dimensions, and networking limits.
 * Keep stable: changes affect simulation determinism and client interpolation.
 */
export class GameConfig {
  tickRate: number;
  snapshotRate: number;
  worldSize: { w: number; h: number };
  net: { maxPlayers: number; maxPacketBytes: number };
  interpolation: { bufferTicks: number };

  /**
   * Loads configuration (hardcoded defaults for MVP; env/JSON override later).
   * @returns A fully populated GameConfig.
   */
  static load(): GameConfig;
}
```

### `IdGenerator` — `packages/shared/src/math/IdGenerator.ts`

```ts
/**
 * Allocates unique integer IDs for runtime entity instances.
 * Server is the source of truth; client treats IDs as stable sprite keys.
 */
export class IdGenerator {
  private nextId: number;

  /**
   * Allocates a new unique ID.
   * @returns New integer ID.
   */
  alloc(): number;

  /**
   * Releases an ID back to the pool (optional).
   * Prefer not to reuse IDs early to avoid client confusion.
   * @param id The ID to release.
   */
  free?(id: number): void;
}
```

### `Vec2` — `packages/shared/src/math/Vec2.ts`

```ts
/**
 * Lightweight 2D vector helper used by simulation and rendering.
 * Keep allocation minimal because it runs every tick.
 */
export class Vec2 {
  x: number;
  y: number;

  /**
   * @param x X component.
   * @param y Y component.
   */
  constructor(x?: number, y?: number);

  /** Adds v to this vector in-place. */
  add(v: Vec2): this;

  /** Subtracts v from this vector in-place. */
  sub(v: Vec2): this;

  /** Multiplies this vector by scalar s in-place. */
  mul(s: number): this;

  /** @returns Euclidean length. */
  len(): number;

  /**
   * Normalizes this vector in-place.
   * If length is zero, leaves it unchanged.
   */
  norm(): this;

  /** @returns A new Vec2 with the same components. */
  clone(): Vec2;
}
```

### `Rng` — `packages/shared/src/math/Rng.ts`

```ts
/**
 * Deterministic RNG helper for authoritative rolls (waves/loot).
 * Client RNG should be used for visuals only.
 */
export class Rng {
  seed: number;

  /** @param seed Initial seed value. */
  constructor(seed: number);

  /** @returns Float in [0, 1). */
  nextFloat(): number;

  /** @returns Int in [min, max]. */
  nextInt(min: number, max: number): number;
}
```

### Defs — `packages/shared/src/defs/*`

```ts
/**
 * Enumerates canonical entity kinds used in snapshots.
 * Client uses kind to choose a renderer; server uses kind for grouping/querying.
 */
export type EntityKind =
  | "player"
  | "enemy"
  | "projectile"
  | "pickup"
  | "building"
  | "resource_node";

/** Item definition for resources/craftables. */
export interface ItemDef {
  id: string;              // e.g., "game:wood"
  name: string;
  stackMax: number;
  icon?: string;           // asset key
}

/** Weapon definition (data-driven stats + effect IDs). */
export interface WeaponDef {
  id: string;
  name: string;
  type: "ranged" | "melee";
  damage: number;
  fireRate: number;
  range: number;
  projectile?: ProjectileDef;
  hitEffects: string[];
  ammo?: { magSize: number; reloadMs: number; reserveMax: number };
  spread?: number;
}

/** Projectile definition for ranged weapons. */
export interface ProjectileDef {
  speed: number;
  lifeMs: number;
  hitRadius: number;
  pierce?: number;
  bounces?: number;
}

/** Structure definition for building placement and upgrades. */
export interface StructureDef {
  id: string;
  name: string;
  radius: number;
  maxHp: number;
  cost: { itemId: string; amount: number }[];
  upgradeTo?: string;
  behavior?: "wall" | "tower" | "trap" | "generator" | "station";
  tower?: { weaponId: string; range: number; fireRate: number };
}

/** Recipe definition for crafting. */
export interface RecipeDef {
  id: string;
  name: string;
  inputs: { itemId: string; amount: number }[];
  outputs: { itemId: string; amount: number }[];
  stationId?: string;
  craftMs: number;
}

/** Wave definition for scheduled enemy spawns. */
export interface WaveDef {
  wave: number;
  durationMs: number;
  spawns: { enemyType: string; count: number; intervalMs: number }[];
  boss?: { enemyType: string; atMs: number };
}
```

### Net types — `packages/shared/src/net/*`

```ts
/**
 * Input command sent from client to server.
 * Keep small, explicit, and easy to validate.
 */
export interface InputCommand {
  seq: number;
  tick: number;
  moveX: number;  // -1..1
  moveY: number;  // -1..1
  aimX: number;   // normalized direction
  aimY: number;
  fire: boolean;
  reload: boolean;
  use: boolean;
  build?: { structureId: string; x: number; y: number };
  craft?: { recipeId: string; count: number };
  switchSlot?: number;
}

/** Per-entity state replicated to client. */
export interface EntitySnapshot {
  id: number;
  kind: EntityKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  r: number;
  hp?: number;
  maxHp?: number;
  ownerId?: number;
  data?: Record<string, any>;
}

/** Snapshot for one server tick. */
export interface WorldSnapshot {
  tick: number;
  timeMs: number;
  entities: EntitySnapshot[];
  events: NetEvent[];
}

/** Discrete events for UI/VFX. */
export interface NetEvent {
  type: string;
  tick: number;
  payload: any;
}

/**
 * Simple JSON codec. Start here, optimize later.
 */
export class JsonCodec {
  /** Encodes an input command to JSON string. */
  encodeInput(cmd: InputCommand): string;

  /** Decodes an input command from JSON string. */
  decodeInput(raw: string): InputCommand;

  /** Encodes a world snapshot to JSON string. */
  encodeSnapshot(s: WorldSnapshot): string;

  /** Decodes a world snapshot from JSON string. */
  decodeSnapshot(raw: string): WorldSnapshot;
}
```

### `RingBuffer<T>` — `packages/shared/src/util/ringbuffer.ts`

```ts
/**
 * Fixed-capacity ring buffer storing snapshot history for interpolation.
 */
export class RingBuffer<T> {
  constructor(capacity: number);

  /** Appends a value, overwriting oldest when full. */
  push(v: T): void;

  /**
   * Gets element by index from oldest->newest ordering.
   * @throws if index out of bounds.
   */
  get(i: number): T;

  /** @returns Number of elements currently stored. */
  size(): number;

  /** Clears all stored values. */
  clear(): void;
}
```

---

## 8B) apps/server

### `index.ts` — `apps/server/src/index.ts`

```ts
/**
 * Server entrypoint.
 * Creates Bun HTTP server via bun.serve(), upgrades /ws to WebSocket,
 * and boots GameServer.
 */
export function main(): void;
```

### `TickClock` — `apps/server/src/server/clock.ts`

```ts
/**
 * Fixed-step tick scheduler.
 * Calls a callback at a stable tick rate (drift-correcting loop).
 */
export class TickClock {
  /** @param tickRate Ticks per second. */
  constructor(tickRate: number);

  /**
   * Starts calling cb every tick.
   * @param cb Called with fixed dtMs.
   */
  start(cb: (dtMs: number) => void): void;

  /** Stops the tick loop. */
  stop(): void;

  /** @returns Monotonic time in milliseconds. */
  nowMs(): number;
}
```

### `GameServer` — `apps/server/src/server/GameServer.ts`

```ts
/**
 * High-level orchestrator for the authoritative server simulation.
 * Owns the World, runs systems in order each tick, handles connect/disconnect,
 * and broadcasts snapshots.
 */
export class GameServer {
  world: World;
  systems: System[];
  net: WsServer;
  snapshotter: SnapshotManager;
  validator: AntiCheatValidator;

  constructor(cfg: GameConfig, net: WsServer);

  /** Starts ticking and accepting network connections. */
  start(): void;

  /** Stops ticking and disconnects clients. */
  stop(): void;

  /** Runs one server tick: systems + snapshot broadcast. */
  tick(dtMs: number): void;

  /** Validates input and forwards to the owning player entity. */
  handleInput(clientId: string, cmd: InputCommand): void;

  /** Spawns player and returns entity id for this client. */
  onConnect(clientId: string): number;

  /** Cleans up state when a client disconnects. */
  onDisconnect(clientId: string): void;
}
```

### `WsServer` — `apps/server/src/net/WsServer.ts`

```ts
/**
 * Bun WebSocket wrapper.
 * Abstracts client IDs, broadcasting, and message callbacks.
 */
export class WsServer {
  onMessage(fn: (clientId: string, raw: string) => void): void;
  onOpen(fn: (clientId: string) => void): void;
  onClose(fn: (clientId: string) => void): void;

  /** Sends raw message to a specific client. */
  send(clientId: string, data: string | Uint8Array): void;

  /** Broadcasts raw message to all clients. */
  broadcast(data: string | Uint8Array): void;

  /** Disconnects a client. */
  disconnect(clientId: string, reason?: string): void;
}
```

### `SnapshotManager` — `apps/server/src/net/SnapshotManager.ts`

```ts
/**
 * Converts authoritative World state into compact WorldSnapshots.
 * MVP: full snapshot each send; later: delta compression.
 */
export class SnapshotManager {
  constructor(snapshotRate: number);

  /** @returns True if snapshot should be emitted at this tick. */
  shouldSendSnapshot(tick: number): boolean;

  /** Serializes the world into a snapshot. */
  makeSnapshot(world: World): WorldSnapshot;

  /** Optional: builds a delta snapshot from prev->next. */
  makeDelta?(prev: WorldSnapshot, next: WorldSnapshot): any;
}
```

### `AntiCheatValidator` — `apps/server/src/net/AntiCheatValidator.ts`

```ts
/**
 * Basic input validation/clamping to reduce trivial cheats.
 * Server remains authoritative even without this, but it improves robustness.
 */
export class AntiCheatValidator {
  /** Validates an input command against the player state. */
  validate(cmd: InputCommand, player: Player): boolean;

  /** Clamps movement vector magnitude and rejects NaNs. */
  clampMove(cmd: InputCommand): void;

  /** Clamps aim vector magnitude and rejects NaNs. */
  clampAim(cmd: InputCommand): void;
}
```

---

## 8B.1) World core

### `EventBus` — `apps/server/src/world/EventBus.ts`

```ts
/**
 * Per-tick event queue used for both gameplay and replication.
 * Systems push events; SnapshotManager includes them in WorldSnapshot.
 */
export class EventBus {
  private queue: NetEvent[];

  /** Adds an event to the queue. */
  emit(e: NetEvent): void;

  /**
   * Drains all queued events and clears the queue.
   * @returns Events emitted since last drain.
   */
  drain(): NetEvent[];
}
```

### `World` — `apps/server/src/world/World.ts`

```ts
/**
 * Authoritative world state container.
 * Holds entities, spatial index, tick/time counters, RNG, and event bus.
 */
export class World {
  tick: number;
  timeMs: number;
  entities: EntityStore;
  spatial: SpatialIndex;
  rng: Rng;
  events: EventBus;
  cfg: GameConfig;

  constructor(cfg: GameConfig);

  /** Advances tick/time counters; clears per-tick state if needed. */
  step(dtMs: number): void;

  /** Adds an entity and inserts it into indices. */
  spawn(e: Entity): void;

  /** Removes an entity and de-indexes it. */
  despawn(id: number): void;

  /** Returns entity by ID, if present. */
  get<T extends Entity = Entity>(id: number): T | undefined;
}
```

### `EntityStore` — `apps/server/src/world/EntityStore.ts`

```ts
/**
 * Stores entities and provides lookup by ID and by kind.
 */
export class EntityStore {
  byId: Map<number, Entity>;
  byKind: Map<string, Set<number>>;

  /** Adds an entity to storage. */
  add(e: Entity): void;

  /** Removes an entity by ID. */
  remove(id: number): void;

  /** Returns entity by ID. */
  get<T extends Entity = Entity>(id: number): T | undefined;

  /** Returns entities for a kind (slow; prefer spatial for nearby). */
  queryKind(kind: string): Entity[];
}
```

### `SpatialIndex` — `apps/server/src/world/SpatialIndex.ts`

```ts
/**
 * Grid-based spatial hash for nearby queries.
 * Used for collision broadphase, tower targeting, pickups, melee checks.
 */
export class SpatialIndex {
  cellSize: number;

  constructor(cellSize: number);

  /** Inserts entity into grid cells. */
  insert(e: Entity): void;

  /** Updates entity's cell membership after movement. */
  update(e: Entity, oldX: number, oldY: number): void;

  /** Removes entity from grid cells. */
  remove(e: Entity): void;

  /** Returns candidate entity IDs within a circle area (broadphase). */
  queryCircle(x: number, y: number, r: number): number[];
}
```

### `Collision` — `apps/server/src/world/Collision.ts`

```ts
/**
 * Collision helpers for circle-based collisions (MVP).
 * Buildings/resources use radius. Upgrade later to AABB/polygons if desired.
 */
export class Collision {
  /** Returns true if circles overlap. */
  static circleVsCircle(ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean;

  /**
   * Resolves overlap between two dynamic entities by pushing them apart.
   * Optionally modifies velocity along the normal to reduce jitter.
   */
  static resolveDynamicVsDynamic(a: Entity, b: Entity): void;

  /** Resolves dynamic entity vs world bounds. */
  static resolveDynamicVsWorld(a: Entity, worldW: number, worldH: number): void;
}
```

---

## 8B.2) Goal-based AI (server)

### `GoalControl`, `Goal` — `apps/server/src/ai/Goal.ts`

```ts
/**
 * Control channels used to prevent incompatible goals from running together.
 * Example: only one goal should control 'move' at a time.
 */
export type GoalControl = "move" | "look" | "attack";

/**
 * A small AI behavior module (objective) similar to Minecraft's Goal.
 * Goals are evaluated each tick and executed by GoalSelector.
 */
export interface Goal {
  /** Higher priority runs first. */
  priority: number;

  /** Which control channels this goal requires. */
  controls: Set<GoalControl>;

  /**
   * Returns true if this goal can start running right now.
   * @param ctx Shared AI context.
   */
  canStart(ctx: GoalContext): boolean;

  /**
   * Called once when this goal becomes active.
   * @param ctx Shared AI context.
   */
  start(ctx: GoalContext): void;

  /**
   * Called each tick while active.
   * @param ctx Shared AI context.
   * @param dtMs Fixed timestep.
   */
  tick(ctx: GoalContext, dtMs: number): void;

  /**
   * Returns true if this goal should keep running.
   * If false, GoalSelector stops it.
   */
  shouldContinue(ctx: GoalContext): boolean;

  /**
   * Called once when goal stops (preempted or finished).
   * @param ctx Shared AI context.
   */
  stop(ctx: GoalContext): void;
}
```

### `GoalContext` — `apps/server/src/ai/GoalContext.ts`

```ts
/**
 * Shared context passed to goals.
 * Keeps goal code decoupled from global singletons and makes goals testable.
 */
export class GoalContext {
  world: World;
  self: Enemy;
  spatial: SpatialIndex;
  combat: CombatSystem;
  projectiles: ProjectileSystem;

  constructor(args: {
    world: World;
    self: Enemy;
    spatial: SpatialIndex;
    combat: CombatSystem;
    projectiles: ProjectileSystem;
  });
}
```

### `GoalSelector` — `apps/server/src/ai/GoalSelector.ts`

```ts
/**
 * Selects and ticks active goals each server tick.
 * Rough model:
 * - Sort goals by priority (desc)
 * - Start goals that can run and don't conflict with active controls
 * - Stop goals that shouldn't continue or are preempted
 *
 * MVP simplification: allow at most ONE active goal that controls 'move',
 * and at most ONE active goal that controls 'attack'.
 */
export class GoalSelector {
  private goals: Goal[];
  private active: Set<Goal>;

  constructor();

  /**
   * Adds a goal to this selector.
   * @param goal The goal instance.
   */
  add(goal: Goal): void;

  /** Removes all goals and stops any active goals. */
  clear(ctx: GoalContext): void;

  /** Ticks goal selection and executes active goals. */
  tick(ctx: GoalContext, dtMs: number): void;

  /** @returns A snapshot/debug view of current active goal names/ids. */
  debugActive(): string[];
}
```

### Built-in goals — `apps/server/src/ai/goals/*`

```ts
/**
 * Chooses the nearest valid target (player or building) within aggro range.
 * Writes the chosen target id into Enemy.aggroTargetId.
 */
export class TargetNearestGoal implements Goal {
  priority: number;
  controls: Set<GoalControl>;
  aggroRange: number;

  constructor(priority: number, aggroRange: number);

  canStart(ctx: GoalContext): boolean;
  start(ctx: GoalContext): void;
  tick(ctx: GoalContext, dtMs: number): void;
  shouldContinue(ctx: GoalContext): boolean;
  stop(ctx: GoalContext): void;
}

/**
 * Moves the enemy toward a fixed world position.
 * Useful for scripted behavior or returning to a spawn/home.
 */
export class GoToPositionGoal implements Goal {
  priority: number;
  controls: Set<GoalControl>;
  x: number;
  y: number;
  stopDistance: number;

  constructor(priority: number, x: number, y: number, stopDistance: number);

  canStart(ctx: GoalContext): boolean;
  start(ctx: GoalContext): void;
  tick(ctx: GoalContext, dtMs: number): void;
  shouldContinue(ctx: GoalContext): boolean;
  stop(ctx: GoalContext): void;
}

/**
 * Moves the enemy toward its current aggro target (Enemy.aggroTargetId).
 */
export class GoToTargetGoal implements Goal {
  priority: number;
  controls: Set<GoalControl>;
  stopDistance: number;

  constructor(priority: number, stopDistance: number);

  canStart(ctx: GoalContext): boolean;
  start(ctx: GoalContext): void;
  tick(ctx: GoalContext, dtMs: number): void;
  shouldContinue(ctx: GoalContext): boolean;
  stop(ctx: GoalContext): void;
}

/**
 * Idle wandering when no target exists.
 * Applies small random steering changes every so often.
 */
export class WanderGoal implements Goal {
  priority: number;
  controls: Set<GoalControl>;
  radius: number;
  changeDirMs: number;
  private timerMs: number;
  private dirX: number;
  private dirY: number;

  constructor(priority: number, radius: number, changeDirMs: number);

  canStart(ctx: GoalContext): boolean;
  start(ctx: GoalContext): void;
  tick(ctx: GoalContext, dtMs: number): void;
  shouldContinue(ctx: GoalContext): boolean;
  stop(ctx: GoalContext): void;
}

/**
 * Performs a melee attack when within range of the aggro target.
 * Uses CombatSystem.applyDamage for authoritative resolution.
 */
export class MeleeAttackGoal implements Goal {
  priority: number;
  controls: Set<GoalControl>;
  range: number;
  cooldownMs: number;
  private cooldownLeftMs: number;

  constructor(priority: number, range: number, cooldownMs: number);

  canStart(ctx: GoalContext): boolean;
  start(ctx: GoalContext): void;
  tick(ctx: GoalContext, dtMs: number): void;
  shouldContinue(ctx: GoalContext): boolean;
  stop(ctx: GoalContext): void;
}

/**
 * Ranged attack objective (usable for ranged mobs or towers).
 * When a target is in range, spawns a projectile via ProjectileSystem.
 */
export class ShootAtGoal implements Goal {
  priority: number;
  controls: Set<GoalControl>;
  range: number;
  fireRate: number;
  projectile: ProjectileDef;
  damage: number;
  hitEffects: string[];
  private cooldownMs: number;

  constructor(args: {
    priority: number;
    range: number;
    fireRate: number;
    projectile: ProjectileDef;
    damage: number;
    hitEffects: string[];
  });

  canStart(ctx: GoalContext): boolean;
  start(ctx: GoalContext): void;
  tick(ctx: GoalContext, dtMs: number): void;
  shouldContinue(ctx: GoalContext): boolean;
  stop(ctx: GoalContext): void;
}
```

---

## 8B.3) Entities (server runtime)

### `Entity` — `apps/server/src/entities/Entity.ts`

```ts
/**
 * Base runtime entity instance (server-only).
 * Holds simulation state and provides snapshot serialization.
 */
export abstract class Entity {
  id: number;
  kind: EntityKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  r: number;
  alive: boolean;
  teamId?: number;
  ownerId?: number;

  /** Minimal extra flags for snapshots (e.g., burning). */
  data: Record<string, any>;

  constructor(id: number, kind: EntityKind);

  /**
   * Optional per-entity timers. Core movement/collision is handled by systems.
   */
  tick(world: World, dtMs: number): void;

  /** Serializes entity state into a snapshot for replication. */
  toSnapshot(): EntitySnapshot;

  /** Applies an impulse to velocity (knockback). */
  applyImpulse(ix: number, iy: number): void;
}
```

### `Player` — `apps/server/src/entities/Player.ts`

```ts
/**
 * Player-controlled entity.
 * Stores validated inputs, inventory/wallet, and equipped weapon state.
 */
export class Player extends Entity {
  name: string;
  health: Health;
  inventory: Inventory;
  wallet: Wallet;
  weapon?: Weapon;

  /** Buffer of recent inputs; MVP can keep only the latest. */
  inputBuffer: InputCommand[];

  /** Movement tuning. */
  moveSpeed: number;

  constructor(id: number);

  /** Enqueues validated input for this player. */
  enqueueInput(cmd: InputCommand): void;

  /**
   * Applies latest buffered input to movement/actions for this tick.
   * Called by InputSystem.
   */
  applyInputForTick(world: World, tick: number): void;

  /** Attempts to fire the equipped weapon. */
  tryFire(world: World): void;
}
```

### `Enemy` — `apps/server/src/entities/Enemy.ts`

```ts
/**
 * Hostile mob used in wave defense.
 * Uses a GoalSelector (Minecraft-style objectives) to decide movement/attacks.
 */
export class Enemy extends Entity {
  enemyType: string;
  health: Health;

  /** AI fields */
  aggroTargetId?: number;
  aggroRange: number;

  /** Movement/combat tuning */
  moveSpeed: number;
  damage: number;

  /** Brain: list of Goals (objectives). */
  goals: GoalSelector;

  constructor(id: number, enemyType: string);

  /** Sets current aggro target. */
  setTarget(entityId: number | undefined): void;

  /** Optional per-entity timers; goals do the main AI work. */
  tick(world: World, dtMs: number): void;
}
```

### `Projectile` — `apps/server/src/entities/Projectile.ts`

```ts
/**
 * Projectile instance (bullet/arrow).
 * Simulated by ProjectileSystem; expires after lifetime or on hit.
 */
export class Projectile extends Entity {
  projectileDef: ProjectileDef;
  damage: number;
  lifeMs: number;
  hitEffects: string[];
  shooterId: number;

  constructor(id: number, shooterId: number, def: ProjectileDef, damage: number, hitEffects: string[]);

  /** Decrements lifetime; movement/hit checks are in ProjectileSystem. */
  tick(world: World, dtMs: number): void;

  /** Marks projectile for despawn and emits events if needed. */
  expire(world: World): void;
}
```

### `Pickup` — `apps/server/src/entities/Pickup.ts`

```ts
/**
 * Ground pickup (resource or item).
 * InventorySystem controls pickup rules and merges stacks.
 */
export class Pickup extends Entity {
  stack: ItemStack;

  /** Optional: reserved pickup owner for a short window. */
  ownerLockId?: number;
  ownerLockMs?: number;

  constructor(id: number, stack: ItemStack);

  /** Called when a player successfully picks this up. */
  onPickup(world: World, player: Player): void;
}
```

### `Building` — `apps/server/src/entities/Building.ts`

```ts
/**
 * Placed structure instance (wall/tower/trap/station).
 * BuildingSystem enforces placement & upgrades; CombatSystem applies damage.
 */
export class Building extends Entity {
  structureId: string;
  health: Health;
  ownerPlayerId: number;

  /** Tower fields (if structure has tower behavior). */
  towerCooldownMs?: number;
  towerRange?: number;

  constructor(id: number, structureId: string, ownerPlayerId: number);

  /** Called after validated placement. */
  onPlace(world: World): void;

  /** Called when upgraded to new structure id. */
  onUpgrade(world: World, newStructureId: string): void;
}
```

### `ResourceNode` — `apps/server/src/entities/ResourceNode.ts`

```ts
/**
 * Harvestable node (tree, stone).
 * ResourceSystem applies gathering, yield, and respawn.
 */
export class ResourceNode extends Entity {
  resourceItemId: string;
  remaining: number;
  respawnMs: number;
  respawnTimerMs: number;

  constructor(id: number, resourceItemId: string);

  /** Applies one harvest action; returns yielded stack if any. */
  harvest(world: World, by: Player): ItemStack | null;

  /** Ticks respawn timer if depleted. */
  tick(world: World, dtMs: number): void;
}
```

---

## 8B.4) Systems (server tick phases)

### `System` — `apps/server/src/systems/System.ts`

```ts
/**
 * Tick system contract.
 * Systems run in a fixed order each server tick to keep behavior deterministic.
 */
export interface System {
  /**
   * Updates world state for this tick.
   * @param world Authoritative world.
   * @param dtMs Fixed timestep.
   */
  update(world: World, dtMs: number): void;
}
```

### `InputSystem` — `apps/server/src/systems/InputSystem.ts`

```ts
/**
 * Applies buffered player inputs to player movement/actions for this tick.
 */
export class InputSystem implements System {
  update(world: World, dtMs: number): void;
}
```

### `MovementSystem` — `apps/server/src/systems/MovementSystem.ts`

```ts
/**
 * Integrates velocities into positions and applies friction.
 */
export class MovementSystem implements System {
  update(world: World, dtMs: number): void;
}
```

### `CollisionSystem` — `apps/server/src/systems/CollisionSystem.ts`

```ts
/**
 * Resolves overlaps and prevents passing through walls/buildings.
 * Uses SpatialIndex for broadphase.
 */
export class CollisionSystem implements System {
  update(world: World, dtMs: number): void;
}
```

### `AISystem` — `apps/server/src/systems/AISystem.ts`

```ts
/**
 * Runs enemy AI each tick using Minecraft-style Goals (objectives).
 * For each enemy:
 * - Build GoalContext (world + refs)
 * - Call enemy.goals.tick(ctx, dtMs)
 *
 * Goals may:
 * - set enemy.vx/vy (movement)
 * - call CombatSystem.applyDamage (melee)
 * - spawn projectiles via ProjectileSystem (ranged)
 */
export class AISystem implements System {
  combat: CombatSystem;
  projectiles: ProjectileSystem;

  constructor(combat: CombatSystem, projectiles: ProjectileSystem);

  update(world: World, dtMs: number): void;
}
```

### `ProjectileSystem` — `apps/server/src/systems/ProjectileSystem.ts`

```ts
/**
 * Spawns and simulates projectiles; checks hits; applies effects; expires projectiles.
 */
export class ProjectileSystem implements System {
  effects: EffectRegistry;

  constructor(effects: EffectRegistry);

  /**
   * Spawns a projectile entity into the world.
   * @returns The spawned projectile.
   */
  spawnProjectile(
    world: World,
    shooterId: number,
    x: number, y: number,
    dirX: number, dirY: number,
    def: ProjectileDef,
    damage: number,
    hitEffects: string[]
  ): Projectile;

  update(world: World, dtMs: number): void;
}
```

### `CombatSystem` — `apps/server/src/systems/CombatSystem.ts`

```ts
/**
 * Applies authoritative damage/heal, deaths, knockback, and combat events.
 */
export class CombatSystem implements System {
  effects: EffectRegistry;

  constructor(effects: EffectRegistry);

  /**
   * Applies damage to a target entity and emits appropriate events.
   */
  applyDamage(world: World, attackerId: number, targetId: number, amount: number, tags?: string[]): void;

  update(world: World, dtMs: number): void;
}
```

### `StatusSystem` — `apps/server/src/systems/StatusSystem.ts`

```ts
/**
 * Ticks status effects stored in each entity's StatusContainer (burn/slow).
 */
export class StatusSystem implements System {
  update(world: World, dtMs: number): void;
}
```

### `InventorySystem` — `apps/server/src/systems/InventorySystem.ts`

```ts
/**
 * Handles pickups, drops, merging stacks, and inventory mutations.
 */
export class InventorySystem implements System {
  /** Attempts to pick up a Pickup into the player's inventory. */
  pickup(world: World, playerId: number, pickupId: number): boolean;

  /** Drops from a player slot onto the ground. */
  drop(world: World, playerId: number, slot: number, amount?: number): boolean;

  update(world: World, dtMs: number): void;
}
```

### `BuildingSystem` — `apps/server/src/systems/BuildingSystem.ts`

```ts
/**
 * Validates placement and upgrades for structures (walls, towers, traps).
 * Also runs tower firing behavior (which can reuse ShootAtGoal internally).
 */
export class BuildingSystem implements System {
  structures: Map<string, StructureDef>;
  projectiles: ProjectileSystem;

  constructor(structures: Map<string, StructureDef>, projectiles: ProjectileSystem);

  /** Validates and places a structure for a player; consumes costs. */
  place(world: World, playerId: number, structureId: string, x: number, y: number): boolean;

  /** Attempts to upgrade an existing building; consumes costs. */
  upgrade(world: World, playerId: number, buildingId: number): boolean;

  update(world: World, dtMs: number): void;
}
```

### `ResourceSystem` — `apps/server/src/systems/ResourceSystem.ts`

```ts
/**
 * Gathering system: harvests ResourceNodes and produces resources.
 */
export class ResourceSystem implements System {
  update(world: World, dtMs: number): void;

  /** Attempts to harvest a node by a player. */
  tryHarvest(world: World, playerId: number, nodeId: number): ItemStack | null;
}
```

### `CraftingSystem` — `apps/server/src/systems/CraftingSystem.ts`

```ts
/**
 * Validates and executes crafting recipes; consumes inputs and produces outputs.
 */
export class CraftingSystem implements System {
  recipes: Map<string, RecipeDef>;

  constructor(recipes: Map<string, RecipeDef>);

  /** Attempts to craft a recipe count times. */
  craft(world: World, playerId: number, recipeId: string, count: number): boolean;

  update(world: World, dtMs: number): void;
}
```

### `WaveSystem` — `apps/server/src/systems/WaveSystem.ts`

```ts
/**
 * Drives wave progression and enemy spawning.
 * Emits events: wave_start, wave_end, boss_spawn.
 */
export class WaveSystem implements System {
  waves: WaveDef[];
  currentWave: number;
  waveTimerMs: number;

  constructor(waves: WaveDef[]);

  /** Starts the next wave and schedules spawns. */
  startNextWave(world: World): void;

  /** Spawns one enemy instance at a spawn location. */
  spawnEnemy(world: World, enemyType: string): Enemy;

  /** Chooses a spawn location near map edge or spawner points. */
  chooseSpawn(world: World): { x: number; y: number };

  update(world: World, dtMs: number): void;
}
```

---

## 8B.5) Gameplay components (server)

### `Health` — `apps/server/src/gameplay/Health.ts`

```ts
/**
 * Health component with damage/heal rules and optional invulnerability window.
 */
export class Health {
  max: number;
  cur: number;
  invulnMs: number;
  invulnTimerMs: number;

  constructor(max: number);

  /** Applies damage. @returns True if entity died. */
  damage(amount: number): boolean;

  /** Heals up to max. */
  heal(amount: number): void;

  /** @returns True if cur <= 0. */
  isDead(): boolean;

  /** Ticks invulnerability timer. */
  tick(dtMs: number): void;
}
```

### `ItemStack` — `apps/server/src/gameplay/ItemStack.ts`

```ts
/**
 * Quantity of an item plus optional metadata (durability, rarity).
 */
export class ItemStack {
  itemId: string;
  amount: number;
  meta?: Record<string, any>;

  constructor(itemId: string, amount: number, meta?: Record<string, any>);

  /** @returns A copy suitable for safe transfers. */
  clone(): ItemStack;
}
```

### `Inventory` — `apps/server/src/gameplay/Inventory.ts`

```ts
/**
 * Fixed-slot inventory for ItemStacks.
 */
export class Inventory {
  slots: Array<ItemStack | null>;
  activeIndex: number;

  constructor(slotCount: number);

  /** Adds a stack; returns true if fully added. */
  add(stack: ItemStack, itemDefs?: Map<string, ItemDef>): boolean;

  /** Removes up to amount from slot; returns removed stack or null. */
  remove(slot: number, amount?: number): ItemStack | null;

  /** @returns Active slot stack. */
  getActive(): ItemStack | null;

  /** Sets active slot index. */
  setActive(i: number): void;

  /** @returns True if inventory contains required items. */
  hasItems(req: { itemId: string; amount: number }[]): boolean;

  /** Consumes required items if available. */
  consume(req: { itemId: string; amount: number }[]): boolean;
}
```

### `Wallet` — `apps/server/src/gameplay/Wallet.ts`

```ts
/**
 * Currency-like resource tracker (e.g., gold).
 */
export class Wallet {
  gold: number;

  constructor(gold?: number);

  /** Adds gold. */
  add(amount: number): void;

  /** Attempts to spend; returns true if successful. */
  spend(amount: number): boolean;
}
```

### `Weapon` — `apps/server/src/gameplay/Weapon.ts`

```ts
/**
 * Base weapon runtime wrapper around WeaponDef.
 * Handles cooldown and delegates attack behavior to subclasses.
 */
export abstract class Weapon {
  def: WeaponDef;
  cooldownMs: number;

  constructor(def: WeaponDef);

  /** @returns True if weapon can fire now. */
  canFire(): boolean;

  /**
   * Performs one attack action (spawn projectile or apply melee hits).
   * Subclasses implement the actual behavior.
   */
  abstract fire(world: World, owner: Player, aimX: number, aimY: number): void;

  /** Ticks cooldown timers. */
  tick(dtMs: number): void;
}
```

### `RangedWeapon` — `apps/server/src/gameplay/RangedWeapon.ts`

```ts
/**
 * Ranged weapon runtime: manages ammo/reload/spread and projectile spawning.
 */
export class RangedWeapon extends Weapon {
  ammoInMag: number;
  reserveAmmo: number;
  reloadTimerMs: number;

  constructor(def: WeaponDef);

  /** Starts reload if possible. */
  reload(): void;

  /** Computes a spread-adjusted direction vector. */
  computeSpreadDir(rng: Rng, aimX: number, aimY: number): { x: number; y: number };

  /** Fires and spawns projectiles via ProjectileSystem (owned by systems). */
  fire(world: World, owner: Player, aimX: number, aimY: number): void;

  /** Ticks cooldown and reload timers. */
  tick(dtMs: number): void;
}
```

### `MeleeWeapon` — `apps/server/src/gameplay/MeleeWeapon.ts`

```ts
/**
 * Melee weapon runtime: short-range hit query (also used for gathering tools).
 */
export class MeleeWeapon extends Weapon {
  meleeRange: number;

  constructor(def: WeaponDef);

  /** Performs melee hit query and applies damage/effects. */
  fire(world: World, owner: Player, aimX: number, aimY: number): void;
}
```

---

## 8B.6) Effects (server)

### `Effect` — `apps/server/src/effects/Effect.ts`

```ts
/**
 * Base hit-effect hook referenced by string IDs in defs.
 * Effects apply immediate logic (knockback) or apply status effects (burn/slow).
 */
export abstract class Effect {
  id: string;

  constructor(id: string);

  /**
   * Called when an attack hits a target.
   * @param world Authoritative world.
   * @param attacker Attacking entity.
   * @param target Hit entity.
   * @param payload Hit info (damage + direction).
   */
  onHit?(
    world: World,
    attacker: Entity,
    target: Entity,
    payload: { damage: number; dirX: number; dirY: number }
  ): void;
}
```

### `StatusEffect` — `apps/server/src/effects/StatusEffect.ts`

```ts
/**
 * Time-based effect applied to an entity (burn DoT, slow).
 */
export abstract class StatusEffect {
  id: string;
  durationMs: number;
  elapsedMs: number;

  constructor(id: string, durationMs: number);

  /** Called once when status is applied. */
  onApply?(world: World, target: Entity): void;

  /** Called every tick while active. */
  onTick?(world: World, target: Entity, dtMs: number): void;

  /** Called once when status expires or is removed. */
  onExpire?(world: World, target: Entity): void;

  /** @returns True if this status has completed. */
  isDone(): boolean;
}
```

### `StatusContainer` — `apps/server/src/effects/StatusContainer.ts`

```ts
/**
 * Stores active statuses for an entity.
 * StatusSystem ticks these each server tick.
 */
export class StatusContainer {
  active: Map<string, StatusEffect>;

  constructor();

  /** Adds or refreshes a status by ID. */
  add(status: StatusEffect): void;

  /** Removes a status by ID and calls onExpire if present. */
  remove(world: World, target: Entity, id: string): void;

  /** @returns True if status exists. */
  has(id: string): boolean;

  /** Ticks all statuses and removes completed ones. */
  tick(world: World, target: Entity, dtMs: number): void;
}
```

### `EffectRegistry` — `apps/server/src/effects/EffectRegistry.ts`

```ts
/**
 * Maps effect IDs to implementations and status factories.
 * Lets defs reference effects by string ID safely.
 */
export class EffectRegistry {
  effects: Map<string, Effect>;
  statusFactories: Map<string, (params?: any) => StatusEffect>;

  constructor();

  /** Registers a hit effect. */
  registerEffect(effect: Effect): void;

  /** Registers a status effect factory. */
  registerStatus(id: string, factory: (params?: any) => StatusEffect): void;

  /** Retrieves effect by ID; throws if missing. */
  getEffect(id: string): Effect;

  /** Creates a status instance by ID. */
  createStatus(id: string, params?: any): StatusEffect;
}
```

### Built-in effects — `apps/server/src/effects/builtin/*`

```ts
/** Burn hit effect: applies burn status (DoT). */
export class BurnEffect extends Effect {
  durationMs: number;
  dps: number;

  constructor();

  onHit(world: World, attacker: Entity, target: Entity, payload: { damage: number; dirX: number; dirY: number }): void;
}

/** Slow hit effect: applies movement slow status. */
export class SlowEffect extends Effect {
  durationMs: number;
  slowFactor: number;

  constructor();

  onHit(world: World, attacker: Entity, target: Entity, payload: { damage: number; dirX: number; dirY: number }): void;
}

/** Knockback hit effect: applies impulse away from attacker. */
export class KnockbackEffect extends Effect {
  strength: number;

  constructor();

  onHit(world: World, attacker: Entity, target: Entity, payload: { damage: number; dirX: number; dirY: number }): void;
}
```

---

## 8B.7) Services (server)

### `AuthService` — `apps/server/src/services/AuthService.ts`

```ts
/**
 * Optional authentication provider.
 * MVP: guest-only; later: token verification.
 */
export class AuthService {
  /** Verifies bearer token; returns identity or null. */
  verifyToken(token: string): Promise<{ userId: string; name?: string } | null>;

  /** Creates a guest identity. */
  guestLogin(): Promise<{ userId: string; name: string }>;
}
```

---

## 8C) apps/client

### `main.ts` — `apps/client/src/main.ts`

```ts
/**
 * Client entrypoint.
 * Boots Pixi, loads assets, connects to server, starts the render loop.
 */
export function main(): void;
```

### `GameClient` — `apps/client/src/client/GameClient.ts`

```ts
/**
 * Client coordinator: networking + interpolation + rendering.
 * Does not contain authoritative gameplay logic.
 */
export class GameClient {
  net: WsClient;
  state: ClientWorldState;
  interp: Interpolator;
  input: InputManager;
  renderer: PixiRenderer;
  cfg: GameConfig;

  constructor(cfg: GameConfig);

  /** Connects to server and starts loops. */
  start(url: string): void;

  /** Called each frame to render interpolated state. */
  update(dtMs: number): void;

  /** Applies a received snapshot to history. */
  onSnapshot(s: WorldSnapshot): void;
}
```

### `WsClient` — `apps/client/src/net/WsClient.ts`

```ts
/**
 * Browser WebSocket wrapper for sending inputs and receiving snapshots.
 */
export class WsClient {
  socket?: WebSocket;
  codec: JsonCodec;

  constructor(codec: JsonCodec);

  /** Connects to the server WebSocket endpoint. */
  connect(url: string): void;

  /** Sends an InputCommand. */
  sendInput(cmd: InputCommand): void;

  /** Registers snapshot handler. */
  onSnapshot(fn: (s: WorldSnapshot) => void): void;

  /** Registers open handler. */
  onOpen(fn: () => void): void;

  /** Registers close handler. */
  onClose(fn: () => void): void;
}
```

### `ClientWorldState` — `apps/client/src/net/ClientWorldState.ts`

```ts
/**
 * Snapshot store and history buffer used for interpolation.
 */
export class ClientWorldState {
  history: RingBuffer<WorldSnapshot>;
  latest?: WorldSnapshot;

  constructor(capacity: number);

  /** Pushes a snapshot to history. */
  pushSnapshot(s: WorldSnapshot): void;

  /** @returns Latest snapshot. */
  getLatest(): WorldSnapshot | undefined;

  /** @returns History as an array (oldest->newest). */
  getHistory(): WorldSnapshot[];
}
```

### `Interpolator` — `apps/client/src/net/Interpolator.ts`

```ts
/**
 * Samples history to produce smooth render state.
 */
export class Interpolator {
  bufferTicks: number;

  constructor(bufferTicks: number);

  /** Updates buffer ticks (latency/jitter tuning). */
  setBufferTicks(n: number): void;

  /**
   * Produces interpolated entity map for the given render tick.
   * MVP: linear interpolate x,y,rot; copy other fields from nearest snapshot.
   */
  sample(history: WorldSnapshot[], renderTick: number): Map<number, EntitySnapshot>;
}
```

### `InputManager` — `apps/client/src/input/InputManager.ts`

```ts
/**
 * Collects keyboard/mouse state and produces InputCommand messages.
 */
export class InputManager {
  seq: number;
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  fire: boolean;
  reload: boolean;
  use: boolean;
  switchSlot?: number;

  constructor();

  /** Binds DOM listeners. */
  bind(el: HTMLElement | Window): void;

  /** Produces an InputCommand for the given server tick. */
  toCommand(tick: number): InputCommand;

  /** Clears one-shot actions if used. */
  clearOneShots(): void;
}
```

---

## 8C.1) Rendering (Pixi)

### `PixiRenderer` — `apps/client/src/render/PixiRenderer.ts`

```ts
/**
 * Pixi rendering facade.
 * Creates/destroys sprites for entities and applies per-frame updates.
 */
export class PixiRenderer {
  app: PIXI.Application;
  camera: Camera;
  sprites: SpriteStore;
  factory: SpriteFactory;
  hud: Hud;

  constructor(app: PIXI.Application, factory: SpriteFactory, sprites: SpriteStore, camera: Camera, hud: Hud);

  /** Synchronizes sprites with interpolated entities. */
  sync(entities: Map<number, EntitySnapshot>): void;

  /** Frame update hook for animation/VFX. */
  update(dtMs: number): void;

  /** Spawns sprite for entity. */
  spawn(id: number, kind: EntityKind): void;

  /** Removes sprite for entity. */
  despawn(id: number): void;
}
```

### `SpriteStore` — `apps/client/src/render/SpriteStore.ts`

```ts
/**
 * Stores entityId -> Pixi display object mapping.
 */
export class SpriteStore {
  byId: Map<number, PIXI.Container>;

  constructor();

  /** Gets sprite container by entity id. */
  get(id: number): PIXI.Container | undefined;

  /** Sets sprite container by entity id. */
  set(id: number, sprite: PIXI.Container): void;

  /** Removes sprite container mapping. */
  remove(id: number): PIXI.Container | undefined;
}
```

### `SpriteFactory` — `apps/client/src/render/SpriteFactory.ts`

```ts
/**
 * Creates sprites/containers per EntityKind and applies visuals per snapshot.
 */
export class SpriteFactory {
  assets: Assets;

  constructor(assets: Assets);

  /** Creates a new container for an entity kind. */
  create(kind: EntityKind): PIXI.Container;

  /** Applies snapshot data to a sprite (hp bars, burning tint, etc.). */
  apply(sprite: PIXI.Container, snap: EntitySnapshot): void;
}
```

### `Camera` — `apps/client/src/render/Camera.ts`

```ts
/**
 * Camera that follows the local player.
 */
export class Camera {
  x: number;
  y: number;
  zoom: number;
  followId?: number;

  constructor();

  /** Sets which entity id to follow. */
  follow(entityId: number): void;

  /** Updates camera based on followed entity. */
  update(dtMs: number, entities: Map<number, EntitySnapshot>): void;

  /** Converts world coordinates to screen coordinates (optional). */
  worldToScreen(x: number, y: number): { x: number; y: number };
}
```

### `Hud` — `apps/client/src/render/Hud.ts`

```ts
/**
 * UI overlay: health, wave status, inventory hotbar, build/craft hints.
 */
export class Hud {
  root: PIXI.Container;

  constructor();

  /** Updates widgets from latest snapshot/events. */
  update(latest: WorldSnapshot | undefined, dtMs: number): void;

  /** Shows temporary damage indicator. */
  showDamage(amount: number): void;

  /** Shows wave banner text. */
  showWaveBanner(text: string): void;
}
```

### `Assets` — `apps/client/src/render/assets.ts`

```ts
/**
 * Asset loader wrapper for Pixi resources.
 */
export class Assets {
  /** Loads all textures needed for MVP. */
  loadAll(): Promise<void>;

  /** Retrieves a texture by key. */
  tex(key: string): PIXI.Texture;
}
```

---

## 8C.2) Client VFX

### `EffectVfxRegistry` — `apps/client/src/fx/EffectVfxRegistry.ts`

```ts
/**
 * Client-only mapping from effect IDs to VFX handlers.
 * Mirrors server effect IDs but is purely visual.
 */
export class EffectVfxRegistry {
  /** Registers a VFX handler for an effect ID. */
  register(id: string, fn: (ctx: { sprite: PIXI.Container; snap: EntitySnapshot }) => void): void;

  /** Plays VFX for an effect ID if registered. */
  play(id: string, ctx: { sprite: PIXI.Container; snap: EntitySnapshot }): void;
}
```

### `BurnVfx` — `apps/client/src/fx/BurnVfx.ts`

```ts
/**
 * Client-only burn visuals (particles/tint).
 */
export class BurnVfx {
  /** Starts burn visuals on target sprite. */
  start(target: PIXI.Container): void;

  /** Stops burn visuals. */
  stop(): void;
}
```

---

# 9) System order (server tick pipeline)

Run systems in this order every tick:

1. `World.step(dtMs)`
2. `InputSystem.update()`
3. `AISystem.update()`  (goal selection + actions)
4. `MovementSystem.update()`
5. `CollisionSystem.update()`
6. `ProjectileSystem.update()`
7. `CombatSystem.update()`
8. `StatusSystem.update()`
9. `BuildingSystem.update()` (tower firing)
10. `ResourceSystem.update()`
11. `CraftingSystem.update()`
12. `WaveSystem.update()`
13. Snapshot build + `WsServer.broadcast()`

---

# 10) MVP milestones

1. Connect (bun.serve + ws) + echo snapshots
2. Move + collide + interpolate + Pixi render
3. Projectiles + damage + death events
4. Build walls (cost + collision)
5. Waves + goal-based enemy AI (chase + melee)
6. Gather/craft + build upgrades
7. Towers + ranged goals (ShootAtGoal) + polish

---

# 11) Performance notes

- Always use `SpatialIndex` for proximity queries; avoid O(n²)
- Keep snapshots compact:
  - Always: id, kind, x,y,vx,vy,rot,r
  - Optional: hp/maxHp only when needed
  - data flags only when needed (e.g., `data: { burning: true }`)
- Delta snapshots can come later after gameplay is fun

---

# 12) Security notes

- Never trust client for:
  - damage/hits
  - placement legality or costs
  - crafting validity
- Clamp input vectors and rate limit actions server-side

---

End of PLAN.md
