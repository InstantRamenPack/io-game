# Creating a New Enemy or Building

This document describes the exact process for adding a new enemy or building in the current architecture.

The important rule is that a type is spread across three different layers:

1. Runtime behavior lives in the server class.
2. Non-simulation metadata lives in JSON content files.
3. The registries are populated in bootstrap by combining the class metadata with the JSON content.

The id is not handwritten as a string constant anymore. It is derived from:

- `kind`
- `resourceName`

That means these examples:

- `enemy:zombie` comes from `kind = "enemy"` and `resourceName = "zombie"`
- `building:wall` comes from `kind = "building"` and `resourceName = "wall"`
- `item:wall` comes from `kind = "item"` and `resourceName = "wall"`

## Architecture Overview

Before adding a new type, understand where each concern belongs.

### Runtime classes

- Base entity ids are derived in [apps/server/src/entities/Entity.ts](/Users/raymondzhu/Documents/Coding/io-game/apps/server/src/entities/Entity.ts).
- Base item ids are derived in [apps/server/src/items/Item.ts](/Users/raymondzhu/Documents/Coding/io-game/apps/server/src/items/Item.ts).
- Class metadata validation and id derivation happen in [apps/server/src/registry/typeMetadata.ts](/Users/raymondzhu/Documents/Coding/io-game/apps/server/src/registry/typeMetadata.ts).

Simulation-affecting fields belong on classes, not in JSON. Examples:

- enemy AI and stats
- building radius and hp
- item `stackMax`
- structure item `buildingTypeId`

### JSON content

JSON content lives under [packages/shared/src/content](/Users/raymondzhu/Documents/Coding/io-game/packages/shared/src/content).

Right now the supported shapes are defined in [packages/shared/src/content/schema.ts](/Users/raymondzhu/Documents/Coding/io-game/packages/shared/src/content/schema.ts):

- entity JSON: `{ "label": "..." }`
- item JSON: `{ "label": "...", "recipe"?: { ... } }`

JSON is for non-simulation metadata. Examples:

- labels
- craft recipe costs
- craft recipe hint text
- craft output amount

### Catalog

The shared catalog is not auto-discovered from the filesystem. It is manually wired in [packages/shared/src/content/catalog.ts](/Users/raymondzhu/Documents/Coding/io-game/packages/shared/src/content/catalog.ts).

That means adding a new JSON file is not enough by itself. You must also:

1. import the JSON file in `catalog.ts`
2. add it to the `itemContents` or `entityContents` map

If you skip this step, bootstrap will fail because `requireEntityContent(...)` or `requireItemContent(...)` will not find the content.

### Registries

Registries live in [apps/server/src/registry/registries.ts](/Users/raymondzhu/Documents/Coding/io-game/apps/server/src/registry/registries.ts) and are populated in [apps/server/src/registry/bootstrap.ts](/Users/raymondzhu/Documents/Coding/io-game/apps/server/src/registry/bootstrap.ts).

Do not create a parallel `buildingRegistry` or `enemyRegistry`.

Instead:

- all entities go into `entityTypeRegistry`
- all items go into `itemTypeRegistry`
- projectiles use `projectileTypeRegistry` because they have a different spawn contract

### Goal-Driven Behavior

This is the most important behavioral rule in the current server architecture:

- enemy movement is goal-driven
- enemy targeting is goal-driven
- enemy attacks are goal-driven
- building actions are goal-driven
- building movement, if a building ever has any, must also be goal-driven

The relevant base class is [apps/server/src/entities/GoalControlledEntity.ts](/Users/raymondzhu/Documents/Coding/io-game/apps/server/src/entities/GoalControlledEntity.ts).

All enemies and all buildings inherit from `GoalControlledEntity` through:

- [apps/server/src/entities/Enemy.ts](/Users/raymondzhu/Documents/Coding/io-game/apps/server/src/entities/Enemy.ts)
- [apps/server/src/entities/Building.ts](/Users/raymondzhu/Documents/Coding/io-game/apps/server/src/entities/Building.ts)

Each tick, `GoalControlledEntity.tick(...)` does this in order:

1. runs `goalSelector.tick(new GoalContext(world, this))`
2. ticks the entity's weapons
3. runs the base entity tick

That means autonomous actions should not be written as ad hoc movement or attack logic somewhere else. In this architecture, the correct place for autonomous behavior is a goal.

The goal system contract lives in:

- [apps/server/src/goals/Goal.ts](/Users/raymondzhu/Documents/Coding/io-game/apps/server/src/goals/Goal.ts)
- [apps/server/src/goals/GoalSelector.ts](/Users/raymondzhu/Documents/Coding/io-game/apps/server/src/goals/GoalSelector.ts)
- [apps/server/src/goals/GoalContext.ts](/Users/raymondzhu/Documents/Coding/io-game/apps/server/src/goals/GoalContext.ts)

Goals claim one or more control channels:

- `move`
- `look`
- `attack`
- `target`

Lower numeric priorities win. If two goals want the same control channel, the lower-priority-number goal gets it and the other goal is excluded for that tick.

In practice, this means:

- movement goals should call `setMovementVelocity(...)`
- look/aim goals should usually set `rotation`
- targeting goals should usually set `targetId`
- attack goals should usually call a weapon's `hit(...)`

Do not bypass this model by hardcoding enemy/building movement or attacks directly in the entity tick unless you are changing the architecture on purpose.

Buildings are included in this rule even if many buildings are currently static. A passive building simply has no movement or attack goals. An active building, such as a turret or trap, should still express that behavior through goals instead of custom one-off tick logic.

## Step-by-Step: Creating a New Enemy

This is the process for a normal enemy that exists as a world entity and can be spawned by the server.

### 1. Choose the resource name

Pick a stable snake_case `resourceName`.

Example:

- `goblin`

The final id will be:

- `enemy:goblin`

The resource name must match:

- the server class static `resourceName`
- the JSON filename
- the entry added to the catalog

If those drift apart, the registry/content lookup will fail.

### 2. Add the shared entity JSON file

Create:

- `packages/shared/src/content/enemy/goblin.json`

Example shape:

```json
{
  "label": "Goblin"
}
```

Right now enemy JSON only carries the display label. Do not put combat stats or movement tuning here.

### 3. Register the JSON file in the shared catalog

Open [packages/shared/src/content/catalog.ts](/Users/raymondzhu/Documents/Coding/io-game/packages/shared/src/content/catalog.ts).

Add:

1. an import for the JSON file
2. an entry in `entityContents`

Follow the existing pattern:

```ts
import goblinEntityJson from "@shared/content/enemy/goblin.json";
```

and then:

```ts
[
  makeResourceId("enemy", "goblin"),
  parseEntityContent(makeResourceId("enemy", "goblin"), goblinEntityJson),
],
```

This step is mandatory because the current architecture uses a manually maintained catalog.

### 4. Add the server enemy class

Create a new file under:

- `apps/server/src/entities/enemies/Goblin.ts`

Most enemies should extend [apps/server/src/entities/Enemy.ts](/Users/raymondzhu/Documents/Coding/io-game/apps/server/src/entities/Enemy.ts).

Also remember the behavioral rule from above: enemies do not get their autonomous movement and attack behavior from random code in `tick()`. They get it from registered goals.

Minimum structure:

```ts
import { AttackAtGoal } from "@server/goals/builtin/AttackAtGoal.ts";
import { Enemy } from "@server/entities/Enemy.ts";
import { GoToTargetGoal } from "@server/goals/builtin/GoToTargetGoal.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";

export class Goblin extends Enemy {
  public static override readonly resourceName = "goblin";

  public constructor(id: number) {
    const arrivalRadius = 18;

    super(id, {
      radius: 11,
      hp: 70,
      maxHp: 70,
      vx: 0,
      vy: 0,
      moveSpeed: 10,
      aggroRange: 420,
      arrivalRadius,
      goals: [
        new TargetEntityGoal<Enemy>(0),
        new GoToTargetGoal<Enemy>(1, arrivalRadius),
        new AttackAtGoal<Enemy>(2, 0),
      ],
    });
  }
}
```

Important rules:

- Do not manually declare `typeId`.
- Do declare `public static override readonly resourceName = "goblin"`.
- The base `Enemy` class already provides `kind = "enemy"`.
- Put AI, combat stats, and movement tuning in this class.
- Register goals in the constructor config instead of inventing ad hoc autonomous movement or attack code.

### 5. Register the enemy type in bootstrap

Open [apps/server/src/registry/bootstrap.ts](/Users/raymondzhu/Documents/Coding/io-game/apps/server/src/registry/bootstrap.ts).

Add:

1. an import for the new class
2. a `registerEntityType(Goblin);` call in `bootstrapTypeRegistries()`

If you forget this step, the type will exist in code but will not be available to the server registry, snapshots, or any registry-based lookup.

### 6. Decide how the enemy enters the world

Registering the type only makes it known to the registry. It does not automatically spawn the enemy.

If you want it to actually appear in the game, update a world population path such as:

- [apps/server/src/server/GameServer.ts](/Users/raymondzhu/Documents/Coding/io-game/apps/server/src/server/GameServer.ts)

Typical tasks here are:

1. instantiate the enemy with `new Goblin(world.allocEntityId())`
2. optionally give it a weapon
3. set `x` and `y`
4. call `world.spawn(enemy)`

### 7. Add client rendering logic if the default enemy presentation is not enough

All enemies already render as generic enemy circles, because the client primarily keys off `kind`.

If that is good enough, stop here.

If you want a custom enemy-specific shape or color, update:

- [apps/client/src/net/ClientEntity.ts](/Users/raymondzhu/Documents/Coding/io-game/apps/client/src/net/ClientEntity.ts)

That file currently contains type-path-specific drawing logic for some known types. If you want the new enemy to look visually distinct, add the corresponding branch there.

### 8. Sanity checklist for a new enemy

Before considering the enemy complete, verify all of these are true:

- the JSON filename matches the class `resourceName`
- `catalog.ts` imports and registers the JSON file
- the class extends the correct base class
- the enemy's autonomous movement, targeting, and attacking are expressed through goals
- bootstrap registers the class
- some runtime code actually spawns it
- client rendering is acceptable for the new type

## Step-by-Step: Creating a New Building

Buildings are slightly more involved than enemies because there are usually two related types:

1. the world entity, such as `building:forge`
2. the inventory item used to place it, such as `item:forge`

If the building should be placeable or craftable, you need both.

### 1. Choose the shared resource name

Pick one stable snake_case resource name and reuse it for both the building and the matching structure item.

Example:

- `forge`

This produces:

- `building:forge` for the world structure
- `item:forge` for the placeable inventory item

That shared name is what ties the content and runtime classes together.

### 2. Add the building entity JSON file

Create:

- `packages/shared/src/content/building/forge.json`

Example:

```json
{
  "label": "Forge"
}
```

This label becomes the default label used by the server building class and by any client UI that reads shared content.

### 3. Register the building JSON in the catalog

Open [packages/shared/src/content/catalog.ts](/Users/raymondzhu/Documents/Coding/io-game/packages/shared/src/content/catalog.ts).

Add:

1. the JSON import
2. the `entityContents` map entry for `makeResourceId("building", "forge")`

This is exactly the same manual step used for enemies.

### 4. Create the server building class

Create:

- `apps/server/src/entities/buildings/Forge.ts`

Most concrete buildings should extend [apps/server/src/entities/Building.ts](/Users/raymondzhu/Documents/Coding/io-game/apps/server/src/entities/Building.ts).

Follow the existing pattern from [apps/server/src/entities/buildings/Wall.ts](/Users/raymondzhu/Documents/Coding/io-game/apps/server/src/entities/buildings/Wall.ts), [apps/server/src/entities/buildings/Tower.ts](/Users/raymondzhu/Documents/Coding/io-game/apps/server/src/entities/buildings/Tower.ts), and [apps/server/src/entities/buildings/Windmill.ts](/Users/raymondzhu/Documents/Coding/io-game/apps/server/src/entities/buildings/Windmill.ts).

Example:

```ts
import { Building } from "@server/entities/Building.ts";
import { requireEntityContent } from "@shared/content/catalog.ts";

export class Forge extends Building {
  public static override readonly resourceName = "forge";

  public constructor(
    id: number,
    label = requireEntityContent(Forge.typeId).label,
    tier = 1,
    ownerId?: number,
  ) {
    super(id, label, tier, ownerId, {
      baseHp: 240,
      radius: 24,
    });
  }
}
```

Important rules:

- Do not write a manual `typeId`.
- Do use `resourceName`.
- Do source the default `label` from `requireEntityContent(Forge.typeId).label`.
- Put hp, radius, and other simulation stats in the class constructor.
- If the building performs autonomous actions, express that behavior through goals, not ad hoc tick logic.

### 5. Register the building entity in bootstrap

Open [apps/server/src/registry/bootstrap.ts](/Users/raymondzhu/Documents/Coding/io-game/apps/server/src/registry/bootstrap.ts).

Add:

1. the import
2. `registerEntityType(Forge);`

This makes the building discoverable through `entityTypeRegistry`, allows `Entity.toSnapshot()` to resolve its kind correctly, and allows structure items to point at its type id.

### 6. Decide whether the building is only spawned by the server or also placeable by players

There are two valid cases:

1. server-only/static building
2. player-placeable building

If it is server-only, you can stop after the building entity registration and add whatever spawn logic you need in the server.

If it is player-placeable, continue with the structure item steps below.

### 7. Add the structure item JSON file

Create:

- `packages/shared/src/content/item/forge.json`

Example with recipe:

```json
{
  "label": "Forge Kit",
  "recipe": {
    "hint": "Used to place a forge.",
    "outputAmount": 1,
    "costs": [
      { "typeId": "item:wood", "amount": 30 },
      { "typeId": "item:stone", "amount": 50 }
    ]
  }
}
```

Important rules:

- item recipes now live inside the item JSON, not in a separate recipe file
- the craft target is the output item `typeId`
- if the building should not be craftable, omit `recipe`

### 8. Register the structure item JSON in the catalog

Open [packages/shared/src/content/catalog.ts](/Users/raymondzhu/Documents/Coding/io-game/packages/shared/src/content/catalog.ts).

Add:

1. the JSON import
2. the `itemContents` entry for `makeResourceId("item", "forge")`

If the JSON contains a `recipe`, this is also the step that makes the item appear in `CRAFTABLE_ITEM_TYPE_IDS` and therefore in the build/craft HUD.

### 9. Add the structure item class

Create:

- `apps/server/src/items/resources/structures/ForgeItem.ts`

It should usually extend [apps/server/src/items/resources/StructureItem.ts](/Users/raymondzhu/Documents/Coding/io-game/apps/server/src/items/resources/StructureItem.ts).

Example:

```ts
import { Forge } from "@server/entities/buildings/Forge.ts";
import { StructureItem } from "@server/items/resources/StructureItem.ts";

export class ForgeItem extends StructureItem {
  public static override readonly resourceName = "forge";
  public static override readonly buildingTypeId = Forge.typeId;

  public constructor(id: number) {
    super(id);
  }
}
```

Important rules:

- `resourceName` must match the JSON filename and the derived `item:forge` id
- `buildingTypeId` must point at the building entity type
- `stackMax` does not need to be repeated here unless the default from `StructureItem` is wrong

### 10. Register the structure item in bootstrap

Open [apps/server/src/registry/bootstrap.ts](/Users/raymondzhu/Documents/Coding/io-game/apps/server/src/registry/bootstrap.ts).

Add:

1. the import
2. `registerItemType(ForgeItem);`

This step is required for three reasons:

1. player crafting resolves recipes through `itemTypeRegistry`
2. inventory stack behavior resolves `stackMax` through `itemTypeRegistry`
3. building placement resolves `buildingTypeId` through `itemTypeRegistry`

If you forget registration, the building item will not craft or place correctly even if the JSON exists.

### 11. Confirm the placement path is satisfied

Player building placement is handled in [apps/server/src/entities/Player.ts](/Users/raymondzhu/Documents/Coding/io-game/apps/server/src/entities/Player.ts).

That code expects:

1. the chosen item type to exist in `itemTypeRegistry`
2. the item registry entry to have `buildingTypeId`
3. the building entity type to exist in `entityTypeRegistry`

If all of that is true, the server will:

1. check placement range
2. check world bounds
3. check overlap against collidable entities
4. consume one structure item
5. spawn the building

That means the building/item pair is the real placeable unit of content, not the building entity by itself.

### 12. Optionally seed it into player inventory or static world setup

If you want new players to start with the building item, update:

- [apps/server/src/entities/Player.ts](/Users/raymondzhu/Documents/Coding/io-game/apps/server/src/entities/Player.ts)

Specifically, extend `seedStarterInventory(...)`.

If you want a static world instance placed at startup, update:

- [apps/server/src/server/GameServer.ts](/Users/raymondzhu/Documents/Coding/io-game/apps/server/src/server/GameServer.ts)

### 13. Add client rendering branches if the building should have a custom look

The building will already render with a generic building fallback because the client uses `kind === "building"` for baseline rendering.

If you want a custom silhouette or color, update the type-path-specific logic in:

- [apps/client/src/net/ClientEntity.ts](/Users/raymondzhu/Documents/Coding/io-game/apps/client/src/net/ClientEntity.ts)

The current client has special branches for:

- `wall`
- `tower`
- `windmill`
- `crafting_station`

If you add `forge`, decide whether it should:

1. use the generic building fallback
2. get its own shape/color branch

### 14. Sanity checklist for a new building

For a placeable building, all of these must line up:

- `packages/shared/src/content/building/<name>.json`
- `packages/shared/src/content/item/<name>.json`
- building class static `resourceName = "<name>"`
- structure item class static `resourceName = "<name>"`
- structure item class static `buildingTypeId = <BuildingClass>.typeId`
- both JSON files imported into `catalog.ts`
- both runtime classes registered in `bootstrap.ts`
- any autonomous building behavior is implemented with goals

If one of those is missing, the content chain is incomplete.

## Common Mistakes

### Adding a JSON file but forgetting `catalog.ts`

This is the easiest mistake to make in the current setup.

The filesystem is not auto-scanned. A JSON file that is not imported and inserted into the correct map in [catalog.ts](/Users/raymondzhu/Documents/Coding/io-game/packages/shared/src/content/catalog.ts) is effectively invisible.

### Reusing different names in class and JSON

If the class says:

- `resourceName = "forge"`

but the JSON file is:

- `smithy.json`

the lookup will break because the derived `typeId` and the catalog key will not match.

### Putting gameplay stats in JSON

Do not put hp, radius, movement speed, or AI tuning into the content JSON unless the schema is explicitly extended first.

In the current architecture:

- classes own simulation
- JSON owns label and recipe metadata

### Forgetting bootstrap registration

A new class that is never passed to `registerEntityType(...)` or `registerItemType(...)` does not participate in the game.

### Forgetting the structure item for a placeable building

If the building should be player-placeable, adding only the building entity is not enough. The placement system is item-driven.

### Writing autonomous enemy/building behavior outside the goal system

If you make an enemy or active building move, aim, acquire targets, or attack by hand in random entity methods, you are working against the current architecture.

In this codebase, those behaviors are supposed to be modeled as goals that claim:

- `move`
- `look`
- `attack`
- `target`

That is what keeps behavior composable and priority-driven.

## Step-by-Step: Creating a Goal

This section describes how to add a new goal for enemies, buildings, or any other `GoalControlledEntity`.

The goal system exists to make autonomous behavior composable. Instead of hardcoding all logic into one entity class, each goal owns one slice of behavior and claims the controls it needs.

### 1. Decide which controls the goal owns

Before writing code, decide which control channels the goal needs.

Examples:

- a chase goal usually needs `move`
- a turret-tracking goal might need `look`
- a melee swing goal usually needs `attack`
- a target acquisition goal usually needs `target`
- a strafing ranged goal might need both `move` and `attack`

This matters because the selector resolves conflicts by control channel. If two goals both claim `move`, only one of them can win on a given tick.

### 2. Decide the priority relative to other goals

Priorities are numeric, and lower numbers win.

That means:

- `0` beats `1`
- `1` beats `2`

Use this to decide which behavior should take precedence when controls conflict.

Typical examples:

- target acquisition often runs at a very high priority, such as `0`
- navigation/chasing might run after target acquisition
- attack goals might run after a target has been established

### 3. Create the goal file

Add a file under:

- `apps/server/src/goals/builtin/` for reusable generic goals
- or a more specific goal path if the behavior is specialized enough to deserve it

If the goal is generic and can apply to multiple entity types, keep it reusable and generic.

### 4. Extend the `Goal` base class

Use [apps/server/src/goals/Goal.ts](/Users/raymondzhu/Documents/Coding/io-game/apps/server/src/goals/Goal.ts) as the contract.

Skeleton:

```ts
import type { GoalControlledEntity } from "@server/entities/GoalControlledEntity.ts";
import type { GoalContext } from "@server/goals/GoalContext.ts";
import { Goal } from "@server/goals/Goal.ts";

export class HoldPositionGoal<
  TSelf extends GoalControlledEntity = GoalControlledEntity,
> extends Goal<TSelf> {
  public constructor(priority: number) {
    super(priority, ["move"]);
  }

  public override canStart(ctx: GoalContext<TSelf>): boolean {
    return true;
  }

  public override start(_ctx: GoalContext<TSelf>): void {
    // optional one-time setup
  }

  public override tick(ctx: GoalContext<TSelf>): void {
    ctx.self.setMovementVelocity(0, 0);
  }

  public override shouldContinue(_ctx: GoalContext<TSelf>): boolean {
    return true;
  }

  public override stop(ctx: GoalContext<TSelf>): void {
    ctx.self.setMovementVelocity(0, 0);
  }
}
```

Every goal must implement:

- `canStart(...)`
- `start(...)`
- `tick(...)`
- `shouldContinue(...)`
- `stop(...)`

### 5. Use the correct side effects inside the goal

This is the key architectural rule.

Inside goals:

- use `ctx.self.setMovementVelocity(...)` for movement
- use `ctx.self.rotation = ...` for aim/look state
- use `ctx.self.targetId = ...` for targeting state
- use `weapon.hit(ctx.world, ctx.self, x, y)` for attacks

Good examples already in the repo:

- [apps/server/src/goals/builtin/GoToPositionGoal.ts](/Users/raymondzhu/Documents/Coding/io-game/apps/server/src/goals/builtin/GoToPositionGoal.ts)
- [apps/server/src/goals/builtin/AttackAtGoal.ts](/Users/raymondzhu/Documents/Coding/io-game/apps/server/src/goals/builtin/AttackAtGoal.ts)
- [apps/server/src/goals/builtin/RangedAttackGoal.ts](/Users/raymondzhu/Documents/Coding/io-game/apps/server/src/goals/builtin/RangedAttackGoal.ts)
- [apps/server/src/goals/builtin/TargetEntityGoal.ts](/Users/raymondzhu/Documents/Coding/io-game/apps/server/src/goals/builtin/TargetEntityGoal.ts)

### 6. Make `stop(...)` clean up any control state the goal owns

If a goal owns movement, `stop(...)` should usually zero movement with `setMovementVelocity(0, 0)`.

If a goal owns some transient state, reset it there.

This matters because when the selector swaps active goals, the losing goal gets `stop(...)` before the winning set is ticked.

### 7. Register the goal on the entity

After creating the goal class, wire it into the entity constructor.

Enemies usually do this through the `goals` array passed into the `Enemy` base constructor config.

Buildings can do the same because [apps/server/src/entities/Building.ts](/Users/raymondzhu/Documents/Coding/io-game/apps/server/src/entities/Building.ts) also inherits from [apps/server/src/entities/GoalControlledEntity.ts](/Users/raymondzhu/Documents/Coding/io-game/apps/server/src/entities/GoalControlledEntity.ts).

Example:

```ts
super(id, {
  radius: 11,
  hp: 70,
  maxHp: 70,
  vx: 0,
  vy: 0,
  moveSpeed: 10,
  aggroRange: 420,
  arrivalRadius,
  goals: [
    new TargetEntityGoal<Enemy>(0),
    new GoToTargetGoal<Enemy>(1, arrivalRadius),
    new AttackAtGoal<Enemy>(2, 0),
  ],
});
```

This is the normal pattern for enemy AI in the current codebase.

### 8. Make sure the entity has the state the goal expects

Goals often assume certain runtime state exists.

Examples:

- `AttackAtGoal` expects a melee weapon in a specific slot
- `RangedAttackGoal` expects a ranged weapon in a specific slot
- target-follow goals expect `targetId` to be managed by some targeting goal
- movement goals expect `moveSpeed` to be set meaningfully

If the supporting runtime state is missing, the goal may silently do nothing or throw.

### 9. Prefer composing goals instead of creating one giant AI class

The intended style here is:

- one goal acquires a target
- another goal moves into position
- another goal attacks

That is usually better than stuffing target selection, pathing, facing, and attack behavior into one oversized goal or directly into the entity class.

### 10. Sanity checklist for a new goal

Before considering a goal complete, verify all of these are true:

- it claims the correct control channels
- its priority is sensible relative to sibling goals
- `stop(...)` cleans up its owned control state
- the entity that uses it has the required runtime fields or weapons
- the entity constructor actually registers the goal
- the behavior is not duplicated somewhere else in entity tick code

### Forgetting client-specific rendering branches

The new type may work fully on the server but still render with a generic fallback on the client. That is not a server bug. It just means [ClientEntity.ts](/Users/raymondzhu/Documents/Coding/io-game/apps/client/src/net/ClientEntity.ts) was not taught how to draw that specific type.

## Quick Reference

### New enemy

1. Create `packages/shared/src/content/enemy/<name>.json`
2. Import it and register it in `packages/shared/src/content/catalog.ts`
3. Create `apps/server/src/entities/enemies/<Name>.ts`
4. Set `static resourceName = "<name>"`
5. Register it in `apps/server/src/registry/bootstrap.ts`
6. Add spawn logic where needed
7. Add client-specific rendering only if necessary

### New placeable building

1. Create `packages/shared/src/content/building/<name>.json`
2. Import it and register it in `packages/shared/src/content/catalog.ts`
3. Create `apps/server/src/entities/buildings/<Name>.ts`
4. Set `static resourceName = "<name>"`
5. Register the building in bootstrap
6. Create `packages/shared/src/content/item/<name>.json`
7. Import it and register it in `packages/shared/src/content/catalog.ts`
8. Create `apps/server/src/items/resources/structures/<Name>Item.ts`
9. Set `static resourceName = "<name>"`
10. Set `static buildingTypeId = <Name>.typeId`
11. Register the item in bootstrap
12. Optionally add recipe, starter inventory, static world spawn, and custom client rendering
