# io-game Reconstruction Specification

Status: reconstruction contract  
Source snapshot: `InstantRamenPack/io-game` commit
`93a28a952b0ff28daeb34e5c319815e3f05d753a` (2026-07-17)  
Specification date: 2026-07-25

Audit coverage: all 692 tracked files (10 root/tooling, 173 server, 210 client,
201 shared, 98 scripts) plus seven generated server registries and one
generated client renderer registry. The audit covered 25,541 server TypeScript
lines, 134 client source modules, all 74 public PNGs, 299 shared/script files,
all 80 test files, and all 13 benchmark/tooling files.

## 1. Purpose and acceptance contract

This document is the only source material provided to the clean-room
implementation. Recreate a browser-playable, server-authoritative,
multiplayer top-down survival/extraction game with the mechanics, balance,
protocol behavior, and visual character specified below. Implementation names
and internal architecture may differ. Observable behavior, content statistics,
deterministic generation, authority boundaries, and performance gates may not.

`MUST`, `SHOULD`, and `MAY` are normative:

- `MUST`: required for acceptance.
- `SHOULD`: expected unless a documented, tested alternative preserves the
  same result.
- `MAY`: implementation choice.

The reconstruction is complete only when all of these are true:

1. A production server and browser client start from documented commands.
2. The complete gameplay loop works: join, lobby, exploration, looting,
   crafting, building, day/night waves, infrastructure failure/repair,
   legendary encounters, team extraction or team defeat, and replay.
3. Every content family and exact statistic in this document is implemented.
4. The server remains authoritative for movement, combat, inventory, crafting,
   building, pickups, repair, death, respawn, lobby, and extraction.
5. Unit, integration, protocol, deterministic simulation, browser end-to-end,
   and performance tests cover the acceptance matrix in this document.
6. The TPS benchmark satisfies the hard 2x gate in section 2 without reducing
   simulated work, entity counts, clients, snapshot cadence, or rules.
7. Accessibility basics are preserved: semantic controls, keyboard operation
   for join/chat/game actions, labels, focus safety, readable contrast, and
   reduced-motion-safe UI behavior.

## 2. Critical performance requirement: at least 2x TPS

### 2.1 Metric

The primary metric is **effective server TPS**:

```text
effective_tps = 1000 / arithmetic_mean(measured_runtime_tick_ms)
```

Measure only the synchronous authoritative `runtime.tick()` call, including
world simulation, entity/AI/effect ticks, collision, navigation work,
snapshot construction, binary encoding, and calls to the in-memory network
sink. Do not include intentional wall-clock sleeping by the production tick
clock, process startup, world construction, client-side interpolation, or the
warmup period.

### 2.2 Frozen baseline

The source snapshot was measured on:

- CPU: Intel Xeon w9-3475X, Linux x86-64, one process pinned to logical CPU 2
- kernel: Linux 5.15.0-179-generic
- CPU driver/governor: `intel_pstate` / `powersave`
- runtime: Bun `1.3.8+b64edcb49`
- command shape:
  `taskset -c 2 bun run benchmark:optimization --json <run.json>`

Frozen scenario:

| Parameter | Value |
| --- | ---: |
| world seed | 1337 |
| world dimensions | 12,800 x 12,800 world units |
| sectors / simulated clients | 9 / 9 |
| authored layout enemy spawn specs | 132 |
| enemy multiplier | 5x, including legendary bosses |
| enemies immediately after setup | 660 |
| total entities immediately after setup | 1,042 |
| enemies after warmup + measured ticks | 659 (one bomber is removed by normal simulation) |
| total entities after warmup + measured ticks | 1,041 |
| replication interest radius | 1,440 units |
| warmup | 60 ticks |
| measured sample | 300 ticks |
| benchmark reporting budget / client-frame timeline | 50 TPS |
| authoritative simulation tick rate | 20 TPS |
| input sequence | deterministic pattern in section 2.3 |

Five fresh-process pinned-core baseline runs produced effective TPS:

```text
156.0826, 156.1174, 153.6756, 154.3676, 157.1439
```

Sorted median: **156.0826 TPS**.

The reconstruction MUST achieve:

```text
median effective TPS across five fresh processes >= 312.1653
```

Round only for display; compare unrounded values. The required result is both
`>= 312.1653 TPS` and `>= 2.0 * 156.08261732635165`.

### 2.3 Benchmark workload

The benchmark MUST be checked into the reconstruction and runnable with one
documented command. It MUST:

1. Build the full deterministic procedural match for seed 1337 with normal
   ambient pickup spawning disabled.
2. Set the debug spawn multiplier to zero and replication radius to 1,440.
3. For every one of the 132 normal and legendary layout enemy spawn specs,
   retain the original and add four copies. Give copy `c` (`1..4`) this
   deterministic offset:

   ```text
   hash = int32(seed XOR c)
   for each UTF-16 code unit ch in sector_id:
       hash = imul(hash XOR ch, 0x01000193)
   hash = imul(hash XOR enemy_index, 0x01000193)
   u = uint32(hash)
   angle = (u mod 360) * PI / 180
   magnitude = 16 + ((u >>> 8) mod 17)
   dx = cos(angle) * magnitude
   dy = sin(angle) * magnitude
   ```

4. Connect one ready client at the center of each of the nine sectors. Move
   client `i` on tick `t` with:

   ```text
   phase = (t + 7*i) mod 96
   right = phase < 24
   up    = 24 <= phase < 48
   left  = 48 <= phase < 72
   down  = phase >= 72
   aim_theta = ((i + t) mod 16) * PI/8
   input_seq = t
   client_time_ms = 50*t
   ```

5. Run 60 unmeasured warmup ticks, reset benchmark counters, then measure 300
   consecutive ticks with `performance.now()` around each entire tick.
6. Use an in-memory sink that accepts the actual binary snapshot payload. It
   MUST count payloads and bytes but MUST NOT decode them inside the timed
   server tick. A separate correctness test MUST decode representative full and
   delta snapshots.
7. Fail if the scenario does not have exactly 9 clients and 132 source spawn
   specs, if no binary snapshots are emitted, if required simulation systems
   are disabled, or if deterministic checksums differ between repeated runs.
8. Emit JSON containing all 300 samples; mean, median, p95 and p99 tick
   milliseconds; effective TPS; world/entity/enemy/collision/navigation and
   snapshot/encode timing; entity counts by family; snapshot counts and bytes;
   runtime revision; OS/CPU; git commit; and benchmark parameters.
9. Run five fresh processes pinned to the same logical CPU, sort the five
   effective-TPS values, and gate on their median.

The original benchmark's client/network report showed zero because its capture
sink only parsed legacy string snapshots while the current protocol sends
binary payloads. Those zero values are not valid baselines and MUST NOT be
copied or presented as improvements.

### 2.4 Anti-cheating parity conditions

The 2x result is invalid unless:

- all functional and deterministic tests pass in the same release build;
- scenario entity/client counts and generation checksum match the specified
  workload;
- the same tick systems, AI decisions, collision rules, status effects,
  navigation requests, delta-snapshot decisions, and binary serialization run;
- no benchmark-only gameplay shortcuts or disabled validation are present;
- garbage collection, JIT warmup, logging policy, and environment are disclosed;
- the report includes the five raw values, median, ratio, and machine details.

Changing runtime or hardware is allowed for the product, but the acceptance
comparison MUST run old and new measurements under the frozen Bun 1.3.8
environment above or use the fixed numeric threshold on the same workstation.
On any other host, the same benchmark is diagnostic only: report its raw
numbers, but do not claim the fixed 2x gate has passed.

## 3. Technology and repository-independent constraints

The reference product uses:

- Bun server/runtime and package manager;
- TypeScript with strict checking and ECMAScript modules;
- Vite browser build;
- PixiJS 8 renderer;
- WebSocket transport;
- MessagePack-derived compact binary messages;
- Zod validation for untrusted messages and authored content;
- deterministic seeded generation;
- a small deque dependency for queue-heavy paths.

The clean-room implementation MUST remain TypeScript on Bun for the server and
browser TypeScript for the client; the acceptance benchmark uses Bun 1.3.8.
It MAY replace other libraries or internal organization when browser support,
wire/game behavior, determinism, and performance remain intact. Do not copy
source files or clone the reference repository.

Required production surfaces:

- `GET /healthz` returns a successful health response.
- `GET /runtime-config` returns client-safe connection/runtime configuration.
- `GET /` and static asset paths serve the built client.
- WebSocket upgrades are accepted at `/ws`.
- Optional HTTPS is enabled only when both certificate and key paths are
  supplied; supplying only one MUST fail startup.
- Production bind host defaults to all interfaces; development uses a Vite
  proxy for `/runtime-config`, `/healthz`, and `/ws`.

Reference deployment values:

| Setting | Value |
| --- | --- |
| production Bun version | 1.3.8 |
| production `TICK_RATE` | 20 |
| production `SIMULATION_SPEED_MULTIPLIER` | 1 |
| development server port | 3000 |
| development Vite port | 5173 |
| development Vite host | `0.0.0.0` |
| Vite backend target | `http://127.0.0.1:3000` |
| client output | static `dist` directory with source maps |

Positive-integer port environment variables MUST reject invalid, zero, or
negative values. Gameplay config and content MUST be validated before serving
players; malformed trust-boundary messages MUST fail closed.

## 4. High-level architecture and authority

The game has three conceptual layers:

1. **Shared contract and content**: resource identifiers, strict schemas,
   gameplay rules used for preview and authority, compact protocol, snapshots,
   configuration, and deterministic world layout types.
2. **Authoritative server**: connection/lobby lifecycle, match instances,
   world/entity store, goals/AI, combat/effects, inventory/content adapters,
   simulation systems, collision/navigation/spatial indexes, AOI snapshot
   replication, and anti-cheat validation.
3. **Presentation client**: session UI, input routing, WebSocket client,
   snapshot history/interpolation, Pixi scene/renderers/effects, camera/culling,
   HUD/modal coordinators, and a development debug bridge.

Entity IDs are monotonically allocated replication identities and MUST NOT be
reused during a match. A despawned entity ID may still exist in client history;
reuse can render stale state onto a new entity.

Static geometry has one canonical blocker index consumed by physical
collision, navigation, combat occlusion, projectile impact, and placement.
Gameplay hitboxes and visibility/light blockers remain separate concepts.

Combat target legality and line-of-sight occlusion are separate checks. The
former decides whether team/range/state permits an attack; the latter tests
the segment against canonical static geometry.

Player placement authority is server-side. A client preview SHOULD mirror the
same pure validation rule for immediate feedback, but only the server mutates
the world or inventory.

## 5. Build, quality, and clean-room deliverables

The reconstruction MUST include:

- deterministic dependency lockfile and one-command install;
- development command starting server and client together;
- production client build and production server command;
- strict typecheck;
- content/config generation or validation command if generated registries are
  used;
- one-command unit/integration test suite;
- a separately runnable browser end-to-end suite;
- separately runnable protocol, gameplay, collision, and TPS benchmark suites;
- CI that installs from the lockfile, builds, typechecks, runs all non-browser
  tests, starts the production service for browser tests, and archives benchmark
  JSON;
- concise README with controls, setup, architecture, tests, and benchmark gate.

No benchmark-only alternative implementation is permitted. Generated registries
MAY be used, but missing content/render mappings MUST fail loudly rather than
silently falling back to a generic entity.

The reference snapshot passed strict typecheck, production build, and 649 tests
across 72 test files on Bun 1.3.8. The reconstruction need not preserve that
test count or file layout; it MUST cover every acceptance behavior in section
20 with meaningful unit, integration, and end-to-end assertions.

## 6. Authoritative shared configuration

All authored tick counts in this document assume 20 simulation ticks per
second. When the active server tick rate differs, scale an authored tick count
as `max(1, round(authored_ticks * active_tick_rate / 20))`. Gameplay time
advances at `tick_rate * simulation_speed_multiplier`; wall seconds for a
simulation interval are
`ticks / (tick_rate * simulation_speed_multiplier)`.

`TICK_RATE` (legacy alias `DEBUG_TICK_RATE`) accepts any finite positive number,
including a fraction. `SIMULATION_SPEED_MULTIPLIER` (aliases
`SIMULATION_SPEED`, `DEBUG_SIMULATION_SPEED`) does the same. Invalid supplied
values MUST fail startup, not silently use defaults.

### 6.1 Runtime, collision, replication, and interpolation

| Setting | Exact default |
| --- | ---: |
| tick rate | 20 |
| simulation speed multiplier | 1 |
| world width / height | 12,800 / 12,800 |
| collision spatial cell | 64 |
| dynamic collision solver iterations | 2 |
| dynamic collision push scale | 0.5 |
| maximum dynamic correction per tick | 8 |
| network slot capacity | 64 |
| maximum accepted packet bytes | 16,384 |
| replication interest radius | 1,440 |
| debug spawn multiplier | 1 |
| interpolation snap distance | 192 |
| snapshot history size | 8 |
| tick-duration EWMA smoothing | 0.2 |
| render-delay smoothing | 0.15 |
| render delay | minimum 2, maximum 5 ticks |
| maximum projectile extrapolation | 0.5 tick |
| observed tick duration clamps | 0.7x to 1.4x |
| arrival / jitter EWMA smoothing | 0.12 / 0.12 |
| jitter buffer | `3 * jitter_EWMA + 35 ms` |
| maximum interpolation debug records | 600 |
| correction follow sharpness | 18 |
| correction epsilon | 0.01 |
| correction frame-scale clamp | 0.5 to 2.5 |

Interpolation delay adapts within the two-to-five-tick range. Duplicate and
out-of-order snapshots do not mutate current state. Histories stay bounded.
An alive/dead transition or a position jump beyond the 192-unit snap distance
is a discontinuity and snaps once rather than interpolating across it. A
non-projectile with one frame holds and ordinary delayed sampling extrapolates
at most 0.5 observed tick. A normal damaging projectile instead samples at the
estimated current server tick and may extrapolate through the entire known
arrival gap; a server-delayed/zero-damage projectile uses the bounded delayed
path. The client does not locally predict players: local and remote players
render from authoritative snapshots.

### 6.2 Interaction and inventory limits

| Setting | Exact default |
| --- | ---: |
| hotbar slots | 10 |
| chest slots | 30 |
| build placement maximum distance | 160 |
| crafting-station query radius | 160 |
| crafting-station hitbox padding | 48 |
| chest interaction radius / padding | 160 / 48 |
| recycler interaction padding | 80 |
| tower interaction padding | 80 |
| hold-to-interact duration | 750 ms |
| maximum chat message length | 240 characters |

### 6.3 Match, world, day/night, extraction, and infrastructure

| Setting | Exact default |
| --- | ---: |
| maximum lobby players | 5 |
| start countdown | 10,000 ms |
| lobby code length | 6 |
| day duration | 2,400 ticks (120 s at reference rate) |
| night duration | 1,200 ticks (60 s at reference rate) |
| storm damage / cadence | 0 / 40 ticks |
| fallback home-core bounds | 760 x 520 |
| fallback helipad center/radius | (1,000, 4,050) / 160 |
| extraction enemy-danger radius | 400 |
| required simultaneous boarding | 200 ticks (10 s) |
| legacy chopper timer | 400 ticks (unused by current completion flow) |
| starter-tower offsets from home center | energy `(-217,+125)`, comms `(+217,+125)` |
| outer player-building decay | 400 ticks |
| forest-camp enemy respawn radius | 420 |

Extraction starts available. Destroying the communications tower locks it;
repairing communications restores it. Extraction boarding progresses only
while every living player is simultaneously on the helipad and no blocking
condition applies. Leaving breaks the consecutive 200-tick boarding interval.
Completion is immediate at 200 ticks; the authored 400-tick chopper value is a
legacy unused field. The extraction point and helipad occupy the same protected
procedural BSP leaf.

### 6.4 World-generation frame

| Setting | Exact value |
| --- | ---: |
| default seed | 1337 |
| sector grid | 3 x 3 |
| x/y sector bands | 5,120; 2,560; 5,120 |
| tile size | 16 |
| target villages including extraction settlement | 13 |
| village center margin | x 720, y 560 |
| lobby/preview world | 1,000 x 1,000 |

The required dungeon room-role set is:
`entrance`, `combat`, `enemy_swarm`, `treasure`, `maze`, `trap`, `armory`,
`mini_boss`, and `boss`.

### 6.5 Enemy global tuning

| Setting | Day | Night |
| --- | ---: | ---: |
| melee weapon cooldown multiplier | 2x | 1x |
| ranged damage multiplier | 0.5x | 1x |
| ranged weapon cooldown multiplier | 6x | 3x |
| attack-range multiplier | 0.5x | 0.75x |

Enemy goal level-of-detail begins beyond 1,200 units and evaluates that work
every 6 ticks. Lights-out/night behavior removes the daytime combat
handicaps as specified by the table; enemies must remain dangerous when the
energy tower is down.

### 6.6 Recycling

Recycling is server-authoritative, allowed only near the hub recycler, and
draws an inclusive integer hunk reward from the consumed item's rarity range:

| Rarity | Hunk range |
| --- | ---: |
| common | 10-20 |
| uncommon | 30-50 |
| rare | 40-80 |
| epic | 80-120 |
| legendary | 200-300 |

### 6.7 Random wave schedule

Random waves are enabled. Budget is `6 + 3 * (night_cycle - 1)`. Spawn buckets use
delays `0, 45, 90, 135, 180, 225, 270` ticks and spawn 600-900 units from the
chosen center. The default announcement is
`Wave {nightCycle} approaching! Enemies incoming!`.

Enemy selection weights:

| Enemy | Tier | Weight |
| --- | --- | ---: |
| drifter | common | 6 |
| shoota | common | 4 |
| police | uncommon | 3 |
| ranger | uncommon | 3 |
| bomber | uncommon | 2 |
| saboteur | rare | 2 |
| wallbreaker | rare | 2 |
| stalker | rare | 2 |
| sniper | epic | 1 |
| commander | epic | 1 |
| megaknight | epic | 1 |

Tier floors and permitted tiers:

| Night | Minimum counts by tier | Permitted tiers |
| ---: | --- | --- |
| 1 | common 1 | common |
| 2 | common 2, uncommon 1 | common-uncommon |
| 3 | common 2, uncommon 2, rare 1 | common-rare |
| 4 | common 3, uncommon 2, rare 2 | common-rare |
| 5 | common 3, uncommon 3, rare 2, epic 1 | common-epic |
| 6 | common 4, uncommon 3, rare 3, epic 1 | common-epic |
| 7+ | common 4, uncommon 4, rare 3, epic 3 | common-epic |

Night does not end merely because its timer elapsed: dawn waits until all wave
enemies are dead. A second extraction legendary boss appears on cycle 7. At
dawn, surviving regular layout enemies stay where they are and only half of
vacant/killed regular layout spawn points are repopulated. Dungeon enemies and
legendary bosses are excluded from that refresh. Procedural crates are finite
and never respawn.

## 7. Browser launch, session, lobby, and game-over flow

The client is a full-window top-down multiplayer survival/shooter. Keep one
live canvas mounted for the page lifetime. Before joining, connect that canvas
as a real preview observer and blur it behind a small DOM join modal; a static
fake background is not equivalent. There is no account or authentication flow.

Startup sequence:

1. Resolve required DOM nodes and fail loudly if any is absent.
2. Construct config, network, renderer, HUD, chat, lobby, death, game-over,
   launch, session, and input controllers.
3. Bind keyboard safety handlers immediately.
4. Read the optional name from local storage key `zombs-player-name`.
   First-time input is blank. Persist only a non-empty normalized name.
5. Fetch and strictly parse `/runtime-config`; apply compatibility hash, tick
   rate, simulation speed, world size, and interpolation settings. Failure is
   fatal rather than silently using a client-only default.
6. Initialize the renderer in `#game-root` and connect
   `ws(s)://<current-host>/ws` with preview mode.
7. Query `autoStart=1` may click Play after configuration. Development-only
   network profile and seed may come from query or local storage.

Play uses the native required field, normalizes the name, changes the button to
`Connecting...`, disables it, and sends a normal hello with name and
compatibility hash. Welcome enters play. Socket close or fatal startup error
returns to menu and resets session/HUD state.

Server-side duplicate names are rejected case-insensitively. Client messages:

| Error | Display |
| --- | --- |
| local empty / `name_required` | `Enter a valid name.` |
| `name_taken` | `That name is already in use.` |
| `invalid_name` | `Invalid name. Use 1-20 letters/numbers/spaces.` |

Socket error, compatibility mismatch, server full, invalid/missing name, or
missing hello are fatal connection errors. An ordinary rejected action or chat
error need not tear down the session.

Session modes are `menu`, `connecting`, `playing`, and `dead`. The canvas never
unmounts. Menu/connecting show the modal and blur the world; play/dead hide it.
Chat exists only during gameplay and is pointer-disabled while dead.

Lobby rules:

- Not queued: show no selected code and actions for an open lobby or an
  uppercased/trimmed code.
- Queued and not started: show code, player count out of five, queue age, and
  `Ready when you click Start`, `Waiting for 2 players`, or a ceiling-rounded
  countdown. Only the host can start; countdown disables Start.
- Use server time to compute a local offset and refresh countdown text every
  250 ms.
- Started: hide queue actions and show `CORE | <CODE> | MM:SS`.
- A newly observed `startedAtMs` shows `Game started` for 3 seconds.
- Backquote toggles a development/sector feed and hides the queue HUD while it
  is visible.

Death behavior differs by world:

- Playground/preview practice: show a death card and Respawn button. Respawn
  clears input suppressions and sends an authoritative request.
- Active match: show no respawn card. Display `SPECTATING`, camera-follow the
  server-selected living teammate, and promise respawn at dawn. HUD selectors
  show the spectated player.

Win and loss share a game-over card with duration and waves survived. Win says
`YOUR TEAM ESCAPED`; loss says `YOU WERE OVERWHELMED`. Play Again requests an
open lobby, Return leaves the current lobby, and Home disconnects to the name
menu.

## 8. Input contract and client action behavior

Movement is `WASD` plus arrows. Send only key edges (ignore repeat); keyup sends
release. Window blur releases every held direction and held attack. Suppress
game input when the target is a text input, textarea, select, contenteditable,
or chat. Movement has reference-counted suppression reasons for chat, crafting,
inventory, chest/hub, and death; acquiring one immediately emits releases.

| Input | Exact priority/behavior |
| --- | --- |
| primary pointer down/hold | aim and repeatedly attack unless HUD consumes it |
| pointer move/up/cancel | update aim/drag; up completes drag and stops fire |
| `1`-`9`,`0` | hotbar slots 1-10 |
| `Enter` | craft selection if crafting is open, else open/send chat |
| `/` | open chat seeded with slash |
| `T` | open chat |
| backquote | toggle sector/performance feed |
| `C` | toggle crafting; near hub opens combined hub UI |
| `H` | toggle hotbar-layout inventory; closes hub first |
| `E` | close hub; else explicit nearest pickup; else open nearby hub/chest; else hold to use selected consumable/armor; else pickup request |
| `R` | hold to repair nearby damaged tower; otherwise reload |
| `Q` | drop one selected item |
| `Ctrl+Q` | drop the full selected stack |
| `Escape` | close hub, else close inventory |
| craft Up/Down/Enter | change selection / craft |
| wheel on craft tabs/body | scroll tabs / rows by `deltaY / 240` |
| Shift-click recipe | craft immediately when legal |

Use and repair use the shared 750 ms hold duration. Release cancels; repair
also cancels when range becomes invalid.

Pointer position transforms client coordinates to canvas and world. For the
local displayed weapon, derive aim from viewport center to screen cursor so
server position corrections cannot make it jitter; translate back around the
authoritative local player for the world target. Only primary pointer/button
participates.

Send an input intent immediately on movement/aim change and at least every
100 ms while playing. Aim equality epsilon is `0.0001` radians. Input/actions
use monotonically increasing client sequences; input carries
`performance.now()`. Held attack cadence derives from the selected weapon's
cooldown and effective simulation TPS, and blocks during cooldown, reload, or
empty magazine. Start the local attack animation as soon as a legal action is
sent without applying authoritative damage locally.

## 9. Client transport, snapshots, and interpolation

Use browser WebSocket with `binaryType = "arraybuffer"` and the compact binary
codec in section 15. Hello bypasses optional development network simulation and
contains compatibility hash, optional normalized name, and optional preview
flag. Outbound families are hello, input, action, respawn, chat, and lobby.
Inbound families are welcome, snapshot, chat, lobby state, game complete, game
over, spectate update, and error.

Snapshot arrival MUST:

1. reject/count duplicate and older ticks;
2. apply a full snapshot by upserting all included entities and deleting
   identities omitted from that full AOI;
3. apply a delta by patching only known/complete entities and honoring explicit
   removals; an incomplete delta-only new entity waits for a full descriptor;
4. update extraction, infrastructure, map/minimap, night blend, measured TPS,
   placement index, renderers, and one-shot presentation events;
5. resolve a welcome race from a matching pending player identity;
6. keep all snapshot and per-entity histories bounded.

A welcome that changes world/player identity is instance migration: clear
interpolation, render identities, presentation events, pointer/input/held
attack, placement, map/extraction, camera, and suppressions while retaining the
transport. A world-id-less duplicate welcome cannot erase a known world ID.

Development network simulation uses a deterministic seeded LCG separately for
inbound and outbound:

| Profile | Base latency | Symmetric jitter | Loss | Duplicate | Reorder |
| --- | ---: | ---: | ---: | ---: | ---: |
| perfect / A | 0 | 0 | 0 | 0 | 0 |
| mild / B | 50 ms | 20 ms | 1% | 1% | 1.5%, +35 ms |
| bad / C | 125 ms | 55 ms | 4% | 3% | 5%, +90 ms |

Per animation frame:

1. refresh pointer target;
2. estimate entity render poses;
3. choose local or spectated camera actor;
4. apply local visual aim;
5. sync entity visuals/blockers/confusion/status particles;
6. update minimap, placement preview, and sniper guide;
7. update effects, camera, darkness, grid, minimap, extraction, HUD, and render;
8. refresh pointer again, send keepalive, and advance held attack.

Ordinary entities sample a monotonically advancing render playhead delayed by
the adaptive two-to-five-tick buffer. Advance by frame delta / observed tick
duration and correct drift by 8%, capped at the larger of `0.02 tick` and 35%
of normal frame advance. Lerp position; interpolate angle by shortest arc.
Hold outside history. A regular projectile may extrapolate to estimated current
server time; a `presentation.serverDelayed` projectile (including homing drone)
uses delayed interpolation. Explicit discontinuities snap once.

## 10. Client scene, camera, culling, and world presentation

Create one Pixi-like application preferring WebGPU, resizing to window, with
antialiasing, auto-density, device-pixel-ratio resolution (minimum 1),
background `#d7f3d2`, and manual rendering. Development may expose it through a
debug bridge; production must not.

Scene order:

1. world render group: grid/background, effects, sortable entities, placement;
2. screen render group: darkness/damage/confusion overlays, then HUD.

Static world entities sort at `1,000,000 + visualY`; mobile actors and
projectiles at `visualY`; equipped items at `visualY + 0.1`. House floors use
a deliberately extreme negative z so walls/actors always cover them.

Camera snaps to the first target then directly follows the rendered
local/spectated pose. A target move over 320 counts as a diagnostic snap;
settle epsilon is 0.001. Put the world pivot at camera and the world origin at
screen center plus optional confusion swim. Scale relative to the first
captured gameplay viewport. Cache canvas bounds and invalidate on resize/scroll.

Performance-preserving presentation requirements:

- render groups; no pointer interaction on world/effect/entity/placement nodes;
- viewport culling with 160 world-unit padding and world-bound clamp;
- visible-only 64-unit grid redraw when camera/scale/screen changes;
- cache textures, particle textures, renderer instances, placement
  profiles/grid, craft lists/tabs, and canvas bounds;
- redraw entity geometry only when visual/health versions change;
- animate only transient renderers each frame except active projectile trails;
- skip clean HUD layout/sync;
- cull darkness blockers to screen plus 300 px, reuse render textures/scratch
  graphics, and process near-first;
- do not run full schema validation on every production frame.

World palette:

| Mode | Fill | 1 px grid |
| --- | --- | --- |
| playground | `#f2e8d0` | `#9e8060` |
| match day | `#d7f3d2` | `#2d4f37` |
| match night | `#3f5f46` | `#9fd69a` |

Grid max alpha is 0.4. Fill follows night blend; line contrast leads/lags by
0.12 and disappears around blend 0.5. Sector rectangles use 0.16 alpha and
5-unit dark outlines. Region colors: home `#a8b9a6`, extraction `#b8a54e`,
dungeon `#55545d`, military `#596550`, forest `#2e6b3a`, lake/swamp `#40747a`,
industrial/quarry/bunker-edge `#6a665c`, default `#78906e`.

Dungeon floor uses a 96-unit alternating checker (`#6c6c6c`, `#5f5f5f`) over
a dark 0.88 base. Home compound is centered, 800x600 minimum and 1600x1200
maximum, with dark outer pad, tiled inner floor, crossed paths, four orange
corner lights, and a green center circle.

The minimap is 184x184 at 16 px from top/right, dark blue-black at 0.78 alpha,
6 px radius. Draw sectors, major/discovered markers, optional visibility
radius, and players. Self is a white 3.5 dot with cyan 5.5/2 ring; teammate is
green-ringed. Label `MAP` is 10 px. When communications are offline, replace
the map with a 184x46 red-bordered `COMMS OFFLINE` banner.

Darkness:

- With energy online, transition by distance from world/map center:
  1500-2000 units in day and 750-1125 at night, multiplied by night blend.
- Energy offline forces night/distance alpha to 1.
- Dungeon independently fades 0-to-1 over 100 units inward from its bounds.
- Final alpha is the maximum of night/distance and dungeon.
- Visibility radius lerps from 1,000 at alpha 0 to 500 at alpha 1.
- Development player `debug` suppresses darkness.

Use a 4096 radial black mask with transparent center near 480 and opaque by
600 for a nominal 500-unit view. Project shadows from canonical static
blockers; tree canopies are circles, configured non-blockers are excluded, and
other blockers use resolved hitbox rectangles. Cut obstacle silhouettes out
so each obstacle remains visible while space behind it is dark.

## 11. Entity art direction, animation, and effects

Mobile actors are hitbox-sized circles with a 2 px black outline. Armor adds a
3 px ring: tier 1 `#b6c2cf`, tier 2 `#7fb8ff`, tier 3 `#c68cff`, tier 4
`#ffd36b`.

Reference enemy colors:

| Enemy | Color |
| --- | --- |
| bomber | `#ffdd00` |
| commander | `#344c8a` |
| drifter, megaknight, shoota | `#bf2a2a` |
| police | `#355cde` |
| ranger | `#3a8f45` |
| saboteur | `#555555` |
| sniper | `#6f2abf` |
| stalker | `#226244` |
| thanos | `#8e44ad` |
| wallbreaker | `#ff6600` |
| wither | `#1a1a2e` |

Projectile colors: ordinary bullets/arrows gold `#ffb703`; homing drone
`#ff8c42`; Thanos bullet `#c39bd3`; Thanos rocket `#ff4500`; carbine
`#6ad1da`; main firecracker `#435063`; heavy pistol `#df41e3`; LMG `#70fcc0`;
machine pistol `#d9d3f5`; shotgun pellet `#e8f2f4`; small firecracker
`#77754f`. Trails retain up to eight points, ignore steps under 2 units, live
120 ms, and back-project the initial point by 0.25 velocity. Draw each segment
with black width 7 under colored width 3 and 1.5 px endpoint dots.

Common behaviors:

- damage flash `#ff4242`, default 150 ms, alpha falling from 0.7;
- health bar on living non-structure entities with max HP, width
  `max(20, hitbox_width)`, height 5, 12 units above, dark track and `#57d34d`;
- dead players have no body renderer;
- optional debug hitboxes are blue 2 px authoritative rectangles;
- pickups are rounded dark-green plates with 2 px black border, icon inset
  5 px, and outlined 12 px count at lower-right when stack exceeds one.

Recognizer-level world prop visuals:

| Object | Appearance |
| --- | --- |
| cannon | ochre `#c78d2d` hitbox body with 2 px black edge |
| landmine | dark gray `#454545` circle |
| wall / dungeon wall | rounded brown `#8b6f57` |
| tesla | blue-gray 22-unit core, bright 10-unit center, white bolt and radius |
| crate | rounded `#9b6a34` body, vertical braces at 18/82%, center cross-brace |
| tree | brown trunk/shadow and layered dark/mid/highlight green canopy |
| house/barracks | inset floor below all actors plus only wall hitboxes at actor z; brown / olive |
| camp shelter/market stall/wreck | pale translucent footprint and darker hitbox parts |
| dungeon | gray union of room rectangles with only exposed outer edges |
| fence | gray bar/hitbox with darker posts |
| tripwire | red 6-unit strip on long axis |
| barrel | wood staves, metal hoops, gold top highlight |
| bone pile | crossed ivory bones and eyed skull |
| boss throne | dark stone spires, red cushion, gold trim, skull |
| brazier | dark bowl, glow, red/orange/yellow triangular flame |
| furniture | label-specific brown fill, light edge/detail |
| gold pile/statue | layered dark and bright gold |
| guard tower | gray platform/tower detail |
| stone pillar | rounded gray stone with light top/dark bottom |
| weapon rack | wood frame with four alternating metal/wood weapons |
| hub | rounded brown body, roof band, short antenna |
| energy tower | indigo body/roof/antenna and central yellow lightning |
| comms tower | green body, mast/dish, three neon-green radio arcs |

Equipped item sprites are authored facing right. Normalize them to target height
`42 * authored_render_scale`, anchor at center, and mirror x plus add PI to
container rotation when facing left. Hold x/y, item rotation, scale, recoil,
swing, and jab offsets come from section 18's content manifests.

Animation timing:

- shoot recoil: sinusoid over `max(100 ms, cooldown wall duration)`;
- drone shooter: same, pulse exponent 0.68 and recoil scaled by 8-16 orbit;
- jab: sinusoidal forward motion over 200 ms;
- swing: ease-out half-arc during `min(100 ms, cooldown)`, then ease-in return;
- fists: two 7-unit tan/black circles at forward 10 and side +/-9; alternate
  hands, punch +18, pull inactive hand back 3;
- katana combo: sweep down/hold, sweep up/hold, center stab/recover; sweep
  strike uses 35%, stab thrust 22%, stab recovery 16%, remaining time returns.

Sniper-style aim guide is a red `#ff2d2d` 2 px line at 0.35 alpha from actor to
the first world-boundary intersection.

Presentation effects:

- local damage: full-screen `#8f0f0f` wash from alpha 0.28 over 200 ms;
- destroyed crate: 12 brown shards for 220-280 ms and tan 180 ms ring;
- explosion: two expanding rings, eight radial sparks; generic 240 ms
  yellow/cream, landmine 320 ms orange/peach;
- Wither beam: cyan rectangle at 0.85 alpha with event length/width/angle,
  fading 300 ms;
- airstrike warning: 3 px orange-red radius ring for
  `warning_ticks * 50 ms`, pulsing roughly 0.25-0.75;
- Tesla shock: white 4 px ring growing from 16 to configured radius over the
  shared shock-wave duration.

Every 180 ms, active effects may emit four particles at roughly 55/77% of
actor radius: bleeding red/pink 260 ms; confusion purple/cyan 340 ms;
fractured ivory/brown 300 ms; speed cyan/white 220 ms. Stun additionally emits
six 150 ms squiggles staggered 12 ms. Confusion adds color matrix, blurred dark
edge with elliptical clear center, bloom/flash, and camera swim: initial flash
0.65 s, saturation term down to -0.92 times intensity, swim ramps 0.3-0.7 s to
22 px. Intensity fades only in the final 80 effect ticks.

## 12. DOM shell and gameplay HUD

Use `"Trebuchet MS", "Segoe UI", sans-serif`. Base palette: `#0d160f`,
`#112116`, `#1d3623`, panel `rgba(7,14,9,.78)` / `rgba(5,10,7,.9)`, text
`#e8f5e7`, dim `#98ad96`, green `#5cca2a` / `#82ec4f`, hazard `#bf382f`.
Default panel shadow is `0 20px 60px rgba(0,0,0,.5)`.

DOM order/z intent: fixed full canvas (z 10), menu modal (z 30), training
banner, 3-second start prompt, match core, lobby queue, chat, death, spectate,
game-over (z 50). Use semantic buttons/inputs and `aria-live="polite"` for
chat. `[hidden]` always uses `display:none !important`.

Join card: max 320 px / 88 vw, padding 22, radius 18, 1 px translucent border,
dark 0.72 fill, 14 px backdrop blur, `0 24px 80px` shadow. Heading 34 px; label
12 px uppercase. Input/Play are 56 px high, radius 12, 22 px text. The world
backdrop is blur 6 px, scale 1.02, canvas opacity 0.92.

Chat is 18 px from left/bottom, max `min(38vw,420px)`; at <=980 px use
`min(78vw,440px)`, at <=640 use 12 px and 90 vw. Retain eight visible lines.
Closed lines fade after 8 s and remove after 12; open chat restores timers.
System is `#ffd6a0`, emote `#b9f2c2` italic, whisper `#d9c8ff`. Chat history,
schema-driven command autocomplete, Tab accept, arrow history, slash seed, and
HTML escaping are required.

Core Pixi HUD:

- day/night indicator centered 16 px from top with 200x10 progress bar and
  `Day N` / `Night N`; day detail `Hold the hub until night falls`, night shows
  remaining enemies/batches or `Wave cleared — dawn soon`;
- top-right 184x184 minimap or communications-offline banner;
- optional top-left player/tick/infrastructure/entity/TPS/FPS panel;
- active effect icons 18 px plus seconds in inventory detail;
- centered bottom 10-slot hotbar: slot 52, gap 6, pad 8, total 586x68, numbers
  `1..9,0`, active white 2.5 px expanded edge, 4 px orange reload/ammo strip;
- rarity edges: common `#9ca3af`, uncommon `#22c55e`, rare `#3b82f6`, epic
  `#a855f7`, legendary `#f59e0b`;
- hunk badge 10 px right of hotbar, 22 px icon;
- combat panel 12 px above hotbar: 28 px HP row, 30 px ammo/armor row; eight
  8x20 bullet icons and four 20 px armor icons;
- selected item toast 10 px above combat panel, 850 ms hold and 1,600 ms total;
- Wither boss bar 420x18 at upper center with cyan label and numeric HP;
- pickup/hub prompt 320x44 and hold-progress prompt 320x27 at center-bottom.

Inventory `H`: 10 horizontal 64 px slots, gap 10, pad 20, modal 770x176.
Drag/click swaps and number keys move a hovered slot to the chosen hotbar
index. Held icon is 34 px.

Crafting tabs are Weapons, Armor, Ammo, Healing, Buildings. Modal is up to
780 px alone or 620 with storage, height up to 560, radius 18. Pool at most 64
tiles; min tile width 92, gap 12; tab 112x30 with gap 8. States are
`Ready to craft`, `Missing materials`, `Move closer to the tower hub`, and
`Blueprint required`. Ammo recipes are shown only after the corresponding gun
has been obtained; blueprint recipes only after lobby unlock.

At wide sizes, hub storage docks beside crafting; otherwise it stacks below.
Storage is ten columns by three chest rows plus ten hotbar slots. Drag/click
transfers between chest and hotbar. Crafted output may target a chosen slot.
Recycling is a separate 88 px-tall panel over storage with 48 px drop target
and 138x44 button. Recycling a chest item first needs a free hotbar slot.
Leaving hub range closes UI and releases movement.

All HUD pointer handling is a modal gate: a pointer consumed by UI cannot
attack, build, use, or drop into the world.

Extraction overlay uses the map marker or fallback helipad. Stage colors are
red locked, green active/boarding, blue incoming. Text is:

- `COMMS OFFLINE` or `EXTRACTION LOCKED`;
- `STAND HERE TO EXTRACT`, `N/M on pad`;
- `EXTRACTING...` with ceiling seconds when all alive players are present;
- `RETURN TO HELIPAD` plus count when boarding conditions break.

## 13. Asset contract

The clean-room rewrite must create original, similar artwork; do not copy the
reference PNG bytes. Use transparent RGBA PNGs or equivalent vector/procedural
art. Preserve recognizable silhouettes, orientation, palette, and aspect ratio.
A loud 32x32 magenta/black checker is the missing-art indicator.

Required art families:

- four 96x96 armor chest plates: gray-blue, green, blue, purple;
- fifteen 96x96 blue blueprint cards for armor, AK-47, cannon, drone shooter,
  fire axe, firecracker gun, halberd, heavy pistol, katana, LMG, machine
  pistol, shotgun, sniper, spiked spear, and Tesla;
- fourteen 96x96 magazine cards plus blank base for Glock, AK, carbine,
  crossbow, drone shooter, firecracker, heavy pistol, LMG, machine pistol,
  shotgun, sniper, and three Thanos guns;
- buildable icons: cannon/landmine/wall around 192x192, Tesla high-resolution;
- bandage, medkit, speed potion around 192x192; hunk 300x300;
- armor HUD icons 32x32; bullet HUD icons 8x32;
- right-facing weapon silhouettes for every weapon in section 18.

Representative source aspect/orientation targets:

| Weapon | Reference pixels |
| --- | ---: |
| bat | 908x1731, upright |
| dagger | 330x230 |
| Glock | 253x158 |
| AK | 318x190 |
| spear | 284x31 |
| sword | 384x410 |
| carbine | 320x213 |
| cleaver | 300x128 |
| crossbow | 1355x1161 |
| drone shooter | 190x121 |
| fire axe | 270x180 |
| firecracker gun | 290x193 |
| halberd | 380x131 |
| heavy pistol | 210x140 |
| katana | 300x124 |
| LMG | 330x185 |
| machete | 310x109 |
| machine pistol | 200x191 |
| scissors | 557x355 |
| shotgun | 300x200 |
| sniper | 320x189 |
| spiked spear | 242x42 |
| taser | 300x125 |
| each Thanos weapon | 192x192 |

Acceptance screenshots at 1920x1080 and 1366x768 MUST cover menu preview,
day, night energy-on/off, dungeon, extraction stages, combat effects,
inventory, wide/stacked hub, death, spectate, win, and loss. Compare anchors,
palette, font scale, layer order, silhouettes, and darkness within documented
tolerance rather than demanding copied pixels.

## 14. Resource IDs, schemas, compatibility, and binary protocol

Resource IDs are `<namespace>:<path>` matching
`^[a-z][a-z0-9_-]*:[a-z0-9_./-]+$`. Registries reject duplicates and unknown
required lookups, preserve insertion order, and permanently freeze after
bootstrap.

Normalize a player name by removing ASCII controls `0x00..0x1f` and `0x7f`,
trimming, and cutting to 20 JavaScript string code units. The standalone helper
may accept a fallback, but the join boundary MUST reject an empty normalized
name and case-insensitive duplicate.

Client object messages:

- hello `{t, compatHash, playerName?, preview?}`;
- strict input `{t:"input", seq:uint, clientTimeMs?:finite, theta:finite,
  movement:{up,down,left,right:boolean}}`; x/y is forbidden;
- action with nonnegative independent action sequence:
  attack(theta), craft(item ID and optional hotbar/chest target),
  build(x,y), hotbar move/select, armor move, chest move, drop(whole?),
  pickup, recycle, reload, repair tower(ID), or use consumable(ID);
- respawn, optional-time ping, chat text length 1-240;
- lobby open join, code join, leave, or start. A code is trimmed, 4-12
  `[A-Za-z0-9_-]` characters even though generated codes are length six.

An invalid action MUST NOT consume the last accepted action sequence. Input and
action sequence streams are independent; stale/duplicate/out-of-order values
cannot replace a newer accepted value.

Server object messages:

- welcome `{entityId:uint,worldId?}`, pong, and error;
- chat `{text<=240, kind?:global|system|emote|whisper, from?}`;
- lobby state with membership/host/code/count/max/timestamps/server time;
- game complete and game over `{gameDurationMs,wavesCompleted}`;
- spectate update `{targetEntityId:uint|null}`;
- world snapshot.

Snapshot entity base:

```text
id, kind, typeId?, x, y, vx, vy, rotation, hitboxes?,
hp?, maxHp?, alive?, ownerId?
```

Players add name, inventory, effects, movement speed, equipped item, and armor.
Enemies add target, equipped item, effects, and armor. Building/tower add label,
tier, and optional exactly-30-slot chest. Structure adds label. Pickup adds
inventory. Player inventory has resource stacks, exactly ten hotbar slots,
selected index 0-9, armor slot, and unlocked recipe IDs. Active effect has
positive ticks remaining and optional action-prevention/speed multiplier.

World snapshot includes tick; day/night; extraction; energy/comms; optional
static map, visibility, and minimap players; full/delta indicator; entities;
removed IDs; and events. Full map metadata is sent on early/periodic keyframes
and the first snapshot of a late joiner, not every delta.

Event families and fields:

- damage: source/target/type, amount, remaining/max HP, position, fatal;
- explosion: source, position, positive radius, style
  landmine/drone/wallbreaker;
- attack: source, position, swing/jab/shoot;
- Wither beam: source, position, angle, length, width;
- Wither airstrike warning: position, radius, warning ticks;
- Tesla shock: source, position, radius.

### 14.1 Compact MessagePack wire

Normal transport is MessagePack, not JSON. A string JSON decoder MAY remain for
tests/compatibility. Outer packet:

```text
[0, object]                  generic object packet
[1, compact_input_tuple]     client input
[2, server_payload]          server message; snapshot payload uses compact world
```

`IO_GAME_COMPACT_PROTOCOL=0` keeps MessagePack envelopes but uses object input
and object server payloads. Compact mode is default.

Compact input is
`[seq, clientTimeMs|null, quantizedTheta, movementMask]`; mask bits are up 1,
down 2, left 4, right 8.

Quantize coordinates, dimensions, effect speeds, and map values as
`round(value*10)` and divide by ten. Quantize an angle as
`round(normalize(angle)*65535/(2*PI))` and normalize after decoding.

Compact world positional contract:

| Index | Field |
| ---: | --- |
| 0 | tick |
| 1 | day/night tuple |
| 2 | extraction tuple |
| 3 | infrastructure bitmask, energy=1, comms=2 |
| 4 | map or null |
| 5 | visibility or null |
| 6 | minimap players or null |
| 7 | full flag or null |
| 8 | entities |
| 9 | removed IDs or null |
| 10 | events |

Day/night:
`[dayCount,phase(0/1),elapsed,dayDuration,nightDuration,waveEnemies,
waveSpawns,waveThreatTotal]`.

Extraction:
`[stageCode0..4,lockReason0-or-null,boardElapsed,boardGoal,chopperElapsed,
playersOnPad,totalAlive,enemiesInRadius]`.

Entity is `[kindCode,base,extra]`, where player..pickup codes are 1..7. Base:

```text
[id,typeId|null,x,y,vx,vy,rotation,hitboxes|null,
 hp|null,maxHp|null,alive|null,ownerId|null]
```

Hitbox is `[offsetX,offsetY,width,height]`. Extra tuples:

- player:
  `[name,inventory,effects,moveSpeed,equipped,armorType,armorTier,reduction]`;
- enemy:
  `[target,equipped,effects,armorType,armorTier,reduction]`;
- building/tower: `[label,tier,chestSlots|null]`;
- structure `[label]`; projectile `[]`; pickup `[inventory]`.

Inventory is
`[resources[[typeId,amount]],slots,selectedIndex,unlockedRecipeIds]`.
Slot tag 0 is empty, 1 weapon, 2 counted item/buildable. Weapon/equipped is
`[typeId,ownerId-or-style,cooldown,ammo,magSize,reserveMags,reloadTicks,
reloadRemaining]`. Effect is
`[typeId,ticks,preventsAction|null,speedMultiplierTimes10|null]`.

Map is
`[seed,sectorSize,centerId,extractionId,dungeonId,dungeonBounds,militaryId,
forestId,sectors,features,markers]`. Sector holds ID/label/archetype/row/column/
bounds/lightsOut. Feature holds ID/label/role/risk/reward/bounds/center. Marker
holds ID/label/archetype/importance/discovered/x/y and optional risk/tier.
Minimap player is `[id,x,y,aliveBit]`.

Event code is first: damage 1, explosion 2, attack 3, Wither beam 4,
airstrike warning 5, Tesla shock 6; subsequent values preserve the field order
listed above.

Codec failures fail closed and are counted by category. A representative
compact snapshot MUST round-trip all fields and be no more than 50% of its
normalized JSON byte size. Server encode p95 MUST remain <=2 ms in the
16-client compression scenario in section 20.

### 14.2 Compatibility hash

The handshake compatibility descriptor includes parsed/default-expanded
content, core gameplay config, protocol/event tags, snapshot field names,
compact tuple field order, and runtime-config handshake fields. Serialize with
recursively sorted object keys and hash using 32-bit FNV-1a (offset
`0x811c9dc5`, multiply `0x01000193`), displayed as eight hex digits.
Any included contract change changes the hash. The rewrite MUST also include
death-loot and all procedural tuning in the descriptor, closing an apparent
reference omission.

Slash commands tokenize quotes and backslash escapes; dangling escape/unclosed
quote fails. IDs/aliases lowercase. Required commands/aliases:
`help`, `me`, `say`, `whisper|w|tell`, `reply|r`, `list`, `spawn`, `kill`,
`killall`, `effect`, `give`, `map`, and `time`. Admin commands support player
names/selectors `@a`/`@e`, entity/item/effect IDs, quantities/positions, map
editing, and day/night. Authorization is server-side; autocomplete is not
authority.

## 15. Exact gameplay content and balance

All content is strictly validated at startup. Weapon/buildable items require
rarity. Enemies require rarity and a death-loot object; a declared spawn-weapon
list cannot be empty. Runtime and renderer registry coverage is exact.

### 15.1 Player, armor, status, and loot

Player: 100 HP, speed 15, dynamic 32x32. Passive healing begins 100 ticks after
combat and restores 0.02 HP/tick. Unarmed jab: cooldown 6, range 20, damage 5,
knockback 4, width 18.

The playground loadout selects zero-based slot 1 and contains sword, Glock,
spear, crossbow; 50 hunk; 5 landmines; 8 walls; 2 cannons. A normal match
starts players with empty hotbars at distinct assigned home spawns.

| Armor | Rarity | Bars | Reduction | Reflect | Recipe |
| --- | --- | ---: | ---: | ---: | ---: |
| T1 Scout | common | 2 | 33.333% | 0 | 25 |
| T2 Field | uncommon | 4 | 50% | 0 | 40 |
| T3 Juggernaut | rare | 7 | 63.636% | 0 | 65 |
| T4 Aegis | epic | 10 | 71.429% | 10% | 95 |

Each bar adds 25% effective HP; damage multiplier is
`1/(1 + 0.25*bars)`.

| Effect | Exact behavior |
| --- | --- |
| bleeding | 30 ticks; 2 damage every 3 ticks |
| confusion | 200 ticks; speed x0.3 |
| fractured | 100 ticks; speed x0.7 |
| speed | speed x1.35; potion lasts 3,600 ticks |
| stunned | 10 ticks; prevents action |
| knockback | impulse 15 |
| damage / heal | immediate typed effect |

Enemy death loot `(weapon chance, hunk range, matching-mag chance/count)`:
common `(0.15,8-15,0.30/1-2)`, uncommon `(0.20,15-25,0.50/1-2)`, rare
`(0.30,20-40,0.50/1-3)`, epic `(0.30,35-60,0.50/2-3)`, legendary
`(1,100-150,1/2-4)`. Melee enemies never drop magazines. Wither instead drops
fixed 1,000 hunk; Thanos drops exactly one randomly selected carried weapon.

### 15.2 Items and weapons

Shoot stats are `cooldown/projectile/mag/reload/spread/special`; melee stats
are `cooldown/range/damage/knockback/arc-or-width/combo`.

| Item | Tier/style | Exact stats | Hunk |
| --- | --- | --- | ---: |
| Baseball Bat | C swing | 12/50/15/25/90/- | 35 |
| Dagger | C jab | 3/30/8/6/14/- | 30 |
| Glock 17 | C shoot | 5/basic bullet/12/20/5/- | 50 |
| AK-47 | R shoot | 5/rifle bullet/30/20/4/- | 150 |
| Spear | C jab | 12/100/18/15/24/- | 30 |
| Sword | C swing | 8/50/15/15/90/- | 20 |
| Cannon Item | R build | building:cannon | 50 |
| M4A1 | U shoot | 3/carbine bullet/30/20/3/- | 100 |
| Cleaver | C swing | 12/50/10/10/90/- | 40 |
| Crossbow | U shoot | 8/arrow/8/30/2/- | 60 |
| Crude Bandage | consumable | heal 20 | 30 |
| Drone Shooter | R shoot | 25/homing drone/5/30/0/- | 150 |
| Fire Axe | R swing | 20/50/50/24/90/- | 140 |
| Firecracker Gun | E shoot | 12/shell/3/50/0/self-knockback 24 | 180 |
| Halberd | E swing | 12/75/50/20/90/- | 180 |
| Desert Eagle | E shoot | 12/heavy bullet/8/20/1/- | 180 |
| Katana | E swing | 6/75/20/18/90/chain1.5, stab x2 range105 width18 | 140 |
| Landmine Item | U build | building:landmine | 15 |
| M249 SAW | E shoot | 1/LMG bullet/100/50/4/- | 300 |
| Military Machete | U swing | 8/60/20/14/90/- | 80 |
| Scorpion vz.61 | R shoot | 2/machine bullet/16/20/10/- | 130 |
| Medkit | consumable | heal 100 | 100 |
| Scissors | C jab | 6/30/8/4/14/- | 20 |
| Shotgun | R shoot | 12/pellet/5/30/0/10 pellets across 60deg | 140 |
| Remington 700 | E shoot | 50/sniper bullet/5/50/0/aim guide | 200 |
| Speed Potion | consumable | speed for 3,600 ticks | 75 |
| Spiked Spear | R jab | 12/100/24/15/24/- | 130 |
| Taser | U swing | 6/60/1/20/90/- | 70 |
| Tesla Item | E build | building:tesla | 150 |
| Infinity Fist | L swing | 15/100/100/45/180/- | uncraftable |
| Thanos Machine Gun | L shoot | 1/Thanos bullet/120/1/0/- | uncraftable |
| Thanos Rifle | L shoot | 8/Thanos bullet/8/30/4/- | uncraftable |
| Thanos Rocket Launcher | L shoot | 20/rocket/3/50/0/- | uncraftable |
| Wall Item | C build | building:wall | 5 |

Armor recipes are 25/40/65/95 hunk for T1-T4. Some source item records carry
legacy fixed recycle values (M4A1 10, Fire Axe 10, Firecracker 18, Halberd 15,
Desert Eagle 16, LMG 22, Machete 6, Machine Pistol 14, Shotgun 16), but active
weapon/buildable recycling intentionally uses the rarity roll in section 6.6;
those fixed values are metadata, not the payout.

Magazine recipes: Glock 12; AK 20; M4A1 16; crossbow 16; drone 20;
firecracker 32; Desert Eagle 32; LMG 40; machine pistol 20; shotgun 20;
sniper 32; each Thanos magazine 48. Each produces one. Manual reload consumes
one matching magazine and refills a partially used selected gun.

Common/uncommon crafts are immediate. Rare/epic crafts require blueprints;
legendary gear is uncraftable. Blueprint IDs: armor (sequentially unlocks T2,
T3, T4) and one each for AK, cannon, drone, fire axe, firecracker, halberd,
Desert Eagle, katana, LMG, machine pistol, shotgun, sniper, spiked spear,
Tesla. Unlock is lobby-wide and persists for later joiners.

Melee on-hit specials: bat and fire axe always fracture; cleaver bleeds with
40% chance; scissors bleeds with 10%; machete, spiked spear always bleed; taser
always stuns; halberd always fractures. Effects apply only to legal actual hits.

### 15.3 Item render transforms

Tuple:
`held(x,y,deg,scale,recoil,swing,jab); icon(x,y,deg,scale); comboStabJab`.
Unlisted content uses position/action zero and scale one.

| Item | Held tuple | Icon tuple | Combo |
| --- | --- | --- | ---: |
| bat | 0,-40,100,1.4,0,100,0 | 0,0,45,1.2 | - |
| dagger | 15,0,0,1,0,0,10 | 0,0,-45,1 | - |
| Glock | 30,11,0,1,10,0,0 | 0,0,0,1 | - |
| AK | 33,0,7,1,16,0,0 | 0,0,0,1 | - |
| spear | 15,0,0,.5,0,0,20 | 0,0,-45,1.3 | - |
| sword | 40,0,5,1.7,0,90,0 | 0,0,-45,1.2 | - |
| M4A1 | 20,5,0,1,10,0,0 | 0,0,0,1 | - |
| cleaver | 35,8,4,1.2,0,95,0 | 0,3,-45,1.8 | - |
| crossbow | 30,4,0,1.8,7,0,0 | 0,0,0,1 | - |
| drone | 15,0,0,1,6,0,0 | 0,0,0,1 | - |
| fire axe | 22,-22,45,1.8,0,90,0 | -15,5,-4,1.8 | - |
| firecracker | 20,5,-4,1.15,20,0,0 | 0,0,0,1 | - |
| halberd | 32,0,8,1.3,0,90,0 | 0,0,-45,1.4 | - |
| Desert Eagle | 26,6,0,1,16,0,0 | 0,0,0,1 | - |
| katana | 40,-15,10,1.4,0,100,0 | 0,-10,-45,1.5 | 30 |
| LMG | 14,3,0,1,14,0,0 | 0,0,0,1 | - |
| machete | 30,0,6,1,0,100,0 | 0,0,0,1 | - |
| machine pistol | 28,4,0,.95,8,0,0 | 0,0,0,1 | - |
| scissors | 10,0,0,.85,0,0,20 | 0,0,0,1 | - |
| shotgun | 18,4,1,1,18,0,0 | -3,6,0,1.2 | - |
| sniper | 22,1,10,1,18,0,0 | 0,0,0,1 | - |
| spiked spear | 15,2,0,.8,0,0,20 | 0,0,-45,1.3 | - |
| taser | 30,5,0,1,0,90,0 | 0,0,0,2 | - |
| Infinity Fist | 20,6,0,1.5,0,130,0 | 0,0,0,1 | - |
| Thanos MG | 30,0,0,1.4,16,0,0 | 0,0,0,1 | - |
| Thanos Rifle | 20,4,0,1.8,12,0,0 | 0,0,0,1 | - |
| Thanos Rocket | 22,0,0,2,18,0,0 | 0,0,0,1 | - |

### 15.4 Enemies and AI-visible content

All enemies are dynamic. Hitbox notation is `width x height @ offset`.

| Enemy | HP | Speed | Hitbox | Tier | Spawn weapons |
| --- | ---: | ---: | --- | --- | --- |
| bomber | 38 | 10 | 46x46 | rare | bespoke |
| commander | 90 | 6 | 28x18@0,-8 + 34x20@0,10 | rare | AK, machine pistol, drone, shotgun rotating |
| drifter | 50 | 8 | 24x24 | common | sword, scissors, bat, dagger, cleaver, spear rotating |
| megaknight | 75 | 7 | 28x20@0,-10 + 40x20@0,10 | epic | bespoke |
| police | 55 | 12 | 24x24 | uncommon | taser |
| ranger | 65 | 8 | 24x24 | uncommon | M4A1, crossbow rotating |
| saboteur | 40 | 11 | 18x12@0,-6 + 22x14@0,8 | uncommon | sword; 2x building damage |
| shoota | 50 | 8 | 24x24 | common | Glock |
| sniper | 35 | 7 | 22x22 | epic | sniper, Desert Eagle, LMG, firecracker rotating |
| stalker | 48 | 13 | 18x12@0,-6 + 22x14@0,8 | rare | spiked spear, fire axe rotating |
| Thanos | 2,000 | 3 | 64x64 | legendary | fist, rifle, rocket, machine gun all active |
| wallbreaker | 1 | 12 | 22x22 | rare | bespoke |
| Wither | 2,000 | 2 | 64x64 | legendary | bespoke |

Goal selection uses prioritized goals with mutual exclusion. Enemies prefer a
visible, in-range living player, otherwise a nearer legal player-team building.
A blocking building may be targeted when it occludes the player. Wave enemies
have finite player-first aggro; locks drop outside radius or after 100
continuous ticks without sight, but survive shorter occlusion. Crates are enemy
team/player-breakable and never draw enemy aggro.

Outer layout enemies remain dormant without nearby activity. Once active and
after losing aggro, they wander around their standing point. Players,
buildings, towers, structures, projectiles, and wave enemies always simulate;
layout enemy goal/collision work is replication-radius activated, while base
status effects continue. The exact 2,560x2,560 center sector is always active.

### 15.5 Projectiles

All projectiles have HP zero and collision mode none. Tuple is
`speed/range/damage/maxHits/hitbox`.

| Projectile | Tuple | Special |
| --- | --- | --- |
| basic bullet | 75/1000/15/1/12x12 | trail |
| cannon bullet | 40/1000/20/1/16x16 | trail |
| carbine bullet | 100/1500/8/1/12x12 | - |
| crossbow arrow | 50/4000/20/10/12x12 | piercing |
| firecracker shell | 50/300/30/1/16x16 | five sparks across 60deg |
| heavy-pistol bullet | 75/1000/50/1/12x12 | - |
| homing drone | 20/10000/0/1/8x8 | delayed presentation, explosion |
| LMG bullet | 100/1500/8/1/6x6 | - |
| machine-pistol bullet | 75/600/8/1/6x6 | - |
| rifle bullet | 100/2000/15/1/12x12 | trail |
| shotgun pellet | 75/600/10/1/8x8 | ten-shot fan |
| small firecracker | 70/600/8/1/8x8 | split child |
| sniper bullet | 300/1,000,000/200/10/6x6 | piercing |
| Thanos bullet | 100/2000/8/5/12x12 | piercing |
| Thanos rocket | 40/2000/100/1/20x20 | explosion |

Resolve projectile impact continuously against canonical static geometry and
legal dynamic targets to prevent tunneling. Honor max hits. A special
firecracker reaches its authored distance then splits; shotgun spends one shell
for the full fan; drone and rocket explosions apply their radial effect once.

### 15.6 Player buildings, towers, pickups, and structures

- Wall: 200 HP, static 40x40.
- Cannon: 120 HP, static 36x40. Turret gun cooldown 20, cannon bullet,
  magazine one, reload 36, zero spread. Energy failure disables it.
- Landmine: 15 HP, collision none, 18x18, trigger radius 28, no visibility
  blocking; triggers enemy team once and explodes.
- Tesla: 100 HP, static 42x42. Shock radius 140, damage 10, stun 20 ticks;
  ring expands 6 units/tick for 24 ticks and damages each reached enemy once.
- Hub, energy, and comms towers: 600 HP, static 100x165. Repair costs one hunk
  per 6 HP. Hub has crafting, recycler, and 30-slot container. The three are
  uncraftable match starters; at 0 HP they remain in world, become unusable,
  and may be repaired.
- Pickup bag: dynamic 42x42, explicit E interaction, no automatic contact
  collection. There is no ambient post-generation pickup spawner.

Static/generated structure dimensions:

| Structure | Collision / hitbox |
| --- | --- |
| barracks | hollow 640x320: top 640x16 y-160, bottom 272x16 x+/-184 y160, sides 16x304 x+/-312 |
| barrel | static 44x44; no visibility block |
| bone pile | none 60x44 |
| boss throne | static 100x92 |
| brazier | static 40x40; no visibility block |
| camp shelter | static 224x112 |
| command post | hollow: top 480x16 y-176, bottom 184x16 x+/-148 y176, sides 16x336 x+/-232 |
| crate | 1 HP, static 52x52, enemy team |
| dungeon / wall | static 16x16 |
| fence H / V | static 400x16 / 16x400 |
| gold pile | none 56x40 |
| golden statue | static 56x72 |
| guard tower | static 128x128 |
| house S | hollow: top 288x16 y-112, bottoms 96x16 x+/-96 y112, sides 16x208 x+/-136 |
| house M | hollow: top 400x16 y-144, bottoms 144x16 x+/-128 y144, sides 16x272 x+/-192 |
| house L | hollow: top 560x16 y-192, bottoms 224x16 x+/-160 y192, sides 16x368 x+/-272 |
| house XL | hollow: top 880x16 y-288, bottoms 368x16 x+/-256 y288, sides 16x576 x+/-432 |
| market stall | static 160x96 |
| stone pillar | static 56x56 |
| tree | static 91x91, circular visibility radius 52.76430801214018 |
| tripwire | collision none, 220x16; no visibility block |
| vehicle wreck | static 240x128 |
| weapon rack | static 92x30; no visibility block |
| bed/chair/table | static 112x64 / 40x40 / 96x48 |

Tripwire initial damage is 12. Once per player it applies bleeding for 90 ticks
with 4-damage pulses every 10, fractured for 140 at speed x0.55, and confusion
for 100 at speed x0.75. Rotated placement uses a vertical trigger shape.

## 16. Authoritative server simulation

### 16.1 Host, runtimes, lobby, and tick clock

Start by validating content/registries and optional built client. Require both
TLS certificate and key or neither. Bind `PORT` default 3000. Static serving
MUST contain resolved paths beneath the client root; browser routes fall back
to the SPA. `/runtime-config` uses `Cache-Control: no-store`.

Use a drift-aware recursive timer at `1000/tickRate` rather than an unbounded
interval queue. Run at most three catch-up ticks; if still behind, skip schedule
positions, increment overload telemetry, and log every 30 overload episodes.

There is one lightweight playground/preview runtime plus active match runtimes.
Tick the playground only with players/observers; preview-only ticks alternate
server phases at half rate. Then update lobbies/countdowns, tick active matches,
and handle completion/failure.

Connection states are connected, preview, or ready. A compatible preview hello
creates no player and observes playground. A normal hello requires unique
nonempty name, capacity, and exact compatibility hash, then spawns playground
player and sends pong, welcome/world ID, and lobby state.

Lobby behavior:

- open join chooses the first unstarted lobby with room, else creates one;
- code join uppercases, joins matching room, or creates that requested code;
- random codes use `ABCDEFGHJKLMNPQRSTUVWYZ`, six characters, retry collision;
- first member is host; first remaining member becomes host on departure;
- only host may manually start; one member is sufficient for manual start;
- automatic ten-second countdown starts at two and cancels below two;
- explicit code join MAY enter a started match, but open matchmaking MUST NOT
  select a started lobby;
- seed is 32-bit FNV-1a over the lobby code;
- starting constructs a seeded match and migrates all members, recreating
  players rather than carrying playground transient state.

After extraction, keep results available while players choose replay/lobby;
dispose the match and lobby once empty. On team failure, send game over, return
participants to playground, and dispose the failed runtime.

Match player spawns have empty hotbars and 50 hunk resource; playground gets
the full authored loadout. Non-production name `debug` is 4x speed, no-clip,
invulnerable, gets all personal blueprint unlocks and at least 999,999 hunk,
and skips hunk craft/repair costs. It must never activate in production.

Dead playground players may explicitly respawn. Dead match players spectate the
living teammate with earliest alive-since tick and respawn only at dawn; reject
explicit match respawn. No living players means team failure.

### 16.2 Tick order, movement, and entity identity

Each world tick:

1. increment logical tick and begin per-tick AI cache;
2. update day/night, waves, camps, infrastructure, extraction;
3. synchronize dynamic index and navigation dirty regions;
4. snapshot the insertion-ordered tick-phase entity set;
5. compute collision-active subset;
6. tick each still-present phase entity;
7. apply simulation-speed displacement;
8. resolve collision;
9. run post-movement hooks;
10. merge compatible pickups;
11. decay outer player buildings;
12. resynchronize spatial state and record phase timings.

Entities have desired/drive/momentum velocity. Drive normally snaps to desired
(infinite acceleration). Momentum drag is 0.85/tick and components below
magnitude one become zero. Combined velocity is drive + momentum. Stun blocks
drive/action, not momentum. Debug no-clip skips collision and clamps to world.
Input becomes stale after five authored ticks; diagonal input is normalized.

Use monotonically increasing match-lifetime IDs. Store iteration and typed
queries preserve insertion order. On spawn/despawn update counts, ownership,
static/nav/spatial indexes, and replication removals.

### 16.3 Collision, geometry, and navigation

Use one 64-unit uniform spatial grid for broad phase and a separate canonical
static grid. Index each resolved hitbox in every overlapped cell, deduplicate
queries, and avoid reindex when object/cell span is unchanged.

Static resolution per active dynamic:

1. recover initial overlap with up to eight minimum-separation steps;
2. sweep X then Y against static hitboxes;
3. stop at earliest hit time minus 0.001 and clip contact-normal velocity;
4. treat 0.01 as touch tolerance; outward movement from touch is legal;
5. clamp complete hitbox bounds inside world.

Dynamic resolution runs two iterations and each ID pair once. Pickups do not
push actors; compatible pickup stacks do not push each other. Split correction,
multiply by 0.5, cap each at 8. Clip left against static, transfer unresolved
correction to right, then clip right. Recover/clamp again.

Only exactly overlapping one-stack compatible ground inventories merge.
Materials/buildables/consumables/armor merge; weapons or mixed bags do not.

Navigation uses an 800x800 grid of 16-unit tiles, eight-neighbor weighted A*:
cardinal cost 1, diagonal sqrt(2), octile heuristic x3, no corner cutting, no
closed-node reopen, maximum 200,000 pops. If start/goal is blocked, search
deterministic square rings out to eight tiles. Direct clear tile line returns
the exact target. Cache 2,048 paths by start/goal tile with insertion-order LRU;
dirty tile rectangles merge with one-tile adjacency and invalidate intersecting
cached path bounds. Look ahead 48 path units.

Per-tick AI cache may share target candidates, LOS, alive-player proximity and
waypoints by 64-unit actor cell. A rewrite may use more exact cache keys, but
must preserve deterministic target ordering: squared distance then stable ID,
and must never share semantically different target filters under one key.

### 16.4 Combat, effects, actions, inventory, and crafting

Damage rejects dead/missing instigator, self-hit, and illegal teams. Apply
instigator outgoing multiplier, target armor reduction, event emission, armor
reflection, then death. Pulsed/environment damage may omit outgoing multiplier
but still obey teams/reduction.

Enemy armor chance is 12%; conditional tier distribution T1/T2/T3/T4 is
60/25/11/4%, and equipped enemy armor drops with 4% chance.

Active effect reapplication replaces/refreshes the same type. Subtract
simulation speed from pulse countdown, emit at most one due pulse, then subtract
simulation speed from duration. Movement multipliers multiply.

Player action queue cap is 64 and FIFO; drop oldest on overflow and compact
after head 32. Drain all queued actions per player tick. Every hotbar weapon and
fists tick cooldown even when not selected. Fists attack when selection is
empty/buildable/consumable.

Inventory:

- ten stateful hotbar slots plus separate armor;
- resources/magazines in unbounded type-count map;
- weapons occupy one slot and preserve state in ground bags;
- stackables of one type merge without count ceiling;
- acquisition is all-or-nothing; blueprints never occupy a slot;
- adding a ranged gun unlocks its magazine recipe.

Explicit pickup requires hitbox overlap; choose nearest bag and require the
whole inventory fit. Drop one/full selected stack or actual weapon state 20
units forward. If no hotbar item but armor is equipped, drop armor.

Craft near an alive hub: validate recipe/unlock/cost/destination/capacity;
consume resource-map costs before hotbar stacks, scanning hotbar high-to-low;
then grant output. A weapon target must be one empty slot; stackable target may
merge; materials/mags cannot target a slot. Debug skips hunk cost only.

Placement accepts only player-building item constructors. Range uses original
target center (<=160); actual position rounds to integer; validate rounded
hitbox against world, player, and canonical static blockers; consume and spawn.

Hub chest moves swap/merge hotbar and 30 chest slots. Weapon transfer through
the chest reconstructs the weapon with fresh ammo/cooldown state, matching the
reference behavior. Recycling consumes one selected item near an alive hub.
Tower repair cost is `ceil(missingHP/6)` hunk and restores full state.

Weapon cooldown subtracts simulation speed; ranged reload subtracts exactly one
per actual server tick. Empty guns auto-reload when a magazine is available;
enemies have infinite magazines. Spread `S` degrees means a total S-degree
span. Melee sorts hits by blocker entry, target entry/center/ID, hits every
legal visible target in shape, and consumes cooldown on a whiff.

Area effects measure distance to the nearest target-hitbox point and ignore
static occlusion:

| Source | Radius | Damage / impulse |
| --- | ---: | --- |
| bomber | 100 | fixed 200 |
| wallbreaker | 90 | wall/player 200, other legal 80 |
| landmine | 140 | `max(1,round(80*(1-r/R)))`, knockback `32*(1-r/R)` |
| drone | 96 | `max(1,round(35*(1-r/R)))`, knockback `18*(1-r/R)` |
| megaknight | 80 | 40, knockback 25 |

### 16.5 AI goals and boss mechanics

Goals claim target, movement, look, and attack channels. Lower numeric priority
wins; ties retain registration order. Continue active goals before starting
inactive candidates, stop deselected, start new, then tick selected. Wander is
fallback priority 100.

Generic movement: repath period `10 + id%3`, waypoint reached within squared
distance 16, steering cap 1.5 at speed multiplier 0.22, deterministic jitter
period 18/radius 5. Wander anchor radius 140, arrival 12, wait
`20 + hash%50`, steering 0.18.

Ranged movement repaths `6 + id%3`, approaches preferred range, retreats when
too close, strafes inside tolerance, optionally solves projectile intercept,
and fires only within both weapon and goal maximum.

| Enemy | Aggro | Primary behavior |
| --- | ---: | --- |
| bomber | 825 | chase to 42 then 100-radius self explosion |
| commander | 1,080 | range 360, tolerance48, strafe36, lead.65, fire<=600 |
| drifter | 720 | chase arrival20, melee |
| megaknight | 900 | jump attack then chase arrival30 |
| police | 630 | chase arrival18, melee |
| ranger | 800 | range260/tol40/strafe54/lead.55/fire<=600 |
| saboteur | towers1,200/building900/player600 | prioritize energy, comms, buildings; sword |
| shoota | 720 | range220/tol32/strafe45/lead.5/fire<=600 |
| sniper | 1,470 | range620/tol60/strafe90/lead.85/fire<=600 |
| stalker | 840 | chase arrival16, melee |
| wallbreaker | wall/building1,050/player600 | detonate within36 |
| Thanos | 1,470 | fist, MG spray, rocket, rifle, chase in priority order |
| Wither | 1,470 | airstrike, rotating beam, cardinal beam, chase |

Megaknight: windup 8, airborne 3, recovery 12, cooldown 50; launch base speed
40/minimum12; landing uses section 16.4.

Wither airstrike every 500 ticks: warning 50, fourteen strikes drawn from a
jittered 4x4 pattern with two omitted inside radius 550; each radius110,
damage110. Cardinal beams every160: four directions, length600, width70,
damage35. Rotating beams every420: duration140, four beams length580 width65,
two rotations, damage4 each overlapping tick; during it, shoot at each alive
player within900 on a 25-tick internal cadence. These boss areas use center/
rectangle tests and ignore static occlusion.

Thanos uses fist priority2; 12-bullet 120-degree MG spray priority2.5/cycle200;
rocket priority3 up to900; rifle priority4 at range350/tolerance60/strafe70/
lead.45/fire<=600; chase priority5 arrival90.

Use match-seeded enemy loadout rotation rather than process-global state so a
fresh seeded match is reproducible. Preserve the listed rotating sets.

### 16.6 Day/night, waves, camps, extraction

Day/night elapsed advances by simulation speed and can cross multiple states.
Night clamps at duration-1 while any wave enemy/pending spawn remains. Entering
day increments day count and respawns dead match players.

Enemy combat is empowered at night or when energy is offline: range and
cooldown return toward baseline as section 6.5 specifies. Enemy ranged outgoing
damage remains x0.5 at all times.

Random wave budget is **`6 + 3*(nightCycle - 1)`**. Add required tier-floor
counts then spend remaining budget by eligible weights. Use the night-only LCG:

```text
state0 = uint32(0x9e3779b9 XOR imul(night,0x85ebca6b))
state  = uint32(imul(state,1664525) + 1013904223)
```

Split each enemy-type count evenly across the seven delay buckets, with
remainders in earlier buckets. Delays decrement one per server tick and due
entries process in reverse queue order. Spawn at explicit coordinate or a
random angle/radius 600-900 around center, add independent +/-20 x/y jitter,
and clamp. Mark `spawnSource="wave"`. Never choose legendary enemies from
random waves. A police-only wave is invalid.

Every ordinary non-home/extraction/dungeon sector has forest camps: corners
three, edges two. Center margin360, radius260. Corner group 1-3/max3 with
police/ranger/stalker; edge group1-2/max2 with drifter/shoota/police. First
attempt delay is 3,600 ticks plus uniform `0..3599`; each due attempt schedules
the next, skips at alive cap, and spawns with probability 0.55 within 75% camp
radius. Camps may begin during the first night.

At dawn, keep surviving regular layout enemies; vacant means no living regular
layout enemy within128 of its spec. Deterministically repopulate the first
`min(floor(vacant/2),floor(missing/2))` specs. Do not refresh loot/crates,
dungeon enemies, or legendary extraction state.

Extraction follows section 6.3. Enemy count within 400 is UI-only and does not
block boarding. After the uninterrupted 200-tick board timer, complete
immediately; do not add the unused legacy 400-tick chopper phase.

## 17. Deterministic procedural world

Use deterministic, purpose-specific seeded RNG streams so performance changes
do not perturb unrelated outcomes.

### 17.1 Sectors and fixed landmarks

Divide the 12,800 square by 5,120/2,560/5,120 bands on both axes. Sector ID is
`sector_<row>_<column>`. Center is home. Shuffle corners: first dungeon, second
extraction. Shuffle edges plus remaining corners: first military, second
forest. Shuffle ruined town, abandoned suburb, farmstead, wreckage field, and
roadside village across remaining cells. Connect cardinal neighbors.

Snap centers as `floor(value/16)*16 + 8`; edges as `floor(value/16)*16`.
Every sector has a landmark/reward marker. Home bounds are center sector inset
280; other sectors have lights-out and fast-building-decay flags.

Home offsets: hub `(0,-250)`, energy `(-217,125)`, comms `(217,125)`, spear
pickup `(-128,192)`. Features are 760x520 low-risk core and 1,280x960
medium-risk defense ring.

Extraction offsets: commander `(0,-360)`, snipers `(-420,-240)/(420,-240)`,
AK `(320,-192)`, fence 960x720, pad 420x420, north approach 360x900 at y-720,
perimeter 1,200x900. The fortified village's reserved helipad leaf becomes the
final marker. Initial Thanos spawns there; Wither spawns in dungeon boss room.

### 17.2 Villages, loot, and blueprints

Create thirteen villages: twelve ordinary plus fortified extraction. Exclude
home/extraction/dungeon from ordinary placement, guarantee one per eligible
sector before global placements, retry up to 256, reject rectangle overlap,
retain 64-unit sector margin. Ordinary center margin is x720/y560.

Rank ordinary villages by center distance: nearest four low/common, next four
medium/uncommon, farthest four high/rare. Extraction is boss/epic. Roles:

- civilian: house, cluster, market, camp, supply cache;
- corner scavenger: cluster, market, camp, supply cache, armory;
- other scavenger omits armory;
- military: checkpoint, command post, armory, barracks, motor pool;
- extraction: helipad, house, cluster, checkpoint, command post, armory,
  motor pool.

Footprints: extraction 1,760x1,728; ordinary corner 1,520x1,180; other
1,180x920. Roles beyond four add 18% width and 14% height. BSP: inset96, split
gap160, minimum leaf720, final partition320, ring partition208, split ratio
0.42-0.58, largest-leaf 64-iteration guard then grid fallback. Extraction
reserves central 920x720 helipad leaf and partitions its ring.

Provide two deterministic templates for each role: house
`single_home/side_lot`; cluster `triad_courtyard/lane_row`; market
`crossroad_stalls/corner_vendor`; checkpoint `road_gate/watch_corner`; camp
`shelter_firepit/offset_shelter`; cache `central_crate/stashed_crate`; armory
`locked_barracks/rear_cache`; barracks `double_bunk/bunk_line`; motor pool
`wreck_yard/guarded_wreck`; command `command_house/command_perimeter`;
helipad `wide_lz/tight_lz`. Scavenger adds salvage/scrap variants; military
adds hardpoint/fenced armory; extraction adds fortified LZ. Newly authored
offsets are allowed but MUST obey footprints, counts, clearances and invariants.

Interior chance: furniture 0.3, crate 0.5, enemy 0.5. Interior inset16;
doorway lane half-width48/depth112. Reject wall/door/object overlap. Pruning a
parent prunes all children.

Every village has a crate and ground craftable. Ordinary crates contain exactly
one count-one stack. Weapon pools:

- common: bat, dagger, Glock, spear, sword, cleaver, scissors;
- uncommon: M4A1, crossbow, machete, taser;
- rare: AK, drone, fire axe, machine pistol, shotgun, spiked spear;
- epic: halberd, Desert Eagle, katana, LMG, sniper.

Crate rarity rolls: common source -> .3 common/.7 uncommon; uncommon ->
.3 uncommon/.7 rare; rare -> .5 rare/.5 epic; epic -> epic.

There are 15 distinct blueprint IDs: repeatable armor plus 14 named unlocks.
Generate exactly 17 stacks: armor three times and every other once. Across
common villages place armor +3 rare slots; uncommon armor +2 rare +1 epic;
rare armor +3 epic; extraction one epic; dungeon two rare +2 epic in one
four-stack blueprint crate. Seed/shuffle pools without other duplicates.

### 17.3 Dungeon

Fill the dungeon corner sector. Two entrances face inward from its outer world
edges. Wall64, further inset96, 16-20 rooms, minimum leaf704, split candidate
>=1.65x minimum, choose among four largest, ratios
0.34/0.42/0.5/0.58/0.66, gaps32/48/64. Room inset48; boss room doubles half
extents. Hallways width96 across five depth layers, 45% optional lateral links.
Rasterize solid space to 32-unit cells and compress into composite rectangles.

Required roles: entrance, combat, enemy swarm, maze, trap, armory, mini boss,
treasure, exactly one deepest boss. Fixed contents:

- entrance: pillars +/-200,-120; braziers +/-200,120; drifter -160,0; police
  160,0; 5% uncommon crate;
- combat: barrels -200,-120 / 200,-120 / 190,150; drifter -120,0; shoota
  120,0; police 0,112; 20% uncommon crate;
- swarm: four bone piles; drifters -240,-160 / 0,-180 / 240,-160; shootas
  -180,140 / 180,140; police 0,220; 5% uncommon crate;
- treasure: statues +/-230,-40; three gold piles; rare/blueprint/epic crates
  at x 96/0/-96;
- maze: four pillars, stalker -200,-180, police 220,180, H/V tripwires;
- armory: four racks, barrel 0,180, police 0,-120, T4 crate 0,96;
- trap: bone piles/barrels, police -160,0, stalker 160,0, three tripwires,
  50% rare crate;
- mini boss: pillars/braziers, commander center, epic crate 0,160;
- boss: throne 0,-210, pillars/braziers +/-250, Wither 0,-80, megaknight
  -220,160, sniper 220,160.

Acceptance: entrances/all rooms connected; all roles; one boss; 10-200 wall
rects; >=10 ordinary enemies; >=6 crates and mean 8.2-10 over seed corpus;
rooms >=240x224; no open-space leakage; >10,000 open cells and >=0.97
reachable ratio on 32-unit audit; no unreachable major feature.

### 17.4 Static cleanup and loading

Tree count is `floor(area/520000)` for corners and `floor(area/680000)` for
edges; keep 180-unit border. Accept static objects in authored order and prune
later exact overlap. Handle crates separately, prune trees against structures,
remove orphan interiors. Military fences step384 and leave 260 half-span gates.

Lobby map is 1,000 square with one hub near center y+56. Gameplay loader
instantiates every registered object, labels layout enemies, fills crates,
skips crates overlapping static geometry, registers first infrastructure
towers, and emits map/minimap metadata. Any unresolved resource ID is fatal.

## 18. Replication, security, and operational behavior

Each runtime tick drains world events and prepares snapshots. For each player,
AOI center is self while alive, spectated target while dead, or whole world for
debug. Preview observers receive one reusable full-world snapshot without
gameplay events.

Snapshot limits/refresh:

- initial ticks <=2 are full;
- more than 1,024 entity updates or 96 removals forces full;
- a newly visible entity is sent complete four times;
- reliable full entity refresh every 600 ticks;
- map/layout only in full frames;
- minimap contains all players globally each tick;
- AOI is square broad phase at radius 1,440, own player always included;
- AOI exit emits removal and clears per-client fingerprint; reentry is full;
- events relevant inside radius+180, or always when the recipient is a direct
  source/target participant.

Fingerprint/version state covers transforms, velocities, HP/alive, owner,
hitboxes, player inventory/effects/equipment, enemy target/equipment/armor, and
specialized fields. An ordinary delta strips unchanged stable type/maxHP/alive/
owner/hitbox and enemy equipment fields.

The rewrite MUST optimize the reference's expensive global every-entity,
every-tick snapshot materialization. Prefer versioned dirty components and
materialize only the union of recipient AOIs; share AOI recipient sets by
region and reuse fixed-layout encoding buffers. Observable full/delta cadence,
reliable refresh, ordering, bytes, and removals remain as above.

Inbound frames over 16,384 bytes send a typed error then close code 1009.
Normal disconnect is 1000. Reject NaN/infinity on every numeric trust-boundary
field. Structural validation is only the first layer: all state mutation still
checks alive state, ownership, proximity, capacity, bounds, teams, and current
world. Add bounded per-client message/action rate limiting sized above all legal
input/automatic-fire rates.

Chat strips controls, trims, cuts to 240, and ignores empty. Configured filter
terms are treated as escaped literal, case-insensitive whole words. Whisper
matches normalized name exactly; reply maps to last whisper sender and cleans
on disconnect.

All spawn/kill/effect/give/time/map commands and debug-log HTTP routes require
non-production authenticated debug-admin status. Production disables map
filesystem mutation and focused trace. Focused trace may retain 4,000 entries
and discard oldest.

Operational telemetry MUST expose tick compute distribution, schedule skips,
overload count, connections/runtimes/entities, AOI entities, snapshot bytes,
codec failures, action rejection reasons, path/collision counters, GC/memory,
and the performance benchmark report without exposing player-private content.

## 19. Explicit clean-room decisions

These decisions resolve reference comments, defects, and stale surfaces:

1. “2x TPS” means sustainable compute throughput at equal semantics, not
   configured 20->40 scheduling. Section 2 is the only gate; 2.5x is optional
   stretch.
2. Binary network/client zeros from the legacy benchmark are invalid.
3. Successful matches persist only through result actions, then dispose when
   empty; failed matches dispose after returning players.
4. Explicit respawn is playground-only; match deaths wait for dawn.
5. Manual lobby start is host-only. Open matchmaking excludes started rooms;
   direct code join may late-join one with space.
6. Admin and debug HTTP access are secured and production-disabled.
7. Wave composition remains the deterministic night-number LCG; enemy rotating
   loadouts become match-seeded rather than process-global.
8. Wither fixed loot is 1,000 hunk. Numeric content overrides contradictory
   prose (`Crossbow` magazine is eight; rifle label is AK-47).
9. Blueprint catalog is 15 distinct IDs and 17 placements including three
   armor copies.
10. Enemy ranged damage remains x0.5 at night/energy loss; range/cooldown
    return to baseline.
11. Reload timers count real server ticks, not simulation speed.
12. Camps may populate during first night.
13. Extraction danger count does not block boarding.
14. PvP damage remains enabled.
15. Chest weapon transfer resets ammo/cooldown state.
16. Placement range uses unsnapped requested center and overlap/bounds use the
    rounded actual hitbox.
17. Current direct camera follow is normative; no hidden smoothing.
18. Desktop keyboard/mouse is required. Mobile layout should not crash, but
    touch/gamepad gameplay is out of scope.
19. Generated distribution bundles are not source artifacts; clean build
    output is authoritative.
20. Similar newly authored art is required; copying reference PNG bytes is not.
21. Procedural tuning, loot, content, protocol, and config all participate in
    compatibility hashing.

## 20. Required test and benchmark matrix

Use the runtime's native test runner for unit/integration and a real browser
automation runner for end-to-end. Tests MUST be deterministic, parallel-safe,
and leave no listeners/processes/files behind. CI runs release-equivalent code.

### 20.1 Unit tests

Shared/config/content:

- strict parsing of every config/content/procedural record, cross-field bounds,
  registry exact coverage, resource IDs, name normalization, compatibility hash;
- authored tick scaling/fractional runtime rate and effective simulation time;
- armor reduction/reflection, team matrix, build validation/snapping;
- angle normalization/interpolation, integer hash, grid insert/query/removal and
  marker rollover;
- all item/weapon/projectile/effect/building/enemy constants in section 15;
- content generator coverage and loud missing art/runtime mapping.

Protocol/client:

- every client/server message accepts valid and rejects malformed/non-finite/
  out-of-range data;
- compact input and every compact snapshot tuple round-trip within 0.1-unit/
  angle tolerance; corrupt binary fails closed; size <=50% JSON;
- full/delta apply, absent full entity removal, explicit removal, incomplete
  unseen delta wait, map keyframes, AOI leave/reentry;
- snapshot/interpolation histories bounded, duplicate/out-of-order ignored,
  same-tick replace, alive/jump discontinuity snaps exactly once;
- perfect/mild/bad seeded network profiles reproduce exactly;
- at 50 ms server tick and 60 FPS: perfect velocity CV <=0.08, no
  freeze/reverse/large-step/snap/extrapolation, interpolation ratio >=0.95;
  mild seeds 1/2/3/42/99 CV<=0.22, <=2 freezes, zero reverse, <=2 large steps,
  interpolation>=0.85; bad seeds 1/2/3/42/99/12345 CV<=0.4, <=8 freezes,
  zero reverse, <=8 large steps, interpolation>=0.7, extrapolation<=0.2;
- input router priorities, blur release, `R` reload, modal pointer gate, ammo
  total, magazine recipe discovery, HUD model states.

Server primitives:

- tick clock normal/catch-up-three/skip/overload cadence;
- independent input/action sequences and invalid action non-consumption;
- effect refresh/pulse/death ordering and simulation-speed behavior;
- each melee shape/status/combo/occlusion and every ranged ammo/reload/spread/
  fan/split/homing/piercing behavior;
- swept projectile static/target ordering, no repeat target, bounds/range;
- every radial falloff;
- inventory all-or-nothing capacity, cost order, targeted craft, global
  blueprint/armor chain, drop/use/pickup/recycle/chest/repair;
- goal channel arbitration, hidden grace, player-before-building, intercept;
- navigation direct path/A*/corner rule/cache/invalidation/eviction;
- static collision sweep/recovery/world bounds and dynamic wall-safe correction;
- wave LCG/floors/buckets, camp schedule/chance, extraction timer reset;
- chat tokenizer/sanitizer/filter/autocomplete/auth.

Collision fuzz MUST run seeds 1-250, 60 steps each, worlds 360-900, 3-12
walls, 3-10 actors, 2-6 pickups, varied extreme velocities. Assert finite,
in-bounds, no dynamic-static penetration, no entity growth, and insertion-order
independence where required.

### 20.2 Integration tests

Run real in-process server/runtime and binary codec:

- HTTP health/runtime config/static containment/SPA; TLS both-or-neither;
  WebSocket upgrade, size limit, compatibility, preview, duplicate names;
- lobby open/code/host/countdown/start/late code join/leave/failure/success and
  cleanup;
- playground-to-match starter inventory and deterministic spawns;
- movement stale input, diagonal normalization, authoritative collision;
- full day/night with waves, first-night camps, energy/comms failure and repair,
  dawn enemy/player refresh, night held until threats clear;
- multiplayer loot, inventory, chest, crafting, recycling, blueprint late
  join, armor, manual reload, placement/nav/static mutation, tower repair;
- cannon owner/energy gate, Tesla/landmine/tripwire, all boss abilities;
- finite crate/death/player-drop economy and no ambient pickups;
- all-player extraction requires 200 consecutive ticks; danger doesn't block;
- AOI with 0/normal/debug radius, full/delta thresholds and event relevance;
- deterministic world checksums for a seed corpus.

Worldgen seed-corpus assertions: nine sectors; distinct dungeon/extraction
corners; 13 villages with 4/4/4 tiers; one Wither and initial Thanos; no
legendary/wave-only normal pool; 15 distinct/17 blueprint placements; village
crate+loot; ordinary crates one stack; dungeon blueprint crate four; no static
overlap/orphan interior; protected extraction leaf; dungeon role/reachability/
volume constraints from section 17.

### 20.3 Browser end-to-end

Use at least two isolated browser contexts against a production server:

1. load real blurred preview, leave first name blank, validate name errors;
2. join unique players, reject duplicate case-insensitive name;
3. create/join lobby, verify host controls/countdown/start;
4. move/aim/attack with keyboard/pointer; blur releases movement;
5. explicit pickup, inventory/hotbar/chest drag, craft, ammo reload, blueprint
   unlock visible to both and a late joiner;
6. place wall/cannon/Tesla, verify invalid preview/authority, destroy energy/
   comms, observe darkness/minimap/extraction/cannon changes, repair;
7. kill a match player, verify spectate/no explicit respawn, dawn respawn;
8. survive a night and verify timer waits for last wave enemy;
9. put every living player on helipad for ten seconds, interrupt/reset once,
   then extract and verify result/replay/lobby cleanup;
10. separate deterministic loss flow to game-over.

Capture/menu-diff the visual states in section 13 at 1920x1080 and 1366x768.
Also assert semantic DOM labels/focus/keyboard controls, no console errors,
no world action from modal clicks, no stale entity after migration, and all
WebSocket/browser processes shut down.

### 20.4 Performance and soak benchmarks

The all-benchmarks command MUST include the section 2 realistic gate and
protocol compression plus:

| Scenario | Frozen workload | Required reference ceiling |
| --- | --- | --- |
| collision | 3 clients, radius1400, 180 police, 260 walls, 120 bullets; warm40/sample180; +24 arrows/20 ticks | avg20ms, p95 40, collision p95 24/p99 36 |
| combat burst | 6 clients, radius1300, 260 shoota, 140 walls; 80 mixed projectiles/12; warm30/sample180 | avg20, p95 40, p99 110, collision p95 24, net p95 120KB |
| AOI | 32 clients, radius520, 260 police, 160 walls; warm40/sample180 | avg20, p95 40, p99 75, snapshot p95 90KB/max180KB |
| long run | 12 clients, radius1000, 300 mixed, 260 walls; warm60/sample900; +36 bullets/45 | p99 110, heap growth <=96MiB, entity growth<=80 |
| multiplayer scale | 8/16/32/64 clients, radius720, 240 drifters, 180 walls; warm30/sample150 | largest avg20, p95 40, world p95 65, avg <=85KB/client/tick |
| pathfinding | 6 clients, radius1600, 360 wallbreakers, 720 dungeon walls; warm50/sample220 | avg20, p95 40, nav dirty p95 8, search avg1.8, nodes6500, failures<=40 |
| tick budget | 4 clients; dungeon70/320, mixed140/80, projectile90/60+120; warm30/sample120 | every avg/p95/p99/max/world p95 <=10ms |
| lights/network | 4 clients, 180 mixed, 320 walls plus 900x3 blocker render | network p95/max<=2Mbps; blocker p95/p99<=2.0833ms |
| compression | 16 clients, 180 police, 120 walls; warm20/sample80 | >=50% byte saving, encode p95<=2ms |

The primary realistic run still MUST meet section 2's >=312.1653 median gate;
legacy scenario ceilings are parity guards. No scenario p95 may regress >5%
against a same-host source measurement and network bytes may not regress >5%.

Run a multi-night soak with 5 active clients and preview observer. Require no
tick backlog/skips at configured 20 TPS, no ID reuse, stuck night, stale AOI
entity, unbounded queue/history/particle/timer, or >10% steady-state heap growth
after warmup. Archive raw samples, screenshots, traces on failure, and all JSON
benchmark reports.

### 20.5 Definition of done

Release is accepted only when:

- install, typecheck, production build, unit, integration, and browser E2E pass;
- deterministic checksums and all exact content/schema assertions pass;
- five-run TPS gate and every parity benchmark pass with raw reports;
- README documents controls, environment, tests, benchmark command/result,
  known desktop-only scope, and clean-room art provenance;
- no skipped/flaky/quarantined acceptance test and no benchmark-only shortcut.

## 21. Independent clean-room review resolutions

This section closes the independent clean-room review performed after the first
complete draft. It is normative and overrides earlier wording where the two
conflict. The reconstruction target is the complete game described here, not
bit-for-bit interoperability with the source client/server, copied artwork, or
identical procedural coordinates. Semantic mechanics, numeric content, family
counts, authority, deterministic behavior, test coverage, visual character,
and the section 2 workload/performance gate are required. Internally consistent
new wire IDs and newly authored deterministic layouts are acceptable only where
this section explicitly says so.

### 21.1 Performance and acceptance fixtures (B01-B09)

- **B01 counts.** Setup contains exactly 660 enemies and 1,042 entities:
  enemies 660, players 9, structures 370, towers 3. After the 60 warmup and 300
  measured ticks, normal simulation removes one bomber, leaving enemies 659
  and total entities 1,041. Tick-zero enemy types are bomber 40, commander 55,
  drifter 270, megaknight 40, police 75, ranger 20, shoota 55, sniper 40,
  stalker 55, Thanos 5, and Wither 5. Tick 360 differs only in bomber=39.
- **B02 clocks.** The authoritative runtime is 20 TPS and authored tick
  durations use the 20-TPS reference. `OPT_TARGET_TPS=50` is only the legacy
  report budget and client-frame timestamp scale. `client_time_ms=50*t`
  correctly models a 20-TPS input clock. It does not configure the simulation.
- **B03 checksums.** Count parity above is the cross-implementation oracle.
  Determinism uses UTF-8 SHA-256 of compact JSON containing records
  `[id,typeId,round(x,3),round(y,3),round(rotation,6)]`, sorted by numeric ID.
  Two fresh runs of one implementation MUST match at setup and tick 360.
  Informative source digests are setup
  `6f185e70fc6a374bd872a10ce911f8d4f5266dedce6bfd254e3f315ca0773982`
  and tick 360
  `385f97317b18829b7d27e9abbb877f1341ee49ca569a45e6422c3236895fa615`;
  they are not a gate because newly authored layout coordinates are allowed.
- **B04 client setup.** Construct clients with the normal ready-player factory
  and normal starter inventory, then set each authoritative player center to
  its row-major sector center before tick zero. This is test fixture setup, not
  a benchmark-only branch in production simulation.
- **B05 initial state.** Begin at match tick 0, Day 1 elapsed 0, nightCycle 0,
  energy/comms alive, extraction locked, empty normal-match hotbars, all enemies
  alive, no queued actions/attacks/projectiles, all production systems enabled,
  and nine recipients with no prior snapshot fingerprints. The deterministic
  movement inputs are the only client actions during warmup/sample. Camps and
  waves follow normal timers; none is manually injected.
- **B06 measurements.** The whole-tick sample is inclusive. Subsystem timers
  are exclusive leaf durations and may sum to less than the whole tick but
  MUST NOT overlap each other. Percentiles use nearest rank
  `sorted[ceil(p*n)-1]`; mean is arithmetic. Byte counts are encoded payload
  bytes before WebSocket framing; displays use KiB (`bytes/1024`). Checksums
  are computed outside timed regions after setup and tick 360.
- **B07 secondary fixtures.** All secondary scenarios use seed 1337, Day 1,
  empty player inventories, fresh full-snapshot recipients, row-major entity
  IDs, and no actions except the named periodic projectile injection. Place
  clients on an evenly spaced square grid centered at `(6400,6400)` (spacing
  36 for collision/combat, 420 otherwise); place enemies and walls in separate
  row-major square grids centered there with spacing 28, offset the wall grid
  by `(14,14)`, and alternate "mixed" enemy/projectile types in the table order
  of sections 15.4/15.5. Projectiles point east; each injection starts at the
  owning clients in client-index order. `dungeon70/320` means 70 enemies and
  320 dungeon walls, `mixed140/80` means 140 mixed enemies and 80 walls, and
  `projectile90/60+120` means 90 enemies, 60 walls, and 120 projectiles. A
  checked-in JSON manifest expands these rules and its SHA-256 is archived with
  results.
- **B08 parity guards.** The numeric ceilings in section 20.4 are authoritative.
  The relative 5% p95/byte comparison is required only when a same-host source
  report is supplied; it is otherwise reported as `not_available`, never
  treated as a failure or silently proxied.
- **B09 hardware.** Only the designated Xeon/Bun 1.3.8 environment can certify
  the fixed 312.1653 gate. Other hosts run identical fixtures and report
  diagnostic results without a pass claim.

### 21.2 Protocol, schemas, compatibility, and replication (B10-B27)

- **B10 IDs and records.** Canonical namespaces are `item`, `mag`, `blueprint`,
  `enemy`, `projectile`, `building`, `tower`, `structure`, and `effect`.
  Unless an ID is printed elsewhere, derive its path from the displayed label
  by lowercase ASCII, replacing runs of nonalphanumerics with `_`, trimming
  `_`, and use explicit familiar spellings `ak_47`, `m4a1`, `m249_saw`,
  `glock_17`, and `thanos`. Insert records in the order of section 15 tables.
  A content record is strict and consists of `id,label,rarity?,maxHp?,
  speed?,collisionMode?,hitboxes?,recipe?,loot?,runtime?`; family-specific
  numeric fields are exactly those table columns. Unknown keys or IDs fail
  startup. This generated catalog, table order, and its strict validator are
  the canonical manifest; source registry hash parity is not required.
- **B11 HTTP.** `/healthz` returns status 200, content type JSON, and exactly
  `{"ok":true}`. `/runtime-config` returns status 200 and
  `{compatHash,tickRate,simulationSpeedMultiplier,worldSize,
  interpolation,wsPath}` where `worldSize={w,h}`, `interpolation` is the
  fully expanded section 6.1 object, and `wsPath="/ws"`. All fields are
  required, finite where numeric, and no unknown keys are accepted by the
  client.
- **B12 object discriminators.** Use `t` values `hello`, `input`, `action`,
  `respawn`, `ping`, `chat`, `lobby`, `welcome`, `pong`, `error`,
  `lobby_state`, `game_complete`, `game_over`, `spectate`, and `snapshot`.
  `action` is `{t:"action",seq,action:<variant>}`; `lobby` is
  `{t:"lobby",op:"open"|"join"|"leave"|"start",code?}`. Server error is
  `{t:"error",code,message,fatal:false}`. Lobby state is
  `{t:"lobby_state",lobbyId,code,hostId,members:[{entityId,name,connected}],
  maxPlayers,started,createdAtMs,serverTimeMs}`. Results and other payloads use
  exactly the fields listed in section 14. Integers are safe nonnegative
  integers unless a narrower domain is stated; strict boundary parsing rejects
  unknown keys.
- **B13 actions.** Variants are
  `{kind:"attack",theta}`, `{kind:"craft",itemTypeId,destination?}`,
  `{kind:"build",slot,x,y}`, `{kind:"move_slot",from:{container,index},
  to:{container,index}}`, `{kind:"select",index}`,
  `{kind:"equip_armor",container,index}`, `{kind:"drop",container,index,
  whole}`, `{kind:"pickup",entityId}`, `{kind:"recycle",container,index}`,
  `{kind:"reload",slot}`, `{kind:"repair",towerId}`, and
  `{kind:"use",slot}`. Containers are `hotbar|chest|armor`; indices are
  zero-based and armor index is always zero. Build consumes the buildable in
  the explicit slot. Craft destination defaults to the lowest fitting hotbar
  slot. Every target/range/state check is repeated authoritatively at drain.
- **B14 sequences.** Input and action each use a per-connection unsigned
  32-bit counter starting at zero, strictly greater than the last accepted
  value, with no wrap; close with `sequence_exhausted` after `0xffffffff`.
  Structural/rate validation occurs before acceptance. State-dependent
  validation occurs FIFO at drain. A structurally valid queued action consumes
  its sequence even if later state-invalid; a structurally/rate-invalid action
  does not. At the 64-action cap reject the new action with `queue_full`; never
  drop an old action.
- **B15 rate limits.** Per connection token buckets are: input 40/s burst 80,
  action 30/s burst 60, chat 4/s burst 8, ping 4/s burst 8, lobby 4/s burst 8,
  and hello one per socket. Excess produces nonfatal `rate_limited`, does not
  mutate sequence state, and three consecutive ten-second windows above twice
  the limit close the socket.
- **B16 compact nested tuples.** Empty slot is `[0]`; weapon is
  `[1,typeId,cooldown,ammo,magSize,reserveMags,reloadTicks,reloadRemaining]`;
  counted item/buildable is `[2,typeId,count]`. Inventory is
  `[resources,slots,selectedIndex,unlockedRecipeIds,armor]`, with resources
  `[[typeId,amount]]` and armor `null|[typeId,tier,reduction]`. Chest slots use
  the same slot form. A sent entity always carries a complete base/extra tuple;
  delta packets omit unchanged entities rather than sparsifying tuple fields.
  Thus `null` means an actual absent nullable value and never "unchanged."
  Map sector is `[id,label,archetype,row,column,minX,minY,maxX,maxY,
  lightsOut]`; feature is `[id,label,role,risk,reward,minX,minY,maxX,maxY,
  centerX,centerY]`; marker is `[id,label,archetype,importance,discovered,
  x,y,risk|null,tier|null]`. Event tuples append `eventId` immediately after
  their code, followed by section 14 field order.
- **B17 enum codes.** Entity codes: player 1, enemy 2, building 3, tower 4,
  structure 5, projectile 6, pickup 7. Phase: day 0, night 1. Extraction:
  locked 0, active 1, boarding 2, complete 3, reserved-unused 4. Lock reason:
  comms_offline 1. Damage: melee 1, projectile 2, explosion 3, effect 4,
  environment 5, reflection 6. Explosion style: landmine 1, drone 2,
  wallbreaker 3, bomber 4, megaknight 5, rocket_visual 6. Codes not listed
  here are UTF-8 string IDs, not implicit numeric enums.
- **B18 delta model.** Full and delta use identical complete entity tuples.
  Full contains every AOI entity; delta contains only new or fingerprint-
  changed complete entities. Removed IDs are explicit. A client never admits
  an unknown entity from any other representation. This supersedes any earlier
  suggestion of stripped entity fields or an unchanged sentinel.
- **B19 duplicate tick.** First accepted snapshot for a `(worldId,tick)` wins.
  Later same-tick packets are ignored byte-for-byte or otherwise; they never
  replace state. Tests named "same-tick replace" MUST be renamed to
  "same-tick ignore."
- **B20 cadence/order.** A recipient gets full frames on its first snapshot,
  ticks 0, 1, 2, and every tick divisible by 600. The periodic frame is a full
  AOI world frame. Entities are ascending numeric ID, removed IDs ascending,
  and events in authoritative emission order. Fingerprints compare the exact
  quantized compact tuple.
- **B21 events.** World `eventId` is monotonic uint32, allocated in emission
  order and reset only with a new `worldId`. Clients deduplicate by
  `(worldId,eventId)` using a 1,024-entry rolling set; two identical events in
  one tick still have different IDs.
- **B22 binary profile.** Use one pinned MessagePack implementation on both
  ends, shortest-width integer/string/array encodings, float64 for
  nonquantized fractional numbers, no extension values, strict UTF-8, and
  declared tuple/array order. The JSON denominator is UTF-8 byte length of
  compact `JSON.stringify` on the fully expanded semantic object with keys in
  schema declaration order and no omitted optional fields.
- **B23 quantization.** Apply x10 rounding only to world x/y/vx/vy, hitbox
  offsets/width/height, radii, lengths, map bounds/centers, movement speeds,
  effect speed multipliers, HP and damage. Counts, IDs, ticks, masks,
  importance/risk/tier codes are integers and not quantized. Reject nonfinite
  or values outside signed 32-bit quantized range; canonicalize `-0` to `0`.
  Angles normalize to `[0,2π)` before encoding; encoded 65535 decodes and
  renormalizes to zero.
- **B24 compatibility descriptor.** It is
  `{schemaVersion:1,content,gameplayConfig,protocolCodes,compactFieldOrder,
  eventCodes,runtimeConfigFields,proceduralTuning}`. Canonical JSON recursively
  sorts object keys, preserves array order, rejects undefined/nonfinite values,
  uses compact JSON and UTF-8, then FNV-1a as section 14.2. The expected value
  is generated by the reconstruction and checked into a golden test after all
  authored records exist; source hash equality is not required. A one-field
  mutation test MUST change it.
- **B25 network-simulation RNG.** State transition is
  `state=uint32(imul(state,1664525)+1013904223)` and sample is
  `state/2^32`. Inbound seed is the requested seed; outbound is
  `seed XOR 0xa5a5a5a5`. For each packet draw, in order: loss, duplication,
  base-delay jitter, duplicate jitter, reorder. Jitter is continuous uniform
  `[-configuredJitter,+configuredJitter)`. Queues order by delivery time then
  insertion ID; duplicates receive a new insertion ID.
- **B26 connection states.** A socket begins `awaiting_hello`, with a
  five-second monotonic timeout. Preview hello creates an observer only. A
  later normal hello on that socket atomically releases preview capacity and
  creates a fresh player identity; incompatible hello gets fatal
  `compat_mismatch`. Welcome precedes the first snapshot. World migration
  clears history/event dedupe before the new welcome. There is no identity
  resume or automatic reconnect.
- **B27 map size field.** Compact `sectorSize` means the center-band width
  2,560 only. Every actual transform uses explicit sector bounds; the scalar
  is informational.

### 21.3 Gameplay and deterministic state (B28-B59)

- **B28 rarity.** Section 15.4 is item/death-loot rarity. Section 6.7 `Tier`
  is renamed **wave unlock tier** and affects selection only; bomber unlocks
  uncommon, saboteur unlocks rare, and commander unlocks epic despite their
  content rarity.
- **B29 enemy modifiers.** Day/energy-on uses melee cooldown x2, ranged damage
  x0.5, ranged cooldown x6, and range x0.5. Night or energy-off uses melee
  cooldown x1, ranged damage x0.5, ranged cooldown x3, and range x0.75.
  Section 6.5's night ranged-damage `1x` cell is superseded.
- **B30 teams.** Player damage may hit player or enemy (including crates);
  enemy damage may hit player only; environment damage may hit player only.
  Buildings/towers are player, normal structures environment, crates enemy.
  No self-hit unless an authored self-knockback explicitly says so.
  Reflection validates this matrix against the original instigator.
- **B31 damage.** HP and damage stay float64 with no rounding until protocol
  quantization. Order is legal-team check, outgoing modifier, armor reduction,
  HP subtraction, one nonrecursive Aegis reflection equal to 10% of
  post-armor positive damage, death handling, then events. Reflection receives
  the attacker's armor if applicable and cannot reflect again. Any positive
  legal damage dealt or received resets that participant's combat-heal delay.
- **B32 effects.** An instance stores type, remaining duration, pulse interval,
  pulse damage, speed multiplier, action prevention, source ID, and
  next-pulse countdown. Reapplying a type atomically replaces all parameters,
  source, duration, and pulse phase; different types coexist. Immediate
  damage/heal effects do not persist.
- **B33 recipes.** `C/U/R/E/L` are common/uncommon/rare/epic/legendary.
  Numeric Hunk is the one-output craft cost; `uncraftable` has no recipe.
  Every item, buildable, consumable, armor, and magazine row produces one
  unit, except weapon fire consumes ammunition rather than a crafted
  projectile. Magazine costs in section 15.2 are exact one-mag recipes.
- **B34 armor progression.** Store lobby-wide `armorBlueprintLevel` 0..3.
  Each of the three `blueprint:armor` pickups increments it once; levels 1, 2,
  3 unlock T2, T3, T4. T2 is not immediate despite uncommon rarity; this
  explicit progression overrides the generic rarity rule.
- **B35 projectiles.** Firecracker children use -30,-15,0,15,30 degrees,
  spawning on first enemy/static impact or range exhaustion; the main shell
  applies its direct 30 before splitting and has no radial damage. Homing drone
  picks nearest legal target by hitbox distance then ID, turns instantly each
  tick, and detonates on target/static/range. Range is cumulative path length.
  Each projectile tracks hit entity IDs and cannot hit one twice. Resolve the
  earliest parametric contact; static wins an epsilon tie, otherwise lower ID.
- **B36 rocket.** Thanos rocket deals 100 direct projectile damage to its
  first legal target and despawns. It has no radial gameplay damage, falloff,
  or impulse; its orange trail/impact burst is visual only.
- **B37 towers.** Cannon acquires the nearest visible enemy within 650 by
  squared distance then ID, rotates toward it, uses normal static occlusion,
  fires only through its listed one-round magazine, and reloads internally in
  36 real ticks without consuming player magazines. Tesla starts a wave when a
  previously unlatched enemy first touches its 140 radius; the ring expands
  6/tick, hits each captured enemy once, ends at 24 ticks, and cannot retrigger
  for an enemy until that enemy leaves the radius and re-enters.
- **B38 decay.** A player building whose containing sector has
  `allowsFastBuildingDecay=true` takes `maxHp/400` damage per authored
  simulation tick (scaled by simulation speed), so a full-health building
  lasts 400 authored ticks. Other sectors never decay it. Moving is impossible,
  so qualification is fixed at placement.
- **B39 melee geometry.** Swing is an inclusive circular sector centered on
  actor position, facing rotation, with listed radius/angle. Jab is an
  inclusive forward capsule with listed range and width. Test target resolved
  AABBs, use earliest contact distance, static occlusion at a strictly smaller
  entry distance, and numeric ID ties. Katana combo state selects its authored
  alternate jab; each attack can hit each legal ID once.
- **B40 hitboxes.** Entity x/y is the profile origin. Rect offsets are local
  centers and normally remain axis-aligned; only explicitly rotated tripwire
  geometry rotates. Bounds are center +/- half dimensions. Positive-area
  overlap collides; edge touching alone does not. Visual dimensions do not
  alter collision, HP bars, clamps, or AOI, all of which use resolved rects.
- **B41 collision pairs.** Living players/enemies are dynamic and collide with
  static blockers and each other, splitting correction equally subject to the
  configured cap. Buildings/towers/ordinary blockers are static. Pickups are
  dynamic against static geometry but neither push nor are pushed by actors.
  Projectiles, landmines, tripwires, decorative none-mode props, and dead
  entities do not enter the solver. Sort candidate pairs by `(minId,maxId)`.
- **B42 A*.** Neighbor order is N,E,S,W,NE,SE,SW,NW. Diagonal moves cannot cut
  a blocked cardinal corner. Queue tie order is `f`, `h`, insertion number.
  A tile is blocked by positive-area overlap with a canonical static rect.
  Return tile-center waypoints excluding the start and including the goal.
  Blocked-ring search visits increasing Chebyshev radius, clockwise from north.
  Cache key is start tile, goal tile, nav revision, actor clearance.
- **B43 inventory.** Resources always fit. Bag pickup is atomic: resources,
  then bag slots in insertion order, merge counted items of identical type,
  then lowest empty hotbar. Armor remains a counted hotbar item until an
  explicit equip action. Nearest comparisons use point-to-resolved-hitbox
  distance then entity ID. Slot move merges identical counted items, swaps two
  compatible slots, and otherwise fails without mutation. Any pickup failure
  rolls the entire transaction back.
- **B44 recycle.** All non-resource, non-blueprint items with rarity, including
  armor/consumables/buildables/weapons, are recyclable; legendary boss gear
  uses 200-300. A named match stream `recycle` makes exactly one inclusive
  integer draw after validation. Recycling from a chest is one atomic
  remove-and-reward transaction and does not need a temporary hotbar slot.
- **B45 held interactions.** `E` chooses nearest eligible pickup/use target by
  hitbox distance then ID; armor is equipped only through its UI action. Server
  validates at press/start and completion and cancels on release, death,
  leaving range, or target invalidation; incoming damage alone does not cancel.
  `R` repairs the nearest damaged, in-range, affordable infrastructure target
  by distance/ID; if none can begin, it reloads the selected gun.
- **B46 time domains.** At startup, scale every authored server tick constant
  by active rate relative to 20 TPS. During play, movement, cooldowns, effects,
  AI abilities/repaths, day/night, decay, stale input, and camp timers advance
  by simulation multiplier. Reload and already-queued wave-delay counters
  decrement exactly once per real server tick. The 750-ms interaction hold and
  DOM/presentation timers use monotonic wall time.
- **B47 phase counters.** Start Day 1, nightCycle 0, elapsed 0. Dusk increments
  nightCycle before entering Night 1; dawn increments dayCount before Day 2.
  `waveEnemies` is living spawned wave enemies, `waveSpawns` pending entries,
  and `waveThreatTotal` their sum including the cycle-7 boss.
  `wavesCompleted` increments once at each dawn after all threats clear.
- **B48 wave draws.** Every enemy costs one budget. First satisfy floors in
  table tier order using weighted draws restricted to that exact unlock tier;
  then draw remaining slots over all permitted tiers. Map `state/2^32` into
  half-open cumulative weights in section 6.7 row order. If a result is all
  police, replace its last member with the first eligible non-police common.
- **B49 wave positions.** Default center is world `(6400,6400)` unless a
  trigger supplies an explicit point. Draw angle continuous `[0,2π)`, then
  integer radius 600..900 inclusive, then independent integer x/y jitter
  -20..20 from the night LCG. Clamp the full hitbox inside world bounds; do not
  reroll blockers or player proximity.
- **B50 cycle 7.** Spawn a distinct Thanos at the extraction marker center on
  entering Night 7, tag it wave-source, and include it in threat totals so it
  blocks dawn. The initial extraction Thanos may coexist if still alive.
- **B51 camps/dawn.** World generation emits camp records in sector row-major,
  then camp insertion order. Camp centers are the sector-center-relative
  corner/edge positions implied by margin/radius in section 16.6. A per-camp
  match stream selects group size/type and a uniform polar point within 75%
  radius. Every attempt schedules the next `3600+uniformInt(0,3599)` before
  cap/probability checks. Dawn `missing` is original regular spec count minus
  living regular-layout count; "first" means layout insertion order.
- **B52 random streams.** Use 32-bit FNV-1a of UTF-8
  `<uint32MatchSeed>:<streamName>` as state for named streams `world`,
  `village`, `dungeon`, `static`, `camp:<id>`, `enemy_loadout`, `death_loot`,
  `recycle`, and `blueprint`. All use the B25 LCG, `floor(sample*n)` indexing,
  inclusive integer `lo+floor(sample*(hi-lo+1))`, and Fisher-Yates from end to
  start. Iterate records in canonical insertion/ID order.
- **B53 generic targeting.** On scheduled AI evaluations, consider living
  legal targets whose center-to-hitbox ray is not blocked before target entry.
  Prefer a visible player within the behavior's fire/melee range, then nearest
  living player inside aggro, then enemy-specific priority building classes,
  then nearest other player building. Distance ties use ID. Hold target,
  movement, and channel state between LOD evaluations; clear after leaving
  aggro or 100 consecutive failed LOS evaluations.
- **B54 bosses.** Ability cooldowns start full. Choose nearest living legal
  player by distance/ID. Bosses freeze translation during windup/channel but
  may rotate; casts are interrupted only by death. Megaknight follows
  windup-airborne-land-recovery and lands after its three airborne ticks.
  Wither airstrike iterates a row-major 4x4 grid, omits two cells selected by
  its named stream, and applies each strike once after warning. Cardinal beams
  start east then south/west/north. Rotating beams start at actor rotation,
  rotate clockwise two turns, and damage every overlap tick. Thanos weapons
  have their section 15 magazines/reloads and priority channels prevent
  simultaneous attacks.
- **B55 lifecycle.** A direct late join gets a new alive starter player at the
  lowest unused home spawn. Disconnect removes that player immediately from
  alive/extraction counts and transfers host to earliest connected member.
  A finished runtime is frozen while members remain. Play Again leaves the old
  result room and joins/creates an open lobby; Return leaves to menu. Dispose
  the old runtime when its last member leaves.
- **B56 names.** After control stripping/trim, require ASCII
  `[A-Za-z0-9 ]{1,20}`. Consecutive/leading/trailing spaces are allowed only as
  preserved after outer trim. Case-insensitive uniqueness is per lobby/runtime,
  not global.
- **B57 commands/admin.** Public: `/help`, `/me <text>`, `/say <text>`,
  `/whisper|w|tell <name> <text>`, `/reply|r <text>`, `/list`; responses are
  system chat and failures use `Usage: ...`. Admin commands accept the IDs,
  selectors, counts/coordinates described in section 14.2. They and
  `/debug/metrics` exist only with `NODE_ENV!="production"`,
  `ENABLE_ADMIN=1`, and a nonempty `ADMIN_TOKEN`; HTTP uses
  `Authorization: Bearer <token>`, sockets supply it in admin hello. Production
  is exactly `NODE_ENV="production"` and never exposes these surfaces.
- **B58 extraction.** Codes are locked/active/boarding/complete/reserved as
  B17. Only `comms_offline` locks. A living connected player's center is on the
  circular helipad when distance to marker center is <= pad radius. All living
  connected players must be on pad; absence resets the 200-tick boarding
  counter. Dead, disconnected, and observers do not count. Enemy danger never
  blocks. Reaching 200 completes immediately; chopper elapsed remains zero.
- **B59 tower positions.** Use home-center offsets energy `(-217,+125)` and
  comms `(+217,+125)`. The stale value 500 is deleted and has no meaning.

### 21.4 Procedural world (B60-B69)

Exact source coordinates are intentionally not required; the following
algorithm plus section 17 invariants is the reconstruction contract.

- **B60 RNG.** World streams and sampling use B52. A subsystem may draw only
  from its named stream. Candidate retry consumes all values in the documented
  attempt even when rejected; sorting/comparison consumes none.
- **B61 frame/order.** World is `[0,12800]` on both axes, origin top-left,
  positive x right, positive y down. Rows top-to-bottom and columns
  left-to-right form row-major sector IDs `sector_r_c`; canonical cardinal
  neighbor order is N,E,S,W.
- **B62 templates.** Each role template is newly authored data, not source
  art. It MUST fit its section 17 footprint/clearance, use only section 15.6
  structures, expose at least one navigable entrance, and carry explicit
  insertion-ordered local object/enemy spawn arrays. Across seed 1337 these
  arrays MUST produce the 132 enemy specs and 370 structures required by B01
  after cleanup. The checked-in expanded seed-1337 layout JSON is the canonical
  fixture for regression and lets a later agent reproduce the chosen offsets
  without reverse engineering generator draw order.
- **B63 villages/BSP.** Eligible sectors are row-major. Candidate centers are
  uniform integer points snapped to 16 units inside margins; touching
  footprints are allowed, positive overlap is not. Retry 256 times then fail
  loudly. Split the largest leaf (area, then top-left tie), longest axis
  (horizontal on tie), with ratio uniformly 0.4..0.6; stop when all required
  roles have leaves or after 64 splits. Assign roles in declared template
  order to leaves by descending area. If splitting cannot finish, use a
  row-major grid inside the footprint; if that cannot satisfy clearance, reject
  the seed rather than silently dropping content.
- **B64 village loot.** Every ordinary village has exactly one guaranteed crate
  and one ground craftable in addition to explicit template interior rolls.
  Source rarity equals village tier. Select uniformly from items of that
  rarity that have recipes; the ground item is one such item. Each eligible
  house interior performs its crate and enemy chance once in object order.
  Extraction guaranteed loot uses epic rarity.
- **B65 blueprints.** Place one stack in each of 12 ordinary villages, one at
  extraction, and one dungeon treasure crate holding four stacks: 17 stacks
  total. The three armor stacks occupy one uncommon, one rare, one epic slot
  and all share `blueprint:armor`. Classify other blueprints by output rarity,
  Fisher-Yates each rarity pool, and assign village tiers then extraction/
  dungeon in row-major location order.
- **B66 dungeon.** Draw room count uniformly 16..20. Start with dungeon bounds
  and apply B63 largest-leaf BSP until that many leaves, minimum leaf width/
  height 160. Build a minimum spanning tree over room-center Manhattan distance
  (distance then room-ID ties), add one lateral edge between the closest
  nonadjacent pair, and carve 32-unit L corridors horizontal then vertical.
  Assign one entrance, treasure, armory, mini-boss, boss, maze, and trap in that
  order; alternate remaining combat/enemy_swarm. Raster walls on a 16-unit
  grid, leave corridor/door cells open, then compress row-major contiguous wall
  cells horizontally into rects. Entrance is the room nearest the home-sector
  center; boss is farthest by graph distance. Optional contents use the
  dungeon stream in room-ID/object-order.
- **B67 dungeon crates.** Rare/epic crates contain one uniformly selected item
  from that rarity. T4 crate contains one T4 Aegis armor. The treasure
  blueprint crate is the single four-stack dungeon placement from B65, not an
  additional blueprint crate.
- **B68 statics/cleanup.** Tree centers are uniform 16-unit-grid points in
  canonical sector order; reject positive-area AABB overlap and preserve
  template insertion order. Military fence pieces use section 15.6 H/V
  footprints following authored perimeter order. Cleanup tests objects in
  insertion order, skips a crate when its positive-area hitbox overlaps a
  previous retained blocker, and prunes every declared child when its parent
  is pruned. Edge touching is retained.
- **B69 map metadata.** Sectors use IDs from B61, labels `Sector r,c`,
  archetype/risks/rewards from their assigned role, importance 1 ordinary,
  2 village, 3 extraction/dungeon/home. Features and markers are in sector then
  local insertion order. Home begins discovered; all others do not. Entering a
  sector with any living player marks its sector/features/markers discovered
  permanently for the lobby. Bounds, centers, role, tier, risk, and reward are
  explicit in the expanded layout fixture.

### 21.5 Client, visuals, E2E, and soak (B70-B77)

- **B70 interpolation.** First accepted pair initializes observed tick duration
  to `arrivalDelta/tickDelta`; subsequent valid pairs clamp that sample to
  `[0.7,1.4]*current` and EWMA by 0.2. Arrival interval and absolute deviation
  each EWMA by 0.12. Target delay milliseconds is
  `clamp(2,5,(arrivalEWMA+3*jitterEWMA+35)/tickDurationEWMA)` in ticks;
  render delay EWMA uses 0.15. Playhead starts newest tick minus delay and never
  reverses. Estimated server tick is newest tick plus elapsed arrival wall time
  divided by observed tick duration. Normal damaging projectiles may
  extrapolate through that full known arrival gap; server-delayed,
  presentation-only, and nonprojectile entities cap at 0.5 tick. Snap beyond
  192.
- **B71 motion metrics.** Use a 600-frame constant-velocity diagonal fixture at
  60 FPS with seeded B25 network impairment. `freeze` is speed below 5% of
  expected for two frames; `reverse` is negative dot product with expected
  velocity; `largeStep` is displacement >2.5x expected; `snap` is correction
  >=192; velocity CV is sample standard deviation/absolute mean speed after
  the first 60 frames. Interpolation/extrapolation ratios divide frames in each
  mode by eligible post-warmup frames. Epsilon is `1e-6`.
- **B72 darkness.** Lerp inner threshold 1500->750 and outer 2000->1125 by
  night blend `b`. Radial alpha is `smoothstep(inner,outer,cameraDistance)*b`.
  Dungeon alpha is `smoothstep(0,100,inwardDistanceFromDungeonBoundary)`;
  final darkness is max(radial,dungeon), then blocker shadows occlude light.
- **B73 scale.** Capture initial gameplay canvas CSS width/height and use world
  scale 1 CSS pixel per world unit for that session. Resize keeps scale 1,
  recenters the camera, and changes only viewport/culling extents. No implicit
  zoom, fit, or clamp is required.
- **B74 screenshots.** Source pixel goldens are unavailable and copied art is
  forbidden. Acceptance is reviewer-approved reconstruction goldens captured
  in Chromium at 1920x1080 and 1366x768, device scale 1, bundled fonts, fixed
  seed/state/tick, presentation RNG frozen, and animations paused. Subsequent
  regression uses per-pixel RGBA absolute difference <=16, <=0.5% differing
  pixels after a two-pixel edge dilation mask, with no masking of HUD text or
  gameplay entities. Visual similarity review uses the section 10-13 anchors,
  palette, silhouettes, and layers rather than a source image diff.
- **B75 E2E control.** Test builds expose `/test/control` only when
  `NODE_ENV="test"` and a random per-run bearer token is supplied. Typed
  operations set phase, grant resources/items, damage/heal an entity, clear
  wave threats, teleport a player, and advance exact ticks by invoking the
  same authoritative services used by gameplay; they never patch client state
  or disable validation. The route is absent from production output.
- **B76 seed corpus.** Worldgen tests use seeds
  `[0,1,2,42,1337,2147483647,4294967295]`. Each implementation checks in the
  canonical expanded layout JSON and SHA-256 for these seeds after first
  generation. Acceptance requires repeat equality, section 17 invariants, and
  the exact B01 seed-1337 counts; source-coordinate digest parity is not
  required. Dungeon crate mean uses total eligible optional crate count divided
  by seven and must remain 8.2..10.
- **B77 soak.** Run one unmeasured full day/night cycle, then three measured
  cycles with five deterministic moving clients plus one observer. Sample heap
  every 100 ticks; when Bun exposes `Bun.gc(true)`, force it before the first
  and final five-sample windows and disclose this. Compare window medians:
  growth <=10% and <=96 MiB. Caps are action queue 64/client, snapshot history
  8, event dedupe 1,024, interpolation debug 600, particles 2,000 with oldest
  eviction, pending timers 10,000/runtime, and outbound queued bytes
  4 MiB/client before disconnect.

### 21.6 Non-blocking review improvements (N01-N15)

- **N01-N03 environment/capacity.** Ports accept only decimal ASCII digits
  1..65535 with no signs/whitespace. Primary environment names beat legacy
  aliases; two supplied conflicting aliases fail. TLS names are
  `TLS_CERT_PATH`/`TLS_KEY_PATH`; `NODE_ENV` selects production. All open
  sockets, including preview observers, count toward the global 64; the 65th
  hello receives fatal `server_full` before world mutation.
- **N04-N05 chat.** Strip controls, trim, limit to 240 JavaScript UTF-16 code
  units, tokenize commands, and filter only final public chat text. History is
  50, autocomplete follows command-schema insertion order, and fade timers use
  monotonic wall time paused while chat is open.
- **N06-N08 accessibility/hub/use.** Meet WCAG 2.1 AA contrast, visible focus,
  modal focus trap/restore, and disable camera swim, pulses, and transitions
  for reduced motion. Docked hub breakpoint is >=1200 CSS px. Every drag has
  focusable source/destination keyboard actions. `E` uses consumables but never
  equips armor.
- **N09-N10 results/death.** Duration is match-start to completion/failure,
  floored to seconds and displayed `MM:SS`; waves survived is fully cleared
  nights. Match death retains inventory for dawn respawn; only explicit drop
  actions drop player items.
- **N11-N12 operations/static.** Metrics are structured process-local JSON and
  the authenticated nonproduction `/debug/metrics`; production exports
  aggregates without chat/name content. Hashed assets are immutable, HTML and
  runtime config `no-store`, correct MIME plus compression is used, missing
  extension paths are 404, and only extensionless GET navigation falls back to
  the SPA.
- **N13-N15 presentation/props/reconnect.** Presentation RNG is B25 seeded by
  `(worldId,eventId)` and screenshots capture named elapsed ticks while paused.
  Generated props are indestructible environment geometry except crates.
  Socket close returns to menu without retry, preserves the nonempty saved
  name, and requires the user to press Play again.

### 21.7 Final residual resolutions (R01-R12)

These answers supersede any conflicting B/N resolution above.

- **R01 benchmark kinds.** The section 2 source workload intentionally has
  snapshot-kind counts `enemy=660`, `player=9`, `structure=370`, `tower=3`,
  and zero building/projectile/pickup at setup. Its 370 structures are exactly:
  barracks 4, barrel 12, bone pile 16, boss throne 1, brazier 8, camp shelter
  5, command post 3, crate 36, dungeon 1, fence H 13, fence V 1, gold pile 3,
  golden statue 2, guard tower 3, house L 1, house M 11, house S 21, market
  stall 15, stone pillar 16, tree 157, tripwire 6, vehicle wreck 6, weapon rack
  8, wooden bed 6, wooden chair 7, and wooden table 8. The 36 crate inventories
  contain authored loot. Ground pickup specs such as the home spear,
  extraction AK, village craftables, and blueprint stacks remain in the
  procedural layout metadata but the benchmark loader does not instantiate
  them. Normal playable matches MUST instantiate them; this omission is frozen
  only for comparability with the measured section 2 workload.
- **R02 primary semantic-work floor.** In addition to counts and rules, the
  300 measured ticks MUST report at least 312,300 entity tick calls, 197,700
  enemy tick calls, 1,600 navigation requests, 850 actual path searches,
  40,000 searched nodes, exactly 2,700 snapshot packets, 50,000 decoded entity
  descriptor occurrences, and 60 event occurrences. Binary payload count and
  byte total MUST be positive, but bytes have no lower floor because genuine
  compression is allowed. Counters are collected without disabling normal
  work and are not timed except the normal operations they observe. Failing a
  floor invalidates the TPS result. Freeze and check in the expanded seed-1337
  benchmark layout before the first performance optimization commit; its hash
  is part of every report.
- **R03 benchmark extraction.** Benchmark tick zero has extraction **active**,
  not locked, because communications are alive. No synthetic lock exists.
- **R04 strict hello/error.** Hello is
  `{t:"hello",compatHash,playerName?,preview?,adminToken?}`. `adminToken` is
  accepted only behind the B57 nonproduction gates and is rejected in
  production. Error is `{t:"error",code,message,fatal:boolean}`. Fatal codes
  are `compat_mismatch`, `server_full`, `name_required`, `name_taken`,
  `invalid_name`, `missing_hello`, `sequence_exhausted`, `frame_too_large`, and
  `protocol_violation`; rate/queue/action errors are nonfatal. A fatal error is
  sent once when possible, then the socket closes.
- **R05 lobby clocks.** Add required nullable `countdownEndsAtMs` and
  `startedAtMs` to `lobby_state`. Countdown is null before auto-start
  eligibility, set from authoritative server time when eligibility begins,
  reset to null if eligibility is lost, and cleared on start. `startedAtMs` is
  null before start and is the immutable authoritative start timestamp
  afterward, including for late joiners. Manual host start sets it immediately.
  The client ceiling-rounds `(countdownEndsAtMs-serverTimeMs)/1000`; it shows
  the start prompt only when observing a nonnull start timestamp for the first
  time and for three wall-clock seconds.
- **R06 hello transitions.** A socket permits
  `awaiting_hello -> preview -> ready`: at most one preview hello and then at
  most one normal promotion hello. A normal first hello may transition directly
  to ready. A second preview, any hello after ready, or a third hello is
  `protocol_violation`. The B15 hello rate limit is one per legal state
  transition, not one per socket lifetime.
- **R07 authoritative holds.** Replace one-shot use/repair variants with
  `{kind:"begin_use",slot}`, `{kind:"begin_repair",towerId}`, and
  `{kind:"cancel_interaction"}`. A begin starts one server-owned monotonic
  750-ms hold after validation. The server rechecks release/cancel, death,
  range, and target state each tick, then performs the mutation only at
  completion. A second begin while active is rejected `interaction_busy`;
  disconnect and any migration cancel. Client key release always sends cancel.
- **R08 Wither airstrike.** Add named stream
  `boss:wither:<entityId>:airstrike`. Each cast centers a 4x4 grid on the
  selected player's position at windup start, with x/y offsets
  `[-360,-120,120,360]` (240 spacing). Fisher-Yates the 16 cell indices using
  the stream and omit the first two; for each of the remaining 14 in row-major
  order draw independent inclusive integer x/y jitter -30..30. Clamp a
  jittered offset to radius 550 from the frozen target center along its radial
  direction rather than rerolling. Emit all warnings together for 50 ticks,
  then apply one radius-110, damage-110 strike per retained cell in row-major
  order. Each Wither owns an independent persistent stream.
- **R09 village loot.** Guaranteed crate source rarity equals village tier,
  then uses section 17's source-to-output rarity probabilities and selects
  uniformly from the resulting output-rarity item pool. The guaranteed ground
  craftable skips the upgrade roll and selects uniformly from craftable items
  whose content rarity equals the village tier. Interior crate rolls use their
  template-declared source rarity and the same upgrade algorithm.
- **R10 lights/network benchmark.** Split the table row into two results.
  Network uses the B07 server fixture with four clients, 180 alternating enemy
  types, 320 walls, radius 1,440, warmup 40 and sample 180 ticks. For each
  `(client,tick)`, Mbps is `encodedPayloadBytes*20*8/1_000_000`; p95/max are
  across those 720 observations, never aggregate across clients. Renderer uses
  headless Chromium, device scale 1, viewport 1920x1080, production client
  build, three deterministic scenes of 900 row-major 40x40 visibility
  blockers each, and one light/camera following a radius-500 circle over 600
  frames. Warm 120 frames, then measure 600 frames per scene. Time only CPU
  blocker-mask update plus render-command submission using `performance.now()`,
  not GPU completion; pool all 1,800 samples for p95/p99 <=2.0833 ms. Pin and
  report Chromium version, OS, CPU, and flags.
- **R11 E2E modes.** "Production server" means the release-equivalent server
  and production-built browser assets. The full deterministic E2E launches
  that build with `NODE_ENV=test` and a random control token, so `/test/control`
  is available. A separate startup/security smoke launches the identical build
  with `NODE_ENV=production`, verifies normal join/health/static/WS, and proves
  `/test/control`, admin commands, and debug metrics are absent.
- **R12 dungeon crate oracle.** For each corpus seed, count every retained
  dungeon `structure:crate` entity after optional rolls and cleanup, including
  fixed rare/epic/T4 and the blueprint crate; the four blueprint stacks count
  as one crate entity. The reconstruction's required per-seed counts in B76
  order are `[9,8,10,9,9,8,10]`, mean exactly 9.0. These are authored
  reconstruction oracles, not source-coordinate parity, and the expanded
  fixtures MUST carry the same counts.
