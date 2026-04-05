# Wave Spawning System

The wave spawning mechanic automatically spawns waves of enemies at the start of each night cycle according to a JSON configuration file.

## Overview

The wave spawning system consists of three main components:

1. **WaveSpawner** (`WaveSpawner.ts`) - The core class that manages wave spawning logic
2. **DayNightSystemWithWaves** (`DayNightSystemWithWaves.ts`) - Extended day/night system that triggers wave spawns
3. **waves.json** - Configuration file defining waves for each night cycle

## Configuration Format

The `waves.json` file defines waves for each night cycle. Here's the structure:

```json
{
  "waves": [
    {
      "nightCycle": 1,
      "spawns": [
        {
          "entityType": "drifter",
          "x": 1500,
          "y": 500,
          "delayTicks": 0,
          "count": 3
        },
        {
          "entityType": "shoota",
          "x": 1500,
          "y": 2500,
          "delayTicks": 60,
          "count": 2
        }
      ]
    }
  ]
}
```

### Wave Configuration Properties

- **nightCycle** (number): Which night this wave belongs to (1-indexed)
- **spawns** (array): List of spawn events for this night

### Spawn Configuration Properties

- **entityType** (string): Resource name of the entity to spawn (e.g., "drifter", "shoota", "bomber")
- **x** (number): X coordinate for spawn location
- **y** (number): Y coordinate for spawn location
- **delayTicks** (number): Ticks to wait before spawning (0 = immediately at night start)
- **count** (number): Number of entities to spawn at this location

## Available Entity Types

These entity types can be spawned (based on registered enemies):
- `drifter` - Basic melee zombie
- `shoota` - Ranged attacker
- `bomber` - Explosive enemy
- `police` - Tough ranged enemy
- `megaknight` - Boss-tier enemy
- `wallbreaker` - Structure-destroying enemy
- `saboteur` - Special enemy type

## Usage

### Setup in World or GameServer

To integrate wave spawning into your game:

```typescript
import { WaveSpawner } from "@server/systems/WaveSpawner.ts";
import { DayNightSystemWithWaves } from "@server/systems/DayNightSystemWithWaves.ts";

// In GameServer constructor or where you initialize systems:

// Load the wave configuration
const configPath = "./apps/server/src/config/waves.json";
const waveSpawner = WaveSpawner.loadFromFile(configPath);

// Replace the standard DayNightSystem with the extended version
world.dayNightSystem = new DayNightSystemWithWaves({
  tickRate: gameConfig.tickRate,
  dayDurationMs: gameConfig.dayNight.dayDurationMs,
  nightDurationMs: gameConfig.dayNight.nightDurationMs,
  waveSpawner: waveSpawner,
});
```

### Manual Wave Spawner Usage

You can also use WaveSpawner independently:

```typescript
const waveSpawner = new WaveSpawner(wavesConfig);

// When night starts
waveSpawner.onNightStart(nightCycleNumber);

// Each tick
waveSpawner.update(world, isNight);
```

## How It Works

1. **Night Transition**: When the day/night cycle transitions from day to night, `DayNightSystemWithWaves` calls `waveSpawner.onNightStart()` with the current night cycle number.

2. **Queue Spawns**: The wave spawner looks up the configuration for that night cycle and queues all spawns with their respective delays.

3. **Delayed Spawning**: Each tick during night, the spawner decrements timers for each queued spawn. When a timer reaches 0, the entities are spawned.

4. **Entity Placement**: Entities are spawned at configured locations with slight random offsets (±20 units) to avoid perfect overlap, and are clamped to world bounds.

## Debugging

To check pending spawns during a night:

```typescript
const details = waveSpawner.getPendingSpawnDetails();
console.log("Pending spawns:", details);
// Output: [
//   { entityType: "drifter", count: 3, ticksRemaining: 45 },
//   { entityType: "shoota", count: 2, ticksRemaining: 15 }
// ]
```

## Example Configurations

### Simple Wave
```json
{
  "nightCycle": 1,
  "spawns": [
    {
      "entityType": "drifter",
      "x": 1500,
      "y": 1500,
      "delayTicks": 0,
      "count": 5
    }
  ]
}
```

### Staggered Wave
```json
{
  "nightCycle": 1,
  "spawns": [
    {
      "entityType": "drifter",
      "x": 500,
      "y": 1500,
      "delayTicks": 0,
      "count": 3
    },
    {
      "entityType": "drifter",
      "x": 2500,
      "y": 1500,
      "delayTicks": 30,
      "count": 3
    },
    {
      "entityType": "shoota",
      "x": 1500,
      "y": 500,
      "delayTicks": 60,
      "count": 2
    }
  ]
}
```

### Boss Wave
```json
{
  "nightCycle": 5,
  "spawns": [
    {
      "entityType": "megaknight",
      "x": 1500,
      "y": 1500,
      "delayTicks": 0,
      "count": 1
    },
    {
      "entityType": "drifter",
      "x": 1000,
      "y": 1500,
      "delayTicks": 0,
      "count": 6
    },
    {
      "entityType": "police",
      "x": 2000,
      "y": 1500,
      "delayTicks": 30,
      "count": 3
    }
  ]
}
```

## Notes

- Night cycles are 1-indexed (first night = cycle 1)
- Spawn delays are in ticks (not milliseconds)
- If no wave is configured for a night cycle, no entities spawn
- The system handles missing entity types gracefully with a warning log
- Entities are randomly offset slightly to prevent perfect overlap at spawn locations
