# Wave Spawning System - Implementation Summary

## What Was Created

I've implemented a complete wave spawning mechanic for your io-game that spawns enemy waves at the start of each night cycle. Here's what was added:

### 1. **WaveSpawner Class** (`apps/server/src/systems/WaveSpawner.ts`)
   - Core class that manages wave spawning logic
   - Loads wave configurations from JSON
   - Handles delayed entity spawning with tick-based timing
   - Provides debugging methods for monitoring pending spawns
   - Automatically positions entities with slight randomization to prevent overlap
   - **Key Methods:**
     - `constructor(wavesConfig)` - Create with loaded config
     - `loadFromFile(path)` - Static method to load from JSON
     - `onNightStart(nightCycle)` - Called when night begins to queue spawns
     - `update(world, isNight)` - Called each tick to process spawns
     - `getPendingSpawnDetails()` - Debug method to view queued spawns

### 2. **DayNightSystemWithWaves Class** (`apps/server/src/systems/DayNightSystemWithWaves.ts`)
   - Extends the base `DayNightSystem` to integrate wave spawning
   - Automatically detects night transitions and triggers wave spawns
   - Manages the wave spawner lifecycle
   - **Key Features:**
     - Tracks night cycle count (1-indexed)
     - Notifies WaveSpawner on night transitions
     - Updates wave spawner each tick
     - Can be injected with a WaveSpawner or set via `setWaveSpawner()`

### 3. **Wave Configuration File** (`apps/server/src/config/waves.json`)
   - JSON file defining waves for each night cycle
   - Includes example waves for nights 1-3
   - Each wave specifies:
     - Entity types to spawn (drifter, shoota, bomber, police, megaknight, wallbreaker, saboteur)
     - Spawn positions (x, y coordinates)
     - Spawn delays (in ticks)
     - Entity counts per spawn

### 4. **Documentation**
   - **[WAVE_SPAWNING.md](WAVE_SPAWNING.md)** - Complete usage guide with examples
   - **[WAVE_SPAWNING_INTEGRATION.md](WAVE_SPAWNING_INTEGRATION.md)** - Integration instructions

## How to Integrate

### Option 1: Automatic Integration (Recommended)

Modify your `GameServer.ts` and `World.ts` as shown in [WAVE_SPAWNING_INTEGRATION.md](WAVE_SPAWNING_INTEGRATION.md):

1. **In World.ts**: Replace `DayNightSystem` with `DayNightSystemWithWaves`
2. **In GameServer.ts**: Load the wave configuration and attach it to the day/night system

### Option 2: Manual Integration

```typescript
import { WaveSpawner } from "@server/systems/WaveSpawner.ts";
import { DayNightSystemWithWaves } from "@server/systems/DayNightSystemWithWaves.ts";

// Load config
const spawner = WaveSpawner.loadFromFile("./apps/server/src/config/waves.json");

// Create extended system
const dnSystem = new DayNightSystemWithWaves({
  tickRate: config.tickRate,
  dayDurationMs: config.dayNight.dayDurationMs,
  nightDurationMs: config.dayNight.nightDurationMs,
  waveSpawner: spawner,
});

// Use in world
world.dayNightSystem = dnSystem;
```

## Configuration

Edit `waves.json` to define your own waves:

```json
{
  "waves": [
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
  ]
}
```

## Available Entity Types

- `drifter` - Basic melee zombie
- `shoota` - Ranged attacker
- `bomber` - Explosive enemy
- `police` - Tough ranged enemy
- `megaknight` - Boss-tier enemy
- `wallbreaker` - Structure-destroying enemy
- `saboteur` - Special enemy type

## Features

✅ **JSON-Based Configuration** - Easy to modify waves without code changes
✅ **Tick-Based Delays** - Precise timing independent of frame rate
✅ **Night Cycle Integration** - Automatically syncs with day/night system
✅ **Spawn Randomization** - Slight position variance to prevent overlaps
✅ **World Bounds Clamping** - Entities spawn within valid world area
✅ **Registry Lookup** - Works with your existing entity registration system
✅ **Debug Methods** - Monitor pending spawns and their timing
✅ **Error Handling** - Graceful warnings for missing entity types

## Example Wave Patterns

### Progressive Difficulty
```json
{
  "nightCycle": 1,
  "spawns": [
    { "entityType": "drifter", "x": 1500, "y": 1500, "delayTicks": 0, "count": 3 }
  ]
},
{
  "nightCycle": 2,
  "spawns": [
    { "entityType": "drifter", "x": 1500, "y": 1500, "delayTicks": 0, "count": 5 },
    { "entityType": "shoota", "x": 1500, "y": 1500, "delayTicks": 30, "count": 2 }
  ]
},
{
  "nightCycle": 3,
  "spawns": [
    { "entityType": "megaknight", "x": 1500, "y": 1500, "delayTicks": 0, "count": 1 },
    { "entityType": "drifter", "x": 1000, "y": 1500, "delayTicks": 0, "count": 6 }
  ]
}
```

### Multi-Point Spawn
```json
{
  "nightCycle": 1,
  "spawns": [
    { "entityType": "drifter", "x": 500, "y": 1500, "delayTicks": 0, "count": 3 },
    { "entityType": "drifter", "x": 2500, "y": 1500, "delayTicks": 0, "count": 3 },
    { "entityType": "shoota", "x": 1500, "y": 500, "delayTicks": 30, "count": 2 },
    { "entityType": "shoota", "x": 1500, "y": 2500, "delayTicks": 30, "count": 2 }
  ]
}
```

## Files Created

```
apps/server/src/systems/WaveSpawner.ts
apps/server/src/systems/DayNightSystemWithWaves.ts
apps/server/src/config/waves.json
WAVE_SPAWNING.md
WAVE_SPAWNING_INTEGRATION.md
```

## Next Steps

1. Review the configuration in `waves.json` and customize for your game design
2. Follow the integration steps in [WAVE_SPAWNING_INTEGRATION.md](WAVE_SPAWNING_INTEGRATION.md)
3. Test by running a server and monitoring the night cycle
4. Use `waveSpawner.getPendingSpawnDetails()` for debugging

## Notes

- Night cycles are 1-indexed (first night = 1)
- Spawn delays are in ticks (not milliseconds) - divide by server tickRate to get seconds
- Entities spawn with slight random offsets (±20 units) to prevent perfect overlap
- If no wave is configured for a night, no entities spawn during that night
- The system handles missing entity types gracefully with console warnings

---

For detailed configuration examples and usage patterns, see [WAVE_SPAWNING.md](WAVE_SPAWNING.md).
