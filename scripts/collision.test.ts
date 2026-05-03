import { GameConfig } from "@shared/config/GameConfig.ts";
import { makeHitboxRect } from "@shared/geometry/hitbox.ts";
import { Entity } from "@server/entities/Entity.ts";
import { ItemEntity } from "@server/entities/ItemEntity.ts";
import { bootstrapTypeRegistries } from "@server/registry/bootstrap.ts";
import CollisionSystem from "@server/systems/CollisionSystem.ts";
import { World } from "@server/world/World.ts";

type TestCase = {
  name: string;
  run: () => void;
};

class CollisionTestEntity extends Entity {
  public static readonly kind = "player" as const;
  public static override readonly resourceName = "base";

  constructor(id: number, mode: "dynamic" | "static") {
    super(id, { maxHp: 100 });
    this.collisionMode = mode;
    this.setHitboxProfileRects("default", [makeHitboxRect(20, 20)]);
  }
}

class CollisionTestItemEntity extends ItemEntity {
  constructor(id: number) {
    super(id);
    this.setHitboxProfileRects("default", [makeHitboxRect(20, 20)]);
  }

  public override canMergeStackableWith(_other: ItemEntity): boolean {
    return true;
  }
}

const tests: TestCase[] = [];

bootstrapTypeRegistries();

function test(name: string, run: () => void): void {
  tests.push({ name, run });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNear(
  actual: number,
  expected: number,
  tolerance: number,
  message: string,
): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}: actual=${actual} expected=${expected}`);
  }
}

function makeWorld(
  collisionOverrides: Partial<GameConfig["collision"]> = {},
): World {
  const config = new GameConfig();
  config.worldSize = { w: 500, h: 500 };
  config.debug.spawnMultiplier = 0;
  config.collision = { ...config.collision, ...collisionOverrides };
  return new World(config);
}

function makeEntity(
  world: World,
  mode: "dynamic" | "static",
  x: number,
  y: number,
): CollisionTestEntity {
  const entity = new CollisionTestEntity(world.allocEntityId(), mode);
  entity.x = x;
  entity.y = y;
  world.spawn(entity);
  return entity;
}

function runCollision(world: World): void {
  const collisionSystem = new CollisionSystem();
  world.ensureSpatialIndex();
  collisionSystem.integrateAndResolve(world, world.entities.all());
}

function overlaps(left: Entity, right: Entity): boolean {
  const leftBounds = left.getWorldBounds();
  const rightBounds = right.getWorldBounds();
  return (
    leftBounds.minX < rightBounds.maxX &&
    leftBounds.maxX > rightBounds.minX &&
    leftBounds.minY < rightBounds.maxY &&
    leftBounds.maxY > rightBounds.minY
  );
}

test("single static wall stops X movement", () => {
  const world = makeWorld();
  const mover = makeEntity(world, "dynamic", 100, 100);
  const wall = makeEntity(world, "static", 135, 100);
  mover.vx = 50;

  runCollision(world);

  assert(!overlaps(mover, wall), "mover should not overlap wall");
  assertNear(mover.x, 114.95, 0.001, "mover should stop before wall");
  assertNear(mover.vx, 0, 0.001, "inward X velocity should be clipped");
});

test("single static wall stops Y movement", () => {
  const world = makeWorld();
  const mover = makeEntity(world, "dynamic", 100, 100);
  const wall = makeEntity(world, "static", 100, 135);
  mover.vy = 50;

  runCollision(world);

  assert(!overlaps(mover, wall), "mover should not overlap wall");
  assertNear(mover.y, 114.95, 0.001, "mover should stop before wall");
  assertNear(mover.vy, 0, 0.001, "inward Y velocity should be clipped");
});

test("diagonal movement slides along one static wall", () => {
  const world = makeWorld();
  const mover = makeEntity(world, "dynamic", 100, 100);
  const wall = makeEntity(world, "static", 135, 100);
  mover.vx = 50;
  mover.vy = 20;

  runCollision(world);

  assert(!overlaps(mover, wall), "mover should not overlap wall while sliding");
  assertNear(mover.x, 114.95, 0.001, "mover should stop on blocked axis");
  assertNear(mover.y, 120, 0.001, "mover should keep tangent movement");
});

test("corner contact against two static blockers does not clip", () => {
  const world = makeWorld();
  const mover = makeEntity(world, "dynamic", 100, 100);
  const wallX = makeEntity(world, "static", 135, 100);
  const wallY = makeEntity(world, "static", 100, 135);
  mover.vx = 50;
  mover.vy = 50;

  runCollision(world);

  assert(!overlaps(mover, wallX), "mover should not overlap X blocker");
  assert(!overlaps(mover, wallY), "mover should not overlap Y blocker");
  assertNear(mover.x, 114.95, 0.001, "mover should stop before X blocker");
  assertNear(mover.y, 114.95, 0.001, "mover should stop before Y blocker");
});

test("already-overlapping static start recovers deterministically", () => {
  const world = makeWorld();
  const mover = makeEntity(world, "dynamic", 100, 100);
  const wall = makeEntity(world, "static", 110, 100);

  runCollision(world);

  assert(!overlaps(mover, wall), "mover should recover out of static overlap");
});

test("high-speed movement cannot tunnel through thin static blockers", () => {
  const world = makeWorld();
  const mover = makeEntity(world, "dynamic", 80, 100);
  const wall = makeEntity(world, "static", 170, 100);
  wall.setHitboxProfileRects("default", [makeHitboxRect(6, 120)]);
  mover.vx = 200;

  runCollision(world);

  assert(!overlaps(mover, wall), "mover should not tunnel through thin wall");
  assert(
    mover.getWorldBounds().maxX <= wall.getWorldBounds().minX,
    "mover should remain before the wall",
  );
});

test("dynamic-vs-dynamic softly separates", () => {
  const world = makeWorld();
  const left = makeEntity(world, "dynamic", 100, 100);
  const right = makeEntity(world, "dynamic", 110, 100);

  runCollision(world);

  assert(
    left.x < 100 && right.x > 110,
    "dynamic entities should move apart",
  );
  assertNear(left.x, 96.25, 0.001, "left dynamic should move scaled correction");
  assertNear(
    right.x,
    113.75,
    0.001,
    "right dynamic should move scaled correction",
  );
  assert(
    Math.abs(left.x - 100) <=
      world.gameConfig.collision.maxDynamicCorrectionPerTick,
    "left correction should stay within max per tick",
  );
  assert(
    Math.abs(right.x - 110) <=
      world.gameConfig.collision.maxDynamicCorrectionPerTick,
    "right correction should stay within max per tick",
  );
});

test("dynamic correction clamps per tick", () => {
  const world = makeWorld({
    dynamicSolverIterations: 1,
    dynamicPushScale: 1,
    maxDynamicCorrectionPerTick: 2,
  });
  const left = makeEntity(world, "dynamic", 100, 100);
  const right = makeEntity(world, "dynamic", 108, 100);

  runCollision(world);

  assertNear(left.x, 98, 0.001, "left correction should clamp");
  assertNear(right.x, 110, 0.001, "right correction should clamp");
  assert(
    Math.abs(left.x - 100) <=
      world.gameConfig.collision.maxDynamicCorrectionPerTick,
    "left correction should remain within max per tick",
  );
  assert(
    Math.abs(right.x - 108) <=
      world.gameConfig.collision.maxDynamicCorrectionPerTick,
    "right correction should remain within max per tick",
  );
});

test("dynamic overlap near wall stays wall-safe", () => {
  const world = makeWorld();
  const wall = makeEntity(world, "static", 80, 100);
  const left = makeEntity(world, "dynamic", 100, 100);
  const right = makeEntity(world, "dynamic", 110, 100);

  runCollision(world);

  assert(!overlaps(left, wall), "left dynamic should not overlap wall");
  assertNear(left.x, 100, 0.001, "left dynamic should stay against wall");
  assertNear(
    right.x,
    117.5,
    0.001,
    "right dynamic should receive leftover correction",
  );
});

test("crowd near wall does not penetrate static geometry", () => {
  const world = makeWorld();
  const wall = makeEntity(world, "static", 80, 100);
  const left = makeEntity(world, "dynamic", 100, 100);
  const mid = makeEntity(world, "dynamic", 110, 100);
  const right = makeEntity(world, "dynamic", 120, 100);

  runCollision(world);

  assert(!overlaps(left, wall), "left should not overlap wall");
  assert(!overlaps(mid, wall), "mid should not overlap wall");
  assert(!overlaps(right, wall), "right should not overlap wall");
});

test("mergeable item entities do not dynamically separate", () => {
  const world = makeWorld();
  const left = new CollisionTestItemEntity(world.allocEntityId());
  const right = new CollisionTestItemEntity(world.allocEntityId());
  left.x = 100;
  left.y = 100;
  right.x = 110;
  right.y = 100;
  world.spawn(left);
  world.spawn(right);

  runCollision(world);

  assert(overlaps(left, right), "mergeable item entities should not separate");
});

test("world bounds clamp dynamic entities", () => {
  const world = makeWorld();
  const mover = makeEntity(world, "dynamic", 15, 15);
  mover.vx = -50;
  mover.vy = -50;

  runCollision(world);

  assertNear(mover.getWorldBounds().minX, 0, 0.001, "min X should clamp");
  assertNear(mover.getWorldBounds().minY, 0, 0.001, "min Y should clamp");
  assertNear(mover.vx, 0, 0.001, "outward X velocity should be clipped");
  assertNear(mover.vy, 0, 0.001, "outward Y velocity should be clipped");
});

for (const testCase of tests) {
  testCase.run();
  console.log(`ok - ${testCase.name}`);
}

console.log(`collision validation passed (${tests.length} tests)`);
