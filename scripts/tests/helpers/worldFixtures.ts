import { GameConfig } from "@shared/config/GameConfig.ts";
import type { NetworkServerLike } from "@server/net/NetworkServerLike.ts";
import { bootstrapTypeRegistries } from "@server/registry/bootstrap.ts";
import { GameInstanceRuntime } from "@server/server/matchmaking/GameInstanceRuntime.ts";
import { Wall } from "@server/entities/buildings/Wall.ts";
import { Drifter } from "@server/entities/enemies/Drifter.ts";
import { Megaknight } from "@server/entities/enemies/Megaknight.ts";
import { Police } from "@server/entities/enemies/Police.ts";
import { Saboteur } from "@server/entities/enemies/Saboteur.ts";
import { Shoota } from "@server/entities/enemies/Shoota.ts";
import { Wallbreaker } from "@server/entities/enemies/Wallbreaker.ts";
import { Player } from "@server/entities/Player.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { FakeNetworkServer } from "@tests/helpers/fakeNetwork.ts";

export type TestConfigOverrides = {
  worldSize?: Partial<GameConfig["worldSize"]>;
  collision?: Partial<GameConfig["collision"]>;
  interpolation?: Partial<GameConfig["interpolation"]>;
  replication?: Partial<GameConfig["replication"]>;
  debug?: Partial<GameConfig["debug"]>;
  dayNight?: Partial<GameConfig["dayNight"]>;
  tickRate?: GameConfig["tickRate"];
};

export function bootstrapTestRegistries(): void {
  bootstrapTypeRegistries();
}

export function makeTestConfig(
  overrides: TestConfigOverrides = {},
): GameConfig {
  const config = new GameConfig();
  config.debug.spawnMultiplier = 0;
  if (overrides.tickRate !== undefined) {
    config.tickRate = overrides.tickRate;
  }
  if (overrides.worldSize) {
    config.worldSize = { ...config.worldSize, ...overrides.worldSize };
  }
  if (overrides.collision) {
    config.collision = { ...config.collision, ...overrides.collision };
  }
  if (overrides.interpolation) {
    config.interpolation = {
      ...config.interpolation,
      ...overrides.interpolation,
    };
  }
  if (overrides.replication) {
    config.replication = { ...config.replication, ...overrides.replication };
  }
  if (overrides.debug) {
    config.debug = { ...config.debug, ...overrides.debug };
  }
  if (overrides.dayNight) {
    config.dayNight = { ...config.dayNight, ...overrides.dayNight };
  }
  return config;
}

export function makeRuntime(overrides?: {
  config?: TestConfigOverrides;
  network?: undefined;
}): { runtime: GameInstanceRuntime; network: FakeNetworkServer };
export function makeRuntime(overrides: {
  config?: TestConfigOverrides;
  network: NetworkServerLike;
}): { runtime: GameInstanceRuntime; network: NetworkServerLike };
export function makeRuntime(
  overrides: {
    config?: TestConfigOverrides;
    network?: NetworkServerLike;
  } = {},
): { runtime: GameInstanceRuntime; network: NetworkServerLike } {
  const network = overrides.network ?? new FakeNetworkServer();
  const runtime = new GameInstanceRuntime(
    makeTestConfig(overrides.config),
    network,
  );
  return { runtime, network };
}

export function connectTestClient(
  runtime: GameInstanceRuntime,
  clientId: string = "client-1",
  name = "test-client",
): { player: Player; playerId: number } {
  const playerId = runtime.connectReadyClient(clientId, name);
  const player = runtime.world.get<Player>(playerId);
  if (!player) {
    throw new Error("expected connected player");
  }
  return { player, playerId };
}

export function spawnWall(
  runtime: GameInstanceRuntime,
  x: number,
  y: number,
  options: { tier?: number; ownerId?: number } = {},
): Wall {
  const wall = new Wall(
    runtime.world.allocEntityId(),
    options.tier ?? 1,
    options.ownerId,
  );
  wall.x = x;
  wall.y = y;
  runtime.world.spawn(wall);
  return wall;
}

export type EnemyTypeName =
  | "drifter"
  | "megaknight"
  | "police"
  | "saboteur"
  | "shoota"
  | "wallbreaker";

const ENEMY_CTORS: Record<EnemyTypeName, new (id: number) => Entity> = {
  drifter: Drifter,
  megaknight: Megaknight,
  police: Police,
  saboteur: Saboteur,
  shoota: Shoota,
  wallbreaker: Wallbreaker,
};

export function spawnEnemy(
  runtime: GameInstanceRuntime,
  type: EnemyTypeName,
  x: number,
  y: number,
): Entity {
  const ctor = ENEMY_CTORS[type];
  const enemy = new ctor(runtime.world.allocEntityId());
  enemy.x = x;
  enemy.y = y;
  runtime.world.spawn(enemy);
  return enemy;
}

export function spawnPlayerLikeDynamic(
  runtime: GameInstanceRuntime,
  x: number,
  y: number,
): Player {
  const player = new Player(runtime.world.allocEntityId(), "test-player");
  player.x = x;
  player.y = y;
  runtime.world.spawn(player);
  return player;
}

export function tick(
  runtime: GameInstanceRuntime,
  count: number,
  beforeEachTick?: (tick: number) => void,
): void {
  for (let index = 0; index < count; index += 1) {
    beforeEachTick?.(runtime.world.tick);
    runtime.tick();
  }
}
