import { beforeAll, describe, expect, test } from "bun:test";
import proceduralContentJson from "@shared/world/procedural-content.json";
import {
  PROCEDURAL_GRID_SIZE,
  PROCEDURAL_SECTOR_BANDS,
  PROCEDURAL_TARGET_VILLAGE_COUNT,
  PROCEDURAL_WORLD_SIZE,
  REQUIRED_DUNGEON_ROOM_ROLES,
  generateProceduralWorldLayout,
  pointInRect,
} from "@shared/world/ProceduralWorld.ts";
import {
  countLegendaryBossSpawns,
  getLegendaryBossTypeIds,
  isLegendaryBossTypeId,
  resolveWorldGenLegendaryBossPlacements,
} from "@shared/world/legendaryBoss.ts";
import { resolveHitboxRects } from "@shared/geometry/hitbox.ts";
import {
  getAllItemContentEntries,
  getEntityContent,
  getItemContent,
} from "@shared/content/catalog.ts";
import { doResolvedRectSetsOverlap } from "@shared/geometry/collision.ts";
import { entityTypeRegistry } from "@server/registry/registries.ts";
import { getItemLikeTypeEntry } from "@server/registry/itemLikeRegistry.ts";
import { getPlayerSpawnPosition } from "@server/entities/playerSpawn.ts";
import type { Entity } from "@server/entities/Entity.ts";
import type { World } from "@server/world/World.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import {
  bootstrapTestRegistries,
  makeRuntime,
} from "@tests/helpers/worldFixtures.ts";

const PROCEDURAL_CONTENT = proceduralContentJson as {
  interiorSpawnChances: {
    furniture: number;
    crate: number;
    enemy: number;
  };
  villageGeneration?: {
    sectorEdgeMargin: number;
    bspSplitGap: number;
    bspMinLeafAxis: number;
  };
};

const ACCESS_SAMPLE_SIZE = 32;
const PLAYER_CLEARANCE = 24;
const MIN_REACHABLE_OPEN_RATIO = 0.97;

function isWeaponOrBlueprint(typeId: ResourceId): boolean {
  const item = getItemContent(typeId);
  if (!item) {
    return false;
  }
  return item.weapon !== undefined || item.unlocksRecipeTypeId !== undefined;
}

describe("procedural survival extraction world", () => {
  beforeAll(bootstrapTestRegistries);

  test("generates a deterministic uneven 40/20/40 macro-sector layout", () => {
    const first = generateProceduralWorldLayout(1337);
    const second = generateProceduralWorldLayout(1337);

    expect(first).toEqual(second);
    expect(first.worldSize).toEqual(PROCEDURAL_WORLD_SIZE);
    expect(first.sectors).toHaveLength(
      PROCEDURAL_GRID_SIZE * PROCEDURAL_GRID_SIZE,
    );
    expect(new Set(first.sectors.map((sector) => sector.id)).size).toBe(9);
    const cornerBand = PROCEDURAL_SECTOR_BANDS[0];
    const centerBand = PROCEDURAL_SECTOR_BANDS[1];
    if (cornerBand === undefined || centerBand === undefined) {
      throw new Error("expected corner and center procedural sector bands");
    }
    const center = first.sectors.find((sector) => sector.id === "sector_1_1")!;
    expect(center.maxX - center.minX).toBe(centerBand);
    expect(center.maxY - center.minY).toBe(centerBand);
    for (const id of ["sector_0_0", "sector_0_2", "sector_2_0", "sector_2_2"]) {
      const sector = first.sectors.find((candidate) => candidate.id === id)!;
      expect(sector.maxX - sector.minX).toBe(cornerBand);
      expect(sector.maxY - sector.minY).toBe(cornerBand);
    }
  });

  test("varies meaningful sector assignment across seeds while preserving required roles", () => {
    const first = generateProceduralWorldLayout(1337);
    const second = generateProceduralWorldLayout(1338);

    expect(first.extractionSectorId).not.toBe(second.extractionSectorId);
    for (const layout of [first, second]) {
      expect(layout.centerSectorId).toBe("sector_1_1");
      expect(
        layout.sectors.find((sector) => sector.id === "sector_1_1")?.archetype,
      ).toBe("home");
      expect(
        layout.sectors.find((sector) => sector.id === layout.extractionSectorId)
          ?.archetype,
      ).toBe("extraction");
      expect(
        layout.sectors.find((sector) => sector.id === layout.dungeonSectorId)
          ?.archetype,
      ).toBe("dungeon");
      expect(
        layout.sectors.find((sector) => sector.id === layout.militarySectorId)
          ?.archetype,
      ).toBe("military");
      expect(
        layout.sectors.find((sector) => sector.id === layout.forestSectorId)
          ?.archetype,
      ).toBe("forest");
      expect(isCornerSector(layout.extractionSectorId)).toBe(true);
      expect(isCornerSector(layout.dungeonSectorId)).toBe(true);
      expect(layout.militarySectorId).not.toBe(layout.centerSectorId);
      expect(layout.forestSectorId).not.toBe(layout.centerSectorId);
    }
  });

  test("places villages randomly outside home, dungeon, and non-extraction sectors", () => {
    const layout = generateProceduralWorldLayout(1337);

    expect(layout.villages).toHaveLength(PROCEDURAL_TARGET_VILLAGE_COUNT);
    expect(
      layout.villages.filter(
        (village) => village.kind === "extraction_fortified",
      ),
    ).toHaveLength(1);
    for (const village of layout.villages) {
      expect(village.sectorId).not.toBe(layout.centerSectorId);
      expect(village.sectorId).not.toBe(layout.dungeonSectorId);
      if (village.kind === "extraction_fortified") {
        expect(village.sectorId).toBe(layout.extractionSectorId);
      } else {
        expect(village.sectorId).not.toBe(layout.extractionSectorId);
      }
    }
  });

  test("non-dungeon areas are village and forest driven with rank-based village tiers", () => {
    const layout = generateProceduralWorldLayout(1337);

    expect(layout.villages).toHaveLength(PROCEDURAL_TARGET_VILLAGE_COUNT);
    expect(layout.forestCamps.length).toBeGreaterThanOrEqual(12);
    expect(
      layout.villages.some(
        (village) => village.kind === "extraction_fortified",
      ),
    ).toBe(true);
    expect(
      layout.villages.every(
        (village) => village.sectorId !== layout.centerSectorId,
      ),
    ).toBe(true);
    expect(
      layout.villages.every(
        (village) => village.sectorId !== layout.dungeonSectorId,
      ),
    ).toBe(true);
    const tierLayouts = [layout, generateProceduralWorldLayout(1338)];
    expect(
      new Set(
        tierLayouts.flatMap((entry) =>
          entry.villages.map((village) => village.danger),
        ),
      ),
    ).toEqual(new Set(["low", "medium", "high", "boss"]));
    expect(
      new Set(
        tierLayouts.flatMap((entry) =>
          entry.villages.map((village) => village.lootTier),
        ),
      ),
    ).toEqual(new Set(["common", "uncommon", "rare", "epic"]));
    for (const tierLayout of tierLayouts) {
      expect(villagesAreTieredByDistance(tierLayout)).toBe(true);
    }
    expect(
      layout.villages.every((village) => village.poiRoles.length >= 4),
    ).toBe(true);
  });

  test("village minimap markers expose danger and loot tier metadata", () => {
    const layout = generateProceduralWorldLayout(1337);

    for (const village of layout.villages) {
      const marker = layout.minimapMarkers.find(
        (candidate) => candidate.id === village.id,
      );
      expect(marker).toBeDefined();
      expect(marker?.risk).toBe(village.danger);
      expect(marker?.tier).toBe(village.lootTier);
    }
  });

  test("every village has exactly one blueprint crate and each crate holds one item", () => {
    const layout = generateProceduralWorldLayout(1337);

    for (const village of layout.villages) {
      const sector = layout.sectors.find(
        (candidate) => candidate.id === village.sectorId,
      );
      expect(
        sector,
        `${village.id} should belong to a generated sector`,
      ).toBeDefined();
      if (!sector) continue;

      const villageCrates = sector.enemies.filter(
        (spawn) =>
          spawn.typeId === "enemy:crate" &&
          spawn.x >= village.minX &&
          spawn.x <= village.maxX &&
          spawn.y >= village.minY &&
          spawn.y <= village.maxY,
      );
      expect(
        villageCrates.length,
        `${village.id} should contain at least one crate`,
      ).toBeGreaterThanOrEqual(1);

      const blueprintCrates = villageCrates.filter((crate) =>
        (crate.crateLoot ?? []).some((slot) =>
          slot.typeId.startsWith("blueprint:"),
        ),
      );
      expect(
        blueprintCrates,
        `${village.id} (${village.lootTier}) should have exactly one blueprint crate`,
      ).toHaveLength(1);

      for (const crate of villageCrates) {
        expect(
          crate.crateLoot ?? [],
          `${village.id} crate ${crate.x},${crate.y} should contain one item`,
        ).toHaveLength(1);
        expect(crate.crateLoot?.[0]?.amount ?? 1).toBe(1);
      }
    }
  });

  test("extraction point matches the fortified village helipad feature", () => {
    const layout = generateProceduralWorldLayout(1337);
    const extractionSector = layout.sectors.find(
      (sector) => sector.id === layout.extractionSectorId,
    );
    const extractionVillage = layout.villages.find(
      (village) => village.kind === "extraction_fortified",
    );

    expect(extractionSector).toBeDefined();
    expect(extractionVillage).toBeDefined();
    if (!extractionSector || !extractionVillage) return;

    const helipadFeature = extractionSector.features.find(
      (feature) =>
        feature.role === "village_helipad" &&
        feature.id === `${extractionVillage.id}_helipad`,
    );
    expect(helipadFeature).toBeDefined();
    if (!helipadFeature) return;

    expect(layout.extraction.x).toBe(helipadFeature.center.x);
    expect(layout.extraction.y).toBe(helipadFeature.center.y);
    expect(extractionVillage.center.x).toBe(extractionSector.center.x);
    expect(extractionVillage.center.y).toBe(extractionSector.center.y);

    const helipadMarker = layout.minimapMarkers.find(
      (marker) => marker.id === "extraction_helipad",
    );
    expect(helipadMarker?.x).toBe(layout.extraction.x);
    expect(helipadMarker?.y).toBe(layout.extraction.y);
  });

  test("fortified extraction helipad leaf blocks house structures from overlapping", () => {
    const layout = generateProceduralWorldLayout(1337);
    const extractionSector = layout.sectors.find(
      (sector) => sector.id === layout.extractionSectorId,
    );
    const extractionVillage = layout.villages.find(
      (village) => village.kind === "extraction_fortified",
    );
    expect(extractionSector).toBeDefined();
    expect(extractionVillage).toBeDefined();
    if (!extractionSector || !extractionVillage) return;

    const helipadLeaf = {
      minX: extractionVillage.center.x - 460,
      minY: extractionVillage.center.y - 360,
      maxX: extractionVillage.center.x + 460,
      maxY: extractionVillage.center.y + 360,
    };
    const houseStructures = extractionSector.structures.filter((structure) =>
      structure.typeId.startsWith("structure:house_"),
    );
    for (const structure of houseStructures) {
      const hitboxes = resolveProceduralSpawnHitboxes(structure);
      const overlapsHelipad = hitboxes.some((rect) =>
        proceduralRectsOverlap(helipadLeaf, rect),
      );
      expect(overlapsHelipad).toBe(false);
    }
  });

  test("village generation keeps bounds on-map, spaced rooms, forced crates, extraction houses, and tree pruning", () => {
    const layout = generateProceduralWorldLayout(1337);
    const margin = PROCEDURAL_CONTENT.villageGeneration?.sectorEdgeMargin ?? 64;

    for (const village of layout.villages) {
      const sector = layout.sectors.find(
        (candidate) => candidate.id === village.sectorId,
      )!;
      expect(village.minX).toBeGreaterThanOrEqual(sector.minX + margin);
      expect(village.minY).toBeGreaterThanOrEqual(sector.minY + margin);
      expect(village.maxX).toBeLessThanOrEqual(sector.maxX - margin);
      expect(village.maxY).toBeLessThanOrEqual(sector.maxY - margin);

      const villageCrates = sector.enemies.filter(
        (spawn) =>
          spawn.typeId === "enemy:crate" &&
          spawn.x >= village.minX &&
          spawn.x <= village.maxX &&
          spawn.y >= village.minY &&
          spawn.y <= village.maxY,
      );
      expect(
        villageCrates.length,
        `${village.id} should contain at least one crate`,
      ).toBeGreaterThan(0);
    }

    const extractionSector = layout.sectors.find(
      (sector) => sector.id === layout.extractionSectorId,
    )!;
    const extractionHouses = extractionSector.structures.filter((structure) =>
      structure.typeId.startsWith("structure:house_"),
    );
    expect(extractionHouses.length).toBeGreaterThan(0);
    expect(featureRoles(extractionSector)).toEqual(
      expect.arrayContaining(["village_house"]),
    );

    for (const sector of layout.sectors) {
      const nonTreeStructures = sector.structures.filter(
        (spec) => spec.typeId !== "structure:tree",
      );
      const trees = sector.structures.filter(
        (spec) => spec.typeId === "structure:tree",
      );
      for (const tree of trees) {
        const treeHitboxes = resolveProceduralSpawnHitboxes(tree);
        for (const structure of nonTreeStructures) {
          const structureHitboxes = resolveProceduralSpawnHitboxes(structure);
          expect(
            doResolvedRectSetsOverlap(treeHitboxes, structureHitboxes),
            `${sector.id} tree at ${tree.x},${tree.y} overlaps ${structure.typeId}`,
          ).toBe(false);
        }
      }
    }

    const military = layout.sectors.find(
      (sector) => sector.archetype === "military",
    )!;
    expect(featureRoles(military)).toEqual(
      expect.arrayContaining(["village_motor_pool"]),
    );

    expect(
      PROCEDURAL_CONTENT.villageGeneration?.bspSplitGap,
    ).toBeGreaterThanOrEqual(160);
    expect(
      PROCEDURAL_CONTENT.villageGeneration?.bspMinLeafAxis,
    ).toBeGreaterThanOrEqual(720);
  });

  test("village rooms select varied authored templates deterministically", () => {
    const first = generateProceduralWorldLayout(1337);
    const second = generateProceduralWorldLayout(1337);

    const firstTemplates = villageTemplateLabels(first);
    expect(firstTemplates).toEqual(villageTemplateLabels(second));
    expect(firstTemplates).toEqual(
      expect.arrayContaining([
        "village_template:corner_vendor",
        "village_template:crossroad_stalls",
        "village_template:lane_row",
        "village_template:triad_courtyard",
      ]),
    );
  });

  test("enterable house structures stay five-rect hollow shells", () => {
    for (const typeId of [
      "structure:house_s",
      "structure:house_m",
      "structure:house_l",
      "structure:house_xl",
      "structure:barracks",
      "structure:command_post",
    ] as const) {
      const content = getEntityContent(typeId);
      const hitboxes = content?.hitboxProfiles?.default;
      expect(
        hitboxes,
        `${typeId} should expose default hitboxes`,
      ).toBeDefined();
      if (!hitboxes) {
        throw new Error(`Missing default hitboxes for ${typeId}`);
      }
      expect(hitboxes).toHaveLength(5);
      expect(hitboxes.filter((rect) => rect.height === 16)).toHaveLength(3);
      expect(hitboxes.filter((rect) => rect.width === 16)).toHaveLength(2);
    }
  });

  test("authored village houses can contain crates, enemies, and furniture", () => {
    const layouts = [1337, 1338, 1339].map((seed) =>
      generateProceduralWorldLayout(seed),
    );
    const templateSpawns = layouts
      .flatMap((layout) => layout.sectors)
      .flatMap((sector) => [...sector.structures, ...sector.enemies])
      .filter((spawn) => spawn.label?.startsWith("village_template:"));
    const houseSpawns = templateSpawns.filter((spawn) =>
      [
        "structure:house_s",
        "structure:house_m",
        "structure:house_l",
        "structure:barracks",
        "structure:command_post",
      ].includes(spawn.typeId),
    );
    const furnitureSpawns = templateSpawns.filter((spawn) =>
      [
        "structure:wooden_bed",
        "structure:wooden_chair",
        "structure:wooden_table",
      ].includes(spawn.typeId),
    );

    expect(templateSpawns.some((spawn) => spawn.typeId === "enemy:crate")).toBe(
      true,
    );
    expect(
      templateSpawns.some(
        (spawn) =>
          spawn.typeId !== "enemy:crate" && spawn.typeId.startsWith("enemy:"),
      ),
    ).toBe(true);
    expect(
      templateSpawns.some((spawn) =>
        [
          "structure:wooden_bed",
          "structure:wooden_chair",
          "structure:wooden_table",
        ].includes(spawn.typeId),
      ),
    ).toBe(true);
    expect(furnitureSpawns.length).toBeGreaterThan(0);
    if (PROCEDURAL_CONTENT.interiorSpawnChances.furniture < 1) {
      expect(furnitureSpawns.length).toBeLessThan(houseSpawns.length);
    }
  });

  test("house interiors keep doorway clearance and avoid interior overlap", () => {
    const layouts = [1337, 1338, 1339].map((seed) =>
      generateProceduralWorldLayout(seed),
    );
    for (const layout of layouts) {
      for (const sector of layout.sectors) {
        const interiorByParent = new Map<
          string,
          Array<
            (typeof sector.structures)[number] | (typeof sector.enemies)[number]
          >
        >();
        for (const spawn of [...sector.structures, ...sector.enemies]) {
          const parentKey = interiorParentKeyFromLabel(spawn.label);
          if (!parentKey) {
            continue;
          }
          if (!interiorByParent.has(parentKey)) {
            interiorByParent.set(parentKey, []);
          }
          interiorByParent.get(parentKey)!.push(spawn);
        }
        for (const [parentKey, interiors] of interiorByParent) {
          const house = sector.structures.find(
            (spec) => `${spec.typeId}@${spec.x},${spec.y}` === parentKey,
          );
          expect(house, `missing interior parent ${parentKey}`).toBeDefined();
          if (!house || !isHouseStructureType(house.typeId)) {
            continue;
          }
          const doorway = houseDoorwayClearanceRect(house);
          expect(doorway).not.toBeNull();
          if (!doorway) {
            continue;
          }
          for (const interior of interiors) {
            expect(rectsOverlap(spawnBounds(interior), doorway)).toBe(false);
          }
          for (let i = 0; i < interiors.length; i += 1) {
            for (let j = i + 1; j < interiors.length; j += 1) {
              expect(
                doResolvedRectSetsOverlap(
                  resolveProceduralSpawnHitboxes(interiors[i]!),
                  resolveProceduralSpawnHitboxes(interiors[j]!),
                ),
              ).toBe(false);
            }
          }
        }
      }
    }
  });

  test("interior spawn chances are authored in procedural content", () => {
    expect(PROCEDURAL_CONTENT.interiorSpawnChances).toEqual({
      furniture: expect.any(Number),
      crate: expect.any(Number),
      enemy: expect.any(Number),
    });
    for (const value of Object.values(
      PROCEDURAL_CONTENT.interiorSpawnChances,
    )) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  test("village, forest camp, and crate loot authored pools stay deterministic", () => {
    const layout = generateProceduralWorldLayout(1337);

    const allProceduralEnemyTypes = new Set(
      [
        layout,
        generateProceduralWorldLayout(1338),
        generateProceduralWorldLayout(1339),
      ]
        .flatMap((entry) => entry.sectors)
        .flatMap((sector) => sector.enemies.map((enemy) => enemy.typeId)),
    );
    expect(
      allProceduralEnemyTypes.has("enemy:saboteur"),
      "saboteurs should be wave-only and never come from procedural spawn pools",
    ).toBe(false);
    expect(
      allProceduralEnemyTypes.has("enemy:wallbreaker"),
      "wallbreakers should be wave-only and never come from procedural spawn pools",
    ).toBe(false);

    const villageEnemyTypes = new Set(
      layout.sectors
        .flatMap((sector) => sector.enemies.map((enemy) => enemy.typeId))
        .filter((typeId) =>
          [
            "enemy:drifter",
            "enemy:police",
            "enemy:shoota",
            "enemy:stalker",
            "enemy:bomber",
            "enemy:sniper",
            "enemy:commander",
            "enemy:megaknight",
          ].includes(typeId),
        ),
    );
    expect(villageEnemyTypes).toEqual(
      new Set([
        "enemy:drifter",
        "enemy:police",
        "enemy:shoota",
        "enemy:stalker",
        "enemy:bomber",
        "enemy:sniper",
        "enemy:commander",
        "enemy:megaknight",
      ]),
    );

    expect(
      layout.forestCamps.some((camp) => isCornerSector(camp.sectorId)),
    ).toBe(true);
    expect(
      layout.forestCamps.some((camp) => !isCornerSector(camp.sectorId)),
    ).toBe(true);
    for (const camp of layout.forestCamps) {
      const expected: ResourceId[] = isCornerSector(camp.sectorId)
        ? ["enemy:police", "enemy:ranger", "enemy:stalker"]
        : ["enemy:drifter", "enemy:shoota", "enemy:police"];
      expect(camp.enemyTypes).toEqual(expected);
    }

    const villageCrates = [layout, generateProceduralWorldLayout(1338)]
      .flatMap((entry) => entry.sectors)
      .flatMap((sector) => sector.enemies)
      .filter(
        (enemy) =>
          enemy.typeId === "enemy:crate" &&
          enemy.crateLoot &&
          enemy.label?.startsWith("village_template:"),
      )
      .map((enemy) => enemy.crateLoot!);
    expect(villageCrates.length).toBeGreaterThan(0);
    const villageTierPools = new Set(
      villageCrates.map((lootSlots) =>
        lootSlots.map((slot) => slot.typeId).join(","),
      ),
    );
    expect(villageTierPools.size).toBeGreaterThan(1);
    expect(
      villageCrates.some((crateLoot) =>
        crateLoot.some((slot) => slot.kind === "weapon"),
      ),
    ).toBe(true);
    expect(
      villageCrates.every((crateLoot) =>
        crateLoot.every((slot) => isWeaponOrBlueprint(slot.typeId)),
      ),
    ).toBe(true);
    expect(
      villageCrates.some((crateLoot) =>
        crateLoot.some((slot) => slot.typeId.startsWith("blueprint:")),
      ),
    ).toBe(true);
  });

  test("every sector has content, traversal, rewards, enemies where hostile, and minimap metadata", () => {
    const layout = generateProceduralWorldLayout(1337);

    for (const sector of layout.sectors) {
      expect(sector.traversalConnections.length).toBeGreaterThan(0);
      expect(
        sector.structures.length + sector.buildings.length,
      ).toBeGreaterThan(0);
      expect(sector.loot.length).toBeGreaterThan(0);
      expect(sector.features.length).toBeGreaterThan(0);
      expect(sector.features.some((feature) => feature.hasReward)).toBe(true);
      expect(sector.features.some((feature) => feature.risk !== "low")).toBe(
        true,
      );
      expect(sector.minimapMarkers.length).toBeGreaterThanOrEqual(2);
      expect(sector.landmark.label.length).toBeGreaterThan(0);
      if (sector.archetype !== "home") {
        expect(sector.enemies.length).toBeGreaterThan(0);
        expect(sector.hasLightsOut).toBe(true);
        expect(sector.allowsFastBuildingDecay).toBe(true);
      } else {
        expect(sector.hasLightsOut).toBe(false);
        expect(sector.allowsFastBuildingDecay).toBe(false);
      }
    }
  });

  test("every non-repeatable blueprint appears exactly once and the repeatable armor blueprint appears three times across villages, extraction, and dungeon", () => {
    const seeds = [1337, 1338, 1339, 4242];
    const repeatableArmorBlueprintTypeId = "blueprint:armor" as ResourceId;
    const allBlueprintTypeIds = getAllItemContentEntries()
      .filter(
        ([, item]) => item.unlocksRecipeTypeId || item.unlocksRecipeTypeIds,
      )
      .map(([typeId]) => typeId);
    const uniqueBlueprintTypeIds = allBlueprintTypeIds.filter(
      (typeId) => typeId !== repeatableArmorBlueprintTypeId,
    );

    for (const seed of seeds) {
      const layout = generateProceduralWorldLayout(seed);
      const observedBlueprintTypeIds = new Map<ResourceId, number>();

      for (const sector of layout.sectors) {
        for (const enemy of sector.enemies) {
          if (enemy.typeId !== "enemy:crate" || !enemy.crateLoot) {
            continue;
          }
          for (const slot of enemy.crateLoot) {
            if (!slot.typeId.startsWith("blueprint:")) {
              continue;
            }
            observedBlueprintTypeIds.set(
              slot.typeId,
              (observedBlueprintTypeIds.get(slot.typeId) ?? 0) + 1,
            );
          }
        }
      }

      expect(observedBlueprintTypeIds.size).toBe(allBlueprintTypeIds.length);
      expect(
        observedBlueprintTypeIds.get(repeatableArmorBlueprintTypeId),
        `seed ${seed}: ${repeatableArmorBlueprintTypeId} should appear once per armor unlock tier`,
      ).toBe(3);
      for (const typeId of uniqueBlueprintTypeIds) {
        expect(
          observedBlueprintTypeIds.get(typeId),
          `seed ${seed}: ${typeId} should appear exactly once`,
        ).toBe(1);
      }

      const dungeonSector = layout.sectors.find(
        (sector) => sector.archetype === "dungeon",
      );
      expect(dungeonSector).toBeDefined();
      if (!dungeonSector) {
        continue;
      }

      const dungeonBlueprintCrates = dungeonSector.enemies.filter(
        (enemy) =>
          enemy.typeId === "enemy:crate" &&
          enemy.crateLoot?.some((slot) => slot.typeId.startsWith("blueprint:")),
      );
      expect(dungeonBlueprintCrates).toHaveLength(3);

      let dungeonRareBlueprintCount = 0;
      let dungeonEpicBlueprintCount = 0;
      for (const crate of dungeonBlueprintCrates) {
        const blueprintTypeId = crate.crateLoot?.find((slot) =>
          slot.typeId.startsWith("blueprint:"),
        )?.typeId;
        expect(blueprintTypeId).toBeDefined();
        if (!blueprintTypeId) {
          continue;
        }
        const unlockedRarity = getItemContent(
          getItemContent(blueprintTypeId)?.unlocksRecipeTypeId as ResourceId,
        )?.rarityTier;
        if (unlockedRarity === "rare") {
          dungeonRareBlueprintCount += 1;
        }
        if (unlockedRarity === "epic") {
          dungeonEpicBlueprintCount += 1;
        }
      }
      expect(dungeonRareBlueprintCount).toBe(
        proceduralContentJson.blueprintPlacement.dungeonSlots
          .rareWeaponBlueprintCount,
      );
      expect(dungeonEpicBlueprintCount).toBe(
        proceduralContentJson.blueprintPlacement.dungeonSlots
          .epicWeaponBlueprintCount,
      );
      expect(dungeonBlueprintCrates).toHaveLength(
        proceduralContentJson.blueprintPlacement.dungeonSlots
          .rareWeaponBlueprintCount +
          proceduralContentJson.blueprintPlacement.dungeonSlots
            .epicWeaponBlueprintCount,
      );
    }
  });

  test("generated crate loot only contains weapons or blueprints", () => {
    const layouts = [1337, 1338, 1339].map((seed) =>
      generateProceduralWorldLayout(seed),
    );

    for (const layout of layouts) {
      for (const sector of layout.sectors) {
        for (const loot of sector.loot) {
          expect(
            isWeaponOrBlueprint(loot.typeId),
            `${loot.typeId} should be valid crate loot because loose generated loot is loaded as a crate`,
          ).toBe(true);
        }
        for (const enemy of sector.enemies) {
          if (enemy.typeId !== "enemy:crate" || !enemy.crateLoot) {
            continue;
          }
          for (const slot of enemy.crateLoot) {
            expect(
              isWeaponOrBlueprint(slot.typeId),
              `${slot.typeId} should be valid breakable crate loot`,
            ).toBe(true);
          }
        }
      }
    }
  });

  test("home center area has no procedural structure blockers", () => {
    const layout = generateProceduralWorldLayout(1337);
    const home = layout.sectors.find((sector) => sector.archetype === "home");
    expect(home).toBeDefined();
    if (!home) {
      throw new Error("expected home sector");
    }

    expect(home.structures).toHaveLength(0);
    expect(home.buildings.length).toBeGreaterThanOrEqual(3);
    for (const spec of [...home.structures, ...home.buildings]) {
      expect(pointInRect(spec, layout.homeBounds)).toBe(true);
    }
  });

  test("world generation places exactly two legendary bosses in dungeon and extraction", () => {
    const layout = generateProceduralWorldLayout(1337);
    const placements = resolveWorldGenLegendaryBossPlacements(1337);
    const allEnemies = layout.sectors.flatMap((sector) => sector.enemies);

    expect(getLegendaryBossTypeIds().length).toBeGreaterThan(0);
    expect(countLegendaryBossSpawns(allEnemies)).toBe(2);
    expect(
      layout.dungeon.rooms.filter((room) => room.role === "boss"),
    ).toHaveLength(1);

    const dungeonSector = layout.sectors.find(
      (sector) => sector.archetype === "dungeon",
    )!;
    const extractionSector = layout.sectors.find(
      (sector) => sector.archetype === "extraction",
    )!;

    expect(
      dungeonSector.enemies.filter(
        (enemy) => enemy.typeId === placements.dungeon,
      ),
    ).toHaveLength(1);
    expect(
      extractionSector.enemies.filter(
        (enemy) => enemy.typeId === placements.extraction,
      ),
    ).toHaveLength(1);

    for (const sector of layout.sectors) {
      if (sector.archetype !== "dungeon" && sector.archetype !== "extraction") {
        expect(countLegendaryBossSpawns(sector.enemies)).toBe(0);
      }
    }
  });

  test("dungeon contains all required room roles with role-specific content", () => {
    const layout = generateProceduralWorldLayout(1337);
    const roles = new Set(layout.dungeon.rooms.map((room) => room.role));

    for (const role of REQUIRED_DUNGEON_ROOM_ROLES) {
      expect(roles.has(role)).toBe(true);
    }
    const dungeonSector = layout.sectors.find(
      (sector) => sector.archetype === "dungeon",
    );
    expect(layout.dungeon.rooms.length).toBeGreaterThanOrEqual(16);
    expect(layout.dungeon.rooms.length).toBeLessThanOrEqual(20);
    expect(layout.dungeon.entrances).toHaveLength(2);
    expect(
      new Set(layout.dungeon.entrances.map((entrance) => entrance.side)),
    ).toEqual(new Set(expectedDungeonEntranceSides(layout.dungeonSectorId)));
    const dungeonSectorBounds = layout.sectors.find(
      (sector) => sector.id === layout.dungeonSectorId,
    )!;
    expect(layout.dungeon.minX).toBe(dungeonSectorBounds.minX);
    expect(layout.dungeon.minY).toBe(dungeonSectorBounds.minY);
    expect(layout.dungeon.maxX).toBe(dungeonSectorBounds.maxX);
    expect(layout.dungeon.maxY).toBe(dungeonSectorBounds.maxY);
    expect(layout.dungeon.wallHitboxRects.length).toBeGreaterThan(10);
    expect(layout.dungeon.wallHitboxRects.length).toBeLessThan(200);
    expect(
      dungeonSector?.structures.filter(
        (spec) => spec.typeId === "structure:dungeon",
      ),
    ).toHaveLength(1);
    expect(
      dungeonSector?.structures.filter(
        (spec) => spec.typeId === "structure:dungeon_wall",
      ).length,
    ).toBe(0);
    expect(dungeonSector?.enemies.length).toBeGreaterThanOrEqual(10);
    expect(
      layout.dungeon.rooms.filter((room) => room.role === "boss"),
    ).toHaveLength(1);
    expect(
      dungeonSector?.enemies.filter((enemy) =>
        isLegendaryBossTypeId(enemy.typeId),
      ),
    ).toHaveLength(1);
    expect(entityTypeIds(dungeonSector!)).toEqual(
      expect.arrayContaining(["enemy:megaknight", "enemy:sniper"]),
    );
    expect(
      dungeonSector?.enemies.some((enemy) => enemy.typeId === "enemy:tripwire"),
    ).toBe(true);
    const dungeonTripwires = Object.values(
      (
        proceduralContentJson as {
          dungeonRoomContent: Record<
            string,
            { buildings?: Array<{ typeId: string; orientation?: string }> }
          >;
        }
      ).dungeonRoomContent,
    )
      .flatMap((room) => room.buildings ?? [])
      .filter((building) => building.typeId === "enemy:tripwire");
    expect(dungeonTripwires.length).toBeGreaterThan(0);
    expect(
      dungeonTripwires.every(
        (tripwire) =>
          tripwire.orientation === "horizontal" ||
          tripwire.orientation === "vertical",
      ),
    ).toBe(true);
    expect(
      dungeonSector?.buildings.some(
        (building) => building.typeId === "building:dungeon_door",
      ),
    ).toBe(false);
    expect(
      dungeonSector?.loot.some((loot) => loot.typeId === "item:dungeon_key"),
    ).toBe(false);
    expect(
      entityTypeIds(dungeonSector!).some(
        (typeId) =>
          typeId === "building:dungeon_door" || typeId === "item:dungeon_key",
      ),
    ).toBe(false);
    expect(deepestDungeonRoomRoles(layout, 4)).toEqual(
      expect.arrayContaining(["treasure", "boss"]),
    );
    expect(
      dungeonSector?.enemies.some(
        (enemy) =>
          enemy.typeId === "enemy:crate" &&
          enemy.crateLoot?.some((slot) => slot.typeId.startsWith("blueprint:")),
      ),
    ).toBe(true);
  });

  test("dungeon chamber centers are reachable from the two entrances without key doors", () => {
    const layout = generateProceduralWorldLayout(1337);
    const reachability = computeDungeonReachability(layout);

    expect(layout.dungeon.hallways.length).toBeGreaterThanOrEqual(
      layout.dungeon.rooms.length,
    );
    for (const entrance of layout.dungeon.entrances) {
      expect(reachability.isReachable(entrance)).toBe(true);
    }
    for (const room of layout.dungeon.rooms) {
      expect(
        reachability.isReachable({ x: room.centerX, y: room.centerY }),
        `${room.id} should be reachable from a dungeon entrance`,
      ).toBe(true);
      expect(room.maxX - room.minX).toBeGreaterThanOrEqual(240);
      expect(room.maxY - room.minY).toBeGreaterThanOrEqual(224);
    }
  });

  test("dungeon rooms are separated unless joined by narrow hallways", () => {
    const layout = generateProceduralWorldLayout(1337);

    for (
      let leftIndex = 0;
      leftIndex < layout.dungeon.rooms.length;
      leftIndex += 1
    ) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < layout.dungeon.rooms.length;
        rightIndex += 1
      ) {
        const left = layout.dungeon.rooms[leftIndex]!;
        const right = layout.dungeon.rooms[rightIndex]!;
        expect(
          rectsOverlapOrTouch(left, right),
          `${left.id} should not directly touch ${right.id}`,
        ).toBe(false);
      }
    }

    for (const hallway of layout.dungeon.hallways) {
      expect(
        Math.min(hallway.maxX - hallway.minX, hallway.maxY - hallway.minY),
      ).toBeLessThanOrEqual(96);
      expect(
        layout.dungeon.rooms.filter((room) => rectsOverlap(hallway, room))
          .length,
        `hallway ${hallway.minX},${hallway.minY},${hallway.maxX},${hallway.maxY} should not carve through extra rooms`,
      ).toBeLessThanOrEqual(2);
    }
  });

  test("dungeon open space is limited to chambers and hallways", () => {
    const layout = generateProceduralWorldLayout(1337);
    const blockers = collectProceduralDungeonWallBlockers(layout);
    const dungeon = layout.dungeon;

    for (
      let y = dungeon.minY + ACCESS_SAMPLE_SIZE / 2;
      y < dungeon.maxY;
      y += ACCESS_SAMPLE_SIZE
    ) {
      for (
        let x = dungeon.minX + ACCESS_SAMPLE_SIZE / 2;
        x < dungeon.maxX;
        x += ACCESS_SAMPLE_SIZE
      ) {
        const point = { x, y };
        const isOpen = !pointBlocked(point, blockers);
        const expectedOpen = [...dungeon.rooms, ...dungeon.hallways].some(
          (rect) => pointInRect(point, rect),
        );
        expect(isOpen, `open-space mismatch at ${x},${y}`).toBe(expectedOpen);
      }
    }
  });

  test("military, extraction, and village POIs expose required feature roles", () => {
    const layout = generateProceduralWorldLayout(1337);
    const military = layout.sectors.find(
      (sector) => sector.archetype === "military",
    )!;
    expect(entityTypeIds(military)).toEqual(
      expect.arrayContaining(["enemy:commander", "enemy:ranger"]),
    );
    expect(featureRoles(military)).toEqual(
      expect.arrayContaining([
        "village_checkpoint",
        "barracks",
        "village_command_post",
        "village_armory",
        "village_motor_pool",
      ]),
    );

    const extraction = layout.sectors.find(
      (sector) => sector.archetype === "extraction",
    )!;
    expect(entityTypeIds(extraction)).toEqual(
      expect.arrayContaining(["enemy:commander", "enemy:sniper"]),
    );
    expect(featureRoles(extraction)).toEqual(
      expect.arrayContaining([
        "helipad",
        "approach_route",
        "danger_perimeter",
        "village_helipad",
        "village_checkpoint",
        "village_armory",
      ]),
    );

    const residentialLike = layout.sectors.filter((sector) =>
      [
        "ruined_town",
        "abandoned_suburb",
        "roadside_village",
        "wreckage_field",
        "farmstead",
      ].includes(sector.archetype),
    );
    expect(residentialLike.length).toBeGreaterThan(0);
    for (const sector of residentialLike) {
      expect(featureRoles(sector)).toEqual(
        expect.arrayContaining([
          "village",
          "village_house",
          "village_market",
          "forest_spawn_camp",
        ]),
      );
    }
  });

  test("all generated entity and loot references use known resource families", () => {
    const layout = generateProceduralWorldLayout(1337);
    for (const sector of layout.sectors) {
      for (const spec of [
        ...sector.structures,
        ...sector.buildings,
        ...sector.enemies,
      ]) {
        expect(/^(structure|building|tower|enemy):/.test(spec.typeId)).toBe(
          true,
        );
      }
      for (const loot of sector.loot) {
        expect(loot.typeId.startsWith("item:")).toBe(true);
        expect(loot.amount ?? 1).toBeGreaterThan(0);
      }
    }
  });

  test("all generated entity and loot references resolve through registries", () => {
    const layout = generateProceduralWorldLayout(1337);
    for (const sector of layout.sectors) {
      for (const spec of [
        ...sector.structures,
        ...sector.buildings,
        ...sector.enemies,
      ]) {
        expect(entityTypeRegistry.get(spec.typeId)).toBeDefined();
      }
      for (const loot of sector.loot) {
        expect(getItemLikeTypeEntry(loot.typeId)).toBeDefined();
      }
    }
  });

  test("procedurally placed static structures and buildings do not overlap", () => {
    const layout = generateProceduralWorldLayout(1337);
    for (const sector of layout.sectors) {
      const blockers = [...sector.structures, ...sector.buildings].map(
        (spec) => ({
          spec,
          hitboxes: resolveProceduralSpawnHitboxes(spec),
        }),
      );
      for (let leftIndex = 0; leftIndex < blockers.length; leftIndex += 1) {
        for (
          let rightIndex = leftIndex + 1;
          rightIndex < blockers.length;
          rightIndex += 1
        ) {
          const left = blockers[leftIndex]!;
          const right = blockers[rightIndex]!;
          expect(
            doResolvedRectSetsOverlap(left.hitboxes, right.hitboxes),
            `${sector.id}: ${left.spec.typeId}@${left.spec.x},${left.spec.y} overlaps ${right.spec.typeId}@${right.spec.x},${right.spec.y}`,
          ).toBe(false);
        }
      }
    }
  });

  test("loaded runtime contains the procedural sectors, minimap data, dungeon rooms, and extraction marker", () => {
    const { runtime } = makeRuntime();
    const layout = runtime.world.proceduralLayout;
    expect(layout).not.toBeNull();
    if (!layout) {
      throw new Error("expected procedural layout");
    }
    expect(layout.sectors).toHaveLength(9);
    expect(
      layout.minimapMarkers.some(
        (marker) => marker.id === "extraction_helipad",
      ),
    ).toBe(true);
    expect(
      runtime.world.dungeonRoomsByZone.get(layout.dungeon.id)?.length,
    ).toBe(layout.dungeon.rooms.length);
    expect(
      runtime.world.entities
        .all()
        .filter((entity) => entity.typeId.startsWith("enemy:")).length,
    ).toBeGreaterThan(60);
    expect(
      runtime.world.entities
        .all()
        .filter((entity) => entity.typeId === "pickup:item_entity").length,
    ).toBe(0);
    expect(
      runtime.world.entities
        .all()
        .filter((entity) => entity.typeId === "enemy:crate").length,
    ).toBeGreaterThan(25);
    const blockers = runtime.world.entities
      .all()
      .filter((entity) => isProceduralStaticBlocker(entity));
    const crates = runtime.world.entities
      .all()
      .filter((entity) => entity.typeId === "enemy:crate");
    for (const crate of crates) {
      for (const blocker of blockers) {
        expect(
          doResolvedRectSetsOverlap(
            crate.getWorldHitboxes(),
            blocker.getWorldHitboxes(),
          ),
          `crate@${crate.x},${crate.y} overlaps ${blocker.typeId}@${blocker.x},${blocker.y}`,
        ).toBe(false);
      }
    }
  });

  test("night forest camp respawn repopulates only up to camp caps", () => {
    const { runtime } = makeRuntime({
      config: { dayNight: { dayDurationMs: 1, nightDurationMs: 180000 } },
    });
    const layout = runtime.world.proceduralLayout;
    expect(layout).not.toBeNull();
    if (!layout) {
      throw new Error("expected procedural layout");
    }
    const camp = layout.forestCamps[0];
    expect(camp).toBeDefined();
    if (!camp) {
      throw new Error("expected forest camp");
    }
    camp.respawnDelayTicks = 1;
    runtime.world.initializeForestCampRespawns([camp]);

    for (const entity of runtime.world.entities.all()) {
      if (entity.typeId.startsWith("enemy:") && pointWithinCamp(entity, camp)) {
        runtime.world.despawn(entity.id);
      }
    }
    expect(countAliveEnemiesInCamp(runtime.world, camp)).toBe(0);

    for (let tick = 0; tick < 24; tick += 1) {
      runtime.world.step();
    }

    const respawned = countAliveEnemiesInCamp(runtime.world, camp);
    expect(respawned).toBeGreaterThan(0);
    expect(respawned).toBeLessThanOrEqual(camp.maxAlive + 1);
  });

  test("loaded procedural geometry leaves spawn clear and nearly all unoccupied sample cells reachable", () => {
    const { runtime } = makeRuntime();
    const world = runtime.world;
    const layout = world.proceduralLayout;
    expect(layout).not.toBeNull();
    if (!layout) {
      throw new Error("expected procedural layout");
    }

    const reachability = computeOpenAreaReachability(world);
    expect(reachability.startOccupied).toBe(false);
    expect(reachability.openCells).toBeGreaterThan(10_000);
    expect(reachability.reachableRatio).toBeGreaterThanOrEqual(
      MIN_REACHABLE_OPEN_RATIO,
    );

    world.ensureSpatialIndex();
    world.navPathService.updateDirty(world);
    const spawn = getPlayerSpawnPosition(world.gameConfig.worldSize);
    const unreachableMajorFeatures = layout.sectors.flatMap((sector) =>
      sector.features
        .filter(
          (feature) =>
            feature.risk !== "low" &&
            sector.archetype !== "dungeon" &&
            !feature.role.startsWith("dungeon_") &&
            !reachability.isOccupied(feature.center),
        )
        .filter(
          (feature) =>
            !world.navPathService.getNextWaypoint(
              spawn.x,
              spawn.y,
              feature.center.x,
              feature.center.y,
            ),
        )
        .map((feature) => `${sector.id}:${feature.id}`),
    );
    expect(unreachableMajorFeatures).toEqual([]);
  });
});

function isCornerSector(id: string): boolean {
  return ["sector_0_0", "sector_0_2", "sector_2_0", "sector_2_2"].includes(id);
}

type DungeonEntranceSide = "north" | "south" | "west" | "east";

function expectedDungeonEntranceSides(id: string): DungeonEntranceSide[] {
  switch (id) {
    case "sector_0_0":
      return ["east", "south"];
    case "sector_0_2":
      return ["west", "south"];
    case "sector_2_0":
      return ["east", "north"];
    case "sector_2_2":
      return ["west", "north"];
    default:
      throw new Error(`Expected a corner dungeon sector, got ${id}`);
  }
}

function featureRoles(
  sector: ReturnType<typeof generateProceduralWorldLayout>["sectors"][number],
): string[] {
  return sector.features.map((feature) => feature.role);
}

function entityTypeIds(
  sector: ReturnType<typeof generateProceduralWorldLayout>["sectors"][number],
): string[] {
  return sector.enemies.map((enemy) => enemy.typeId);
}

function villageTemplateLabels(
  layout: ReturnType<typeof generateProceduralWorldLayout>,
): string[] {
  return [
    ...new Set(
      layout.sectors.flatMap((sector) =>
        [...sector.structures, ...sector.enemies]
          .map((spec) => spec.label)
          .filter((label): label is string =>
            Boolean(label?.startsWith("village_template:")),
          ),
      ),
    ),
  ].sort();
}

function interiorParentKeyFromLabel(label: string | undefined): string | null {
  if (!label) {
    return null;
  }
  const marker = "|interior_parent:";
  const index = label.indexOf(marker);
  if (index === -1) {
    return null;
  }
  return label.slice(index + marker.length);
}

function isHouseStructureType(typeId: string): boolean {
  return (
    typeId === "structure:house_s" ||
    typeId === "structure:house_m" ||
    typeId === "structure:house_l" ||
    typeId === "structure:house_xl"
  );
}

function houseDoorwayClearanceRect(
  house: ReturnType<
    typeof generateProceduralWorldLayout
  >["sectors"][number]["structures"][number],
): ProceduralRectLike | null {
  const hitboxes = resolveProceduralSpawnHitboxes(house);
  const bounds = boundsForResolvedSpawnHitboxes(hitboxes);
  const laneHalfWidth = 48;
  const laneDepth = 112;
  const rotation = house.rotation ?? 0;
  const cos = Math.round(Math.cos(rotation));
  const sin = Math.round(Math.sin(rotation));
  if (cos === 1 && sin === 0) {
    return {
      minX: house.x - laneHalfWidth,
      maxX: house.x + laneHalfWidth,
      minY: bounds.minY + (bounds.maxY - bounds.minY - laneDepth),
      maxY: bounds.maxY,
    };
  }
  if (cos === 0 && sin === 1) {
    return {
      minX: bounds.minX,
      maxX: bounds.minX + laneDepth,
      minY: house.y - laneHalfWidth,
      maxY: house.y + laneHalfWidth,
    };
  }
  if (cos === -1 && sin === 0) {
    return {
      minX: house.x - laneHalfWidth,
      maxX: house.x + laneHalfWidth,
      minY: bounds.minY,
      maxY: bounds.minY + laneDepth,
    };
  }
  return {
    minX: bounds.maxX - laneDepth,
    maxX: bounds.maxX,
    minY: house.y - laneHalfWidth,
    maxY: house.y + laneHalfWidth,
  };
}

function spawnBounds(
  spawn: ReturnType<
    typeof generateProceduralWorldLayout
  >["sectors"][number]["structures"][number],
): ProceduralRectLike {
  return boundsForResolvedSpawnHitboxes(resolveProceduralSpawnHitboxes(spawn));
}

function boundsForResolvedSpawnHitboxes(
  hitboxes: readonly ReturnType<typeof resolveHitboxRects>[number][],
): ProceduralRectLike {
  return {
    minX: Math.min(...hitboxes.map((hitbox) => hitbox.minX)),
    minY: Math.min(...hitboxes.map((hitbox) => hitbox.minY)),
    maxX: Math.max(...hitboxes.map((hitbox) => hitbox.maxX)),
    maxY: Math.max(...hitboxes.map((hitbox) => hitbox.maxY)),
  };
}

function villagesAreTieredByDistance(
  layout: ReturnType<typeof generateProceduralWorldLayout>,
): boolean {
  const center = {
    x: layout.worldSize.w / 2,
    y: layout.worldSize.h / 2,
  };
  const villages = layout.villages
    .filter((village) => village.kind !== "extraction_fortified")
    .sort((a, b) => {
      const aDistance = Math.hypot(
        a.center.x - center.x,
        a.center.y - center.y,
      );
      const bDistance = Math.hypot(
        b.center.x - center.x,
        b.center.y - center.y,
      );
      return aDistance - bDistance;
    });

  if (villages.length !== 12) {
    return false;
  }

  const expectedTiers = [
    ...Array.from({ length: 4 }, () => "low"),
    ...Array.from({ length: 4 }, () => "medium"),
    ...Array.from({ length: 4 }, () => "high"),
  ] as const;

  return villages.every(
    (village, index) => village.danger === expectedTiers[index],
  );
}

function pointWithinCamp(
  point: WorldPoint,
  camp: ReturnType<typeof generateProceduralWorldLayout>["forestCamps"][number],
): boolean {
  const dx = point.x - camp.x;
  const dy = point.y - camp.y;
  return dx * dx + dy * dy <= camp.radius * camp.radius;
}

function countAliveEnemiesInCamp(
  world: World,
  camp: ReturnType<typeof generateProceduralWorldLayout>["forestCamps"][number],
): number {
  return world.entities
    .all()
    .filter(
      (entity) =>
        entity.typeId.startsWith("enemy:") &&
        entity.alive &&
        pointWithinCamp(entity, camp),
    ).length;
}

function deepestDungeonRoomRoles(
  layout: ReturnType<typeof generateProceduralWorldLayout>,
  count: number,
): string[] {
  return [...layout.dungeon.rooms]
    .sort(
      (left, right) =>
        dungeonRoomEntranceDepth(right, layout) -
        dungeonRoomEntranceDepth(left, layout),
    )
    .slice(0, count)
    .map((room) => room.role);
}

function dungeonRoomEntranceDepth(
  room: ReturnType<
    typeof generateProceduralWorldLayout
  >["dungeon"]["rooms"][number],
  layout: ReturnType<typeof generateProceduralWorldLayout>,
): number {
  return Math.min(
    ...layout.dungeon.entrances.map((entrance) => {
      const dx = room.centerX - entrance.x;
      const dy = room.centerY - entrance.y;
      return dx * dx + dy * dy;
    }),
  );
}

function rectsOverlapOrTouch(
  left: ProceduralRectLike,
  right: ProceduralRectLike,
): boolean {
  return !(
    left.maxX < right.minX ||
    right.maxX < left.minX ||
    left.maxY < right.minY ||
    right.maxY < left.minY
  );
}

function rectsOverlap(
  left: ProceduralRectLike,
  right: ProceduralRectLike,
): boolean {
  return !(
    left.maxX <= right.minX ||
    right.maxX <= left.minX ||
    left.maxY <= right.minY ||
    right.maxY <= left.minY
  );
}

type ProceduralRectLike = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

function proceduralRectsOverlap(
  left: ProceduralRectLike,
  right: ProceduralRectLike,
): boolean {
  return !(
    left.maxX <= right.minX ||
    right.maxX <= left.minX ||
    left.maxY <= right.minY ||
    right.maxY <= left.minY
  );
}

function resolveProceduralSpawnHitboxes(
  spec: ReturnType<
    typeof generateProceduralWorldLayout
  >["sectors"][number]["structures"][number],
) {
  if (spec.hitboxRects) {
    return resolveHitboxRects(spec.x, spec.y, spec.hitboxRects);
  }
  const content = getEntityContent(spec.typeId);
  const hitboxProfiles = content?.hitboxProfiles;
  expect(hitboxProfiles).toBeDefined();
  if (!hitboxProfiles) {
    throw new Error(`Missing hitbox profile for ${spec.typeId}`);
  }
  const activeProfile =
    (content.activeHitboxProfile &&
      hitboxProfiles[content.activeHitboxProfile]) ??
    Object.values(hitboxProfiles)[0];
  expect(activeProfile).toBeDefined();
  if (!activeProfile) {
    throw new Error(`Missing active hitbox profile for ${spec.typeId}`);
  }
  return resolveHitboxRects(spec.x, spec.y, activeProfile);
}

type WorldPoint = { x: number; y: number };

type RuntimeReachability = {
  startOccupied: boolean;
  openCells: number;
  reachableCells: number;
  reachableRatio: number;
  isOccupied(point: WorldPoint): boolean;
};

type DungeonReachability = {
  isReachable(point: WorldPoint): boolean;
};

function computeDungeonReachability(
  layout: ReturnType<typeof generateProceduralWorldLayout>,
): DungeonReachability {
  const cellSize = ACCESS_SAMPLE_SIZE;
  const dungeon = layout.dungeon;
  const minCol = Math.floor(dungeon.minX / cellSize);
  const minRow = Math.floor(dungeon.minY / cellSize);
  const cols = Math.ceil((dungeon.maxX - dungeon.minX) / cellSize);
  const rows = Math.ceil((dungeon.maxY - dungeon.minY) / cellSize);
  const blockers = collectProceduralDungeonWallBlockers(layout);
  const occupied = new Uint8Array(cols * rows);
  const reachable = new Uint8Array(cols * rows);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const point = cellCenter(minCol + col, minRow + row, cellSize);
      if (pointBlocked(point, blockers)) {
        occupied[cellIndex(cols, col, row)] = 1;
      }
    }
  }

  const queue: number[] = [];
  for (const entrance of dungeon.entrances) {
    const start = pointInsideDungeonFromEntrance(entrance);
    const startCol = clampIndex(Math.floor(start.x / cellSize) - minCol, cols);
    const startRow = clampIndex(Math.floor(start.y / cellSize) - minRow, rows);
    const startIndex = cellIndex(cols, startCol, startRow);
    if (occupied[startIndex] === 0 && reachable[startIndex] === 0) {
      reachable[startIndex] = 1;
      queue.push(startIndex);
    }
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    const col = current % cols;
    const row = Math.floor(current / cols);
    visitNeighbor(col + 1, row, cols, rows, occupied, reachable, queue);
    visitNeighbor(col - 1, row, cols, rows, occupied, reachable, queue);
    visitNeighbor(col, row + 1, cols, rows, occupied, reachable, queue);
    visitNeighbor(col, row - 1, cols, rows, occupied, reachable, queue);
  }

  return {
    isReachable(point: WorldPoint) {
      const col = clampIndex(Math.floor(point.x / cellSize) - minCol, cols);
      const row = clampIndex(Math.floor(point.y / cellSize) - minRow, rows);
      return reachable[cellIndex(cols, col, row)] === 1;
    },
  };
}

function collectProceduralDungeonWallBlockers(
  layout: ReturnType<typeof generateProceduralWorldLayout>,
): Array<{
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}> {
  const dungeonSector = layout.sectors.find(
    (sector) => sector.id === layout.dungeonSectorId,
  );
  if (!dungeonSector) {
    throw new Error("expected dungeon sector");
  }
  return dungeonSector.structures.flatMap((spec) =>
    resolveProceduralSpawnHitboxes(spec).map((rect) => ({
      minX: rect.minX,
      minY: rect.minY,
      maxX: rect.maxX,
      maxY: rect.maxY,
    })),
  );
}

function pointInsideDungeonFromEntrance(
  entrance: ReturnType<
    typeof generateProceduralWorldLayout
  >["dungeon"]["entrances"][number],
): WorldPoint {
  const offset = 128;
  switch (entrance.side) {
    case "north":
      return { x: entrance.x, y: entrance.y + offset };
    case "south":
      return { x: entrance.x, y: entrance.y - offset };
    case "west":
      return { x: entrance.x + offset, y: entrance.y };
    case "east":
      return { x: entrance.x - offset, y: entrance.y };
  }
}

function computeOpenAreaReachability(world: World): RuntimeReachability {
  const cellSize = ACCESS_SAMPLE_SIZE;
  const cols = Math.floor(world.gameConfig.worldSize.w / cellSize);
  const rows = Math.floor(world.gameConfig.worldSize.h / cellSize);
  const blockers = collectExpandedStaticBlockers(world);
  const occupied = new Uint8Array(cols * rows);
  const reachable = new Uint8Array(cols * rows);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const point = cellCenter(col, row, cellSize);
      if (pointBlocked(point, blockers)) {
        occupied[cellIndex(cols, col, row)] = 1;
      }
    }
  }

  const spawn = getPlayerSpawnPosition(world.gameConfig.worldSize);
  const startCol = clampIndex(Math.floor(spawn.x / cellSize), cols);
  const startRow = clampIndex(Math.floor(spawn.y / cellSize), rows);
  const startIndex = cellIndex(cols, startCol, startRow);
  const startOccupied = occupied[startIndex] === 1;
  const queue: number[] = [];
  if (!startOccupied) {
    reachable[startIndex] = 1;
    queue.push(startIndex);
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    const col = current % cols;
    const row = Math.floor(current / cols);
    visitNeighbor(col + 1, row, cols, rows, occupied, reachable, queue);
    visitNeighbor(col - 1, row, cols, rows, occupied, reachable, queue);
    visitNeighbor(col, row + 1, cols, rows, occupied, reachable, queue);
    visitNeighbor(col, row - 1, cols, rows, occupied, reachable, queue);
  }

  let openCells = 0;
  let reachableCells = 0;
  for (let index = 0; index < occupied.length; index += 1) {
    if (occupied[index] === 1) {
      continue;
    }
    openCells += 1;
    if (reachable[index] === 1) {
      reachableCells += 1;
    }
  }

  return {
    startOccupied,
    openCells,
    reachableCells,
    reachableRatio: openCells === 0 ? 0 : reachableCells / openCells,
    isOccupied(point: WorldPoint) {
      return pointBlocked(point, blockers);
    },
  };
}

function collectExpandedStaticBlockers(world: World): Array<{
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}> {
  const blockers: Array<{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }> = [];

  for (const entity of world.entities.all()) {
    if (!isProceduralStaticBlocker(entity)) {
      continue;
    }
    for (const rect of resolveHitboxRects(
      entity.x,
      entity.y,
      entity.hitboxes,
    )) {
      blockers.push({
        minX: rect.minX - PLAYER_CLEARANCE,
        minY: rect.minY - PLAYER_CLEARANCE,
        maxX: rect.maxX + PLAYER_CLEARANCE,
        maxY: rect.maxY + PLAYER_CLEARANCE,
      });
    }
  }
  return blockers;
}

function isProceduralStaticBlocker(entity: Entity): boolean {
  if (entity.collisionMode === "none") {
    return false;
  }
  const kind = entityTypeRegistry.require(entity.typeId).kind;
  return kind === "structure" || kind === "building" || kind === "tower";
}

function pointBlocked(
  point: WorldPoint,
  blockers: ReadonlyArray<{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }>,
): boolean {
  return blockers.some(
    (blocker) =>
      point.x >= blocker.minX &&
      point.x <= blocker.maxX &&
      point.y >= blocker.minY &&
      point.y <= blocker.maxY,
  );
}

function visitNeighbor(
  col: number,
  row: number,
  cols: number,
  rows: number,
  occupied: Uint8Array,
  reachable: Uint8Array,
  queue: number[],
): void {
  if (col < 0 || row < 0 || col >= cols || row >= rows) {
    return;
  }
  const index = cellIndex(cols, col, row);
  if (occupied[index] === 1 || reachable[index] === 1) {
    return;
  }
  reachable[index] = 1;
  queue.push(index);
}

function cellCenter(col: number, row: number, cellSize: number): WorldPoint {
  return {
    x: col * cellSize + cellSize / 2,
    y: row * cellSize + cellSize / 2,
  };
}

function cellIndex(cols: number, col: number, row: number): number {
  return row * cols + col;
}

function clampIndex(value: number, length: number): number {
  return Math.max(0, Math.min(length - 1, value));
}
