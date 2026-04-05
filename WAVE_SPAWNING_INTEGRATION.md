/**
 * INTEGRATION EXAMPLE: How to add wave spawning to your GameServer
 * 
 * This file shows the modifications needed to integrate the wave spawning system.
 * You need to modify two parts:
 * 
 * 1. Modify World.ts constructor to support DayNightSystemWithWaves
 * 2. Modify GameServer.ts to initialize the wave spawner
 */

// ============================================================================
// STEP 1: Modify World.ts
// ============================================================================
// 
// In the World constructor, replace the DayNightSystem initialization with:
//
// BEFORE:
// ```
// this.dayNightSystem = new DayNightSystem({
//   tickRate: gameConfig.tickRate,
//   dayDurationMs: gameConfig.dayNight.dayDurationMs,
//   nightDurationMs: gameConfig.dayNight.nightDurationMs,
// });
// ```
//
// AFTER:
// ```
// this.dayNightSystem = new DayNightSystemWithWaves({
//   tickRate: gameConfig.tickRate,
//   dayDurationMs: gameConfig.dayNight.dayDurationMs,
//   nightDurationMs: gameConfig.dayNight.nightDurationMs,
// });
// ```
//
// And add this import:
// ```
// import { DayNightSystemWithWaves } from "@server/systems/DayNightSystemWithWaves.ts";
// ```

// ============================================================================
// STEP 2: Modify GameServer.ts constructor
// ============================================================================
//
// After creating the world, initialize the wave spawner:
//
// ```typescript
// import { WaveSpawner } from "@server/systems/WaveSpawner.ts";
// import { DayNightSystemWithWaves } from "@server/systems/DayNightSystemWithWaves.ts";
// 
// // In GameServer constructor, after: this.world = new World(gameConfig);
// 
// // Initialize wave spawning
// try {
//   const configPath = "./apps/server/src/config/waves.json";
//   const waveSpawner = WaveSpawner.loadFromFile(configPath);
//   
//   if (this.world.dayNightSystem instanceof DayNightSystemWithWaves) {
//     this.world.dayNightSystem.setWaveSpawner(waveSpawner);
//   } else {
//     console.warn("Wave spawner loaded but DayNightSystemWithWaves not in use");
//   }
// } catch (error) {
//   console.error("Failed to initialize wave spawning:", error);
// }
// ```

// ============================================================================
// EXAMPLE: Complete Modified GameServer Constructor Section
// ============================================================================

/*
import type { GameConfig } from "@shared/config/GameConfig.ts";
import { WaveSpawner } from "@server/systems/WaveSpawner.ts";
import { DayNightSystemWithWaves } from "@server/systems/DayNightSystemWithWaves.ts";
// ... other imports ...

export class GameServer {
  constructor(
    gameConfig: GameConfig,
    networkServer: WsServer,
    authService: AuthService,
  ) {
    bootstrapTypeRegistries();
    this.gameConfig = gameConfig;
    this.networkServer = networkServer;
    this.authService = authService;
    this.world = new World(gameConfig);
    
    // Initialize wave spawning system
    try {
      const configPath = "./apps/server/src/config/waves.json";
      const waveSpawner = WaveSpawner.loadFromFile(configPath);
      
      if (this.world.dayNightSystem instanceof DayNightSystemWithWaves) {
        (this.world.dayNightSystem as DayNightSystemWithWaves).setWaveSpawner(waveSpawner);
        console.log("Wave spawning initialized successfully");
      }
    } catch (error) {
      console.error("Failed to initialize wave spawning:", error);
      // Game continues without wave spawning
    }
    
    // ... rest of constructor ...
  }
}
*/

// ============================================================================
// CONFIGURATION
// ============================================================================
//
// The wave configuration is in: apps/server/src/config/waves.json
// 
// You can edit this file to define waves for each night cycle.
// See WAVE_SPAWNING.md for detailed configuration documentation.

// ============================================================================
// TESTING WITHOUT MODIFICATIONS
// ============================================================================
//
// You can test the WaveSpawner independently without modifying GameServer:
//
// ```typescript
// import { WaveSpawner } from "@server/systems/WaveSpawner.ts";
// import type { WavesConfigFile, NightWaveConfig } from "@server/systems/WaveSpawner.ts";
//
// const config: WavesConfigFile = {
//   waves: [
//     {
//       nightCycle: 1,
//       spawns: [
//         {
//           entityType: "drifter",
//           x: 1500,
//           y: 1500,
//           delayTicks: 0,
//           count: 3,
//         },
//       ],
//     },
//   ],
// };
//
// const spawner = new WaveSpawner(config);
// spawner.onNightStart(1);
// spawner.update(world, true);
// ```
