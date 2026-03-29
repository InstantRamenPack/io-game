# Adding New Runtime Types

This document describes the current workflow for adding new enemies, buildings, items, projectiles, effects, and goals.

The architecture now has three distinct layers:

1. Runtime behavior lives in server classes.
2. Non-simulation metadata lives in shared JSON content files.
3. Registration happens through local barrel files, which are then composed by the shared catalog and server bootstrap.

Do not add handwritten `typeId` constants. Runtime ids are derived from:

- `kind`
- `resourceName`

Examples:

- `enemy:zombie`
- `building:wall`
- `item:basic_gun`
- `projectile:basic_bullet`
- `effect:damage`

## Core Rules

### Put simulation in classes

These belong in runtime classes:

- hp
- radius
- movement speed
- goal lists
- weapon lists
- projectile behavior
- effect behavior
- item `stackMax`
- structure item `buildingTypeId`

### Put metadata in JSON

These belong in shared content JSON:

- labels
- item recipes
- recipe hint text
- recipe output amount

Current shared content domains live under:

- `packages/shared/src/content/enemy`
- `packages/shared/src/content/building`
- `packages/shared/src/content/item`
- `packages/shared/src/content/projectile`
- `packages/shared/src/content/pickup`
- `packages/shared/src/content/player`
- `packages/shared/src/content/effect`

### Register through local barrels

Do not hand-edit central import lists in:

- `packages/shared/src/content/catalog.ts`
- `apps/server/src/registry/bootstrap.ts`

for every new type.

Instead:

- add the JSON to the local content barrel for that domain
- add the class to the local runtime barrel for that domain

The central catalog and bootstrap files compose those local barrels.

## Current Registration Pattern

For every domain, there are two parallel registration paths:

1. Shared content barrel
2. Server runtime barrel

Examples:

- enemies:
  - `packages/shared/src/content/enemy/index.ts`
  - `apps/server/src/entities/enemies/index.ts`
- buildings:
  - `packages/shared/src/content/building/index.ts`
  - `apps/server/src/entities/buildings/index.ts`
- weapons:
  - `packages/shared/src/content/item/index.ts`
  - `apps/server/src/items/weapons/index.ts`
- structure items:
  - `packages/shared/src/content/item/index.ts`
  - `apps/server/src/items/resources/StructureItems.ts`
- effects:
  - `packages/shared/src/content/effect/index.ts`
  - `apps/server/src/effects/index.ts`

If a new type is missing from its local barrel, it is effectively invisible.

## Creating a New Enemy

### Required files

1. Add shared JSON:
   - `packages/shared/src/content/enemy/<name>.json`
2. Register it in:
   - `packages/shared/src/content/enemy/index.ts`
3. Add the server class:
   - `apps/server/src/entities/enemies/<Name>.ts`
4. Export it in:
   - `apps/server/src/entities/enemies/index.ts`

### Enemy constructor rules

Enemy-owned weapons now live directly in the enemy class. Do not populate enemy weapons later in `GameServer`.

Use the enemy constructor to define:

- stats
- movement speed
- weapon list
- goal list

Example:

```ts
import { AttackAtGoal } from "@server/goals/builtin/AttackAtGoal.ts";
import { Enemy } from "@server/entities/Enemy.ts";
import { Player } from "@server/entities/Player.ts";
import { GoToTargetGoal } from "@server/goals/builtin/GoToTargetGoal.ts";
import { TargetEntityGoal } from "@server/goals/builtin/TargetEntityGoal.ts";
import { ZombieSword } from "@server/items/weapons/ZombieSword.ts";

export class Goblin extends Enemy {
  public static override readonly resourceName = "goblin";

  public constructor(id: number) {
    super(id, {
      radius: 11,
      hp: 70,
      maxHp: 70,
      vx: 0,
      vy: 0,
      moveSpeed: 10,
      weapons: [new ZombieSword()],
      goals: [
        new TargetEntityGoal<Enemy>(0, Player, 420),
        new GoToTargetGoal<Enemy>(1, 18),
        new AttackAtGoal<Enemy>(2, 0),
      ],
    });
  }
}
```

Important rules:

- do not add `aggroRange` or `arrivalRadius` fields to the entity
- pass those values directly into the relevant goal constructors
- keep weapon slot assumptions aligned with the goal list

### Spawning

Registration does not spawn the enemy. If you want it in the default world, update a world population path such as:

- `apps/server/src/server/GameServer.ts`

### Optional client work

If the generic enemy rendering is enough, stop there.

If you want a custom look, update:

- `apps/client/src/net/ClientEntity.ts`

## Creating a New Building

Buildings are world entities. If players should place them, you also need a matching structure item.

### Building entity files

1. Add shared JSON:
   - `packages/shared/src/content/building/<name>.json`
2. Register it in:
   - `packages/shared/src/content/building/index.ts`
3. Add the server building class:
   - `apps/server/src/entities/buildings/<Name>.ts`
4. Export it in:
   - `apps/server/src/entities/buildings/index.ts`

Concrete building constructors now take an explicit `label: string`. Do not read the default label inside the class.

Example:

```ts
import { Building } from "@server/entities/Building.ts";

export class Forge extends Building {
  public static override readonly resourceName = "forge";

  public constructor(id: number, label: string, tier = 1, ownerId?: number) {
    super(id, label, tier, ownerId, {
      baseHp: 240,
      radius: 24,
    });
  }
}
```

The placement path supplies the default label from building content. Custom named starter buildings can still pass a custom label directly.

### Placeable building item files

If the building should be placeable:

1. Add item JSON:
   - `packages/shared/src/content/item/<name>.json`
2. Register it in:
   - `packages/shared/src/content/item/index.ts`
3. Add the structure item class:
   - `apps/server/src/items/resources/structures/<Name>Item.ts`
4. Export it in:
   - `apps/server/src/items/resources/StructureItems.ts`

Structure items should extend `StructureItem` and point at the building type:

```ts
import { Forge } from "@server/entities/buildings/Forge.ts";
import { StructureItem } from "@server/items/resources/StructureItem.ts";

export class ForgeItem extends StructureItem {
  public static override readonly resourceName = "forge";
  public static override readonly buildingTypeId = Forge.typeId;
}
```

### Inventory model rule

The inventory is no longer slot-based.

- non-weapon items are counted stackables keyed by `typeId`
- weapons are runtime instances in `inventory.weapons`

That means:

- materials and placeables should usually extend `ResourceItem` or `StructureItem`
- weapons should extend `Weapon`, `MeleeWeapon`, or `RangedWeapon`

## Creating a New Weapon or Other Item

### Weapon

1. Add item JSON:
   - `packages/shared/src/content/item/<name>.json`
2. Register it in:
   - `packages/shared/src/content/item/index.ts`
3. Add the weapon class:
   - `apps/server/src/items/weapons/<Name>.ts`
4. Export it in:
   - `apps/server/src/items/weapons/index.ts`

Weapons are runtime instances. If crafted, each crafted output creates a new weapon instance.

### Material or consumable

1. Add item JSON:
   - `packages/shared/src/content/item/<name>.json`
2. Register it in:
   - `packages/shared/src/content/item/index.ts`
3. Add the item class under a suitable resource folder
4. Export it in the matching resource barrel such as:
   - `apps/server/src/items/resources/Materials.ts`

## Creating a New Projectile

Projectile types stay in their own registry because they have a different spawn contract.

Required files:

1. Add shared JSON:
   - `packages/shared/src/content/projectile/<name>.json`
2. Register it in:
   - `packages/shared/src/content/projectile/index.ts`
3. Add the projectile class:
   - `apps/server/src/entities/projectiles/<Name>.ts`
4. Export it in the projectile barrel for that domain

Then reference the projectile `typeId` from a ranged weapon.

## Creating a New Effect

Effects now participate in the same content/registry system as other runtime types.

Required files:

1. Add shared JSON:
   - `packages/shared/src/content/effect/<name>.json`
2. Register it in:
   - `packages/shared/src/content/effect/index.ts`
3. Add the effect class:
   - `apps/server/src/effects/builtin/<Name>.ts`
4. Export it in:
   - `apps/server/src/effects/builtin/index.ts`
   - and ensure it is included via `apps/server/src/effects/index.ts`

Effect labels now come from JSON through the base `Effect` class. Concrete effects should declare `resourceName` and behavior only.

Example:

```ts
import { Effect } from "@server/effects/Effect.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { World } from "@server/world/World.ts";

export class BurnEffect extends Effect {
  public static override readonly resourceName = "burn";

  public override apply(world: World, source: Entity, target: Entity): void {
    // effect behavior
  }
}
```

## Creating a New Goal

Goals are still the correct place for autonomous movement, targeting, and attacks.

Use goals for:

- target acquisition
- chase movement
- strafing
- weapon firing
- active building behavior

Do not add ad hoc autonomous attack/movement logic to enemy or building `tick()` unless you are intentionally changing the architecture.

When adding a new goal:

1. add the goal file under `apps/server/src/goals`
2. choose the correct claimed controls:
   - `move`
   - `look`
   - `attack`
   - `target`
3. wire it into the entity constructor
4. pass any tuning directly into the goal constructor

Example:

```ts
goals: [
  new TargetEntityGoal<Enemy>(0, Player, 480),
  new GoToTargetGoal<Enemy>(1, 20),
  new AttackAtGoal<Enemy>(2, 0),
];
```

## Common Mistakes

- Adding a JSON file but forgetting the local content barrel.
- Adding a class but forgetting the local runtime barrel.
- Editing `catalog.ts` or `bootstrap.ts` directly instead of the local barrel.
- Adding enemy weapons in `GameServer` instead of the enemy constructor.
- Putting labels inside runtime classes when they belong in JSON.
- Treating the inventory as slot-based when it is now stackables plus weapon instances.
- Adding `aggroRange` or `arrivalRadius` as entity fields instead of goal parameters.
- Forgetting that concrete building classes require an explicit `label`.

## Quick Reference

### New enemy

1. Add `packages/shared/src/content/enemy/<name>.json`
2. Export it from `packages/shared/src/content/enemy/index.ts`
3. Add `apps/server/src/entities/enemies/<Name>.ts`
4. Export it from `apps/server/src/entities/enemies/index.ts`
5. Spawn it where needed

### New building

1. Add `packages/shared/src/content/building/<name>.json`
2. Export it from `packages/shared/src/content/building/index.ts`
3. Add `apps/server/src/entities/buildings/<Name>.ts`
4. Export it from `apps/server/src/entities/buildings/index.ts`
5. If placeable, also add the matching item JSON and structure item class

### New effect

1. Add `packages/shared/src/content/effect/<name>.json`
2. Export it from `packages/shared/src/content/effect/index.ts`
3. Add `apps/server/src/effects/builtin/<Name>.ts`
4. Export it from the effect barrels
