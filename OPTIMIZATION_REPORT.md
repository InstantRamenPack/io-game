# Optimization implementation and validation

The audited changes preserve the existing entity, item, goal, world, and renderer
class boundaries. They do not introduce an ECS or replace the snapshot protocol.

## Audit disposition

| Finding                            | Implementation                                                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Lifetime bookkeeping            | Clear per-query sparse markers and remove despawned IDs from simulation/spatial bookkeeping. Entity IDs remain unrecycled.                        |
| 2. Scenery AI overhead             | `Structure` extends `Entity`; scenery no longer allocates empty goal machinery.                                                                   |
| 3. Entity query invalidation       | Invalidate only class views affected by the added, removed, or replaced entity.                                                                   |
| 4. Post-movement scan              | Visit projectiles, the entities that implement post-movement behavior.                                                                            |
| 5. Static renderer synchronization | Skip unchanged scenery while respecting transforms, state versions, dirty state, and transient effects.                                           |
| 6. Minimap redraw                  | Cache the static background separately from dynamic markers.                                                                                      |
| 7. Lighting rebuilds               | Track geometry changes separately; cache unchanged shadow inputs, including resolution.                                                           |
| 8. HUD selections                  | Cache category lists by membership version; reuse the nearest-chest query.                                                                        |
| 9. Renderer allocations            | Allocate equipment and applicable health bars lazily.                                                                                             |
| 10. Spatial/collision work         | Deduplicate moved-entity synchronization and reuse the active simulation list.                                                                    |
| 11. Failed navigation searches     | Bound failed-path caching, retry after ten ticks, and invalidate on geometry changes.                                                             |
| 12. Observer encoding              | Encode the shared observer preview once per tick.                                                                                                 |
| 13. Snapshot recovery overhead     | Intentionally retain four full-entity recovery sends and the 600-tick refresh; add loss-recovery regressions.                                     |
| 14. Generated content              | Remove duplicate build preparation, avoid rewriting unchanged output, and require explicit scaffolding.                                           |
| 15. Weapon boilerplate             | Resolve shared content defaults in melee base classes; retain named weapon subclasses and special effects.                                        |
| 16. Redundant types/casts          | Reuse Entity's contract for goal actors and correctly type building/tower snapshots.                                                              |
| 17. World-generation complexity    | Extract dungeon/shared geometry; use a spatial broad phase for accepted static spawns without changing exact overlap checks.                      |
| 18. Dead code                      | Remove no-op loot refresh, unused entity views, and a forwarding structure class.                                                                 |
| 19. Benchmark accuracy             | Move fake-network decoding outside timed server work, label interpolation-only measurements honestly, and add a real-browser rendering benchmark. |

Browser testing also exposed a lost lobby transition that could leave the UI stuck.
Unchanged lobby state now refreshes every five seconds, with clock-correction and
per-client regression coverage.

## Verification

- Formatting, typecheck, production build, and all **683 tests** passed.
- Protocol/netcode suites and compression, AOI, collision, and pathfinding benchmark
  budgets passed. The realistic optimization scenario also passed its budgets.
- Deterministic interpolation traces match the baseline exactly across **20, 10,
  5, and 2 TPS**, each with perfect, mild, and bad network profiles. Added checks
  cover motion continuity, bounded steps, and packet-loss recovery.
- Baseline/current optimization runs emitted identical network report fields.
  Four seeded world layouts also remained identical.
- A real browser ran full-match day/night scenes, including camera movement, at
  **5 TPS with the bad-network profile**, without browser errors. CPU frame work
  averaged about **4–5 ms**. SwiftShader software rendering limits this result:
  it does not establish normal-GPU FPS or an isolated GPU speedup.

Repeated server comparisons were noisy: median mean tick time improved about 5%,
but median p95 worsened about 6%. These measurements do **not** establish a reliable
overall speedup. The changes remove identified repeated work and allocations;
hardware profiling remains necessary for end-to-end performance claims. The build
still reports its existing large-client-chunk warning.

The browser benchmark is `scripts/benchmarks/browser-rendering.benchmark.js`; its
header documents invocation and result polling. Existing package benchmark commands
remain the reproducible server regression surfaces.
