import { existsSync } from "node:fs";
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

type ContentKind =
  | "building"
  | "tower"
  | "structure"
  | "effect"
  | "enemy"
  | "item"
  | "mag"
  | "blueprint"
  | "pickup"
  | "player"
  | "projectile";

type RuntimeServerClassKind =
  | "material"
  | "magazine"
  | "rangedWeapon"
  | "projectile"
  | "effect"
  | "custom";

type RuntimeServerHint = {
  classKind?: RuntimeServerClassKind;
  symbol?: string;
  importPath?: string;
};

type RuntimeRendererHint = {
  symbol?: string;
  importPath?: string;
};

type RuntimeHint = {
  server?: RuntimeServerHint;
  renderer?: RuntimeRendererHint;
};

type RawContentJson = {
  label?: string;
  weapon?: {
    attackStyle?: string;
    magItemTypeId?: string;
    projectileTypeId?: string;
  };
  projectile?: unknown;
  recipe?: unknown;
  runtime?: RuntimeHint;
  rendering?: {
    assetPath: string;
    sprite: {
      x: number;
      y: number;
      rotationDeg: number;
      scale: number;
      handedness: "right" | "left";
      recoilDistance: number;
      swingAngleDeg: number;
      jabDistance: number;
    };
    icon: {
      x: number;
      y: number;
      rotationDeg: number;
      scale: number;
    };
  };
};

type ContentCategoryDefinition = {
  directory: ContentKind;
  exportName: string;
  parserExpression: (resourceName: string, importName: string) => string;
};

type ContentResource = {
  kind: ContentKind;
  resourceName: string;
  typeId: string;
  rawContent: RawContentJson;
};

type SourceClassEntry = {
  symbol: string;
  resourceName: string;
  importPath: string;
  filePath: string;
  kind: ContentKind;
};

type RendererClassEntry = {
  symbol: string;
  resourceName: string;
  importPath: string;
  filePath: string;
};

type RuntimeCoverageEntry = {
  kind: ContentKind;
  typeId: string;
  symbol: string;
  source: string;
};

type RendererCoverageEntry = {
  resourceName: string;
  renderer: string;
  importPath: string;
};

type CoverageGroup = {
  content: string[];
  mapped: string[];
  missing: string[];
  extra: string[];
};

type CoverageDiagnostics = {
  generatedBy: string;
  runtime: {
    entity: CoverageGroup;
    item: CoverageGroup;
    mag: CoverageGroup;
    blueprint: CoverageGroup;
    effect: CoverageGroup;
    entries: RuntimeCoverageEntry[];
  };
  renderer: CoverageGroup & {
    entries: RendererCoverageEntry[];
  };
  scaffolded: ScaffoldSummary;
  staleScaffoldCandidates: string[];
};

type ScaffoldSummary = {
  runtime: string[];
  renderer: string[];
};

type RuntimeRegistry = {
  entityRuntimeCtors: SourceClassEntry[];
  itemRuntimeCtors: SourceClassEntry[];
  magRuntimeCtors: SourceClassEntry[];
  blueprintRuntimeCtors: SourceClassEntry[];
  effectRuntimeCtors: SourceClassEntry[];
};

const CONTENT_CATEGORY_DEFINITIONS: readonly ContentCategoryDefinition[] = [
  {
    directory: "building",
    exportName: "buildingContentEntries",
    parserExpression: (resourceName, importName) =>
      `makeParsedEntityContentEntry("building", ${JSON.stringify(resourceName)}, ${importName})`,
  },
  {
    directory: "tower",
    exportName: "towerContentEntries",
    parserExpression: (resourceName, importName) =>
      `makeParsedEntityContentEntry("tower", ${JSON.stringify(resourceName)}, ${importName})`,
  },
  {
    directory: "structure",
    exportName: "structureContentEntries",
    parserExpression: (resourceName, importName) =>
      `makeParsedEntityContentEntry("structure", ${JSON.stringify(resourceName)}, ${importName})`,
  },
  {
    directory: "effect",
    exportName: "effectContentEntries",
    parserExpression: (resourceName, importName) =>
      `makeParsedEffectContentEntry(${JSON.stringify(resourceName)}, ${importName})`,
  },
  {
    directory: "enemy",
    exportName: "enemyContentEntries",
    parserExpression: (resourceName, importName) =>
      `makeParsedEntityContentEntry("enemy", ${JSON.stringify(resourceName)}, ${importName})`,
  },
  {
    directory: "item",
    exportName: "itemContentEntries",
    parserExpression: (resourceName, importName) =>
      `makeParsedItemContentEntry(${JSON.stringify(resourceName)}, ${importName})`,
  },
  {
    directory: "mag",
    exportName: "magContentEntries",
    parserExpression: (resourceName, importName) =>
      `makeParsedMagContentEntry(${JSON.stringify(resourceName)}, ${importName})`,
  },
  {
    directory: "blueprint",
    exportName: "blueprintContentEntries",
    parserExpression: (resourceName, importName) =>
      `makeParsedBlueprintContentEntry(${JSON.stringify(resourceName)}, ${importName})`,
  },
  {
    directory: "pickup",
    exportName: "pickupContentEntries",
    parserExpression: (resourceName, importName) =>
      `makeParsedEntityContentEntry("pickup", ${JSON.stringify(resourceName)}, ${importName})`,
  },
  {
    directory: "player",
    exportName: "playerContentEntries",
    parserExpression: (resourceName, importName) =>
      `makeParsedEntityContentEntry("player", ${JSON.stringify(resourceName)}, ${importName})`,
  },
  {
    directory: "projectile",
    exportName: "projectileContentEntries",
    parserExpression: (resourceName, importName) =>
      `makeParsedEntityContentEntry("projectile", ${JSON.stringify(resourceName)}, ${importName})`,
  },
] as const;

const ENTITY_CONTENT_KINDS = new Set<ContentKind>([
  "building",
  "tower",
  "structure",
  "enemy",
  "pickup",
  "player",
  "projectile",
]);

const GENERATED_HEADER =
  "// Generated by scripts/generate-content-manifest.ts. Do not edit by hand.";
const SCAFFOLD_HEADER =
  "// Scaffolded by scripts/generate-content-manifest.ts. Safe to edit; the generator will not overwrite this file.";
const GENERATED_DIAGNOSTICS_DIRECTORY = "scripts/generated";
const GENERATED_SERVER_REGISTRY_PATH =
  "apps/server/src/registry/generated/runtimeRegistry.ts";
const GENERATED_STRUCTURE_CTORS_PATH =
  "apps/server/src/registry/generated/structureCtors.ts";
const GENERATED_MAG_CTORS_PATH =
  "apps/server/src/registry/generated/magCtors.ts";
const GENERATED_BLUEPRINT_CTORS_PATH =
  "apps/server/src/registry/generated/blueprintCtors.ts";
const GENERATED_CONTENT_PROJECTILE_CTORS_PATH =
  "apps/server/src/registry/generated/contentProjectileCtors.ts";
const GENERATED_RENDERER_REGISTRY_PATH =
  "apps/client/src/render/entity/generated/rendererRegistry.ts";

const HANDWRITTEN_STRUCTURE_RESOURCE_NAMES = new Set([
  "crate",
  "dungeon",
  "dungeon_wall",
  "tripwire",
]);
const BESPOKE_PROJECTILE_RESOURCE_NAMES = new Set([
  "firecracker_bullet",
  "homing_drone",
]);

const SERVER_SCAN_ROOTS = [
  "apps/server/src/entities",
  "apps/server/src/items",
  "apps/server/src/effects",
] as const;
const RENDERER_SCAN_ROOTS = ["apps/client/src/render/entity"] as const;

function toPascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/g)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

function toContentImportName(
  categoryDirectory: string,
  resourceName: string,
): string {
  return `${categoryDirectory}${toPascalCase(resourceName)}Json`;
}

function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}

function toTitleCase(resourceName: string): string {
  return resourceName
    .split("_")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function toTypeId(kind: ContentKind, resourceName: string): string {
  return `${kind}:${resourceName}`;
}

function getResourceName(typeId: string): string {
  const [, resourceName] = typeId.split(":");
  if (!resourceName) {
    throw new Error(`Invalid type id: ${typeId}`);
  }
  return resourceName;
}

function inferMagTypeId(weaponTypeId: string): string {
  return `mag:${getResourceName(weaponTypeId)}`;
}

function buildMagContent(
  typeId: string,
  weaponLabels: readonly string[],
): RawContentJson {
  const resourceName = getResourceName(typeId);
  const targetLabel =
    weaponLabels.length === 1 ? weaponLabels[0] : toTitleCase(resourceName);
  return {
    label: `${targetLabel} Magazine`,
    recipe: {
      hint: `Fresh magazine for ${targetLabel}.`,
      outputAmount: 1,
      costs: [
        {
          typeId: "item:hunk",
          amount: 20,
        },
      ],
    },
    runtime: {
      server: {
        classKind: "magazine",
      },
    },
    rendering: defaultItemRendering(`/mag/generated/${resourceName}.png`),
  };
}

function defaultItemRendering(
  assetPath: string,
): NonNullable<RawContentJson["rendering"]> {
  return {
    assetPath,
    sprite: {
      x: 0,
      y: 0,
      rotationDeg: 0,
      scale: 1,
      handedness: "right",
      recoilDistance: 0,
      swingAngleDeg: 0,
      jabDistance: 0,
    },
    icon: {
      x: 0,
      y: 0,
      rotationDeg: 0,
      scale: 1,
    },
  };
}

function formatJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function toImportPath(repoRoot: string, filePath: string): string {
  const relativePath = path
    .relative(repoRoot, filePath)
    .split(path.sep)
    .join("/");
  if (relativePath.startsWith("apps/server/src/")) {
    return `@server/${relativePath.slice("apps/server/src/".length)}`;
  }
  if (relativePath.startsWith("apps/client/src/")) {
    return `@client/${relativePath.slice("apps/client/src/".length)}`;
  }
  throw new Error(`Cannot build aliased import path for ${relativePath}.`);
}

function resolveSourcePath(repoRoot: string, importPath: string): string {
  if (importPath.startsWith("@server/")) {
    return path.join(
      repoRoot,
      "apps/server/src",
      importPath.slice("@server/".length),
    );
  }
  if (importPath.startsWith("@client/")) {
    return path.join(
      repoRoot,
      "apps/client/src",
      importPath.slice("@client/".length),
    );
  }
  throw new Error(`Unsupported import path: ${importPath}`);
}

async function readTextFile(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readTextFile(filePath)) as T;
}

let crc32Table: Uint32Array | undefined;

function crc32(bytes: Buffer): number {
  const table = getCrc32Table();
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = table[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getCrc32Table(): Uint32Array {
  if (crc32Table) {
    return crc32Table;
  }
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  crc32Table = table;
  return table;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function encodePng(
  width: number,
  height: number,
  pixelAt: (x: number, y: number) => readonly [number, number, number, number],
): Buffer {
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 4);
    row[0] = 0;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixelAt(x, y);
      const offset = 1 + x * 4;
      row[offset] = r;
      row[offset + 1] = g;
      row[offset + 2] = b;
      row[offset + 3] = a;
    }
    rows.push(row);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(Buffer.concat(rows))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

async function writeBlueprintAsset(
  filePath: string,
  resourceName: string,
): Promise<void> {
  const hash = hashString(resourceName);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    encodePng(96, 96, (x, y) => {
      const border = x < 5 || y < 5 || x >= 91 || y >= 91;
      const guideLine =
        (x + y) % 17 === 0 || (x * 3 + y + (hash & 15)) % 23 === 0;
      const dx = x - 48;
      const dy = y - 48;
      const emblem = dx * dx + dy * dy < 520 && ((x + y + hash) & 7) < 4;
      if (border) return [22, 73, 112, 255];
      if (emblem) return [162, 221, 255, 235];
      if (guideLine) return [47, 129, 184, 180];
      return [35, 101, 151, 255];
    }),
  );
}

async function getSortedResourceNames(
  directoryPath: string,
): Promise<string[]> {
  const directoryEntries = await readdir(directoryPath, {
    withFileTypes: true,
  });
  return directoryEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name.replace(/\.json$/i, ""))
    .sort((left, right) => left.localeCompare(right));
}

async function collectContentResources(
  sharedContentRoot: string,
): Promise<ContentResource[]> {
  const resources: ContentResource[] = [];
  for (const category of CONTENT_CATEGORY_DEFINITIONS) {
    const directoryPath = path.join(sharedContentRoot, category.directory);
    const resourceNames = await getSortedResourceNames(directoryPath);
    for (const resourceName of resourceNames) {
      resources.push({
        kind: category.directory,
        resourceName,
        typeId: toTypeId(category.directory, resourceName),
        rawContent: await readJsonFile<RawContentJson>(
          path.join(directoryPath, `${resourceName}.json`),
        ),
      });
    }
  }
  return resources.sort((left, right) =>
    left.typeId.localeCompare(right.typeId),
  );
}

async function refreshGeneratedMagItems(
  repoRoot: string,
  sharedContentRoot: string,
): Promise<void> {
  const itemContentDir = path.join(sharedContentRoot, "item");
  const magContentDir = path.join(sharedContentRoot, "mag");
  const generatedMagDir = path.join(
    repoRoot,
    "apps/client/public/mag/generated",
  );

  const itemFileNames = (await readdir(itemContentDir))
    .filter((fileName) => fileName.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right));
  const items = new Map<
    string,
    { filePath: string; content: RawContentJson }
  >();

  for (const fileName of itemFileNames) {
    const filePath = path.join(itemContentDir, fileName);
    const typeId = `item:${fileName.slice(0, -".json".length)}`;
    items.set(typeId, {
      filePath,
      content: await readJsonFile<RawContentJson>(filePath),
    });
  }

  const magFileNames = (await readdir(magContentDir))
    .filter((fileName) => fileName.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right));
  for (const fileName of magFileNames) {
    const filePath = path.join(magContentDir, fileName);
    const typeId = `mag:${fileName.slice(0, -".json".length)}`;
    items.set(typeId, {
      filePath,
      content: await readJsonFile<RawContentJson>(filePath),
    });
  }

  const magWeaponTypeIds = new Map<string, string[]>();
  const magWeaponLabels = new Map<string, string[]>();

  for (const [typeId, entry] of items) {
    const weapon = entry.content.weapon;
    if (weapon?.attackStyle !== "shoot") {
      continue;
    }

    if (!weapon.magItemTypeId) {
      weapon.magItemTypeId = inferMagTypeId(typeId);
      await writeFile(entry.filePath, formatJson(entry.content));
    }

    const weaponTypeIds = magWeaponTypeIds.get(weapon.magItemTypeId) ?? [];
    weaponTypeIds.push(typeId);
    magWeaponTypeIds.set(weapon.magItemTypeId, weaponTypeIds);

    const weaponLabels = magWeaponLabels.get(weapon.magItemTypeId) ?? [];
    weaponLabels.push(
      entry.content.label ?? toTitleCase(getResourceName(typeId)),
    );
    magWeaponLabels.set(weapon.magItemTypeId, weaponLabels);
  }

  for (const [magTypeId, weaponTypeIds] of magWeaponTypeIds) {
    if (items.has(magTypeId)) {
      continue;
    }

    const resourceName = getResourceName(magTypeId);
    const filePath = path.join(magContentDir, `${resourceName}.json`);
    const content = buildMagContent(
      magTypeId,
      magWeaponLabels.get(magTypeId) ?? weaponTypeIds,
    );
    await mkdir(magContentDir, { recursive: true });
    await writeFile(filePath, formatJson(content));
    items.set(magTypeId, { filePath, content });
  }

  await mkdir(generatedMagDir, { recursive: true });
  for (const [magTypeId, weaponTypeIds] of magWeaponTypeIds) {
    const resourceName = getResourceName(magTypeId);
    const entry = items.get(magTypeId);
    if (!entry) {
      continue;
    }
    const expectedAssetPath = `/mag/generated/${resourceName}.png`;
    const expectedAssetFile = path.join(
      repoRoot,
      "apps/client/public",
      expectedAssetPath,
    );
    if (!entry.content.rendering) {
      entry.content.rendering = defaultItemRendering(expectedAssetPath);
      await writeFile(entry.filePath, formatJson(entry.content));
    }
    const firstWeapon = weaponTypeIds
      .map((weaponTypeId) => items.get(weaponTypeId)?.content.rendering)
      .find((rendering) => rendering?.assetPath);
    const sourceAssetPath = firstWeapon?.assetPath;
    const sourceAssetFile = sourceAssetPath
      ? path.join(repoRoot, "apps/client/public", sourceAssetPath)
      : null;
    if (sourceAssetFile && existsSync(sourceAssetFile)) {
      await copyFile(sourceAssetFile, expectedAssetFile);
    } else if (!existsSync(expectedAssetFile)) {
      await writeBlueprintAsset(expectedAssetFile, resourceName);
    }
  }
}

async function refreshGeneratedBlueprintAssets(
  repoRoot: string,
  sharedContentRoot: string,
): Promise<void> {
  const blueprintContentDir = path.join(sharedContentRoot, "blueprint");
  const blueprintFileNames = (await readdir(blueprintContentDir))
    .filter((fileName) => fileName.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right));

  for (const fileName of blueprintFileNames) {
    const resourceName = fileName.slice(0, -".json".length);
    const filePath = path.join(blueprintContentDir, fileName);
    const content = await readJsonFile<RawContentJson>(filePath);
    const assetPath = `/blueprint/generated/${resourceName}.png`;
    if (!content.rendering) {
      content.rendering = defaultItemRendering(assetPath);
      await writeFile(filePath, formatJson(content));
    }
    await writeBlueprintAsset(
      path.join(repoRoot, "apps/client/public", assetPath),
      resourceName,
    );
  }
}

async function collectTsFiles(directoryPath: string): Promise<string[]> {
  if (!existsSync(directoryPath)) {
    return [];
  }
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        return collectTsFiles(entryPath);
      }
      if (entry.isFile() && entry.name.endsWith(".ts")) {
        return [entryPath];
      }
      return [];
    }),
  );
  return files.flat().sort((left, right) => left.localeCompare(right));
}

function inferServerKindFromPath(filePath: string): ContentKind | null {
  const normalized = filePath.split(path.sep).join("/");
  if (normalized.endsWith("/Player.ts")) return "player";
  if (normalized.endsWith("/ItemEntity.ts")) return "pickup";
  if (normalized.includes("/entities/tower/")) return "tower";
  if (normalized.includes("/entities/buildings/")) return "building";
  if (normalized.includes("/entities/structures/")) return "structure";
  if (normalized.includes("/entities/enemies/")) return "enemy";
  if (normalized.includes("/entities/projectiles/")) return "projectile";
  if (normalized.includes("/items/magazines/")) return "mag";
  if (normalized.includes("/items/blueprints/")) return "blueprint";
  if (normalized.includes("/items/")) return "item";
  if (normalized.includes("/effects/builtin/")) return "effect";
  return null;
}

async function scanServerClasses(
  repoRoot: string,
): Promise<SourceClassEntry[]> {
  const files = (
    await Promise.all(
      SERVER_SCAN_ROOTS.map((root) =>
        collectTsFiles(path.join(repoRoot, root)),
      ),
    )
  ).flat();
  const entries: SourceClassEntry[] = [];
  const classPattern =
    /export\s+(?:abstract\s+)?class\s+([A-Za-z0-9_]+)\b[\s\S]*?public\s+static\s+(?:override\s+)?readonly\s+resourceName\s*=\s*"([^"]+)"/gu;

  for (const filePath of files) {
    const kind = inferServerKindFromPath(filePath);
    if (!kind) {
      continue;
    }
    const source = await readTextFile(filePath);
    for (const match of source.matchAll(classPattern)) {
      const symbol = match[1];
      const resourceName = match[2];
      if (
        !symbol ||
        !resourceName ||
        symbol === "Item" ||
        symbol === "Entity"
      ) {
        continue;
      }
      entries.push({
        symbol,
        resourceName,
        importPath: toImportPath(repoRoot, filePath),
        filePath,
        kind,
      });
    }
  }
  return entries.sort((left, right) =>
    left.importPath.localeCompare(right.importPath),
  );
}

async function scanRendererClasses(
  repoRoot: string,
): Promise<RendererClassEntry[]> {
  const files = (
    await Promise.all(
      RENDERER_SCAN_ROOTS.map((root) =>
        collectTsFiles(path.join(repoRoot, root)),
      ),
    )
  ).flat();
  const entries: RendererClassEntry[] = [];
  const classPattern = /export\s+class\s+([A-Za-z0-9_]+Renderer)\b/gu;
  for (const filePath of files) {
    if (filePath.includes(`${path.sep}generated${path.sep}`)) {
      continue;
    }
    const source = await readTextFile(filePath);
    for (const match of source.matchAll(classPattern)) {
      const symbol = match[1];
      if (!symbol) {
        continue;
      }
      entries.push({
        symbol,
        resourceName: inferRendererResourceName(symbol),
        importPath: toImportPath(repoRoot, filePath),
        filePath,
      });
    }
  }
  return entries.sort((left, right) =>
    left.importPath.localeCompare(right.importPath),
  );
}

function inferRendererResourceName(symbol: string): string {
  if (symbol === "PlayerRenderer") return "base";
  if (symbol === "PickupRenderer") return "item_entity";
  return toSnakeCase(symbol.replace(/Renderer$/u, "").replace(/Enemy$/u, ""));
}

function buildClassIndex(
  entries: readonly SourceClassEntry[],
): Map<string, SourceClassEntry> {
  const index = new Map<string, SourceClassEntry>();
  for (const entry of entries) {
    index.set(`${entry.kind}:${entry.resourceName}`, entry);
  }
  return index;
}

function buildRendererIndex(
  entries: readonly RendererClassEntry[],
): Map<string, RendererClassEntry> {
  const index = new Map<string, RendererClassEntry>();
  for (const entry of entries) {
    index.set(entry.symbol, entry);
    index.set(entry.resourceName, entry);
  }
  return index;
}

function resolveRuntimeSymbol(resource: ContentResource): string {
  const hinted = resource.rawContent.runtime?.server?.symbol;
  if (hinted) return hinted;
  const base = toPascalCase(resource.resourceName);
  if (resource.kind === "effect") return `${base}Effect`;
  if (resource.kind === "mag") return `${base}MagazineItem`;
  if (resource.kind === "blueprint") return `Blueprint${base}Item`;
  if (resource.kind === "item") {
    const classKind = resource.rawContent.runtime?.server?.classKind;
    if (classKind === "material") return `${base}Item`;
    return base;
  }
  if (resource.kind === "enemy" && base === "Sniper") return "SniperEnemy";
  return base;
}

function resolveRuntimePath(
  repoRoot: string,
  resource: ContentResource,
  symbol: string,
): string {
  const hinted = resource.rawContent.runtime?.server?.importPath;
  if (hinted) return resolveSourcePath(repoRoot, hinted);
  if (resource.kind === "effect") {
    return path.join(
      repoRoot,
      "apps/server/src/effects/builtin",
      `${symbol}.ts`,
    );
  }
  if (resource.kind === "item") {
    const classKind = resource.rawContent.runtime?.server?.classKind;
    if (classKind === "material") {
      return path.join(
        repoRoot,
        "apps/server/src/items/materials",
        `${symbol}.ts`,
      );
    }
    if (classKind === "rangedWeapon") {
      return path.join(
        repoRoot,
        "apps/server/src/items/weapons",
        `${symbol}.ts`,
      );
    }
  }
  throw new Error(
    `Missing runtime class for ${resource.typeId}. Add a handwritten class or runtime.server import metadata.`,
  );
}

function getRequiredItemClassKind(
  resource: ContentResource,
): RuntimeServerClassKind {
  const classKind = resource.rawContent.runtime?.server?.classKind;
  if (!classKind) {
    throw new Error(
      `Item ${resource.typeId} needs runtime.server.classKind before the generator can scaffold it.`,
    );
  }
  return classKind;
}

function usesGeneratedRuntimeCtor(resource: ContentResource): boolean {
  if (
    resource.kind === "structure" &&
    !HANDWRITTEN_STRUCTURE_RESOURCE_NAMES.has(resource.resourceName)
  ) {
    return true;
  }
  if (resource.kind === "mag" || resource.kind === "blueprint") {
    return true;
  }
  if (
    resource.kind === "projectile" &&
    !BESPOKE_PROJECTILE_RESOURCE_NAMES.has(resource.resourceName)
  ) {
    return true;
  }
  return false;
}

function resolveGeneratedRuntimeImportPath(resource: ContentResource): string {
  if (resource.kind === "structure") {
    return "@server/registry/generated/structureCtors.ts";
  }
  if (resource.kind === "mag") {
    return "@server/registry/generated/magCtors.ts";
  }
  if (resource.kind === "blueprint") {
    return "@server/registry/generated/blueprintCtors.ts";
  }
  if (resource.kind === "projectile") {
    return "@server/registry/generated/contentProjectileCtors.ts";
  }
  throw new Error(
    `No generated runtime import path for ${resource.typeId}.`,
  );
}

function buildGeneratedCtorEntry(
  repoRoot: string,
  resource: ContentResource,
): SourceClassEntry {
  return {
    symbol: resolveRuntimeSymbol(resource),
    resourceName: resource.resourceName,
    importPath: resolveGeneratedRuntimeImportPath(resource),
    filePath: path.join(
      repoRoot,
      resolveGeneratedRuntimeImportPath(resource).replace(
        "@server/",
        "apps/server/src/",
      ),
    ),
    kind: resource.kind,
  };
}

function buildGeneratedCtorExportLine(resource: ContentResource): string {
  const symbol = resolveRuntimeSymbol(resource);
  if (resource.kind === "structure") {
    return `export const ${symbol} = createStructureCtor(${JSON.stringify(resource.resourceName)});`;
  }
  if (resource.kind === "mag") {
    return `export const ${symbol} = createItemLikeCtor("mag", ${JSON.stringify(resource.resourceName)});`;
  }
  if (resource.kind === "blueprint") {
    return `export const ${symbol} = createItemLikeCtor("blueprint", ${JSON.stringify(resource.resourceName)});`;
  }
  if (resource.kind === "projectile") {
    return `export const ${symbol} = createContentProjectileCtor(${JSON.stringify(resource.resourceName)}, ${JSON.stringify(resource.typeId)});`;
  }
  throw new Error(`Cannot emit generated ctor for ${resource.typeId}.`);
}

type GeneratedCtorFileSpec = {
  outputPath: string;
  importLine: string;
  resources: readonly ContentResource[];
};

async function writeGeneratedCtorFile(
  repoRoot: string,
  spec: GeneratedCtorFileSpec,
): Promise<void> {
  const outputPath = path.join(repoRoot, spec.outputPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    [
      GENERATED_HEADER,
      spec.importLine,
      "",
      ...spec.resources.map(buildGeneratedCtorExportLine),
      "",
    ].join("\n"),
  );
  process.stdout.write(`Updated ${path.relative(repoRoot, outputPath)}\n`);
}

async function writeGeneratedFactoryCtorFiles(
  repoRoot: string,
  contentResources: readonly ContentResource[],
): Promise<void> {
  const specs: GeneratedCtorFileSpec[] = [
    {
      outputPath: GENERATED_STRUCTURE_CTORS_PATH,
      importLine:
        'import { createStructureCtor } from "@server/entities/structures/ContentStructure.ts";',
      resources: contentResources.filter(
        (resource) =>
          resource.kind === "structure" &&
          !HANDWRITTEN_STRUCTURE_RESOURCE_NAMES.has(resource.resourceName),
      ),
    },
    {
      outputPath: GENERATED_MAG_CTORS_PATH,
      importLine:
        'import { createItemLikeCtor } from "@server/items/createItemLikeCtor.ts";',
      resources: contentResources.filter((resource) => resource.kind === "mag"),
    },
    {
      outputPath: GENERATED_BLUEPRINT_CTORS_PATH,
      importLine:
        'import { createItemLikeCtor } from "@server/items/createItemLikeCtor.ts";',
      resources: contentResources.filter(
        (resource) => resource.kind === "blueprint",
      ),
    },
    {
      outputPath: GENERATED_CONTENT_PROJECTILE_CTORS_PATH,
      importLine:
        'import { createContentProjectileCtor } from "@server/entities/projectiles/ContentProjectile.ts";',
      resources: contentResources.filter(
        (resource) =>
          resource.kind === "projectile" &&
          !BESPOKE_PROJECTILE_RESOURCE_NAMES.has(resource.resourceName),
      ),
    },
  ];
  for (const spec of specs) {
    await writeGeneratedCtorFile(repoRoot, spec);
  }
}

function buildRuntimeScaffold(
  resource: ContentResource,
  symbol: string,
): string {
  if (resource.kind === "effect") {
    const classKind = resource.rawContent.runtime?.server?.classKind;
    if (classKind !== "effect") {
      throw new Error(
        `Effect ${resource.typeId} needs runtime.server.classKind = "effect" before the generator can scaffold it.`,
      );
    }
    return [
      SCAFFOLD_HEADER,
      'import type { Entity } from "@server/entities/Entity.ts";',
      'import { Effect } from "@server/effects/Effect.ts";',
      'import type { World } from "@server/world/World.ts";',
      "",
      `export class ${symbol} extends Effect {`,
      `  public static override readonly resourceName = ${JSON.stringify(resource.resourceName)};`,
      "",
      "  public override apply(_world: World, _source: Entity, _target: Entity): void {",
      "    // No-op scaffold; edit this class to add effect behavior.",
      "  }",
      "}",
      "",
    ].join("\n");
  }

  if (resource.kind === "item") {
    const classKind = getRequiredItemClassKind(resource);
    if (classKind === "material") {
      return [
        SCAFFOLD_HEADER,
        'import { MaterialItem } from "@server/items/MaterialItem.ts";',
        "",
        `export class ${symbol} extends MaterialItem {`,
        `  public static override readonly resourceName = ${JSON.stringify(resource.resourceName)};`,
        "}",
        "",
      ].join("\n");
    }
    if (classKind === "rangedWeapon") {
      return [
        SCAFFOLD_HEADER,
        'import { requireShootWeaponRuntime } from "@server/combat/contentAdapters.ts";',
        'import { RangedWeapon } from "@server/items/RangedWeapon.ts";',
        "",
        `export class ${symbol} extends RangedWeapon {`,
        `  public static override readonly resourceName = ${JSON.stringify(resource.resourceName)};`,
        "",
        "  constructor() {",
        `    const weaponContent = requireShootWeaponRuntime(${symbol}.typeId);`,
        "    super(",
        "      weaponContent.cooldownTicks,",
        "      weaponContent.projectileTypeId,",
        "      weaponContent.magSize,",
        "      weaponContent.reloadTicks,",
        "      weaponContent.spreadDeg,",
        "      weaponContent.magItemTypeId,",
        "    );",
        "  }",
        "}",
        "",
      ].join("\n");
    }
  }

  throw new Error(
    `Cannot scaffold ${resource.typeId}; add a handwritten class.`,
  );
}

async function ensureRuntimeClass(
  repoRoot: string,
  resource: ContentResource,
  classIndex: Map<string, SourceClassEntry>,
  scaffolded: ScaffoldSummary,
): Promise<SourceClassEntry> {
  const existing = classIndex.get(resource.typeId);
  if (existing) return existing;
  if (resource.kind !== "item" && resource.kind !== "effect") {
    throw new Error(
      `Missing runtime class for ${resource.typeId}. Add runtime.server import metadata or a handwritten class.`,
    );
  }

  const symbol = resolveRuntimeSymbol(resource);
  const filePath = resolveRuntimePath(repoRoot, resource, symbol);
  if (!existsSync(filePath)) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, buildRuntimeScaffold(resource, symbol));
    scaffolded.runtime.push(path.relative(repoRoot, filePath));
  }
  const entry: SourceClassEntry = {
    symbol,
    resourceName: resource.resourceName,
    importPath: toImportPath(repoRoot, filePath),
    filePath,
    kind: resource.kind,
  };
  classIndex.set(resource.typeId, entry);
  return entry;
}

function buildImportLines(
  entries: readonly { symbol: string; importPath: string }[],
): string[] {
  const importsByPath = new Map<string, string[]>();
  for (const entry of entries) {
    const symbols = importsByPath.get(entry.importPath) ?? [];
    symbols.push(entry.symbol);
    importsByPath.set(entry.importPath, symbols);
  }
  return [...importsByPath.entries()]
    .sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath))
    .map(([importPath, symbols]) => {
      const sortedSymbols = [...new Set(symbols)].sort((left, right) =>
        left.localeCompare(right),
      );
      return `import { ${sortedSymbols.join(", ")} } from "${importPath}";`;
    });
}

function buildRuntimeCtorArray(
  exportName: keyof RuntimeRegistry,
  entries: readonly SourceClassEntry[],
): string {
  return `export const ${exportName} = [\n${entries.map((entry) => `  ${entry.symbol},`).join("\n")}\n] as const;`;
}

async function writeGeneratedRuntimeRegistry(
  repoRoot: string,
  registry: RuntimeRegistry,
): Promise<void> {
  const allEntries = [
    ...registry.entityRuntimeCtors,
    ...registry.itemRuntimeCtors,
    ...registry.magRuntimeCtors,
    ...registry.blueprintRuntimeCtors,
    ...registry.effectRuntimeCtors,
  ];
  const outputPath = path.join(repoRoot, GENERATED_SERVER_REGISTRY_PATH);
  const fileContents = [
    GENERATED_HEADER,
    ...buildImportLines(allEntries),
    "",
    buildRuntimeCtorArray("entityRuntimeCtors", registry.entityRuntimeCtors),
    "",
    buildRuntimeCtorArray("itemRuntimeCtors", registry.itemRuntimeCtors),
    "",
    buildRuntimeCtorArray("magRuntimeCtors", registry.magRuntimeCtors),
    "",
    buildRuntimeCtorArray(
      "blueprintRuntimeCtors",
      registry.blueprintRuntimeCtors,
    ),
    "",
    buildRuntimeCtorArray("effectRuntimeCtors", registry.effectRuntimeCtors),
    "",
  ].join("\n");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, fileContents);
  process.stdout.write(`Updated ${path.relative(repoRoot, outputPath)}\n`);
}

function resolveRendererSymbol(resource: ContentResource): string {
  const hinted = resource.rawContent.runtime?.renderer?.symbol;
  if (hinted) return hinted;
  const base = toPascalCase(resource.resourceName);
  return `${base}Renderer`;
}

const RENDERER_DIRECTORY_BY_KIND: Partial<
  Record<ContentKind, "building" | "tower" | "structure" | "enemy" | "pickup" | "player" | "projectile">
> = {
  building: "building",
  tower: "tower",
  structure: "structure",
  enemy: "enemy",
  pickup: "pickup",
  player: "player",
  projectile: "projectile",
};

function resolveRendererPath(
  repoRoot: string,
  resource: ContentResource,
  symbol: string,
): string {
  const hinted = resource.rawContent.runtime?.renderer?.importPath;
  if (hinted) return resolveSourcePath(repoRoot, hinted);
  const directory = RENDERER_DIRECTORY_BY_KIND[resource.kind];
  if (!directory) {
    throw new Error(`No renderer directory mapping for ${resource.typeId}.`);
  }
  return path.join(
    repoRoot,
    "apps/client/src/render/entity",
    directory,
    `${symbol}.ts`,
  );
}

function colorFromResourceName(resourceName: string): number {
  let hash = 2166136261;
  for (const char of resourceName) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return 0x404040 | (hash & 0xbfbfbf);
}

function buildRendererScaffold(
  resource: ContentResource,
  symbol: string,
): string {
  return [
    SCAFFOLD_HEADER,
    'import { CircleEntityRenderer } from "@client/render/entity/CircleEntityRenderer.ts";',
    'import type { EntityRendererOptions } from "@client/render/entity/EntityRenderer.ts";',
    'import type { PixiRenderer } from "@client/render/PixiRenderer.ts";',
    "",
    `export class ${symbol} extends CircleEntityRenderer {`,
    "  constructor(pixiRenderer: PixiRenderer, options: EntityRendererOptions = {}) {",
    `    super(pixiRenderer, 0x${colorFromResourceName(resource.resourceName).toString(16).padStart(6, "0")}, options);`,
    "  }",
    "}",
    "",
  ].join("\n");
}

async function ensureRendererClass(
  repoRoot: string,
  resource: ContentResource,
  rendererIndex: Map<string, RendererClassEntry>,
  scaffolded: ScaffoldSummary,
): Promise<RendererCoverageEntry & { symbol: string; importPath: string }> {
  const symbol = resolveRendererSymbol(resource);
  const existing =
    rendererIndex.get(symbol) ?? rendererIndex.get(resource.resourceName);
  if (existing) {
    return {
      resourceName: resource.resourceName,
      renderer: existing.symbol,
      symbol: existing.symbol,
      importPath: existing.importPath,
    };
  }

  const filePath = resolveRendererPath(repoRoot, resource, symbol);
  if (!existsSync(filePath)) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, buildRendererScaffold(resource, symbol));
    scaffolded.renderer.push(path.relative(repoRoot, filePath));
  }
  const entry: RendererClassEntry = {
    symbol,
    resourceName: resource.resourceName,
    importPath: toImportPath(repoRoot, filePath),
    filePath,
  };
  rendererIndex.set(symbol, entry);
  return {
    resourceName: resource.resourceName,
    renderer: symbol,
    symbol,
    importPath: entry.importPath,
  };
}

async function writeGeneratedRendererRegistry(
  repoRoot: string,
  rendererEntries: readonly (RendererCoverageEntry & {
    symbol: string;
    importPath: string;
  })[],
): Promise<void> {
  const outputPath = path.join(repoRoot, GENERATED_RENDERER_REGISTRY_PATH);
  const fileContents = [
    GENERATED_HEADER,
    'import type { EntityRendererCtor } from "@client/render/entity/rendererRegistry.ts";',
    ...buildImportLines(rendererEntries),
    "",
    "export const rendererManifests = [",
    ...rendererEntries.map(
      (entry) => `  [${JSON.stringify(entry.resourceName)}, ${entry.symbol}],`,
    ),
    "] as const satisfies ReadonlyArray<readonly [string, EntityRendererCtor]>;",
    "",
  ].join("\n");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, fileContents);
  process.stdout.write(`Updated ${path.relative(repoRoot, outputPath)}\n`);
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function buildCoverageGroup(
  content: Iterable<string>,
  mapped: Iterable<string>,
): CoverageGroup {
  const contentIds = sortedUnique(content);
  const mappedIds = sortedUnique(mapped);
  const contentSet = new Set(contentIds);
  const mappedSet = new Set(mappedIds);
  return {
    content: contentIds,
    mapped: mappedIds,
    missing: contentIds.filter((typeId) => !mappedSet.has(typeId)),
    extra: mappedIds.filter((typeId) => !contentSet.has(typeId)),
  };
}

function assertCoverageGroupPasses(label: string, group: CoverageGroup): void {
  if (group.missing.length === 0 && group.extra.length === 0) return;
  const details = [
    group.missing.length > 0
      ? `missing ${label}: ${group.missing.join(", ")}`
      : undefined,
    group.extra.length > 0
      ? `extra ${label}: ${group.extra.join(", ")}`
      : undefined,
  ].filter(Boolean);
  throw new Error(`Content coverage check failed: ${details.join("; ")}.`);
}

async function writeCoverageDiagnostics(
  repoRoot: string,
  diagnostics: CoverageDiagnostics,
): Promise<void> {
  const outputPath = path.join(
    repoRoot,
    GENERATED_DIAGNOSTICS_DIRECTORY,
    "content-coverage.json",
  );
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(diagnostics, null, 2)}\n`);
  process.stdout.write(`Updated ${path.relative(repoRoot, outputPath)}\n`);
}

async function isScaffoldedFile(filePath: string): Promise<boolean> {
  if (!existsSync(filePath)) return false;
  return (await readTextFile(filePath)).startsWith(SCAFFOLD_HEADER);
}

async function collectStaleScaffoldCandidates(
  resources: readonly ContentResource[],
  classEntries: readonly SourceClassEntry[],
  rendererEntries: readonly RendererClassEntry[],
): Promise<string[]> {
  const resourceTypeIds = new Set(resources.map((resource) => resource.typeId));
  const resourceNames = new Set(
    resources.map((resource) => resource.resourceName),
  );
  const staleRuntime: string[] = [];
  for (const entry of classEntries) {
    if (
      !resourceTypeIds.has(toTypeId(entry.kind, entry.resourceName)) &&
      (await isScaffoldedFile(entry.filePath))
    ) {
      staleRuntime.push(entry.importPath);
    }
  }
  const staleRenderers: string[] = [];
  for (const entry of rendererEntries) {
    if (
      !resourceNames.has(entry.resourceName) &&
      (await isScaffoldedFile(entry.filePath))
    ) {
      staleRenderers.push(entry.importPath);
    }
  }
  return [...new Set([...staleRuntime, ...staleRenderers])].sort(
    (left, right) => left.localeCompare(right),
  );
}

async function buildRegistries(
  repoRoot: string,
  contentResources: readonly ContentResource[],
): Promise<{
  runtimeRegistry: RuntimeRegistry;
  rendererEntries: (RendererCoverageEntry & {
    symbol: string;
    importPath: string;
  })[];
  runtimeEntries: RuntimeCoverageEntry[];
  scaffolded: ScaffoldSummary;
  staleScaffoldCandidates: string[];
}> {
  const scaffolded: ScaffoldSummary = { runtime: [], renderer: [] };
  const classEntries = await scanServerClasses(repoRoot);
  const rendererClassEntries = await scanRendererClasses(repoRoot);
  const classIndex = buildClassIndex(classEntries);
  const rendererIndex = buildRendererIndex(rendererClassEntries);

  const runtimeRegistry: RuntimeRegistry = {
    entityRuntimeCtors: [],
    itemRuntimeCtors: [],
    magRuntimeCtors: [],
    blueprintRuntimeCtors: [],
    effectRuntimeCtors: [],
  };

  for (const resource of contentResources) {
    if (ENTITY_CONTENT_KINDS.has(resource.kind)) {
      const entry = usesGeneratedRuntimeCtor(resource)
        ? buildGeneratedCtorEntry(repoRoot, resource)
        : await ensureRuntimeClass(
            repoRoot,
            resource,
            classIndex,
            scaffolded,
          );
      runtimeRegistry.entityRuntimeCtors.push(entry);
    } else if (resource.kind === "item") {
      const entry = await ensureRuntimeClass(
        repoRoot,
        resource,
        classIndex,
        scaffolded,
      );
      runtimeRegistry.itemRuntimeCtors.push(entry);
    } else if (resource.kind === "mag") {
      runtimeRegistry.magRuntimeCtors.push(
        buildGeneratedCtorEntry(repoRoot, resource),
      );
    } else if (resource.kind === "blueprint") {
      runtimeRegistry.blueprintRuntimeCtors.push(
        buildGeneratedCtorEntry(repoRoot, resource),
      );
    } else if (resource.kind === "effect") {
      const entry = await ensureRuntimeClass(
        repoRoot,
        resource,
        classIndex,
        scaffolded,
      );
      runtimeRegistry.effectRuntimeCtors.push(entry);
    }
  }

  const rendererEntries: (RendererCoverageEntry & {
    symbol: string;
    importPath: string;
  })[] = [];
  for (const resource of contentResources.filter((entry) =>
    ENTITY_CONTENT_KINDS.has(entry.kind),
  )) {
    rendererEntries.push(
      await ensureRendererClass(repoRoot, resource, rendererIndex, scaffolded),
    );
  }

  runtimeRegistry.entityRuntimeCtors.sort((left, right) =>
    toTypeId(left.kind, left.resourceName).localeCompare(
      toTypeId(right.kind, right.resourceName),
    ),
  );
  runtimeRegistry.itemRuntimeCtors.sort((left, right) =>
    left.resourceName.localeCompare(right.resourceName),
  );
  runtimeRegistry.magRuntimeCtors.sort((left, right) =>
    left.resourceName.localeCompare(right.resourceName),
  );
  runtimeRegistry.blueprintRuntimeCtors.sort((left, right) =>
    left.resourceName.localeCompare(right.resourceName),
  );
  runtimeRegistry.effectRuntimeCtors.sort((left, right) =>
    left.resourceName.localeCompare(right.resourceName),
  );
  rendererEntries.sort((left, right) =>
    left.resourceName.localeCompare(right.resourceName),
  );

  return {
    runtimeRegistry,
    rendererEntries,
    runtimeEntries: [
      ...runtimeRegistry.entityRuntimeCtors,
      ...runtimeRegistry.itemRuntimeCtors,
      ...runtimeRegistry.magRuntimeCtors,
      ...runtimeRegistry.blueprintRuntimeCtors,
      ...runtimeRegistry.effectRuntimeCtors,
    ].map((entry) => ({
      kind: entry.kind,
      typeId: toTypeId(entry.kind, entry.resourceName),
      symbol: entry.symbol,
      source: path.relative(repoRoot, entry.filePath),
    })),
    scaffolded,
    staleScaffoldCandidates: await collectStaleScaffoldCandidates(
      contentResources,
      [
        ...classEntries,
        ...runtimeRegistry.entityRuntimeCtors,
        ...runtimeRegistry.itemRuntimeCtors,
        ...runtimeRegistry.magRuntimeCtors,
        ...runtimeRegistry.blueprintRuntimeCtors,
        ...runtimeRegistry.effectRuntimeCtors,
      ],
      rendererClassEntries,
    ),
  };
}

async function runCoverageChecks(
  repoRoot: string,
  contentResources: readonly ContentResource[],
  runtimeEntries: readonly RuntimeCoverageEntry[],
  rendererEntries: readonly RendererCoverageEntry[],
  scaffolded: ScaffoldSummary,
  staleScaffoldCandidates: readonly string[],
): Promise<void> {
  const entityContentTypeIds = contentResources
    .filter((entry) => ENTITY_CONTENT_KINDS.has(entry.kind))
    .map((entry) => entry.typeId);
  const entityRuntimeTypeIds = runtimeEntries
    .filter((entry) => ENTITY_CONTENT_KINDS.has(entry.kind))
    .map((entry) => entry.typeId);
  const itemContentTypeIds = contentResources
    .filter((entry) => entry.kind === "item")
    .map((entry) => entry.typeId);
  const itemRuntimeTypeIds = runtimeEntries
    .filter((entry) => entry.kind === "item")
    .map((entry) => entry.typeId);
  const magContentTypeIds = contentResources
    .filter((entry) => entry.kind === "mag")
    .map((entry) => entry.typeId);
  const magRuntimeTypeIds = runtimeEntries
    .filter((entry) => entry.kind === "mag")
    .map((entry) => entry.typeId);
  const blueprintContentTypeIds = contentResources
    .filter((entry) => entry.kind === "blueprint")
    .map((entry) => entry.typeId);
  const blueprintRuntimeTypeIds = runtimeEntries
    .filter((entry) => entry.kind === "blueprint")
    .map((entry) => entry.typeId);
  const effectContentTypeIds = contentResources
    .filter((entry) => entry.kind === "effect")
    .map((entry) => entry.typeId);
  const effectRuntimeTypeIds = runtimeEntries
    .filter((entry) => entry.kind === "effect")
    .map((entry) => entry.typeId);
  const rendererContentResourceNames = contentResources
    .filter((entry) => ENTITY_CONTENT_KINDS.has(entry.kind))
    .map((entry) => entry.resourceName);
  const rendererResourceNames = rendererEntries.map(
    (entry) => entry.resourceName,
  );

  const diagnostics: CoverageDiagnostics = {
    generatedBy: "scripts/generate-content-manifest.ts",
    runtime: {
      entity: buildCoverageGroup(entityContentTypeIds, entityRuntimeTypeIds),
      item: buildCoverageGroup(itemContentTypeIds, itemRuntimeTypeIds),
      mag: buildCoverageGroup(magContentTypeIds, magRuntimeTypeIds),
      blueprint: buildCoverageGroup(
        blueprintContentTypeIds,
        blueprintRuntimeTypeIds,
      ),
      effect: buildCoverageGroup(effectContentTypeIds, effectRuntimeTypeIds),
      entries: [...runtimeEntries],
    },
    renderer: {
      ...buildCoverageGroup(
        rendererContentResourceNames,
        rendererResourceNames,
      ),
      entries: [...rendererEntries],
    },
    scaffolded,
    staleScaffoldCandidates: [...staleScaffoldCandidates],
  };

  await writeCoverageDiagnostics(repoRoot, diagnostics);
  assertCoverageGroupPasses(
    "runtime entity constructors",
    diagnostics.runtime.entity,
  );
  assertCoverageGroupPasses(
    "runtime item constructors",
    diagnostics.runtime.item,
  );
  assertCoverageGroupPasses(
    "runtime mag constructors",
    diagnostics.runtime.mag,
  );
  assertCoverageGroupPasses(
    "runtime blueprint constructors",
    diagnostics.runtime.blueprint,
  );
  assertCoverageGroupPasses(
    "runtime effect constructors",
    diagnostics.runtime.effect,
  );
  assertCoverageGroupPasses("entity renderers", diagnostics.renderer);
}

function formatGeneratedFiles(repoRoot: string, filePaths: string[]): void {
  const prettier = Bun.spawnSync({
    cmd: ["bunx", "prettier", "--write", ...filePaths],
    cwd: repoRoot,
    stderr: "inherit",
    stdout: "inherit",
  });
  if (prettier.exitCode !== 0) {
    throw new Error("Failed to format generated files.");
  }
}

async function writeContentManifest(
  repoRoot: string,
  sharedContentRoot: string,
): Promise<string> {
  const outputPath = path.join(sharedContentRoot, "generated/manifest.ts");
  const importLines: string[] = [];
  const arrayBlocks: string[] = [];

  for (const category of CONTENT_CATEGORY_DEFINITIONS) {
    const directoryPath = path.join(sharedContentRoot, category.directory);
    const resourceNames = await getSortedResourceNames(directoryPath);
    const entries = resourceNames.map((resourceName) => {
      const importName = toContentImportName(category.directory, resourceName);
      importLines.push(
        `import ${importName} from "@shared/content/${category.directory}/${resourceName}.json";`,
      );
      return `  ${category.parserExpression(resourceName, importName)},`;
    });

    arrayBlocks.push(
      `export const ${category.exportName} = [\n${entries.join("\n")}\n] as const;`,
    );
  }

  const fileContents = [
    GENERATED_HEADER,
    ...importLines,
    "import {",
    "  makeParsedEffectContentEntry,",
    "  makeParsedEntityContentEntry,",
    "  makeParsedBlueprintContentEntry,",
    "  makeParsedItemContentEntry,",
    "  makeParsedMagContentEntry,",
    '} from "@shared/content/parseContent.ts";',
    "",
    ...arrayBlocks.flatMap((block, index) =>
      index === arrayBlocks.length - 1 ? [block, ""] : [block, "", ""],
    ),
  ].join("\n");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, fileContents);
  process.stdout.write(`Updated ${path.relative(repoRoot, outputPath)}\n`);
  return path.relative(repoRoot, outputPath);
}

function printScaffoldSummary(
  scaffolded: ScaffoldSummary,
  stale: readonly string[],
): void {
  if (scaffolded.runtime.length === 0 && scaffolded.renderer.length === 0) {
    process.stdout.write(
      "No new thin runtime or renderer scaffolds created.\n",
    );
  } else {
    if (scaffolded.runtime.length > 0) {
      process.stdout.write(
        `Created runtime scaffolds:\n${scaffolded.runtime.map((file) => `  - ${file}`).join("\n")}\n`,
      );
    }
    if (scaffolded.renderer.length > 0) {
      process.stdout.write(
        `Created renderer scaffolds:\n${scaffolded.renderer.map((file) => `  - ${file}`).join("\n")}\n`,
      );
    }
  }
  if (stale.length > 0) {
    process.stdout.write(
      `Stale scaffold candidates:\n${stale.map((file) => `  - ${file}`).join("\n")}\n`,
    );
  }
}

async function main(): Promise<void> {
  const scriptPath = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(scriptPath), "..");
  const sharedContentRoot = path.join(repoRoot, "packages/shared/src/content");
  await refreshGeneratedMagItems(repoRoot, sharedContentRoot);
  await refreshGeneratedBlueprintAssets(repoRoot, sharedContentRoot);
  const contentResources = await collectContentResources(sharedContentRoot);
  await writeGeneratedFactoryCtorFiles(repoRoot, contentResources);
  const registryResult = await buildRegistries(repoRoot, contentResources);

  await writeGeneratedRuntimeRegistry(repoRoot, registryResult.runtimeRegistry);
  await writeGeneratedRendererRegistry(
    repoRoot,
    registryResult.rendererEntries,
  );
  await runCoverageChecks(
    repoRoot,
    contentResources,
    registryResult.runtimeEntries,
    registryResult.rendererEntries,
    registryResult.scaffolded,
    registryResult.staleScaffoldCandidates,
  );
  const contentManifestPath = await writeContentManifest(
    repoRoot,
    sharedContentRoot,
  );

  formatGeneratedFiles(repoRoot, [
    GENERATED_SERVER_REGISTRY_PATH,
    GENERATED_STRUCTURE_CTORS_PATH,
    GENERATED_MAG_CTORS_PATH,
    GENERATED_BLUEPRINT_CTORS_PATH,
    GENERATED_CONTENT_PROJECTILE_CTORS_PATH,
    GENERATED_RENDERER_REGISTRY_PATH,
    contentManifestPath,
    ...registryResult.scaffolded.runtime,
    ...registryResult.scaffolded.renderer,
  ]);
  printScaffoldSummary(
    registryResult.scaffolded,
    registryResult.staleScaffoldCandidates,
  );
}

await main();
