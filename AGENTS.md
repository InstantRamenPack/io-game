# AGENTS.md

These rules apply to every task in this repo unless the user explicitly overrides them. The goal is to reduce repeated discovery, avoid speculative work, and keep agent runs token-efficient.

## Operating Rules

1. Think before coding. State assumptions, define success criteria, and ask rather than guessing on non-trivial ambiguity.
2. Read before writing. Inspect exports, immediate callers, shared utilities, and tests for the touched path before editing.
3. Keep changes surgical. Touch only what the task requires; do not refactor adjacent code or add abstractions for single-use logic.
4. Prefer existing ownership surfaces over new helpers. If two patterns conflict, use the newer or more validated one and flag the other as cleanup.
5. Fail loud. Do not report completion if verification was skipped, partially run, or blocked.
6. Protect user work. Check `git status --short` before edits and never revert unrelated changes unless explicitly asked.
7. Use deterministic tooling for deterministic work. Use code/search/scripts for routing, transforms, retries, and inventories; use the model for judgment, synthesis, and tradeoffs.

## Repo Shape

- Runtime stack: Bun server, Vite/Pixi client, WebSocket snapshot protocol, shared Zod schemas, generated JSON content manifest.
- Main source roots: `apps/server/src`, `apps/client/src`, `packages/shared/src`, `scripts`.
- Generated content manifest: `packages/shared/src/content/generated/manifest.ts`.
- Manifest generator: `scripts/generate-content-manifest.ts`.
- `postinstall` already runs generated content preparation. Do not duplicate that work in CI/config unless the task is specifically about install behavior.

## Commands

- Use Bun-native commands by default.
- Use `rg` / `rg --files` for search and file discovery.
- After code edits, run `bun run format` on the whole repo. Do not run or recommend `bun run lint` as the formatting step.
- Always format the entire codebase with `bun run format`; do not format only the files you touched.
- `bun run format` runs ESLint fixes and Prettier writes for the full repo. Treat resulting unrelated changes as real workspace changes and report them.
- Use `bun run typecheck` as the default static correctness check.
- Use focused tests or benchmarks for the touched behavior instead of only broad checks.
- Use `bun run build` when validating client/build integration or release-impacting changes.
- Use `bun run dev` when the reported issue is startup/runtime behavior; a successful build is not a substitute.

## Validation Shortcuts

- Protocol or compression changes: run `bun run typecheck`, `bun run test:protocol`, `bun run test:netcode`, `bun run benchmark:protocol-compression`, and `bun run benchmark:network-aoi` when relevant.
- Collision, static geometry, placement, or occlusion changes: prefer `scripts/collision-validation.ts`, the focused gameplay tests under `scripts/tests/gameplay`, and `bun run typecheck`.
- Browser/client startup bugs: reproduce in the browser when requested. If Play gets stuck in `Connecting...` with a canvas mounted, inspect renderer/asset startup before rewriting networking.
- Performance work with hard ceilings should include a benchmark or regression surface, not only ad hoc measurements.
- Audit/review work should stay read-only unless the user asks for implementation. Use stable numbered findings with evidence, impact, better direction, confidence, top fix order, and validation.

## Current Architecture Facts

- Entity ids are replication identity. Do not reintroduce same-match id recycling; stale client renders can result when despawn and spawn share an id before removals apply.
- Binary protocol is MessagePack-based. Wire helpers and tests should use the shared protocol encoder/decoder, not raw JSON assumptions.
- `world.staticGeometry` is the shared static blocker source for collision, navigation, combat occlusion, projectile impact, and placement. Do not revive separate static-blocker classification paths without a strong reason.
- Combat legality and occlusion are separate. `combatEligibilityService.canAttackTarget(...)` decides whether a target is legal; `CombatOcclusion` decides whether geometry blocks an attack segment.
- Gameplay hitboxes and visibility blockers are separate. Do not remove collision hitboxes just to make something stop blocking lights/vision; exclude it from the blocker feed instead.
- Server placement authority lives in `Player.placeStructure(...)`. Client placement preview has parallel logic in `PlacementPreviewController`, so server rule changes may need a narrow preview mirror.
- Local collision feel still matters under server authority. If changing server collision, inspect local prediction paths for matching immediate player feel.
- Enemy lock-on and aggro behavior goes through `TargetEntityGoal`; global enemy weapon tuning goes through `Enemy.ts`; ranged firing distance belongs in `RangedAttackGoal`.

## Content System Facts

- Shared JSON content plus strict parse-time validation is the source of truth for gameplay data.
- For gameplay tuning/config knobs, prefer existing shared `.json` ownership surfaces (especially entity/item content JSON like `packages/shared/src/content/...`) over hardcoded server constants or new one-off config files.
- Regenerate the content manifest after content schema/catalog changes with `bun run generate:content-manifest` or a command that already invokes it.
- Enemy death loot balance lives in `packages/shared/src/content/enemy-death-loot-balance.json`.
- Rarity is required for enemies, weapons, and buildable items. Recycling rarity behavior is server-owned in `serverContentCapabilities.ts`.
- Content/rendering registry gaps should fail loudly. Avoid adding fallback renderers or silent generic placeholders unless the user asks for a temporary fallback.
- New acquisition, pickup, starter-loadout, and inventory behavior should stay on the item/inventory polymorphism path; do not reintroduce removed type-switch grant helpers.

## Client And UI Facts

- The current join flow is plain websocket startup with player-name validation. No Google auth/progression path should be reintroduced.
- First-join player name should start blank; persist only non-empty trimmed names.
- Duplicate player names are a hard server-side join validation rule, not only a client warning.
- A blurred lobby behind the join modal must be backed by a real preview observer feed, not a static mounted canvas.
- `SessionUiController` owns keeping `#game-root` mounted and menu-backdrop state.
- `PixiHud.handlePointerInput(...)` is the modal input gate. If modal clicks or hovers affect the world, inspect this before changing modal layout.
- HUD rarity display is concentrated in the presentation models, tooltip view, gameplay HUD coordinator, and selected-item toast view.

## Dev Server And Browser Notes

- `scripts/dev.ts` uses `PORT` for the Bun server and `VITE_PORT` for Vite. If defaults are occupied, use a paired override such as `PORT=3123 VITE_PORT=5179 bun run dev`.
- If `bun run dev` fails with `EADDRINUSE`, check for an existing listener before blaming the latest code change.
- Browser automation can need a fresh Chrome session/tab after hot reload or extension instability. Retry the browser path when the environment looks recoverable.
- Avoid long client builds unless they are necessary or can finish cleanly; prefer focused checks first.

## Testing Principles

- Tests should encode why behavior matters, not only current output.
- When the user states intended gameplay constants or behavior, update stale tests rather than changing production logic to satisfy outdated expectations.
- Add the narrowest deterministic regression test that proves the fix. Do not add broad, brittle coverage when a focused fixture exists.
- For static geometry and collision regressions, extend existing collision/gameplay validation surfaces before inventing one-off probes.

## Git And Reporting

- Start non-trivial work by checking branch and status.
- Do not amend commits or perform destructive git operations unless explicitly requested.
- If unexpected changes appear, stop and ask how to proceed.
- Final reports should state what changed, what was verified, and what remains uncertain or unverified.
