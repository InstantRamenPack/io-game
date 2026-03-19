Original prompt: separate by concern and write verbose JSDocs

- 2026-03-19: Began refactoring `apps/client/src/main.ts` into concern-focused modules.
- Current goal: move DOM lookup, selectors, HUD rendering, menu/auth gate behavior, launch lifecycle, hotkeys, and debug bridge into separate files with explicit JSDoc boundaries.
- Constraint: keep existing browser behavior and the `window.render_game_to_text` / `window.advanceTime` hooks intact.
- 2026-03-19: Added `apps/client/src/app/` modules for DOM lookup, selectors, HUD, menu/auth gate, runtime status, hotkeys, launch lifecycle, and debug bridge. `apps/client/src/main.ts` is now the composition root only.
- Verification: `bun run typecheck`, `bun run test:unit`, and `bun run test:e2e` all pass after the split.
- Verification: `bun run lint` passes with the existing repo-wide `explicit-member-accessibility` warnings that were already present outside this refactor.
- Follow-up suggestion: rename `ClientWorldState.worldModel` to `world` in a future cleanup pass now that the old model/view naming split has been removed.
- 2026-03-19: Fixed `bun test` discovering Playwright specs directly by renaming browser specs from `*.spec.ts` to `*.e2e.ts` and adding `testMatch: "**/*.e2e.ts"` to `playwright.config.ts`.
- Verification: `bun test` now runs only the Bun unit suite, and `bun run test:e2e` still runs all 3 Playwright browser tests.
- 2026-03-19: Undid the `apps/client/src/net` model-only refactor by restoring `clientWorld` ownership and optional Pixi-owned entities in `ClientEntity`, `ClientWorld`, and `ClientWorldState`.
- Compatibility note: the rollback keeps the newer typed snapshot fields, and entities/worlds can still run headlessly when no `PixiRenderer` is supplied.
- Verification: `bun run typecheck`, `bun test`, and `bun run test:e2e` all pass after the net-layer rollback.
- 2026-03-19: Removed the leftover renderer-owned view path by deleting `apps/client/src/render/views/EntityView.ts` and restoring `apps/client/src/render/PixiRenderer.ts` to a renderer-only role with a shared public `entityContainer`.
- Clarification: `apps/client/src/render/` itself was not removed because it predated the refactor and still contains the original `PixiRenderer` implementation.
