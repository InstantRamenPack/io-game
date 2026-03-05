# PLAN.md — Zombs.io‑style .io game (TypeScript + Bun + WebSockets + PixiJS)

Plan largely written by AI.

This document is the **single source of truth** for building a **zombs.io clone** with:

- **Server:** Bun runtime (TypeScript) using `bun.serve()` + WebSocket upgrade
- **Client:** Browser TypeScript with **PixiJS** renderer
- **Networking:** Server‑authoritative simulation; clients send **inputs**, server sends **snapshots + events**
- **Gameplay:** Gather → craft → build/upgrade → survive enemy **waves** (walls, towers, traps, generators)

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
        bootstrap/
          BootstrapRegistries.ts
        server/
          GameServer.ts
          TickClock.ts
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
        goals/
          Goal.ts
          GoalSelector.ts
          GoalContext.ts
          builtin/
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
          GoalSystem.ts
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
        content/
          enemies/
            Zombie.ts
          weapons/
            BowWeapon.ts
            PistolWeapon.ts
            RifleWeapon.ts
            SwordWeapon.ts
            PickaxeWeapon.ts
          projectiles/
            ArrowProjectile.ts
            BulletProjectile.ts
          buildings/
            Wall.ts
            SpikeTrap.ts
            ArrowTower.ts
            Windmill.ts
            CraftingStation.ts
          resources/
            TreeNode.ts
            StoneNode.ts

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
        registry/
          ResourceId.ts
          RegistryKey.ts
          Registry.ts
          MutableRegistry.ts
          BuiltInRegistries.ts
          RegistryBootstrap.ts
        types/
          EntityType.ts
          EnemyType.ts
          ItemType.ts
          WeaponType.ts
          ProjectileType.ts
          StructureType.ts
          RecipeType.ts
          WaveTemplate.ts
          EffectType.ts
          StatusEffectType.ts
        ids/
          EntityKinds.ts
          ItemIds.ts
          WeaponIds.ts
          ProjectileIds.ts
          StructureIds.ts
          RecipeIds.ts
          WaveIds.ts
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
- `@client/*` → `apps/client/src/*`
- `@server/*` → `apps/server/src/*`

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

## 7) Class-driven content (no data-driven defs)

Gameplay content is class-based, not `*Def` object-driven.

- Every concrete gameplay thing is a class:
  - enemy example: `Zombie extends Enemy`
  - weapon example: `BowWeapon extends RangedWeapon`
  - building example: `Wall extends Building`
  - resource example: `TreeNode extends ResourceNode`
- Registries store class references and/or constructed type instances, not raw `*Def` payloads.
- IDs are still canonical `namespace:path` and are used for networking and cross-system lookup.
- Server remains authoritative and reads only frozen registries at runtime.

This pass is documentation-only: no runtime code implementation is required yet.

---

## 7A) Registry architecture (Minecraft-inspired, class-first TypeScript)

### 7A.1 Core concepts
- `ResourceId`: canonical typed ID with strict `namespace:path` parsing/validation.
- `RegistryKey<T>`: typed identity for a registry (for example, `RegistryKeys.ITEM_CLASS`).
- `Registry<T>`: read-only lookup surface (`get`, `getOrThrow`, `has`, `entries`, `ids`).
- `MutableRegistry<T>`: bootstrap-time writable registry (`register`) plus `freeze`.
- `BuiltInRegistries`: authoritative container for all gameplay registries.
- `RegistryBootstrap`: deterministic startup process that registers concrete classes, validates references, then freezes.

### 7A.2 Gameplay registries (authoritative set)
- `ENTITY_TYPE` → `Registry<EntityType<any>>`
- `ENEMY_CLASS` → `Registry<new (...args: any[]) => Enemy>`
- `ITEM_CLASS` → `Registry<new (...args: any[]) => ItemType>`
- `WEAPON_CLASS` → `Registry<new (...args: any[]) => Weapon>`
- `PROJECTILE_CLASS` → `Registry<new (...args: any[]) => Projectile>`
- `STRUCTURE_CLASS` → `Registry<new (...args: any[]) => Building>`
- `RECIPE_CLASS` → `Registry<new (...args: any[]) => RecipeType>`
- `WAVE_CLASS` → `Registry<new (...args: any[]) => WaveTemplate>`
- `EFFECT_CLASS` → `Registry<new (...args: any[]) => Effect>`
- `STATUS_EFFECT_CLASS` → `Registry<new (...args: any[]) => StatusEffect>`

### 7A.3 Bootstrap order and lifecycle
1. Create mutable built-in registries.
2. Register foundational classes (`ITEM_CLASS`, `PROJECTILE_CLASS`, `STATUS_EFFECT_CLASS`, `EFFECT_CLASS`).
3. Register dependent classes (`WEAPON_CLASS`, `STRUCTURE_CLASS`, `RECIPE_CLASS`, `ENEMY_CLASS`, `WAVE_CLASS`, `ENTITY_TYPE`).
4. Validate all IDs and cross-references.
5. Freeze registries (`register -> validate -> freeze -> read-only`).
6. Start server systems; runtime reads only from frozen registries.

### 7A.4 Validation and error semantics
- Duplicate ID registration: fail startup deterministically.
- Malformed/non-namespaced IDs: fail startup.
- Missing referenced ID (weapon/projectile/effect/recipe/etc.): fail startup.
- Attempted runtime mutation after freeze: throw/reject.
- Unknown IDs in client input: reject at validation boundary and emit error event as needed.

### 7A.5 Inheritance model (Minecraft-style)
- Runtime inheritance is the primary content model.
- Base classes provide shared logic; concrete subclasses provide content behavior:
  - `Enemy` base -> `Zombie`, `FastZombie`, `TankZombie`
  - `RangedWeapon` base -> `BowWeapon`, `PistolWeapon`, `RifleWeapon`
  - `Building` base -> `Wall`, `ArrowTower`, `SpikeTrap`, `Windmill`, `CraftingStation`
- Registries are the discovery/lookup layer for these concrete classes.

### 7A.6 Public interface/type impact
- All registrable IDs and cross-references are canonical `namespace:path` strings.
- `*Def` interfaces are removed from the architecture.
- Systems consume typed registries and class-based content, not ad hoc `Map`/array defs.
- Registry lifecycle is explicit and required for startup correctness.

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

### `ResourceId` — `packages/shared/src/registry/ResourceId.ts`

```ts
/**
 * Canonical namespaced identifier (`namespace:path`) used by all registries.
 * Mirrors Minecraft's ResourceLocation concept with TypeScript ergonomics.
 */
export class ResourceId {
  namespace: string;
  path: string;

  constructor(namespace: string, path: string);

  /** Parses and validates `namespace:path`; throws on invalid format. */
  static parse(raw: string): ResourceId;

  /** Returns true when the raw string matches canonical `namespace:path`. */
  static isValid(raw: string): boolean;

  /** Canonical string form. */
  toString(): string;
}
```

### `RegistryKey<T>` — `packages/shared/src/registry/RegistryKey.ts`

```ts
/**
 * Typed identity for a registry (e.g., ITEM_CLASS, WEAPON_CLASS).
 */
export class RegistryKey<T> {
  id: ResourceId;

  constructor(id: ResourceId);

  /** Convenience constructor from raw string ID. */
  static of<T>(id: string): RegistryKey<T>;
}
```

### `RegistryEntry<T>` — `packages/shared/src/registry/Registry.ts`

```ts
/**
 * Stable entry pairing canonical ID with a value in a registry.
 */
export interface RegistryEntry<T> {
  id: ResourceId;
  value: T;
}
```

### `Registry<T>` — `packages/shared/src/registry/Registry.ts`

```ts
/**
 * Read-only registry API used by runtime systems.
 */
export interface Registry<T> {
  key: RegistryKey<T>;

  /** Returns value for ID, if present. */
  get(id: string | ResourceId): T | undefined;

  /** Returns value for ID or throws a deterministic bootstrap/runtime error. */
  getOrThrow(id: string | ResourceId): T;

  /** Returns true if an entry exists. */
  has(id: string | ResourceId): boolean;

  /** Iterates entries in deterministic registration order. */
  entries(): Iterable<RegistryEntry<T>>;

  /** Iterates IDs in deterministic registration order. */
  ids(): Iterable<ResourceId>;
}
```

### `MutableRegistry<T>` — `packages/shared/src/registry/MutableRegistry.ts`

```ts
/**
 * Bootstrap-time writable registry.
 * After freeze(), register/mutate operations are disallowed.
 */
export interface MutableRegistry<T> extends Registry<T> {
  /** Registers a unique ID/value pair; throws on duplicates or frozen state. */
  register(id: string | ResourceId, value: T): RegistryEntry<T>;

  /** Validates and transitions to read-only mode. */
  freeze(): Registry<T>;

  /** @returns true once registry is frozen. */
  isFrozen(): boolean;
}
```

### `BuiltInRegistries` — `packages/shared/src/registry/BuiltInRegistries.ts`

```ts
/**
 * Global holder for authoritative gameplay registries.
 * Created at bootstrap and read by server/client systems.
 */
export class BuiltInRegistries {
  ENTITY_TYPE: MutableRegistry<EntityType<any>>;
  ENEMY_CLASS: MutableRegistry<new (...args: any[]) => Enemy>;
  ITEM_CLASS: MutableRegistry<new (...args: any[]) => ItemType>;
  WEAPON_CLASS: MutableRegistry<new (...args: any[]) => Weapon>;
  PROJECTILE_CLASS: MutableRegistry<new (...args: any[]) => Projectile>;
  STRUCTURE_CLASS: MutableRegistry<new (...args: any[]) => Building>;
  RECIPE_CLASS: MutableRegistry<new (...args: any[]) => RecipeType>;
  WAVE_CLASS: MutableRegistry<new (...args: any[]) => WaveTemplate>;
  EFFECT_CLASS: MutableRegistry<new (...args: any[]) => Effect>;
  STATUS_EFFECT_CLASS: MutableRegistry<new (...args: any[]) => StatusEffect>;

  constructor();

  /** Freezes all built-in registries in deterministic order. */
  freezeAll(): void;
}
```

### `RegistryBootstrap` — `packages/shared/src/registry/RegistryBootstrap.ts`

```ts
/**
 * Deterministic bootstrapping pipeline for content registries.
 */
export class RegistryBootstrap {
  /**
   * Registers all concrete content classes into BuiltInRegistries, validates references,
   * then freezes registries for runtime use.
   */
  static bootstrap(registries: BuiltInRegistries): void;
}
```

### Gameplay types — `packages/shared/src/types/*`

```ts
/**
 * Registrable entity type descriptor/factory.
 * Runtime entities are still instance classes on the server.
 */
export class EntityType<E extends Entity> {
  id: ResourceId;
  kind: EntityKind;

  constructor(id: ResourceId, kind: EntityKind);

  /** Spawns one runtime entity instance. */
  create(idAlloc: number, args?: any): E;
}

/** Enemy base type metadata used by class-first enemy implementations. */
export abstract class EnemyType {
  id: ResourceId;
  constructor(id: ResourceId);
}

/** Registrable item base class used by inventory/crafting systems. */
export abstract class ItemType {
  id: ResourceId;
  name: string;
  stackMax: number;
  icon?: string;

  constructor(args: { id: ResourceId; name: string; stackMax: number; icon?: string });
}

/** Base weapon type descriptor. */
export abstract class WeaponType {
  id: ResourceId;
  name: string;
  damage: number;
  fireRate: number;
  range: number;
  hitEffects: ResourceId[];

  constructor(args: {
    id: ResourceId;
    name: string;
    damage: number;
    fireRate: number;
    range: number;
    hitEffects: ResourceId[];
  });
}

/** Ranged weapon type base class with projectile and ammo metadata. */
export abstract class RangedWeaponType extends WeaponType {
  projectileClassId: ResourceId;
  ammo?: { magSize: number; reloadMs: number; reserveMax: number };
  spread?: number;

  constructor(args: {
    id: ResourceId;
    name: string;
    damage: number;
    fireRate: number;
    range: number;
    hitEffects: ResourceId[];
    projectileClassId: ResourceId;
    ammo?: { magSize: number; reloadMs: number; reserveMax: number };
    spread?: number;
  });
}

/** Melee weapon type metadata. */
export abstract class MeleeWeaponType extends WeaponType {
  constructor(args: {
    id: ResourceId;
    name: string;
    damage: number;
    fireRate: number;
    range: number;
    hitEffects: ResourceId[];
  });
}

/** Registrable projectile base class metadata. */
export abstract class ProjectileType {
  id: ResourceId;
  speed: number;
  lifeMs: number;
  hitRadius: number;
  pierce?: number;
  bounces?: number;

  constructor(args: {
    id: ResourceId;
    speed: number;
    lifeMs: number;
    hitRadius: number;
    pierce?: number;
    bounces?: number;
  });
}

/** Registrable structure base class metadata and behavior flags. */
export abstract class StructureType {
  id: ResourceId;
  name: string;
  radius: number;
  maxHp: number;
  cost: { itemId: ResourceId; amount: number }[];
  upgradeTo?: ResourceId;
  behavior?: "wall" | "tower" | "trap" | "generator" | "station";
  tower?: { weaponClassId: ResourceId; range: number; fireRate: number };

  constructor(args: {
    id: ResourceId;
    name: string;
    radius: number;
    maxHp: number;
    cost: { itemId: ResourceId; amount: number }[];
    upgradeTo?: ResourceId;
    behavior?: "wall" | "tower" | "trap" | "generator" | "station";
    tower?: { weaponClassId: ResourceId; range: number; fireRate: number };
  });
}

/** Registrable recipe class for crafting rules. */
export abstract class RecipeType {
  id: ResourceId;
  name: string;
  inputs: { itemId: ResourceId; amount: number }[];
  outputs: { itemId: ResourceId; amount: number }[];
  stationId?: ResourceId;
  craftMs: number;

  constructor(args: {
    id: ResourceId;
    name: string;
    inputs: { itemId: ResourceId; amount: number }[];
    outputs: { itemId: ResourceId; amount: number }[];
    stationId?: ResourceId;
    craftMs: number;
  });
}

/** Registrable wave class for deterministic wave progression. */
export abstract class WaveTemplate {
  id: ResourceId;
  waveNumber: number;
  durationMs: number;
  spawns: { enemyClassId: ResourceId; count: number; intervalMs: number }[];
  boss?: { enemyClassId: ResourceId; atMs: number };

  constructor(args: {
    id: ResourceId;
    waveNumber: number;
    durationMs: number;
    spawns: { enemyClassId: ResourceId; count: number; intervalMs: number }[];
    boss?: { enemyClassId: ResourceId; atMs: number };
  });
}

/** Registrable hit-effect base class metadata/behavior hook reference. */
export abstract class EffectType {
  id: ResourceId;

  constructor(id: ResourceId);
}

/** Registrable status-effect base class metadata/behavior factory reference. */
export abstract class StatusEffectType {
  id: ResourceId;
  defaultDurationMs: number;

  constructor(id: ResourceId, defaultDurationMs: number);
}
```

### Concrete content subclasses (no `*Def`) — `apps/server/src/content/*`

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

/** Concrete enemy class with behavior overrides. */
export class Zombie extends Enemy {
  constructor(id: number);

  /** Registers Minecraft-style goal stack for this mob variant. */
  initGoals(): void;
}

/** Concrete ranged weapon implementation. */
export class BowWeapon extends RangedWeapon {
  constructor();
}

/** Concrete structure implementation. */
export class Wall extends Building {
  constructor(id: number, ownerPlayerId: number);
}

/** Concrete resource node implementation. */
export class TreeNode extends ResourceNode {
  constructor(id: number);
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
  rotation: number;
  radius: number;
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

### `TickClock` — `apps/server/src/server/TickClock.ts`

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
  queryCircle(x: number, y: number, radius: number): number[];
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

### `GoalControl`, `Goal` — `apps/server/src/goals/Goal.ts`

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
   * @param ctx Shared goal context.
   */
  canStart(ctx: GoalContext): boolean;

  /**
   * Called once when this goal becomes active.
   * @param ctx Shared goal context.
   */
  start(ctx: GoalContext): void;

  /**
   * Called each tick while active.
   * @param ctx Shared goal context.
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
   * @param ctx Shared goal context.
   */
  stop(ctx: GoalContext): void;
}
```

### `GoalContext` — `apps/server/src/goals/GoalContext.ts`

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

### `GoalSelector` — `apps/server/src/goals/GoalSelector.ts`

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

### Built-in goals — `apps/server/src/goals/builtin/*`

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
  projectileClassId: string;
  damage: number;
  hitEffects: string[];
  private cooldownMs: number;

  constructor(args: {
    priority: number;
    range: number;
    fireRate: number;
    projectileClassId: string;
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
  rotation: number;
  radius: number;
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
  enemyClassId: string;
  health: Health;

  /** Goal fields */
  aggroTargetId?: number;
  aggroRange: number;

  /** Movement/combat tuning */
  moveSpeed: number;
  damage: number;

  /** Brain: list of Goals (objectives). */
  goals: GoalSelector;

  constructor(id: number, enemyClassId: string);

  /** Sets current aggro target. */
  setTarget(entityId: number | undefined): void;

  /** Optional per-entity timers; goals do the main AI work. */
  tick(world: World, dtMs: number): void;
}
```

### Concrete enemies — `apps/server/src/content/enemies/*`

```ts
/**
 * Concrete wave enemy.
 * This is the canonical pattern for gameplay content:
 * concrete classes extend runtime base classes.
 */
export class Zombie extends Enemy {
  constructor(id: number);

  /** Installs zombie goals (target, chase, melee, wander). */
  initGoals(): void;
}
```

### `Projectile` — `apps/server/src/entities/Projectile.ts`

```ts
/**
 * Projectile instance (bullet/arrow).
 * Simulated by ProjectileSystem; expires after lifetime or on hit.
 */
export class Projectile extends Entity {
  projectileClassId: string;
  damage: number;
  lifeMs: number;
  hitEffects: string[];
  shooterId: number;

  constructor(id: number, shooterId: number, projectileClassId: string, damage: number, hitEffects: string[]);

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

### `GoalSystem` — `apps/server/src/systems/GoalSystem.ts`

```ts
/**
 * Runs enemy goals each tick using Minecraft-style Goals (objectives).
 * For each enemy:
 * - Build GoalContext (world + refs)
 * - Call enemy.goals.tick(ctx, dtMs)
 *
 * Goals may:
 * - set enemy.vx/vy (movement)
 * - call CombatSystem.applyDamage (melee)
 * - spawn projectiles via ProjectileSystem (ranged)
 */
export class GoalSystem implements System {
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
    projectileClassId: string,
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
  structures: Registry<StructureType>;
  projectiles: ProjectileSystem;

  constructor(structures: Registry<StructureType>, projectiles: ProjectileSystem);

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
  recipes: Registry<RecipeType>;

  constructor(recipes: Registry<RecipeType>);

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
  waves: Registry<WaveTemplate>;
  currentWaveNumber: number;
  waveTimerMs: number;

  constructor(waves: Registry<WaveTemplate>);

  /** Starts the next wave and schedules spawns. */
  startNextWave(world: World): void;

  /** Spawns one enemy instance at a spawn location. */
  spawnEnemy(world: World, enemyClassId: string): Enemy;

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
  add(stack: ItemStack, itemRegistry?: Registry<ItemType>): boolean;

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
 * Base weapon runtime wrapper around a concrete weapon class ID.
 * Handles cooldown and delegates attack behavior to subclasses.
 */
export abstract class Weapon {
  weaponClassId: string;
  cooldownMs: number;

  constructor(weaponClassId: string);

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

  constructor(weaponClassId: string);

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

  constructor(weaponClassId: string);

  /** Performs melee hit query and applies damage/effects. */
  fire(world: World, owner: Player, aimX: number, aimY: number): void;
}
```

---

## 8B.6) Effects (server)

### `Effect` — `apps/server/src/effects/Effect.ts`

```ts
/**
 * Base hit-effect hook referenced by effect class IDs in registries.
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

### `EffectRegistry` — `apps/server/src/effects/EffectRegistry.ts` (compatibility adapter)

```ts
/**
 * Transitional adapter over generic registries for effect/status lookups.
 * Preferred long-term source of truth is:
 * - Registry<new (...args: any[]) => Effect>
 * - Registry<new (...args: any[]) => StatusEffect>
 */
export class EffectRegistry {
  effectClasses: Registry<new (...args: any[]) => Effect>;
  statusEffectClasses: Registry<new (...args: any[]) => StatusEffect>;

  constructor(
    effectClasses: Registry<new (...args: any[]) => Effect>,
    statusEffectClasses: Registry<new (...args: any[]) => StatusEffect>
  );

  /** Retrieves effect class by namespaced ID. */
  getEffectClass(id: string): new (...args: any[]) => Effect;

  /** Retrieves status effect class by namespaced ID. */
  getStatusEffectClass(id: string): new (...args: any[]) => StatusEffect;
}
```

Compatibility note:
- Existing code paths may keep `EffectRegistry` temporarily as an adapter.
- New code should read from frozen `EFFECT_CLASS` and `STATUS_EFFECT_CLASS` registries directly.

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
   * MVP: linear interpolate x,y,rotation; copy other fields from nearest snapshot.
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
3. `GoalSystem.update()`  (goal selection + actions)
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

All systems resolve content through frozen class registries (for example `STRUCTURE_CLASS`, `RECIPE_CLASS`, `WAVE_CLASS`) and not ad hoc mutable maps.

---

# 10) MVP milestones

1. Connect (bun.serve + ws) + echo snapshots
2. Move + collide + interpolate + Pixi render
3. Projectiles + damage + death events
4. Build walls (cost + collision)
5. Waves + goal-based enemy goals (chase + melee)
6. Gather/craft + build upgrades
7. Towers + ranged goals (ShootAtGoal) + polish

---

# 11) Performance notes

- Always use `SpatialIndex` for proximity queries; avoid O(n²)
- Keep snapshots compact:
  - Always: id, kind, x,y,vx,vy,rotation,radius
  - Optional: hp/maxHp only when needed
  - data flags only when needed (e.g., `data: { burning: true }`)
- Pre-resolve hot-path registry references (ID -> registry entry/value) during bootstrap/spawn to avoid repeated string lookups in tight tick loops.
- Delta snapshots can come later after gameplay is fun

---

# 12) Security notes

- Never trust client for:
  - damage/hits
  - placement legality or costs
  - crafting validity
- Clamp input vectors and rate limit actions server-side
- Reject unknown or malformed (`namespace:path`) IDs during bootstrap and runtime input validation.
- Disallow registry mutation after freeze; runtime content registration must throw/reject.

---

# 13) Registry bootstrap test scenarios

1. Bootstrap success: valid IDs + valid references => all registries populated and frozen.
2. Duplicate registration: same ID registered twice => deterministic startup failure.
3. Missing cross-reference: weapon/recipe/structure references unknown ID => startup failure.
4. Invalid ID format: non-`namespace:path` ID => startup failure.
5. Post-freeze mutation: any `register()` call after `freeze()` => throws/rejects.
6. System integration: building/crafting/wave/effect lookups resolve through registries only.
7. Serialization consistency: snapshot/event payload IDs are canonical namespaced IDs.

---

# 14) Testing requirements and codebase integration

### 14.1 Test layers (required)
- Unit tests:
  - Goal modules (`GoalSelector`, built-in goals, goal lifecycle methods)
  - World primitives (`World`, `EntityStore`, `SpatialIndex`, `Collision`)
  - Gameplay core (`Inventory`, `Health`, `CombatSystem`, `BuildingSystem`)
  - Registry bootstrap validation and protocol codec (`JsonCodec`)
- Integration tests:
  - Server tick pipeline: `World.step -> InputSystem -> GoalSystem -> ... -> WaveSystem`
  - Networking contract: input command validation, snapshot broadcast, disconnect behavior
  - Wave progression and goal-driven enemy behavior under deterministic tick updates
- Client integration tests:
  - Snapshot ingestion + interpolation behavior
  - Render sync contracts for entity spawn/update/despawn
- Regression tests:
  - Goal naming/wiring (`GoalSystem` + goals registry lookup paths)
  - Registry lookup regressions after bootstrap/freeze

### 14.2 Test layout in codebase (required)
- `apps/server/test/unit/...`
- `apps/server/test/integration/...`
- `apps/client/test/unit/...`
- `apps/client/test/integration/...`
- `packages/shared/test/unit/...`
- `test/fixtures/...`
- `.github/workflows/ci.yml`
- `scripts/coverage-gate.ts`

### 14.3 Required package scripts
- `typecheck` (TypeScript static checks)
- `test` (full suite)
- `test:unit` (unit only)
- `test:integration` (integration only)
- `test:coverage` (coverage report generation)
- `test:coverage:gate` (coverage threshold enforcement)

### 14.4 Runner and coverage tooling
- Test runner: `bun test`
- Coverage command: `bun test --coverage`
- Coverage thresholds are enforced by `scripts/coverage-gate.ts` and run in CI.

### 14.5 CI integration requirements
- CI must run on every pull request and block merges on failure.
- Required CI steps:
  1. Install dependencies
  2. Lint
  3. Typecheck
  4. Unit + integration tests
  5. Coverage generation + coverage gate
- Branch protection must require all test/typecheck/lint CI checks to pass before merge.

### 14.6 Deterministic test requirements
- Use fixed tick deltas for simulation tests.
- Use seeded RNG for repeatable outcomes.
- Do not assert against wall-clock timing unless time is controlled/mocked.

### 14.7 Coverage policy (gradual gate)
- Milestones 1-3:
  - Global line coverage >= 60%
  - Global branch coverage >= 50%
  - Shared net/goal modules line coverage >= 70%
- Milestones 4-5:
  - Global line coverage >= 70%
  - Global branch coverage >= 60%
  - Server `goals`, `systems`, `world` line coverage >= 75%
- Milestones 6-7:
  - Global line coverage >= 80%
  - Global branch coverage >= 70%
  - Critical modules line coverage >= 85%:
    - `GoalSystem`
    - `CombatSystem`
    - `BuildingSystem`
    - `WaveSystem`
    - registry bootstrap
    - protocol codec

### 14.8 Test interface expectations
- Any new or updated system requires corresponding unit tests.
- Any server tick pipeline change requires integration test updates.
- Any protocol or snapshot schema change requires contract tests.

### 14.9 Required scenarios
1. `GoalSelector` conflict resolution for `move/look/attack` control channels.
2. Goal lifecycle correctness: `canStart`, `start`, `tick`, `shouldContinue`, `stop`.
3. `GoalSystem` applies expected world-state effects in tick order.
4. Wave spawning uses deterministic goal-driven enemy behavior.
5. Client interpolation remains stable under delayed snapshots.
6. Registry bootstrap rejects malformed IDs, duplicates, and missing references.
7. End-to-end authoritative flow: input command -> server simulation -> snapshot output.

---

# 15) Implementation conventions and documented deviations (2026-03-03)

This section records what is currently implemented in the repo, including intentional deviations from earlier planning text. Future humans/agents should treat this section as source-of-truth for current code conventions.

### 15.1 Naming conventions now enforced in code
- Prefer verbose identifiers over short abbreviations in code-facing names.
  - Examples used in code: `gameConfig`, `networkServer`, `networkClient`, `snapshotManager`, `antiCheatValidator`, `latestSnapshot`.
- Use `rotation` instead of `rot`.
- Use `radius` instead of `r`.
- Use `deltaMs` casing for timestep variables (not `deltaMS`).

### 15.2 Documentation conventions
- New runtime classes and methods are documented with concise JSDoc comments.
- Parsing/validation helper functions are also documented.
- Goal: preserve readability for handoff between human contributors and agents.

### 15.3 External package usage (actual implementation)
- `zod`: protocol message schema validation/parsing (`parseClientToServerMessage`, `parseServerToClientMessage`).
- `denque`: bounded snapshot history/event queue mechanics.
- `seedrandom`: deterministic RNG used directly in `World` (no custom RNG wrapper).
- `lodash-es` (`uniqueId`): backing allocator for `IdGenerator`.

### 15.4 Custom utility replacements and removals
- Removed/replaced custom wrappers/utilities in favor of direct imports:
  - `packages/shared/src/net/codec-json.ts` removed.
  - `packages/shared/src/util/ringbuffer.ts` removed.
  - `apps/server/src/world/EventBus.ts` removed.
  - `packages/shared/src/math/Vec2.ts` removed.
  - `packages/shared/src/math/Rng.ts` removed.
- Current policy: prefer direct third-party imports for common primitives unless a project-specific abstraction is explicitly needed.

### 15.5 Protocol/input scope deviation (current M1 behavior)
- Current `InputCommand` is intentionally movement-only:
  - `seq`, `tick`, `moveX`, `moveY`.
- Earlier planned fields (aim/fire/reload/use/build/craft/switchSlot) are not active in the current implementation pass.
- Server/client validation and tests are aligned to this reduced contract for M1 stability.

### 15.6 Runtime architecture status notes
- Server is authoritative and broadcasts snapshots at configured cadence.
- Client runs interpolation over authoritative snapshots.
- `TickClock` remains a small local wrapper over timer scheduling; can be inlined later if desired.
- `IdGenerator` remains as a thin seam over external ID generation for future swap flexibility.

### 15.7 Testing + CI notes reflected in codebase
- Bun test stack is active (`bun test`, `bun test --coverage`).
- Coverage gate is enforced by `scripts/coverage-gate.ts`.
- Current tests include:
  - unit: input validation and interpolation
  - integration: snapshot pipeline and client render sync
  - shared protocol parse contract tests

### 15.8 Guidance for future changes
- Preserve naming conventions from 15.1 in all new code and docs.
- When protocol shape changes, update:
  - zod schemas/types
  - server/client message handlers
  - contract tests
- When replacing custom code with external imports, record the decision here and keep behavior deterministic for tests.
- Always log specifications, deviations from prior plan text, and design decisions in this section as they happen.

---

End of PLAN.md
