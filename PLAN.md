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
      index.ts
      src/
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
      index.html
      menu-prototype.html
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

  tsconfig.json
  package.json
  render.yaml
```

---

## 3) Build & run assumptions

### 3.1 TypeScript path alias
Use a base tsconfig with:

- `@shared/*` → `packages/shared/src/*`
- `@client/*` → `apps/client/src/*`
- `@server/*` → `apps/server/src/*`

### 3.2 Server — WebSockets via `bun.serve()`
- `apps/server/index.ts` creates server:

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

# 8) Class reference

This section keeps the roadmap-level class inventory without repeating full signatures.
For each class or class family, it records purpose, likely fields, and the method names worth knowing.

---

## 8A) packages/shared

### `GameConfig` — `packages/shared/src/config/GameConfig.ts`

- Purpose: shared runtime tuning for server cadence, snapshots, world bounds, and client interpolation.
- Key fields: `tickRate`, `snapshotRate`, `worldSize`, `network`, `interpolation`, `clientSnapshotHistoryCapacity`, `protocolVersion`.
- Key methods: `load`.

### `IdGenerator` — `packages/shared/src/math/IdGenerator.ts`

- Purpose: allocate stable runtime ids for authoritative entities.
- Key fields: whatever backing state is needed to keep ids monotonic.
- Key methods: `alloc`, `free`.

### Registry layer — `packages/shared/src/registry/*`

- `ResourceId`: namespaced content identifier used across registries. Expect namespace/path data plus parse/string helpers.
- `RegistryKey<T>`: typed handle for a registry family such as items, weapons, recipes, or structures.
- `RegistryEntry<T>`: simple `id` + `value` pairing used when iterating registry contents.
- `Registry<T>`: read-only runtime lookup surface. Core methods should cover `has`, `get`, `require`, `entries`, and `values`.
- `MutableRegistry<T>`: bootstrap-time writable registry that later freezes. Core methods should cover `register`, `freeze`, `isFrozen`, plus the read methods above.
- `BuiltInRegistries`: aggregate holder for the game’s item, weapon, projectile, structure, recipe, enemy, wave, effect, and status-effect registries.
- `RegistryBootstrap`: one-shot bootstrap that registers built-in content and freezes the registry set.

### Gameplay/content types — `packages/shared/src/types/*`

- `EntityType`: base shared data for any spawnable entity shape.
- `EnemyType`: enemy tuning plus the hook that defines that enemy’s goal stack.
- `ItemType`: shared item data such as display name and stack size.
- `WeaponType`: shared weapon data plus the main `use` action.
- `ProjectileType`: projectile tuning such as speed and damage.
- `StructureType`: buildable structure data including cost.
- `RecipeType`: crafting input/output recipe shape.
- `WaveTemplate`: data needed to spawn a configured wave.
- `EffectType`: on-hit or instant effect definition.
- `StatusEffectType`: timed effect definition.

### Shared id constants — `packages/shared/src/ids/*`

- Purpose: centralize stable ids for entity kinds, items, weapons, projectiles, structures, recipes, and waves.
- Key fields: exported constants only.

### Net types and protocol — `packages/shared/src/net/*`

- `protocol.ts`: protocol version, zod schemas, message type families, and parse helpers. Main helpers are `parseClientToServerMessage` and `parseServerToClientMessage`.
- `snapshots.ts`: `EntitySnapshot` and `WorldSnapshot` wire shapes.
- `events.ts`: `NetEvent` shape for discrete replicated events.

### Removed custom helpers

- The current repo does not have dedicated `Vec2`, `Rng`, `JsonCodec`, or `RingBuffer` classes.
- Use native math, `seedrandom`, zod-based parsing helpers, and `Denque` directly unless a real project-specific abstraction becomes necessary.

---

## 8B) apps/server

### `index.ts` — `apps/server/index.ts`

- Purpose: Bun entrypoint that loads config, starts `GameServer`, serves the client shell, and wires WebSocket callbacks.
- Key collaborators: `GameConfig`, `WsServer`, `GameServer`, Bun’s HTTP/WebSocket server.
- Key methods: `main`, plus small local helpers such as HTML rendering.

### `TickClock` — `apps/server/src/server/TickClock.ts`

- Purpose: fixed-rate scheduler for the authoritative loop.
- Key fields: interval timing, running flag, active timer handle.
- Key methods: `start`, `stop`, `nowMs`.

### `GameServer` — `apps/server/src/server/GameServer.ts`

- Purpose: top-level authoritative coordinator for connections, world stepping, input handling, and snapshot output.
- Key fields: `world`, `systems`, `networkServer`, `snapshotManager`, `antiCheatValidator`, id allocation, client/player maps, hello/input tracking state.
- Key methods: `start`, `stop`, `tick`, `handleInput`, `onConnect`, `onDisconnect`, plus internal raw-message and hello handlers.

### `WsServer` — `apps/server/src/net/WsServer.ts`

- Purpose: thin server-side socket registry and dispatch layer over Bun’s callbacks.
- Key fields: socket map and handler arrays for open, message, and close.
- Key methods: `onMessage`, `onOpen`, `onClose`, `handleOpen`, `handleMessage`, `handleClose`, `send`, `broadcast`, `disconnect`.

### `SnapshotManager` — `apps/server/src/net/SnapshotManager.ts`

- Purpose: decide when snapshots are emitted and serialize world state into wire format.
- Key fields: snapshot cadence such as `everyTicks`.
- Key methods: `shouldSendSnapshot`, `makeSnapshot`, and optional delta helpers if they are added later.

### `AntiCheatValidator` — `apps/server/src/net/AntiCheatValidator.ts`

- Purpose: clamp or reject obviously invalid client input before it enters gameplay.
- Key fields: none beyond any lightweight tuning.
- Key methods: `validate`, `clampMove`, plus future helpers such as aim or action clamping if needed.

---

## 8B.1) World core

### `World` — `apps/server/src/world/World.ts`

- Purpose: central authoritative world container that owns time, entities, events, and shared world services.
- Key fields: `tick`, `timeMs`, `entities`, `spatial`, `events`, `gameConfig`, and direct `seedrandom` state if deterministic rolls are needed.
- Key methods: `step`, `spawn`, `despawn`, `get`.

### `EntityStore` — `apps/server/src/world/EntityStore.ts`

- Purpose: primary entity index by id and by kind.
- Key fields: `byId`, `byKind`.
- Key methods: `add`, `remove`, `get`, `queryKind`, `all`.

### `SpatialIndex` — `apps/server/src/world/SpatialIndex.ts`

- Purpose: planned proximity-query helper so AI, combat, and building logic avoid brute-force scans.
- Key fields: cell size and spatial buckets.
- Key methods: `rebuild`, `queryCircle`, `nearest`, plus any update helpers that keep the index in sync.

### `Collision` — `apps/server/src/world/Collision.ts`

- Purpose: planned collection of collision detection and separation helpers.
- Key fields: none; this should stay stateless.
- Key methods: overlap checks, separation helpers, and world-boundary clamping helpers.

---

## 8B.2) Goal-based AI (server)

### `GoalControl`, `Goal` — `apps/server/src/goals/Goal.ts`

- Purpose: define the control channels and lifecycle contract for Minecraft-style AI goals.
- Key fields: `priority`, `controls`.
- Key methods: `canStart`, `start`, `tick`, `shouldContinue`, `stop`.

### `GoalContext` — `apps/server/src/goals/GoalContext.ts`

- Purpose: bundle the world, acting enemy, and helper systems needed by a goal.
- Key fields: `world`, `self`, `spatial`, `combat`, `projectiles`.
- Key methods: construction only unless convenience helpers are added later.

### `GoalSelector` — `apps/server/src/goals/GoalSelector.ts`

- Purpose: choose which goals are active each tick and enforce control conflicts.
- Key fields: `goals`, `active`.
- Key methods: `add`, `clear`, `tick`, `debugActive`.

### Built-in goals — `apps/server/src/goals/builtin/*`

- `TargetNearestGoal`: acquire a valid nearby target.
- `GoToPositionGoal`: steer toward a fixed destination.
- `GoToTargetGoal`: chase a moving target entity.
- `WanderGoal`: pick idle roam destinations.
- `MeleeAttackGoal`: attack in range on cooldown.
- `ShootAtGoal`: fire projectiles at a target on cooldown.
- Key fields across the family: range, cooldown, desired target, repath timing, or projectile/attack tuning.
- Key methods follow the standard goal lifecycle names above.

---

## 8B.3) Entities (server runtime)

### `Entity` — `apps/server/src/entities/Entity.ts`

- Purpose: base runtime entity shared by players, enemies, projectiles, pickups, buildings, and resource nodes.
- Key fields: identity, kind, transform, velocity, `rotation`, `radius`, `alive`, ownership/team info, `data`.
- Key methods: `tick`, `toSnapshot`, `applyImpulse`.

### `Player` — `apps/server/src/entities/Player.ts`

- Purpose: authoritative player entity with movement, inventory, currency, and equipped-weapon state.
- Key fields: `name`, `inputBuffer`, `inventory`, `wallet`, `currentWeapon`, movement tuning.
- Key methods: `enqueueInput`, `applyInputForTick`.

### `Enemy` — `apps/server/src/entities/Enemy.ts`

- Purpose: base hostile runtime entity that owns type data and goal state.
- Key fields: `enemyId`, `hp`, `goals`, `moveSpeed`, `targetId`, attack cooldown state, type reference, optional timers.
- Key methods: construction plus any goal-installation helper such as `buildGoals`.

### Concrete enemies — `apps/server/src/content/enemies/*`

- Purpose: specific enemy type subclasses like `Zombie` that wire stats and goal stacks together.
- Key fields: whatever tuning the enemy exposes in addition to its base type.
- Key methods: mostly type-specific setup and goal-building hooks.

### `Projectile` — `apps/server/src/entities/Projectile.ts`

- Purpose: runtime projectile carrying damage, ownership, lifetime, and effect data.
- Key fields: projectile/type ids, `ownerId`, `damage`, `lifeMs`, `speed`, `onHitEffects`, type reference.
- Key methods: construction and per-tick behavior inherited from `Entity`.

### `Pickup` — `apps/server/src/entities/Pickup.ts`

- Purpose: dropped world item/resource entity.
- Key fields: `stack`, `lifeMs`.
- Key methods: construction and any pickup-specific tick logic.

### `Building` — `apps/server/src/entities/Building.ts`

- Purpose: base placed structure entity.
- Key fields: structure id/type, `hp`, `ownerId`, `level`.
- Key methods: `upgrade`, plus normal entity methods.

### `ResourceNode` — `apps/server/src/entities/ResourceNode.ts`

- Purpose: harvestable world resource entity.
- Key fields: resource id, `hp`, `yields`.
- Key methods: construction and harvest-related behavior.

---

## 8B.4) Systems (server tick phases)

### Systems overview — `apps/server/src/systems/*`

- `System`: base tick contract with `update`.
- `InputSystem`: consume buffered player input and translate it into movement/actions.
- `MovementSystem`: integrate velocity, steering, and world clamps.
- `CollisionSystem`: resolve overlaps and world constraints.
- `GoalSystem`: build `GoalContext` values and tick enemy goal selectors.
- `ProjectileSystem`: move projectiles, expire them, and spawn them from combat/weapon logic.
- `CombatSystem`: apply damage, knockback, deaths, and on-hit effects.
- `StatusSystem`: tick active timed effects.
- `InventorySystem`: move stacks between world pickups and player inventories.
- `BuildingSystem`: validate placement, upgrades, and tower/trap behavior.
- `ResourceSystem`: handle harvesting interactions and node depletion.
- `CraftingSystem`: validate recipes and apply crafting outputs.
- `WaveSystem`: track wave timing and spawn configured enemies.
- Most system classes should stay thin: world references come in through `update`, and helper methods exist only when the system has external entry points such as `spawnProjectile`, `place`, `craft`, or `spawnWave`.

---

## 8B.5) Gameplay components (server)

### Gameplay components — `apps/server/src/gameplay/*`

- `Health`: mutable health state with methods such as `damage`, `heal`, and `isDead`.
- `ItemStack`: item id plus count.
- `Inventory`: slot-based item storage with add/remove/has style methods.
- `Wallet`: currency holder with add/spend style methods.
- `Weapon`: common runtime weapon wrapper with cooldown ownership and `canUse`/`use`.
- `RangedWeapon`: projectile-producing weapon with projectile id and spread tuning.
- `MeleeWeapon`: close-range weapon with damage and reach tuning.

---

## 8B.6) Effects (server)

### Effects overview — `apps/server/src/effects/*`

- `Effect`: base on-hit or instant effect contract.
- `StatusEffect`: timed effect contract with duration/elapsed state and a per-tick method.
- `StatusContainer`: holder for active status effects on one entity.
- `EffectRegistry`: optional compatibility adapter in front of the effect registry set.
- Built-in effects such as `BurnEffect`, `SlowEffect`, and `KnockbackEffect` package up common damage-over-time, slow, or impulse behavior.
- Key methods across the family: `onHit`, `tick`, `isExpired`, `add`, `create`.

---

## 8B.7) Services (server)

### `AuthService` — `apps/server/src/services/AuthService.ts`

- Purpose: optional authentication/account boundary if the project moves past guest-only access.
- Key fields: provider configuration if/when auth is enabled.
- Key methods: token verification and guest-login style entry points.

---

## 8C) apps/client

### `main.ts` — `apps/client/src/main.ts`

- Purpose: current client entrypoint. Today it boots the menu/prototype UI; later it can hand off to the real gameplay client.
- Key fields: local menu state and DOM references only.
- Key methods: local UI handlers plus the top-level startup function.

### `GameClient` — `apps/client/src/client/GameClient.ts`

- Purpose: gameplay client coordinator for networking, snapshot history, interpolation, input, and rendering.
- Key fields: `networkClient`, `worldState`, `interpolator`, `inputManager`, `renderer`, `gameConfig`, `inputTimer`, `started`.
- Key methods: `start`, `update`, `onSnapshot`, `stop`.

### `WsClient` — `apps/client/src/net/WsClient.ts`

- Purpose: browser WebSocket wrapper that speaks the shared protocol.
- Key fields: `socket`, snapshot/open/close handler lists.
- Key methods: `connect`, `sendInput`, `onSnapshot`, `onOpen`, `onClose`, `disconnect`.

### `ClientWorldState` — `apps/client/src/net/ClientWorldState.ts`

- Purpose: bounded history of authoritative snapshots.
- Key fields: `history`, `latest`, capacity bookkeeping.
- Key methods: `pushSnapshot`, `getLatest`, `getHistory`.

### `Interpolator` — `apps/client/src/net/Interpolator.ts`

- Purpose: sample snapshot history to produce render-time entity state.
- Key fields: `bufferTicks`.
- Key methods: `setBufferTicks`, `sample`.

### `InputManager` — `apps/client/src/input/InputManager.ts`

- Purpose: collect DOM input state and serialize it into `InputCommand` messages.
- Key fields: sequence counter, movement state, pressed-key tracking, and any future aim/action state.
- Key methods: `bind`, `toCommand`, `clearOneShots`.

---

## 8C.1) Rendering (Pixi)

### Rendering classes — `apps/client/src/render/*`

- `PixiRenderer`: top-level rendering facade that keeps scene state in sync with interpolated entities. Key methods should stay around `sync`, `update`, `spawn`, and `despawn`.
- `SpriteStore`: entity id to display-object mapping with `get`, `set`, and `remove`.
- `SpriteFactory`: sprite/container creation and snapshot-to-visual application. Expect methods such as `create` and `apply`.
- `Camera`: follow/position/zoom logic for the local player view. Expect methods such as `follow`, `update`, and `worldToScreen`.
- `Hud`: overlay widgets for health, waves, inventory, build/craft hints, or transient banners. Expect methods such as `update`, `showDamage`, and `showWaveBanner`.
- `Assets`: asset loading and lookup wrapper. Expect `loadAll` and texture lookup helpers.

---

## 8C.2) Client VFX

### Client VFX classes — `apps/client/src/fx/*`

- `EffectVfxRegistry`: visual-only mapping from effect ids to effect handlers. Expect `register` and `play`.
- `BurnVfx`: burn-specific particles or tint behavior with start/stop style methods.

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

# 13) Implementation conventions and documented deviations (2026-03-03)

This section records what is currently implemented in the repo, including intentional deviations from earlier planning text. Future humans/agents should treat this section as source-of-truth for current code conventions.

### 13.1 Naming conventions now enforced in code
- Prefer verbose identifiers over short abbreviations in code-facing names.
  - Examples used in code: `gameConfig`, `networkServer`, `networkClient`, `snapshotManager`, `antiCheatValidator`, `latestSnapshot`.
- Use `rotation` instead of `rot`.
- Use `radius` instead of `r`.
- Use `deltaMs` casing for timestep variables (not `deltaMS`).

### 13.2 Documentation conventions
- New runtime classes and methods are documented with concise JSDoc comments.
- Parsing/validation helper functions are also documented.
- Goal: preserve readability for handoff between human contributors and agents.

### 13.3 External package usage (actual implementation)
- `zod`: protocol message schema validation/parsing (`parseClientToServerMessage`, `parseServerToClientMessage`).
- `denque`: bounded snapshot history/event queue mechanics.
- `seedrandom`: deterministic RNG used directly in `World` (no custom RNG wrapper).
- `lodash-es` (`uniqueId`): backing allocator for `IdGenerator`.

### 13.4 Custom utility replacements and removals
- Removed/replaced custom wrappers/utilities in favor of direct imports:
  - `packages/shared/src/net/codec-json.ts` removed.
  - `packages/shared/src/util/ringbuffer.ts` removed.
  - `apps/server/src/world/EventBus.ts` removed.
  - `packages/shared/src/math/Vec2.ts` removed.
  - `packages/shared/src/math/Rng.ts` removed.
- Current policy: prefer direct third-party imports for common primitives unless a project-specific abstraction is explicitly needed.

### 13.5 Protocol/input scope deviation (current M1 behavior)
- Current `InputCommand` is intentionally movement-only:
  - `seq`, `tick`, `moveX`, `moveY`.
- Earlier planned fields (aim/fire/reload/use/build/craft/switchSlot) are not active in the current implementation pass.
- Server/client validation and docs are aligned to this reduced contract for M1 stability.

### 13.6 Runtime architecture status notes
- Server is authoritative and broadcasts snapshots at configured cadence.
- Client runs interpolation over authoritative snapshots.
- `TickClock` remains a small local wrapper over timer scheduling; can be inlined later if desired.
- `IdGenerator` remains as a thin seam over external ID generation for future swap flexibility.

### 13.7 Guidance for future changes
- Preserve naming conventions from 13.1 in all new code and docs.
- When protocol shape changes, update:
  - zod schemas/types
  - server/client message handlers
  - any affected plan descriptions in this file
- When replacing custom code with external imports, record the decision here and keep behavior deterministic at runtime.
- Always log specifications, deviations from prior plan text, and design decisions in this section as they happen.

---

End of PLAN.md
