# 100 TPS Optimization Report

Created: 2026-04-30

## Scope

- `scripts/optimization.test.ts` now defaults to a 1000-enemy `mixed-trio` stress case, spawning saboteurs, drifters, and bombers round-robin.
- Optimization and benchmark thresholds now enforce the 100 TPS throughput target as average server tick <= 10ms, with p95 bounded at <= 20ms for jitter/headroom.
- `bun run benchmark:all`, `bun test`, `bun run typecheck`, and `bun run lint` pass on the final source tree.

## Final Optimization Test

`bun test` final run:

| Metric                |     Final |
| --------------------- | --------: |
| Server TPS            |    144.26 |
| Server average tick   |    6.93ms |
| Server p95 tick       |    9.52ms |
| Stable server ticks   |    97.00% |
| World p95             |    6.27ms |
| Enemy p95             |    5.17ms |
| Collision p95         |    0.82ms |
| Snapshot + send p95   |    3.75ms |
| Path requests         |      5173 |
| Path searches         |       653 |
| Path cache hit        |    87.38% |
| Client p95            |    0.16ms |
| Full snapshots        |   2 / 360 |
| Network average bytes | 125238.77 |

## Before / After Gains

Baseline is the first 1000-enemy mixed-trio run after changing the scenario but before the optimization pass.

| Surface               |    Before |     After |    Gain |
| --------------------- | --------: | --------: | ------: |
| Server TPS            |     21.66 |    142.14 | +556.2% |
| Average server tick   |   46.16ms |    7.03ms |  -84.8% |
| Server p95 tick       |   60.75ms |    9.53ms |  -84.3% |
| Enemy p95             |   32.21ms |    5.66ms |  -82.4% |
| Collision p95         |   18.74ms |    0.80ms |  -95.7% |
| Snapshot + send p95   |    8.52ms |    3.62ms |  -57.5% |
| Network average bytes | 355698.13 | 125238.77 |  -64.8% |
| Full snapshots        | 360 / 360 |   2 / 360 |  -99.4% |
| Long-run heap growth  |  529.31MB |    9.27MB |  -98.2% |

## Complexity Changes

| Area                     | Before                                                                              | After                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Enemy target acquisition | `O(E * spatial bucket occupants)` in dense enemy buckets                            | `O(E / k * P)` for player-targeting hordes, where `P <= 64` and `k` is the adaptive goal interval          |
| Enemy goal work          | `O(E)` every tick                                                                   | `O(E / k)` for hordes, while small fights stay `O(E)`                                                      |
| Dynamic enemy collisions | Exact enemy/enemy pair separation across local density                              | Exact dynamic resolution is kept for player/non-enemy interactions; enemy/enemy body separation is skipped |
| Static geometry queries  | Query all spatial candidates, filter static entities, rebuild hitboxes per consumer | Query cached static blockers as `O(cells + blockers)` from one shared static-geometry index                |
| Path cache keys          | String formatting per request                                                       | Numeric key from start and goal tile indices                                                               |
| Snapshot pressure        | 1000 changed entities forced full snapshots every tick                              | Delta path covers the large horde case; full snapshots occur only at startup/resync                        |
| Benchmark capture        | Retained/parsing snapshot JSON, growing with total bytes                            | Retains numeric summaries, `O(samples)` heap                                                               |

## Final Benchmark Suite

`bun run benchmark:all` final run passed in 14.00s.

| Benchmark                     | Average |     p95 | Key bound                |
| ----------------------------- | ------: | ------: | ------------------------ |
| network-aoi                   |  7.28ms | 11.62ms | avg <= 10ms, p95 <= 20ms |
| dense-police                  |  3.40ms |  4.68ms | avg <= 10ms, p95 <= 20ms |
| mixed-wave                    |  1.52ms |  2.32ms | avg <= 10ms, p95 <= 20ms |
| static-heavy                  |  4.69ms |  8.82ms | avg <= 10ms, p95 <= 20ms |
| projectile-heavy              |  1.31ms |  3.23ms | avg <= 10ms, p95 <= 20ms |
| pathfinding                   |  3.83ms |  5.53ms | avg <= 10ms, p95 <= 20ms |
| collision                     |  5.54ms |  7.68ms | avg <= 10ms, p95 <= 20ms |
| combat-burst                  |  3.11ms |  6.28ms | avg <= 10ms, p95 <= 20ms |
| long-run                      |  2.01ms |  3.49ms | heap growth 9.27MB       |
| multiplayer-scale, 64 clients |  7.43ms |  9.10ms | avg <= 10ms, p95 <= 20ms |

## Behavior Notes

- Small encounters keep per-tick enemy goals; adaptive horde throttling only starts at larger enemy counts.
- Static collision, projectile blocking, pathfinding blockers, and placement validity now share the same static geometry semantics.
- Enemy-vs-enemy body separation is no longer an authoritative server cost in dense hordes; player/static collision, attacks, pickups, and projectile impacts remain authoritative.
- Focused trace remains available, but its default config no longer enables expensive trace bookkeeping.
- Player spawn/respawn now uses one shared spawn helper that avoids the map-center recycler overlap.
