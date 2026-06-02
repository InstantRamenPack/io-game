import { existsSync } from "node:fs";
import path from "node:path";

type JsonObject = Record<string, unknown>;

type BalanceFile = {
  path: string;
  data: JsonObject;
};

type BalanceField = {
  key: string;
  label: string;
  source:
    | "item"
    | "itemLike"
    | "weapon"
    | "projectile"
    | "enemy"
    | "mag"
    | "world"
    | "json";
  path: string[];
  value: string | number | null;
  kind: "number" | "text";
  file?: string;
  editableWhenMissing?: boolean;
  deleteOnBlank?: boolean;
};

type BalanceRow = {
  weaponTypeId: string;
  weaponLabel: string;
  attackStyle: string;
  rarityTier: string | null;
  weaponFile: string;
  projectileTypeId: string | null;
  projectileLabel: string | null;
  projectileFile: string | null;
  magItemTypeId: string | null;
  magFile: string | null;
  dpsNoReload: number | null;
  dpsWithReload: number | null;
  fields: BalanceField[];
};

type EnemyBalanceRow = {
  enemyTypeId: string;
  enemyLabel: string;
  enemyFile: string;
  fields: BalanceField[];
};

type AmmoBalanceRow = {
  magTypeId: string;
  magLabel: string;
  magFile: string;
  fields: BalanceField[];
};

type ItemRenderingRow = {
  itemTypeId: string;
  itemLabel: string;
  itemKind: "item" | "mag" | "blueprint";
  attackStyle: string | null;
  itemFile: string;
  projectileTypeId: string | null;
  projectileFile: string | null;
  assetPath: string;
  fields: BalanceField[];
};

type WorldBalanceRow = {
  configId: string;
  configLabel: string;
  file: string;
  fields: BalanceField[];
};

type BalanceListEntry = {
  label: string;
  detail: string;
  value: unknown;
};

type BalanceListRow = {
  listId: string;
  tab: "waves" | "loot";
  label: string;
  file: string;
  path: string[];
  itemKind:
    | "waveEnemyWeight"
    | "tierFloor"
    | "typeId"
    | "crateLoot"
    | "pickupSpawnPool";
  entries: BalanceListEntry[];
  addTemplate: string;
};

type JsonBalanceRow = {
  jsonId: string;
  file: string;
  pathLabel: string;
  fields: BalanceField[];
};

const itemContentDirectory = "packages/shared/src/content/item";
const magContentDirectory = "packages/shared/src/content/mag";
const enemyContentDirectory = "packages/shared/src/content/enemy";
const projectileContentDirectory = "packages/shared/src/content/projectile";
const proceduralContentPath =
  "packages/shared/src/world/procedural-content.json";
const worldgenConfigPath = "packages/shared/src/config/worldgen.json";
const wavesConfigPath = "packages/shared/src/config/waves.json";
const extractionConfigPath = "packages/shared/src/config/extraction.json";
const pickupsConfigPath = "packages/shared/src/config/pickups.json";
const jsonEditableRoots = [
  "packages/shared/src/config",
  "packages/shared/src/content",
] as const;
const jsonEditableFiles = [proceduralContentPath] as const;
const rarityTiers = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
] as const;
const pickupSpawnPools = ["mag", "weapon", "blueprint", "medical"] as const;

const weaponFieldSpecs = [
  {
    key: "cooldownTicks",
    label: "Cooldown",
    path: ["weapon", "cooldownTicks"],
  },
  { key: "magSize", label: "Mag Size", path: ["weapon", "magSize"] },
  { key: "reloadTicks", label: "Reload", path: ["weapon", "reloadTicks"] },
  { key: "spreadDeg", label: "Spread", path: ["weapon", "spreadDeg"] },
  {
    key: "specialProjectileCount",
    label: "Special Count",
    path: ["weapon", "special", "projectileCount"],
  },
  {
    key: "specialArcDeg",
    label: "Special Arc",
    path: ["weapon", "special", "arcDeg"],
  },
  {
    key: "specialSelfKnockback",
    label: "Self Knockback",
    path: ["weapon", "special", "selfKnockback"],
  },
  { key: "range", label: "Range", path: ["weapon", "range"] },
  { key: "damage", label: "Weapon Damage", path: ["weapon", "damage"] },
  { key: "knockback", label: "Knockback", path: ["weapon", "knockback"] },
  { key: "sweepArcDeg", label: "Sweep Arc", path: ["weapon", "sweepArcDeg"] },
  { key: "jabWidth", label: "Jab Width", path: ["weapon", "jabWidth"] },
  {
    key: "comboChainWindowCooldownMultiplier",
    label: "Combo Chain Window",
    path: ["weapon", "combo", "chainWindowCooldownMultiplier"],
  },
  {
    key: "comboStabDamageMultiplier",
    label: "Combo Stab Damage",
    path: ["weapon", "combo", "stabDamageMultiplier"],
  },
  {
    key: "comboStabWidth",
    label: "Combo Stab Width",
    path: ["weapon", "combo", "stabWidth"],
  },
  {
    key: "comboStabRange",
    label: "Combo Stab Range",
    path: ["weapon", "combo", "stabRange"],
  },
] as const;

const projectileFieldSpecs = [
  { key: "label", label: "Bullet Name", path: ["label"], kind: "text" },
  { key: "speed", label: "Bullet Speed", path: ["projectile", "speed"] },
  { key: "range", label: "Bullet Range", path: ["projectile", "range"] },
  { key: "damage", label: "Bullet Damage", path: ["projectile", "damage"] },
  { key: "maxHits", label: "Max Hits", path: ["projectile", "maxHits"] },
  {
    key: "hitboxWidth",
    label: "Hitbox W",
    path: ["projectile", "hitbox", "width"],
  },
  {
    key: "hitboxHeight",
    label: "Hitbox H",
    path: ["projectile", "hitbox", "height"],
  },
  {
    key: "splitProjectileCount",
    label: "Split Count",
    path: ["projectile", "split", "projectileCount"],
  },
  {
    key: "splitArcDeg",
    label: "Split Arc",
    path: ["projectile", "split", "arcDeg"],
  },
] as const;

const itemFieldSpecs = [
  { key: "label", label: "Weapon Name", path: ["label"], kind: "text" },
  {
    key: "rarityTier",
    label: "Rarity",
    path: ["rarityTier"],
    kind: "text",
  },
] as const;

const itemRenderingFieldSpecs = [
  {
    key: "assetPath",
    label: "Asset Path",
    path: ["rendering", "assetPath"],
    kind: "text",
  },
  { key: "spriteX", label: "Held X", path: ["rendering", "sprite", "x"] },
  { key: "spriteY", label: "Held Y", path: ["rendering", "sprite", "y"] },
  {
    key: "spriteScale",
    label: "Held Scale",
    path: ["rendering", "sprite", "scale"],
  },
  {
    key: "spriteRotationDeg",
    label: "Held Rotation",
    path: ["rendering", "sprite", "rotationDeg"],
  },
  {
    key: "spriteHandedness",
    label: "Handedness",
    path: ["rendering", "sprite", "handedness"],
    kind: "text",
  },
  {
    key: "spriteRecoilDistance",
    label: "Recoil",
    path: ["rendering", "sprite", "recoilDistance"],
  },
  {
    key: "spriteSwingAngleDeg",
    label: "Sprite Swing",
    path: ["rendering", "sprite", "swingAngleDeg"],
  },
  {
    key: "spriteJabDistance",
    label: "Sprite Jab",
    path: ["rendering", "sprite", "jabDistance"],
  },
  {
    key: "comboStabJabDistance",
    label: "Combo Stab Jab",
    path: ["rendering", "comboStab", "jabDistance"],
  },
  { key: "iconX", label: "Icon X", path: ["rendering", "icon", "x"] },
  { key: "iconY", label: "Icon Y", path: ["rendering", "icon", "y"] },
  {
    key: "iconScale",
    label: "Icon Scale",
    path: ["rendering", "icon", "scale"],
  },
  {
    key: "iconRotationDeg",
    label: "Icon Rotation",
    path: ["rendering", "icon", "rotationDeg"],
  },
] as const;

const enemyFieldSpecs = [
  { key: "label", label: "Enemy Name", path: ["label"], kind: "text" },
  {
    key: "rarityTier",
    label: "Rarity",
    path: ["rarityTier"],
    kind: "text",
  },
  {
    key: "spawnWeaponSelection",
    label: "Spawn Weapon Selection",
    path: ["spawnWeapons", "selection"],
    kind: "text",
  },
  {
    key: "spawnWeaponTypeIds",
    label: "Spawn Weapon Type IDs",
    path: ["spawnWeapons", "typeIds"],
    kind: "text",
  },
] as const;

const hunkCostFieldSpec = {
  key: "hunkCost",
  label: "Hunk Cost",
  path: ["recipe", "costs", "item:hunk", "amount"],
} as const;

const worldBalanceSpecs = [
  {
    configId: "worldgen",
    configLabel: "Worldgen",
    file: worldgenConfigPath,
    fields: [
      { key: "seed", label: "Seed", path: ["seed"] },
      {
        key: "targetVillageCount",
        label: "Village Count",
        path: ["targetVillageCount"],
      },
      {
        key: "lobbyWorldWidth",
        label: "Lobby Width",
        path: ["lobbyWorldSize", "w"],
      },
      {
        key: "lobbyWorldHeight",
        label: "Lobby Height",
        path: ["lobbyWorldSize", "h"],
      },
    ],
  },
  {
    configId: "loot",
    configLabel: "Loot",
    file: pickupsConfigPath,
    fields: [
      {
        key: "weaponMaxActive",
        label: "Weapon Pickups",
        path: ["weapon", "maxActive"],
      },
      {
        key: "blueprintMaxActive",
        label: "Blueprint Pickups",
        path: ["blueprint", "maxActive"],
      },
      {
        key: "medicalMaxActive",
        label: "Medical Pickups",
        path: ["medical", "maxActive"],
      },
      {
        key: "spawnAttempts",
        label: "Spawn Attempts",
        path: ["spawnAttempts"],
      },
    ],
  },
  {
    configId: "waves",
    configLabel: "Waves",
    file: wavesConfigPath,
    fields: [
      {
        key: "randomEnabled",
        label: "Random Waves",
        path: ["randomWaves", "enabled"],
        kind: "text",
      },
      {
        key: "baseBudget",
        label: "Base Budget",
        path: ["randomWaves", "baseBudget"],
      },
      {
        key: "budgetPerNight",
        label: "Budget/Night",
        path: ["randomWaves", "budgetPerNight"],
      },
      {
        key: "targetPriority",
        label: "Target Priority",
        path: ["targetPriority"],
      },
    ],
  },
  {
    configId: "extraction",
    configLabel: "Extraction",
    file: extractionConfigPath,
    fields: [
      {
        key: "enemyDangerRadius",
        label: "Enemy Radius",
        path: ["enemyDangerRadius"],
      },
      {
        key: "boardTimerGoalMs",
        label: "Board Timer",
        path: ["boardTimerGoalMs"],
      },
      {
        key: "chopperTimerGoalMs",
        label: "Chopper Timer",
        path: ["chopperTimerGoalMs"],
      },
    ],
  },
  {
    configId: "villageLoot",
    configLabel: "Village Loot",
    file: proceduralContentPath,
    fields: [
      {
        key: "crateChance",
        label: "Interior Crate Chance",
        path: ["interiorSpawnChances", "crate"],
      },
      {
        key: "enemyChance",
        label: "Interior Enemy Chance",
        path: ["interiorSpawnChances", "enemy"],
      },
      {
        key: "furnitureChance",
        label: "Interior Furniture Chance",
        path: ["interiorSpawnChances", "furniture"],
      },
    ],
  },
  {
    configId: "blueprintPlacement",
    configLabel: "Blueprint Placement",
    file: proceduralContentPath,
    fields: [
      {
        key: "villagesPerDistanceTier",
        label: "Villages / Distance Tier",
        path: ["blueprintPlacement", "villagesPerDistanceTier"],
      },
      {
        key: "itemsPerCrate",
        label: "Items / Crate",
        path: ["blueprintPlacement", "crateRules", "itemsPerCrate"],
      },
      {
        key: "ensureVillageHasCrate",
        label: "Ensure Village Crate",
        path: ["blueprintPlacement", "crateRules", "ensureVillageHasCrate"],
        kind: "text",
      },
      {
        key: "commonArmorBlueprint",
        label: "Common Armor Blueprint",
        path: [
          "blueprintPlacement",
          "villageTierSlots",
          "common",
          "armorBlueprintTypeId",
        ],
        kind: "text",
      },
      {
        key: "commonWeaponBlueprintCount",
        label: "Common Rare Weapon BPs",
        path: [
          "blueprintPlacement",
          "villageTierSlots",
          "common",
          "weaponBlueprintCount",
        ],
      },
      {
        key: "commonWeaponBlueprintPool",
        label: "Common Weapon BP Pool",
        path: [
          "blueprintPlacement",
          "villageTierSlots",
          "common",
          "weaponBlueprintPool",
        ],
        kind: "text",
      },
      {
        key: "uncommonArmorBlueprint",
        label: "Uncommon Armor Blueprint",
        path: [
          "blueprintPlacement",
          "villageTierSlots",
          "uncommon",
          "armorBlueprintTypeId",
        ],
        kind: "text",
      },
      {
        key: "uncommonWeaponBlueprintCount",
        label: "Uncommon Rare Weapon BPs",
        path: [
          "blueprintPlacement",
          "villageTierSlots",
          "uncommon",
          "weaponBlueprintCount",
        ],
      },
      {
        key: "uncommonWeaponBlueprintPool",
        label: "Uncommon Weapon BP Pool",
        path: [
          "blueprintPlacement",
          "villageTierSlots",
          "uncommon",
          "weaponBlueprintPool",
        ],
        kind: "text",
      },
      {
        key: "rareArmorBlueprint",
        label: "Rare Armor Blueprint",
        path: [
          "blueprintPlacement",
          "villageTierSlots",
          "rare",
          "armorBlueprintTypeId",
        ],
        kind: "text",
      },
      {
        key: "rareWeaponBlueprintCount",
        label: "Rare Epic Weapon BPs",
        path: [
          "blueprintPlacement",
          "villageTierSlots",
          "rare",
          "weaponBlueprintCount",
        ],
      },
      {
        key: "rareWeaponBlueprintPool",
        label: "Rare Weapon BP Pool",
        path: [
          "blueprintPlacement",
          "villageTierSlots",
          "rare",
          "weaponBlueprintPool",
        ],
        kind: "text",
      },
      {
        key: "extractionWeaponBlueprintCount",
        label: "Extraction Epic Weapon BPs",
        path: [
          "blueprintPlacement",
          "villageTierSlots",
          "epic",
          "weaponBlueprintCount",
        ],
      },
      {
        key: "extractionWeaponBlueprintPool",
        label: "Extraction Weapon BP Pool",
        path: [
          "blueprintPlacement",
          "villageTierSlots",
          "epic",
          "weaponBlueprintPool",
        ],
        kind: "text",
      },
      {
        key: "dungeonRareWeaponBlueprintCount",
        label: "Dungeon Rare Weapon BPs",
        path: [
          "blueprintPlacement",
          "dungeonSlots",
          "rareWeaponBlueprintCount",
        ],
      },
      {
        key: "dungeonEpicWeaponBlueprintCount",
        label: "Dungeon Epic Weapon BPs",
        path: [
          "blueprintPlacement",
          "dungeonSlots",
          "epicWeaponBlueprintCount",
        ],
      },
      {
        key: "dungeonRareWeaponBlueprintPool",
        label: "Dungeon Rare BP Pool",
        path: ["blueprintPlacement", "dungeonSlots", "rareWeaponBlueprintPool"],
        kind: "text",
      },
      {
        key: "dungeonEpicWeaponBlueprintPool",
        label: "Dungeon Epic BP Pool",
        path: ["blueprintPlacement", "dungeonSlots", "epicWeaponBlueprintPool"],
        kind: "text",
      },
      {
        key: "rareWeaponPoolRarity",
        label: "Rare Weapon Pool Rarity",
        path: [
          "blueprintPlacement",
          "weaponBlueprintPools",
          "rareWeapon",
          "unlockedRarityTier",
        ],
        kind: "text",
      },
      {
        key: "epicWeaponPoolRarity",
        label: "Epic Weapon Pool Rarity",
        path: [
          "blueprintPlacement",
          "weaponBlueprintPools",
          "epicWeapon",
          "unlockedRarityTier",
        ],
        kind: "text",
      },
      {
        key: "epicWeaponPoolRequireWeapon",
        label: "Epic Pool Requires Weapon",
        path: [
          "blueprintPlacement",
          "weaponBlueprintPools",
          "epicWeapon",
          "requireWeapon",
        ],
        kind: "text",
      },
    ],
  },
] as const;

function parseIntegerEnv(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (rawValue === undefined) {
    return fallback;
  }

  const parsedValue = Number(rawValue);
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    console.error(
      `[balance] invalid ${name} value "${rawValue}". Expected a positive integer.`,
    );
    process.exit(1);
  }

  return parsedValue;
}

async function readJsonFile(path: string): Promise<BalanceFile> {
  return {
    path,
    data: (await Bun.file(path).json()) as JsonObject,
  };
}

async function readContentFiles(directory: string): Promise<BalanceFile[]> {
  const glob = new Bun.Glob("*.json");
  const files: BalanceFile[] = [];

  for await (const filename of glob.scan(directory)) {
    files.push(await readJsonFile(`${directory}/${filename}`));
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function collectJsonFiles(directory: string): Promise<string[]> {
  const glob = new Bun.Glob("**/*.json");
  const files: string[] = [];

  for await (const filename of glob.scan(directory)) {
    const path = `${directory}/${filename}`;
    if (path.includes("/generated/")) {
      continue;
    }
    files.push(path);
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function resourceNameFromPath(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1, -".json".length);
}

function typeIdForContentPath(path: string): string {
  if (path.includes("/content/enemy/")) {
    return `enemy:${resourceNameFromPath(path)}`;
  }
  if (path.includes("/content/blueprint/")) {
    return `blueprint:${resourceNameFromPath(path)}`;
  }
  if (path.includes("/content/mag/")) {
    return `mag:${resourceNameFromPath(path)}`;
  }
  return `item:${resourceNameFromPath(path)}`;
}

async function loadKnownTypeIds(): Promise<{
  enemyTypeIds: Set<string>;
  itemLikeTypeIds: Set<string>;
  weaponTypeIds: Set<string>;
  blueprintTypeIds: Set<string>;
}> {
  const [itemFiles, magFiles, enemyFiles, blueprintFiles] = await Promise.all([
    readContentFiles(itemContentDirectory),
    readContentFiles(magContentDirectory),
    readContentFiles(enemyContentDirectory),
    readContentFiles("packages/shared/src/content/blueprint"),
  ]);
  const enemyTypeIds = new Set(
    enemyFiles.map((file) => typeIdForContentPath(file.path)),
  );
  const itemLikeTypeIds = new Set<string>();
  const weaponTypeIds = new Set<string>();
  const blueprintTypeIds = new Set<string>();

  for (const file of [...itemFiles, ...magFiles, ...blueprintFiles]) {
    const typeId = typeIdForContentPath(file.path);
    itemLikeTypeIds.add(typeId);
    if (file.path.includes("/content/blueprint/")) {
      blueprintTypeIds.add(typeId);
    }
    if (file.data.weapon) {
      weaponTypeIds.add(typeId);
    }
  }

  return { enemyTypeIds, itemLikeTypeIds, weaponTypeIds, blueprintTypeIds };
}

function getValue(data: JsonObject, path: readonly string[]): unknown {
  let current: unknown = data;
  for (const key of path) {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    current = (current as JsonObject)[key];
  }
  return current;
}

function setValue(
  data: JsonObject,
  path: readonly string[],
  value: unknown,
): void {
  let current: JsonObject = data;
  for (const key of path.slice(0, -1)) {
    const next = current[key];
    if (!next || typeof next !== "object") {
      throw new Error(`Cannot update missing object path ${path.join(".")}.`);
    }
    current = next as JsonObject;
  }

  current[path[path.length - 1]!] = value;
}

function replaceArrayEntry(
  data: JsonObject,
  path: readonly string[],
  entries: unknown[],
): void {
  if (entries.length === 0) {
    throw new Error("List must contain at least one entry.");
  }
  setValue(data, path, entries);
}

function collectPrimitiveFields(
  value: unknown,
  path: string[] = [],
): Array<{ path: string[]; value: string | number | boolean | null }> {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return [{ path, value }];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      collectPrimitiveFields(entry, [...path, String(index)]),
    );
  }

  if (value && typeof value === "object") {
    return Object.entries(value as JsonObject).flatMap(([key, entry]) =>
      collectPrimitiveFields(entry, [...path, key]),
    );
  }

  return [];
}

function hunkCostAmount(data: JsonObject): number | null {
  const recipe = data.recipe;
  if (!recipe || typeof recipe !== "object") {
    return null;
  }

  const costs = (recipe as JsonObject).costs;
  if (!Array.isArray(costs)) {
    return null;
  }

  const hunkCost = costs.find(
    (cost) =>
      cost &&
      typeof cost === "object" &&
      (cost as JsonObject).typeId === "item:hunk",
  );
  const amount =
    hunkCost && typeof hunkCost === "object"
      ? (hunkCost as JsonObject).amount
      : undefined;

  return typeof amount === "number" ? amount : null;
}

function setHunkCost(data: JsonObject, value: number | null): void {
  const recipe = data.recipe;

  if (value === null) {
    if (!recipe || typeof recipe !== "object") {
      return;
    }

    const recipeObject = recipe as JsonObject;
    const costs = recipeObject.costs;
    if (!Array.isArray(costs)) {
      return;
    }

    const remainingCosts = costs.filter(
      (cost) =>
        !(
          cost &&
          typeof cost === "object" &&
          (cost as JsonObject).typeId === "item:hunk"
        ),
    );

    if (remainingCosts.length === 0) {
      delete data.recipe;
      return;
    }

    recipeObject.costs = remainingCosts;
    return;
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Hunk cost must be a positive integer.");
  }

  if (!recipe || typeof recipe !== "object" || Array.isArray(recipe)) {
    data.recipe = {
      outputAmount: 1,
      costs: [{ typeId: "item:hunk", amount: value }],
    };
    return;
  }

  const recipeObject = recipe as JsonObject;
  const costs = Array.isArray(recipeObject.costs) ? recipeObject.costs : [];
  const hunkCost = costs.find(
    (cost) =>
      cost &&
      typeof cost === "object" &&
      (cost as JsonObject).typeId === "item:hunk",
  );

  if (hunkCost && typeof hunkCost === "object") {
    (hunkCost as JsonObject).amount = value;
  } else {
    costs.push({ typeId: "item:hunk", amount: value });
  }

  recipeObject.costs = costs;
}

function makeField(
  spec: {
    key: string;
    label: string;
    path: readonly string[];
    kind?: BalanceField["kind"];
  },
  source: BalanceField["source"],
  data: JsonObject,
): BalanceField {
  const value = getValue(data, spec.path);
  const editableValue =
    typeof value === "number" || typeof value === "string" || value === null
      ? value
      : null;

  return {
    key: `${source}.${spec.key}`,
    label: spec.label,
    source,
    path: [...spec.path],
    value: editableValue,
    kind: spec.kind ?? (typeof value === "string" ? "text" : "number"),
  };
}

function makeItemField(
  spec: (typeof itemFieldSpecs)[number],
  data: JsonObject,
): BalanceField {
  return {
    key: `item.${spec.key}`,
    label: spec.label,
    source: "item",
    path: [...spec.path],
    value:
      typeof getValue(data, spec.path) === "string"
        ? (getValue(data, spec.path) as string)
        : null,
    kind: spec.kind,
  };
}

function makeEnemyField(
  spec: (typeof enemyFieldSpecs)[number],
  data: JsonObject,
): BalanceField {
  const value = getValue(data, spec.path);
  return {
    key: `enemy.${spec.key}`,
    label: spec.label,
    source: "enemy",
    path: [...spec.path],
    value: Array.isArray(value)
      ? value.join(", ")
      : typeof value === "string"
        ? value
        : null,
    kind: spec.kind,
  };
}

function makeHunkCostField(data: JsonObject): BalanceField {
  return {
    key: "item.hunkCost",
    label: hunkCostFieldSpec.label,
    source: "item",
    path: [...hunkCostFieldSpec.path],
    value: hunkCostAmount(data),
    kind: "number",
    editableWhenMissing: true,
    deleteOnBlank: true,
  };
}

function makeHunkCostFieldForSource(
  data: JsonObject,
  source: "item" | "itemLike",
): BalanceField {
  return {
    key: `${source}.hunkCost`,
    label: hunkCostFieldSpec.label,
    source,
    path: [...hunkCostFieldSpec.path],
    value: hunkCostAmount(data),
    kind: "number",
    editableWhenMissing: true,
    deleteOnBlank: true,
  };
}

function makeMagHunkCostField(
  data: JsonObject | undefined,
  file: string | null,
): BalanceField {
  return {
    key: "mag.hunkCost",
    label: "Ammo Hunk Cost",
    source: "mag",
    path: [...hunkCostFieldSpec.path],
    value: data ? hunkCostAmount(data) : null,
    kind: "number",
    editableWhenMissing: Boolean(file),
    deleteOnBlank: true,
    file: file ?? undefined,
  };
}

function numberField(fields: BalanceField[], key: string): number | undefined {
  const value = fields.find((field) => field.key === key)?.value;
  return typeof value === "number" ? value : undefined;
}

function calculateDps(
  attackStyle: string,
  fields: BalanceField[],
): Pick<BalanceRow, "dpsNoReload" | "dpsWithReload"> {
  const cooldownTicks = numberField(fields, "weapon.cooldownTicks");
  if (!cooldownTicks || cooldownTicks <= 0) {
    return { dpsNoReload: null, dpsWithReload: null };
  }

  const damage =
    attackStyle === "shoot"
      ? numberField(fields, "projectile.damage")
      : numberField(fields, "weapon.damage");

  if (damage === undefined) {
    return { dpsNoReload: null, dpsWithReload: null };
  }

  const dpsNoReload = damage / cooldownTicks;
  if (attackStyle !== "shoot") {
    return { dpsNoReload, dpsWithReload: dpsNoReload };
  }

  const magSize = numberField(fields, "weapon.magSize");
  const reloadTicks = numberField(fields, "weapon.reloadTicks");
  if (!magSize || magSize <= 0 || reloadTicks === undefined) {
    return { dpsNoReload, dpsWithReload: null };
  }

  return {
    dpsNoReload,
    dpsWithReload: (damage * magSize) / (cooldownTicks * magSize + reloadTicks),
  };
}

async function loadBalanceRows(): Promise<BalanceRow[]> {
  const [itemFiles, magFiles, projectileFiles] = await Promise.all([
    readContentFiles(itemContentDirectory),
    readContentFiles(magContentDirectory),
    readContentFiles(projectileContentDirectory),
  ]);
  const magsByTypeId = new Map(
    magFiles.map((file) => [`mag:${resourceNameFromPath(file.path)}`, file]),
  );
  const projectilesByTypeId = new Map(
    projectileFiles.map((file) => [
      `projectile:${resourceNameFromPath(file.path)}`,
      file,
    ]),
  );

  return itemFiles
    .filter((file) => !!file.data.weapon)
    .map((weaponFile) => {
      const weapon = weaponFile.data.weapon as JsonObject;
      const projectileTypeId =
        typeof weapon.projectileTypeId === "string"
          ? weapon.projectileTypeId
          : null;
      const projectileFile = projectileTypeId
        ? projectilesByTypeId.get(projectileTypeId)
        : undefined;
      const magItemTypeId =
        typeof weapon.magItemTypeId === "string" ? weapon.magItemTypeId : null;
      const magFile = magItemTypeId
        ? magsByTypeId.get(magItemTypeId)
        : undefined;
      const projectileFields = projectileFile
        ? projectileFieldSpecs.map((spec) =>
            makeField(spec, "projectile", projectileFile.data),
          )
        : [];

      const attackStyle =
        typeof weapon.attackStyle === "string" ? weapon.attackStyle : "";
      const fields = [
        ...itemFieldSpecs.map((spec) => makeItemField(spec, weaponFile.data)),
        makeHunkCostField(weaponFile.data),
        makeMagHunkCostField(magFile?.data, magFile?.path ?? null),
        ...weaponFieldSpecs.map((spec) =>
          makeField(spec, "weapon", weaponFile.data),
        ),
        ...projectileFields,
      ];
      const dps = calculateDps(attackStyle, fields);

      return {
        weaponTypeId: `item:${resourceNameFromPath(weaponFile.path)}`,
        weaponLabel:
          typeof weaponFile.data.label === "string"
            ? weaponFile.data.label
            : resourceNameFromPath(weaponFile.path),
        attackStyle,
        rarityTier:
          typeof weaponFile.data.rarityTier === "string"
            ? weaponFile.data.rarityTier
            : null,
        weaponFile: weaponFile.path,
        projectileTypeId,
        projectileLabel:
          projectileFile && typeof projectileFile.data.label === "string"
            ? projectileFile.data.label
            : null,
        projectileFile: projectileFile?.path ?? null,
        magItemTypeId,
        magFile: magFile?.path ?? null,
        ...dps,
        fields,
      };
    })
    .sort((a, b) => {
      if (a.attackStyle !== b.attackStyle) {
        return a.attackStyle.localeCompare(b.attackStyle);
      }
      return a.weaponLabel.localeCompare(b.weaponLabel);
    });
}

async function loadAmmoBalanceRows(): Promise<AmmoBalanceRow[]> {
  const magFiles = await readContentFiles(magContentDirectory);
  return magFiles
    .map((magFile) => ({
      magTypeId: typeIdForContentPath(magFile.path),
      magLabel:
        typeof magFile.data.label === "string"
          ? magFile.data.label
          : resourceNameFromPath(magFile.path),
      magFile: magFile.path,
      fields: [
        {
          key: "mag.label",
          label: "Ammo Name",
          source: "mag" as const,
          path: ["label"],
          value:
            typeof magFile.data.label === "string" ? magFile.data.label : null,
          kind: "text" as const,
        },
        makeMagHunkCostField(magFile.data, magFile.path),
      ],
    }))
    .sort((a, b) => a.magLabel.localeCompare(b.magLabel));
}

async function loadItemRenderingRows(): Promise<ItemRenderingRow[]> {
  const [itemFiles, magFiles, blueprintFiles, projectileFiles] =
    await Promise.all([
      readContentFiles(itemContentDirectory),
      readContentFiles(magContentDirectory),
      readContentFiles("packages/shared/src/content/blueprint"),
      readContentFiles(projectileContentDirectory),
    ]);
  const projectilesByTypeId = new Map(
    projectileFiles.map((file) => [
      `projectile:${resourceNameFromPath(file.path)}`,
      file,
    ]),
  );
  const files = [
    ...itemFiles.map((file) => ({ file, itemKind: "item" as const })),
    ...magFiles.map((file) => ({ file, itemKind: "mag" as const })),
    ...blueprintFiles.map((file) => ({
      file,
      itemKind: "blueprint" as const,
    })),
  ];

  return files
    .map(({ file, itemKind }) => {
      const itemTypeId = `${itemKind}:${resourceNameFromPath(file.path)}`;
      const weapon = file.data.weapon as JsonObject | undefined;
      const projectileTypeId =
        weapon && typeof weapon.projectileTypeId === "string"
          ? weapon.projectileTypeId
          : null;
      const projectileFile = projectileTypeId
        ? projectilesByTypeId.get(projectileTypeId)
        : undefined;
      const fields = [
        {
          key: "itemLike.label",
          label: "Item Name",
          source: "itemLike" as const,
          path: ["label"],
          value: typeof file.data.label === "string" ? file.data.label : null,
          kind: "text" as const,
        },
        ...itemRenderingFieldSpecs.map((spec) =>
          makeField(spec, "itemLike", file.data),
        ),
        ...(weapon
          ? [
              makeHunkCostFieldForSource(file.data, "itemLike"),
              ...weaponFieldSpecs.map((spec) =>
                makeField(spec, "itemLike", file.data),
              ),
            ]
          : []),
        ...(projectileFile
          ? projectileFieldSpecs.map((spec) =>
              makeField(spec, "projectile", projectileFile.data),
            )
          : []),
      ];
      const assetPathValue = fields.find(
        (field) => field.key === "itemLike.assetPath",
      )?.value;
      return {
        itemTypeId,
        itemLabel:
          typeof file.data.label === "string"
            ? file.data.label
            : resourceNameFromPath(file.path),
        itemKind,
        attackStyle:
          weapon && typeof weapon.attackStyle === "string"
            ? weapon.attackStyle
            : null,
        itemFile: file.path,
        projectileTypeId,
        projectileFile: projectileFile?.path ?? null,
        assetPath:
          typeof assetPathValue === "string"
            ? assetPathValue
            : "/placeholder.png",
        fields,
      };
    })
    .sort((a, b) => {
      if (a.itemKind !== b.itemKind) {
        return a.itemKind.localeCompare(b.itemKind);
      }
      return a.itemLabel.localeCompare(b.itemLabel);
    });
}

async function loadEnemyBalanceRows(): Promise<EnemyBalanceRow[]> {
  const enemyFiles = await readContentFiles(enemyContentDirectory);
  return enemyFiles
    .map((enemyFile) => {
      const enemyResourceName = resourceNameFromPath(enemyFile.path);
      const enemyLabel =
        typeof enemyFile.data.label === "string"
          ? enemyFile.data.label
          : enemyResourceName;
      return {
        enemyTypeId: `enemy:${enemyResourceName}`,
        enemyLabel,
        enemyFile: enemyFile.path,
        fields: enemyFieldSpecs.map((spec) =>
          makeEnemyField(spec, enemyFile.data),
        ),
      };
    })
    .sort((a, b) => a.enemyLabel.localeCompare(b.enemyLabel));
}

function listEntriesFor(
  itemKind: BalanceListRow["itemKind"],
  entries: unknown[],
): BalanceListEntry[] {
  return entries.map((entry) => {
    if (itemKind === "waveEnemyWeight" && entry && typeof entry === "object") {
      const object = entry as JsonObject;
      return {
        label: String(object.entityType ?? ""),
        detail: `${String(object.tier ?? "")} / weight ${String(object.weight ?? "")}`,
        value: entry,
      };
    }
    if (itemKind === "tierFloor" && entry && typeof entry === "object") {
      const object = entry as JsonObject;
      return {
        label: `Night ${String(object.nightCycle ?? "")}`,
        detail: `allowed: ${Array.isArray(object.allowedTiers) ? object.allowedTiers.join(", ") : ""}`,
        value: entry,
      };
    }
    if (itemKind === "crateLoot" && entry && typeof entry === "object") {
      const object = entry as JsonObject;
      return {
        label: String(object.typeId ?? ""),
        detail: `${String(object.kind ?? "")}${object.amount === undefined ? "" : ` x${String(object.amount)}`}`,
        value: entry,
      };
    }
    return { label: String(entry), detail: "", value: entry };
  });
}

function makeListRow(
  tab: BalanceListRow["tab"],
  label: string,
  file: string,
  path: string[],
  itemKind: BalanceListRow["itemKind"],
  entries: unknown,
  addTemplate: string,
): BalanceListRow {
  if (!Array.isArray(entries)) {
    throw new Error(`Expected ${label} to be a list.`);
  }
  return {
    listId: `${file}:${path.join(".")}`,
    tab,
    label,
    file,
    path,
    itemKind,
    entries: listEntriesFor(itemKind, entries),
    addTemplate,
  };
}

function pushListRowIfArray(
  rows: BalanceListRow[],
  tab: BalanceListRow["tab"],
  label: string,
  file: string,
  path: string[],
  itemKind: BalanceListRow["itemKind"],
  entries: unknown,
  addTemplate: string,
): void {
  if (!Array.isArray(entries)) {
    return;
  }
  rows.push(
    makeListRow(tab, label, file, path, itemKind, entries, addTemplate),
  );
}

async function loadBalanceListRows(): Promise<BalanceListRow[]> {
  const [wavesFile, proceduralFile, pickupsFile, itemFiles, blueprintFiles] =
    await Promise.all([
      readJsonFile(wavesConfigPath),
      readJsonFile(proceduralContentPath),
      readJsonFile(pickupsConfigPath),
      readContentFiles(itemContentDirectory),
      readContentFiles("packages/shared/src/content/blueprint"),
    ]);
  const rows: BalanceListRow[] = [];

  rows.push(
    makeListRow(
      "waves",
      "Wave enemy weights",
      wavesConfigPath,
      ["randomWaves", "enemyWeights"],
      "waveEnemyWeight",
      getValue(wavesFile.data, ["randomWaves", "enemyWeights"]),
      '{"entityType":"drifter","tier":"common","weight":1}',
    ),
    makeListRow(
      "waves",
      "Tier floors and allowed tiers",
      wavesConfigPath,
      ["randomWaves", "tierFloors"],
      "tierFloor",
      getValue(wavesFile.data, ["randomWaves", "tierFloors"]),
      '{"nightCycle":1,"floors":{"common":1},"allowedTiers":["common"]}',
    ),
  );

  for (const tier of rarityTiers) {
    pushListRowIfArray(
      rows,
      "loot",
      `Loot tier ${tier}`,
      proceduralContentPath,
      ["lootByTier", tier],
      "typeId",
      getValue(proceduralFile.data, ["lootByTier", tier]),
      '"item:basic_spear"',
    );
    pushListRowIfArray(
      rows,
      "loot",
      `Crate loot ${tier}`,
      proceduralContentPath,
      ["crateLootByTier", tier],
      "crateLoot",
      getValue(proceduralFile.data, ["crateLootByTier", tier]),
      '{"typeId":"item:basic_spear","kind":"weapon"}',
    );
  }

  for (const poolKey of ["rareWeapon", "epicWeapon"] as const) {
    pushListRowIfArray(
      rows,
      "loot",
      `Blueprint pool excludes ${poolKey}`,
      proceduralContentPath,
      [
        "blueprintPlacement",
        "weaponBlueprintPools",
        poolKey,
        "excludeBlueprintTypeIds",
      ],
      "typeId",
      getValue(proceduralFile.data, [
        "blueprintPlacement",
        "weaponBlueprintPools",
        poolKey,
        "excludeBlueprintTypeIds",
      ]),
      '"blueprint:armor"',
    );
  }

  for (const pool of ["corner", "edge"]) {
    rows.push(
      makeListRow(
        "loot",
        `Forest camp ${pool} enemies`,
        proceduralContentPath,
        ["forestCampEnemyTypes", pool],
        "typeId",
        getValue(proceduralFile.data, ["forestCampEnemyTypes", pool]),
        '"enemy:drifter"',
      ),
    );
  }

  const villageEnemyPools = getValue(proceduralFile.data, [
    "villageEnemyPools",
  ]);
  if (villageEnemyPools && typeof villageEnemyPools === "object") {
    for (const pool of Object.keys(villageEnemyPools as JsonObject).sort()) {
      rows.push(
        makeListRow(
          "loot",
          `Village ${pool} enemies`,
          proceduralContentPath,
          ["villageEnemyPools", pool],
          "typeId",
          getValue(proceduralFile.data, ["villageEnemyPools", pool]),
          '"enemy:drifter"',
        ),
      );
    }
  }

  rows.push(
    makeListRow(
      "loot",
      "Legacy blueprint pickup order",
      pickupsConfigPath,
      ["legacyOrder", "blueprint"],
      "typeId",
      getValue(pickupsFile.data, ["legacyOrder", "blueprint"]),
      '"blueprint:halberd"',
    ),
  );

  for (const file of [...itemFiles, ...blueprintFiles]) {
    const pools = getValue(file.data, ["pickupSpawn", "pools"]);
    if (Array.isArray(pools)) {
      rows.push(
        makeListRow(
          "loot",
          `${typeIdForContentPath(file.path)} spawn pools`,
          file.path,
          ["pickupSpawn", "pools"],
          "pickupSpawnPool",
          pools,
          '"weapon"',
        ),
      );
    }
  }

  return rows.sort((a, b) => a.label.localeCompare(b.label));
}

async function loadWorldBalanceRows(): Promise<WorldBalanceRow[]> {
  return Promise.all(
    worldBalanceSpecs.map(async (spec) => {
      const file = await readJsonFile(spec.file);
      return {
        configId: spec.configId,
        configLabel: spec.configLabel,
        file: spec.file,
        fields: spec.fields.map((fieldSpec) => ({
          key: `world.${fieldSpec.key}`,
          label: fieldSpec.label,
          source: "world" as const,
          path: [...fieldSpec.path],
          value: (() => {
            const value = getValue(file.data, fieldSpec.path);
            if (typeof value === "boolean") {
              return String(value);
            }
            return typeof value === "number" || typeof value === "string"
              ? value
              : null;
          })(),
          kind:
            ("kind" in fieldSpec ? fieldSpec.kind : undefined) ??
            (typeof getValue(file.data, fieldSpec.path) === "string" ||
            typeof getValue(file.data, fieldSpec.path) === "boolean"
              ? "text"
              : "number"),
          file: spec.file,
        })),
      };
    }),
  );
}

async function loadJsonBalanceRows(): Promise<JsonBalanceRow[]> {
  const paths = [
    ...(await Promise.all(jsonEditableRoots.map(collectJsonFiles))).flat(),
    ...jsonEditableFiles,
  ];
  const uniquePaths = [...new Set(paths)].sort((a, b) => a.localeCompare(b));
  const rows: JsonBalanceRow[] = [];

  for (const path of uniquePaths) {
    const file = await readJsonFile(path);
    for (const primitive of collectPrimitiveFields(file.data)) {
      const pathLabel = primitive.path.join(".");
      rows.push({
        jsonId: `${path}:${pathLabel}`,
        file: path,
        pathLabel,
        fields: [
          {
            key: "json.value",
            label: "Value",
            source: "json",
            path: primitive.path,
            value:
              typeof primitive.value === "boolean"
                ? String(primitive.value)
                : primitive.value,
            kind: typeof primitive.value === "number" ? "number" : "text",
            file: path,
          },
        ],
      });
    }
  }

  return rows;
}

function knownFieldForUpdate(
  row:
    | BalanceRow
    | ItemRenderingRow
    | AmmoBalanceRow
    | EnemyBalanceRow
    | WorldBalanceRow
    | JsonBalanceRow,
  source: BalanceField["source"],
  path: string[],
): BalanceField | undefined {
  return row.fields.find(
    (field) =>
      field.source === source &&
      field.path.length === path.length &&
      field.path.every((part, index) => part === path[index]),
  );
}

function parseUpdateValue(value: unknown): number | string | null {
  if (value === null || typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  throw new Error("Update value must be a finite number, string, or null.");
}

function parseFieldUpdateValue(
  field: BalanceField,
  value: unknown,
): number | string | string[] | null {
  if (
    field.deleteOnBlank &&
    (value === null || (typeof value === "string" && value.trim() === ""))
  ) {
    return null;
  }

  const parsedValue = parseUpdateValue(value);
  if (field.kind === "text") {
    if (typeof parsedValue !== "string" || parsedValue.trim().length === 0) {
      throw new Error(`${field.label} must be non-empty text.`);
    }
    if (field.key === "enemy.spawnWeaponTypeIds") {
      const typeIds = parsedValue
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
      if (typeIds.length === 0) {
        throw new Error(`${field.label} must include at least one type id.`);
      }
      return typeIds;
    }
    return parsedValue.trim();
  }

  if (typeof parsedValue !== "number") {
    throw new Error(`${field.label} must be a number.`);
  }

  return parsedValue;
}

function assertRarityTier(value: string): void {
  if (!rarityTiers.includes(value as (typeof rarityTiers)[number])) {
    throw new Error(`Unknown rarity tier: ${value}.`);
  }
}

function assertKnownTypeId(typeId: string, knownTypeIds: Set<string>): void {
  if (!knownTypeIds.has(typeId)) {
    throw new Error(`Unknown type id: ${typeId}.`);
  }
}

function isSignedRenderingField(field: BalanceField): boolean {
  return (
    field.source === "itemLike" &&
    field.path[0] === "rendering" &&
    (field.path[1] === "sprite" || field.path[1] === "icon")
  );
}

function validateScalarField(
  field: BalanceField,
  value: number | string | boolean | string[] | null,
  knownIds: Awaited<ReturnType<typeof loadKnownTypeIds>>,
): void {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error(`${field.label} must be finite.`);
  }
  if (
    typeof value === "number" &&
    field.key !== "world.targetPriority" &&
    !isSignedRenderingField(field) &&
    value < 0
  ) {
    throw new Error(`${field.label} must be zero or greater.`);
  }
  if (
    (field.key === "item.rarityTier" || field.key === "enemy.rarityTier") &&
    typeof value === "string"
  ) {
    assertRarityTier(value);
  }
  if (field.key === "enemy.spawnWeaponTypeIds" && Array.isArray(value)) {
    for (const typeId of value) {
      assertKnownTypeId(typeId, knownIds.weaponTypeIds);
    }
  }
}

function validateListEntry(
  itemKind: BalanceListRow["itemKind"],
  value: unknown,
  knownIds: Awaited<ReturnType<typeof loadKnownTypeIds>>,
): unknown {
  if (itemKind === "waveEnemyWeight") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Wave enemy weight must be an object.");
    }
    const object = value as JsonObject;
    if (typeof object.entityType !== "string") {
      throw new Error("Wave enemy weight requires entityType.");
    }
    assertKnownTypeId(`enemy:${object.entityType}`, knownIds.enemyTypeIds);
    if (typeof object.tier !== "string") {
      throw new Error("Wave enemy weight requires tier.");
    }
    assertRarityTier(object.tier);
    if (typeof object.weight !== "number" || object.weight <= 0) {
      throw new Error("Wave enemy weight must be a positive number.");
    }
    return {
      entityType: object.entityType,
      tier: object.tier,
      weight: object.weight,
    };
  }

  if (itemKind === "tierFloor") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Tier floor must be an object.");
    }
    const object = value as JsonObject;
    if (
      !Number.isInteger(object.nightCycle) ||
      Number(object.nightCycle) <= 0
    ) {
      throw new Error("Tier floor nightCycle must be a positive integer.");
    }
    if (
      !object.floors ||
      typeof object.floors !== "object" ||
      Array.isArray(object.floors)
    ) {
      throw new Error("Tier floor requires floors.");
    }
    for (const [tier, floor] of Object.entries(object.floors as JsonObject)) {
      assertRarityTier(tier);
      if (!Number.isInteger(floor) || Number(floor) <= 0) {
        throw new Error(`Tier floor for ${tier} must be a positive integer.`);
      }
    }
    if (
      !Array.isArray(object.allowedTiers) ||
      object.allowedTiers.length === 0
    ) {
      throw new Error("Tier floor allowedTiers must be non-empty.");
    }
    for (const tier of object.allowedTiers) {
      if (typeof tier !== "string") {
        throw new Error("Tier floor allowedTiers must be tier strings.");
      }
      assertRarityTier(tier);
    }
    return {
      nightCycle: object.nightCycle,
      floors: object.floors,
      allowedTiers: object.allowedTiers,
    };
  }

  if (itemKind === "crateLoot") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Crate loot entry must be an object.");
    }
    const object = value as JsonObject;
    if (typeof object.typeId !== "string") {
      throw new Error("Crate loot entry requires typeId.");
    }
    assertKnownTypeId(object.typeId, knownIds.itemLikeTypeIds);
    if (object.kind !== "weapon" && object.kind !== "stackable") {
      throw new Error("Crate loot kind must be weapon or stackable.");
    }
    if (
      object.amount !== undefined &&
      (!Number.isInteger(object.amount) || Number(object.amount) <= 0)
    ) {
      throw new Error("Crate loot amount must be a positive integer.");
    }
    return object.amount === undefined
      ? { typeId: object.typeId, kind: object.kind }
      : { typeId: object.typeId, kind: object.kind, amount: object.amount };
  }

  if (itemKind === "pickupSpawnPool") {
    if (
      typeof value !== "string" ||
      !pickupSpawnPools.includes(value as (typeof pickupSpawnPools)[number])
    ) {
      throw new Error("Pickup spawn pool is unknown.");
    }
    return value;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("List entry must be a non-empty type id.");
  }
  const typeId = value.trim();
  const targetIds =
    itemKind === "typeId" ? knownIdsForTypeId(typeId, knownIds) : null;
  assertKnownTypeId(typeId, targetIds ?? knownIds.itemLikeTypeIds);
  return typeId;
}

function knownIdsForTypeId(
  typeId: string,
  knownIds: Awaited<ReturnType<typeof loadKnownTypeIds>>,
): Set<string> {
  if (typeId.startsWith("enemy:")) {
    return knownIds.enemyTypeIds;
  }
  return knownIds.itemLikeTypeIds;
}

async function balancePayload(): Promise<JsonObject> {
  return {
    rows: await loadBalanceRows(),
    renderingRows: await loadItemRenderingRows(),
    ammoRows: await loadAmmoBalanceRows(),
    enemyRows: await loadEnemyBalanceRows(),
    worldRows: await loadWorldBalanceRows(),
    listRows: await loadBalanceListRows(),
    jsonRows: await loadJsonBalanceRows(),
  };
}

async function saveUpdate(request: Request): Promise<Response> {
  const body = (await request.json()) as {
    weaponTypeId?: unknown;
    itemTypeId?: unknown;
    magTypeId?: unknown;
    enemyTypeId?: unknown;
    configId?: unknown;
    jsonId?: unknown;
    source?: unknown;
    path?: unknown;
    value?: unknown;
  };

  const source = body.source as BalanceField["source"];
  const hasValidIdentifier =
    source === "json"
      ? typeof body.jsonId === "string"
      : source === "world"
        ? typeof body.configId === "string"
        : source === "enemy"
          ? typeof body.enemyTypeId === "string" ||
            typeof body.weaponTypeId === "string"
          : source === "mag"
            ? typeof body.magTypeId === "string" ||
              typeof body.weaponTypeId === "string"
            : source === "itemLike"
              ? typeof body.itemTypeId === "string"
              : source === "projectile" && typeof body.itemTypeId === "string"
                ? true
                : typeof body.weaponTypeId === "string";
  if (
    ![
      "item",
      "itemLike",
      "weapon",
      "projectile",
      "enemy",
      "mag",
      "world",
      "json",
    ].includes(String(body.source)) ||
    !hasValidIdentifier ||
    !Array.isArray(body.path) ||
    !body.path.every((part) => typeof part === "string")
  ) {
    return Response.json({ error: "Invalid save request." }, { status: 400 });
  }

  const knownIds = await loadKnownTypeIds();

  if (source === "json") {
    const rows = await loadJsonBalanceRows();
    const row = rows.find((candidate) => candidate.jsonId === body.jsonId);
    if (!row) {
      return Response.json({ error: "Unknown JSON field." }, { status: 404 });
    }
    const field = knownFieldForUpdate(row, source, body.path);
    if (!field?.file) {
      return Response.json(
        { error: "Unknown editable field." },
        { status: 400 },
      );
    }

    const targetFile = await readJsonFile(field.file);
    const currentValue = getValue(targetFile.data, body.path);
    const parsedValue =
      typeof currentValue === "boolean"
        ? String(body.value) === "true"
        : parseFieldUpdateValue(field, body.value);
    validateScalarField(field, parsedValue, knownIds);
    setValue(targetFile.data, body.path, parsedValue);
    await Bun.write(
      field.file,
      `${JSON.stringify(targetFile.data, null, 2)}\n`,
    );
    return Response.json(await balancePayload());
  }

  if (source === "world") {
    const rows = await loadWorldBalanceRows();
    const row = rows.find((candidate) => candidate.configId === body.configId);
    if (!row) {
      return Response.json({ error: "Unknown world config." }, { status: 404 });
    }
    const field = knownFieldForUpdate(row, source, body.path);
    if (!field?.file) {
      return Response.json(
        { error: "Unknown editable field." },
        { status: 400 },
      );
    }
    const targetFile = await readJsonFile(field.file);
    const parsedValue =
      field.value === "true" || field.value === "false"
        ? String(body.value) === "true"
        : parseFieldUpdateValue(field, body.value);
    validateScalarField(field, parsedValue, knownIds);
    setValue(targetFile.data, body.path, parsedValue);
    await Bun.write(
      field.file,
      `${JSON.stringify(targetFile.data, null, 2)}\n`,
    );
    return Response.json(await balancePayload());
  }
  if (
    source === "itemLike" ||
    (source === "projectile" && typeof body.itemTypeId === "string")
  ) {
    const rows = await loadItemRenderingRows();
    const row = rows.find(
      (candidate) => candidate.itemTypeId === body.itemTypeId,
    );
    if (!row) {
      return Response.json({ error: "Unknown item." }, { status: 404 });
    }
    const field = knownFieldForUpdate(row, source, body.path);
    if (!field) {
      return Response.json(
        { error: "Unknown editable field." },
        { status: 400 },
      );
    }
    const targetPath =
      source === "projectile" ? row.projectileFile : row.itemFile;
    if (!targetPath) {
      return Response.json(
        { error: "Item has no projectile file." },
        { status: 400 },
      );
    }
    const targetFile = await readJsonFile(targetPath);
    const parsedValue = parseFieldUpdateValue(field, body.value);
    validateScalarField(field, parsedValue, knownIds);
    if (field.key === "itemLike.hunkCost") {
      setHunkCost(targetFile.data, parsedValue as number | null);
    } else {
      setValue(targetFile.data, body.path, parsedValue);
    }
    await Bun.write(
      targetPath,
      `${JSON.stringify(targetFile.data, null, 2)}\n`,
    );
    return Response.json(await balancePayload());
  }
  if (source === "enemy") {
    const rows = await loadEnemyBalanceRows();
    const enemyTypeId =
      typeof body.enemyTypeId === "string"
        ? body.enemyTypeId
        : body.weaponTypeId;
    const row = rows.find((candidate) => candidate.enemyTypeId === enemyTypeId);
    if (!row) {
      return Response.json({ error: "Unknown enemy." }, { status: 404 });
    }

    const field = knownFieldForUpdate(row, source, body.path);
    if (!field) {
      return Response.json(
        { error: "Unknown editable field." },
        { status: 400 },
      );
    }

    const targetFile = await readJsonFile(row.enemyFile);
    const parsedValue = parseFieldUpdateValue(field, body.value);
    validateScalarField(field, parsedValue, knownIds);
    setValue(targetFile.data, body.path, parsedValue);
    await Bun.write(
      row.enemyFile,
      `${JSON.stringify(targetFile.data, null, 2)}\n`,
    );

    return Response.json(await balancePayload());
  }

  if (source === "mag" && typeof body.magTypeId === "string") {
    const rows = await loadAmmoBalanceRows();
    const row = rows.find(
      (candidate) => candidate.magTypeId === body.magTypeId,
    );
    if (!row) {
      return Response.json({ error: "Unknown ammo." }, { status: 404 });
    }
    const field = knownFieldForUpdate(row, source, body.path);
    if (!field) {
      return Response.json(
        { error: "Unknown editable field." },
        { status: 400 },
      );
    }
    const targetFile = await readJsonFile(row.magFile);
    const parsedValue = parseFieldUpdateValue(field, body.value);
    validateScalarField(field, parsedValue, knownIds);
    if (field.key === "mag.hunkCost") {
      setHunkCost(targetFile.data, parsedValue as number | null);
    } else {
      setValue(targetFile.data, body.path, parsedValue);
    }
    await Bun.write(
      row.magFile,
      `${JSON.stringify(targetFile.data, null, 2)}\n`,
    );
    return Response.json(await balancePayload());
  }

  const rows = await loadBalanceRows();
  const row = rows.find(
    (candidate) => candidate.weaponTypeId === body.weaponTypeId,
  );
  if (!row) {
    return Response.json({ error: "Unknown weapon." }, { status: 404 });
  }

  const field = knownFieldForUpdate(row, source, body.path);
  if (!field) {
    return Response.json({ error: "Unknown editable field." }, { status: 400 });
  }

  const targetPath =
    source === "item"
      ? row.weaponFile
      : source === "weapon"
        ? row.weaponFile
        : source === "mag"
          ? row.magFile
          : row.projectileFile;
  if (!targetPath) {
    return Response.json(
      { error: "Weapon has no projectile file." },
      { status: 400 },
    );
  }

  const targetFile = await readJsonFile(targetPath);
  const parsedValue = parseFieldUpdateValue(field, body.value);
  validateScalarField(field, parsedValue, knownIds);
  if (field.key === "item.hunkCost") {
    setHunkCost(targetFile.data, parsedValue as number | null);
  } else if (field.key === "mag.hunkCost") {
    setHunkCost(targetFile.data, parsedValue as number | null);
  } else {
    setValue(targetFile.data, body.path, parsedValue);
  }
  await Bun.write(targetPath, `${JSON.stringify(targetFile.data, null, 2)}\n`);

  return Response.json(await balancePayload());
}

async function saveListUpdate(request: Request): Promise<Response> {
  const body = (await request.json()) as {
    listId?: unknown;
    action?: unknown;
    index?: unknown;
    value?: unknown;
  };
  if (
    typeof body.listId !== "string" ||
    !["add", "remove", "move"].includes(String(body.action))
  ) {
    return Response.json({ error: "Invalid list request." }, { status: 400 });
  }

  const listRow = (await loadBalanceListRows()).find(
    (row) => row.listId === body.listId,
  );
  if (!listRow) {
    return Response.json({ error: "Unknown list." }, { status: 404 });
  }

  const targetFile = await readJsonFile(listRow.file);
  const currentValue = getValue(targetFile.data, listRow.path);
  if (!Array.isArray(currentValue)) {
    return Response.json({ error: "Target list is missing." }, { status: 400 });
  }
  const entries = [...currentValue];
  const knownIds = await loadKnownTypeIds();

  if (body.action === "add") {
    entries.push(validateListEntry(listRow.itemKind, body.value, knownIds));
  } else {
    if (
      !Number.isInteger(body.index) ||
      Number(body.index) < 0 ||
      Number(body.index) >= entries.length
    ) {
      return Response.json({ error: "Invalid list index." }, { status: 400 });
    }
    const index = Number(body.index);
    if (body.action === "remove") {
      entries.splice(index, 1);
    } else {
      const direction =
        body.value === "up" ? -1 : body.value === "down" ? 1 : 0;
      if (direction === 0) {
        return Response.json(
          { error: "Invalid move direction." },
          { status: 400 },
        );
      }
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= entries.length) {
        return Response.json(await balancePayload());
      }
      const [entry] = entries.splice(index, 1);
      entries.splice(targetIndex, 0, entry);
    }
  }

  for (const entry of entries) {
    validateListEntry(listRow.itemKind, entry, knownIds);
  }
  replaceArrayEntry(targetFile.data, listRow.path, entries);
  await Bun.write(
    listRow.file,
    `${JSON.stringify(targetFile.data, null, 2)}\n`,
  );
  return Response.json(await balancePayload());
}

const balancePageHtml = await Bun.file("scripts/balance-page.html").text();

const publicAssetRoot = path.resolve("apps/client/public");
const pixiModulePath = path.resolve("node_modules/pixi.js/dist/pixi.mjs");
const balancePreviewEntryPath = path.resolve(
  "scripts/balance-item-rendering-preview.ts",
);

let balancePreviewBundlePromise: Promise<string> | null = null;

async function loadBalancePreviewBundle(): Promise<string> {
  const build = await Bun.build({
    entrypoints: [balancePreviewEntryPath],
    target: "browser",
    format: "esm",
    minify: false,
    sourcemap: "inline",
  });
  if (!build.success) {
    throw new AggregateError(
      build.logs,
      "Failed to build balance preview bundle",
    );
  }
  const output = build.outputs[0];
  if (!output) {
    throw new Error("Balance preview bundle produced no output.");
  }
  return output.text();
}

function getBalancePreviewBundle(): Promise<string> {
  balancePreviewBundlePromise ??= loadBalancePreviewBundle();
  return balancePreviewBundlePromise;
}

function contentTypeForPath(filePath: string): string {
  if (filePath.endsWith(".js") || filePath.endsWith(".mjs")) {
    return "text/javascript; charset=utf-8";
  }
  if (filePath.endsWith(".png")) {
    return "image/png";
  }
  if (filePath.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }
  return "application/octet-stream";
}

export async function balanceFetch(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/") {
    return new Response(balancePageHtml, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (request.method === "GET" && url.pathname === "/vendor/pixi.mjs") {
    return new Response(Bun.file(pixiModulePath), {
      headers: { "Content-Type": "text/javascript; charset=utf-8" },
    });
  }

  if (
    request.method === "GET" &&
    url.pathname === "/balance-item-rendering-preview.js"
  ) {
    const bundle = await getBalancePreviewBundle();
    return new Response(bundle, {
      headers: {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  if (request.method === "GET") {
    const assetPath = path.normalize(decodeURIComponent(url.pathname));
    const filePath = path.resolve(publicAssetRoot, `.${assetPath}`);
    if (filePath.startsWith(publicAssetRoot) && existsSync(filePath)) {
      return new Response(Bun.file(filePath), {
        headers: { "Content-Type": contentTypeForPath(filePath) },
      });
    }
  }

  if (request.method === "GET" && url.pathname === "/api/balance") {
    return Response.json(await balancePayload());
  }

  if (request.method === "POST" && url.pathname === "/api/balance") {
    try {
      return await saveUpdate(request);
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Save failed." },
        { status: 400 },
      );
    }
  }

  if (request.method === "POST" && url.pathname === "/api/balance/list") {
    try {
      return await saveListUpdate(request);
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Save failed." },
        { status: 400 },
      );
    }
  }

  return new Response("Not found", { status: 404 });
}

if (import.meta.main) {
  const port = parseIntegerEnv("BALANCE_PORT", 4179);
  const server = Bun.serve({
    port,
    fetch: balanceFetch,
  });

  const url = `http://127.0.0.1:${server.port}`;
  console.log(`[balance] serving ${url}`);
  console.log("[balance] set BALANCE_PORT to use a different port");

  if (process.platform === "darwin" && process.env.BALANCE_OPEN !== "0") {
    Bun.spawn(["open", url], {
      stdout: "ignore",
      stderr: "ignore",
    });
  }
}
