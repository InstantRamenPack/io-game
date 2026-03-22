Original prompt: PLEASE IMPLEMENT THIS PLAN: JSON-Backed Item/Entity Content and Enriched Registries

- 2026-03-20: Replaced the shared TS item/entity/recipe manifest layer with JSON-backed content under `packages/shared/src/content/<kind>/<name>.json`.
- Added `packages/shared/src/content/schema.ts` and `packages/shared/src/content/catalog.ts` for JSON validation, lookup, and craftable-item enumeration.
- Runtime classes now derive `typeId` from static `kind` + `resourceName`; simulation metadata stays on classes (`stackMax`, `buildingTypeId`).
- Enriched `entityTypeRegistry` and `itemTypeRegistry` to store constructors plus runtime metadata and parsed JSON content.
- Crafting now targets output item `typeId` instead of `recipeId`; embedded recipes live inside craftable item JSON files.
- Removed the old shared content TS modules: `entities.ts`, `items.ts`, `recipes.ts`, `types.ts`, and `index.ts`.
- Validation run: `bun run typecheck` passes.
- Per user instruction, no new tests were written and Playwright was not used.
