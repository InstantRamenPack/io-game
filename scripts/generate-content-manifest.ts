import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type ContentKind =
  | "building"
  | "structure"
  | "effect"
  | "enemy"
  | "item"
  | "pickup"
  | "player"
  | "projectile";

type ContentCategoryDefinition = {
  directory: ContentKind;
  exportName: string;
  parserExpression: (resourceName: string, importName: string) => string;
};

type ContentResource = {
  kind: ContentKind;
  resourceName: string;
  typeId: string;
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
    effect: CoverageGroup;
    entries: RuntimeCoverageEntry[];
  };
  renderer: CoverageGroup & {
    entries: RendererCoverageEntry[];
  };
};

const CONTENT_CATEGORY_DEFINITIONS: readonly ContentCategoryDefinition[] = [
  {
    directory: "building",
    exportName: "buildingContentEntries",
    parserExpression: (resourceName, importName) =>
      `makeParsedEntityContentEntry("building", ${JSON.stringify(resourceName)}, ${importName})`,
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
  "structure",
  "enemy",
  "pickup",
  "player",
  "projectile",
]);

const GENERATED_DIAGNOSTICS_DIRECTORY = "scripts/generated";

function toIdentifier(value: string): string {
  const words = value
    .replace(/\.json$/i, "")
    .split(/[^a-zA-Z0-9]+/g)
    .filter(Boolean);
  const [firstWord = "content", ...restWords] = words;
  const camelCase = [
    firstWord.toLowerCase(),
    ...restWords.map(
      (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    ),
  ].join("");
  return `${camelCase}Json`;
}

function toTypeId(kind: ContentKind, resourceName: string): string {
  return `${kind}:${resourceName}`;
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
      });
    }
  }
  return resources.sort((left, right) =>
    left.typeId.localeCompare(right.typeId),
  );
}

async function readTextFile(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
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
  throw new Error(
    `Unsupported static import path in coverage map: ${importPath}`,
  );
}

function parseNamedImports(source: string): Map<string, string> {
  const imports = new Map<string, string>();
  const importPattern =
    /import\s+(?:type\s+)?\{\s*([^}]+?)\s*}\s+from\s+"([^"]+)";/gs;
  for (const match of source.matchAll(importPattern)) {
    const [, names, importPath] = match;
    if (!names || !importPath) {
      continue;
    }
    for (const rawName of names.split(",")) {
      const importedName = rawName
        .trim()
        .split(/\s+as\s+/u)
        .at(-1)
        ?.trim();
      if (importedName) {
        imports.set(importedName, importPath);
      }
    }
  }
  return imports;
}

function parseRuntimeArray(source: string, arrayName: string): string[] {
  const arrayPattern = new RegExp(
    `export\\s+const\\s+${arrayName}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s+as\\s+const`,
    "u",
  );
  const match = arrayPattern.exec(source);
  if (!match?.[1]) {
    throw new Error(`Unable to find ${arrayName} in runtime constructor map.`);
  }
  return match[1]
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function inferEntityKindFromSourcePath(sourcePath: string): ContentKind {
  const normalized = sourcePath.split(path.sep).join("/");
  if (normalized.endsWith("/Player.ts")) {
    return "player";
  }
  if (normalized.endsWith("/ItemEntity.ts")) {
    return "pickup";
  }
  if (normalized.includes("/entities/buildings/")) {
    return "building";
  }
  if (normalized.includes("/entities/structures/")) {
    return "structure";
  }
  if (normalized.includes("/entities/enemies/")) {
    return "enemy";
  }
  if (normalized.includes("/entities/projectiles/")) {
    return "projectile";
  }
  throw new Error(`Unable to infer entity content kind for ${sourcePath}.`);
}

function parseResourceName(
  source: string,
  symbol: string,
  sourcePath: string,
): string {
  const resourcePattern = new RegExp(
    `export\\s+class\\s+${symbol}\\b[\\s\\S]*?public\\s+static\\s+(?:override\\s+)?readonly\\s+resourceName\\s*=\\s*"([^"]+)"`,
    "u",
  );
  const match = resourcePattern.exec(source);
  if (!match?.[1]) {
    throw new Error(
      `Unable to find static resourceName for ${symbol} in ${sourcePath}.`,
    );
  }
  return match[1];
}

async function collectRuntimeCoverageEntries(
  repoRoot: string,
): Promise<RuntimeCoverageEntry[]> {
  const runtimeMapPath = path.join(
    repoRoot,
    "apps/server/src/registry/runtimeCtorMap.ts",
  );
  const runtimeMapSource = await readTextFile(runtimeMapPath);
  const importsBySymbol = parseNamedImports(runtimeMapSource);
  const runtimeArrays = [
    {
      arrayName: "entityRuntimeCtors",
      resolveKind: (sourcePath: string): ContentKind =>
        inferEntityKindFromSourcePath(sourcePath),
    },
    {
      arrayName: "itemRuntimeCtors",
      resolveKind: (): ContentKind => "item",
    },
    {
      arrayName: "effectRuntimeCtors",
      resolveKind: (): ContentKind => "effect",
    },
  ] as const;
  const entries: RuntimeCoverageEntry[] = [];

  for (const runtimeArray of runtimeArrays) {
    for (const symbol of parseRuntimeArray(
      runtimeMapSource,
      runtimeArray.arrayName,
    )) {
      const importPath = importsBySymbol.get(symbol);
      if (!importPath) {
        throw new Error(
          `Runtime constructor ${symbol} is not imported by ${runtimeArray.arrayName}.`,
        );
      }
      const sourcePath = resolveSourcePath(repoRoot, importPath);
      const source = await readTextFile(sourcePath);
      const kind = runtimeArray.resolveKind(sourcePath);
      const resourceName = parseResourceName(source, symbol, sourcePath);
      entries.push({
        kind,
        typeId: toTypeId(kind, resourceName),
        symbol,
        source: path.relative(repoRoot, sourcePath),
      });
    }
  }

  return entries.sort((left, right) => left.typeId.localeCompare(right.typeId));
}

async function collectRendererCoverageEntries(
  repoRoot: string,
): Promise<RendererCoverageEntry[]> {
  const rendererRegistryPath = path.join(
    repoRoot,
    "apps/client/src/render/entity/rendererRegistry.ts",
  );
  const source = await readTextFile(rendererRegistryPath);
  const manifestPattern =
    /const\s+rendererManifests\s*=\s*\[([\s\S]*?)\]\s+as\s+const/su;
  const manifestMatch = manifestPattern.exec(source);
  if (!manifestMatch?.[1]) {
    throw new Error(
      "Unable to find rendererManifests in client renderer registry.",
    );
  }
  const entries: RendererCoverageEntry[] = [];
  const entryPattern = /\[\s*"([^"]+)"\s*,\s*([A-Za-z0-9_]+)\s*\]/gu;
  for (const match of manifestMatch[1].matchAll(entryPattern)) {
    const [, resourceName, renderer] = match;
    if (resourceName && renderer) {
      entries.push({ resourceName, renderer });
    }
  }
  return entries.sort((left, right) =>
    left.resourceName.localeCompare(right.resourceName),
  );
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
  if (group.missing.length === 0 && group.extra.length === 0) {
    return;
  }
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

async function runCoverageChecks(
  repoRoot: string,
  contentResources: readonly ContentResource[],
): Promise<void> {
  const runtimeEntries = await collectRuntimeCoverageEntries(repoRoot);
  const rendererEntries = await collectRendererCoverageEntries(repoRoot);
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
      effect: buildCoverageGroup(effectContentTypeIds, effectRuntimeTypeIds),
      entries: runtimeEntries,
    },
    renderer: {
      ...buildCoverageGroup(
        rendererContentResourceNames,
        rendererResourceNames,
      ),
      entries: rendererEntries,
    },
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
    "runtime effect constructors",
    diagnostics.runtime.effect,
  );
  assertCoverageGroupPasses("entity renderers", diagnostics.renderer);
}

async function main(): Promise<void> {
  const scriptPath = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(scriptPath), "..");
  const sharedContentRoot = path.join(repoRoot, "packages/shared/src/content");
  const outputPath = path.join(sharedContentRoot, "generated/manifest.ts");
  const contentResources = await collectContentResources(sharedContentRoot);

  const importLines: string[] = [];
  const arrayBlocks: string[] = [];

  for (const category of CONTENT_CATEGORY_DEFINITIONS) {
    const directoryPath = path.join(sharedContentRoot, category.directory);
    const resourceNames = await getSortedResourceNames(directoryPath);
    const entries = resourceNames.map((resourceName) => {
      const importName = `${category.directory}${toIdentifier(resourceName)}`;
      importLines.push(
        `import ${importName} from "@shared/content/${category.directory}/${resourceName}.json";`,
      );
      return `  ${category.parserExpression(resourceName, importName)},`;
    });

    arrayBlocks.push(
      `export const ${category.exportName} = [\n${entries.join("\n")}\n] as const;`,
    );
  }

  await runCoverageChecks(repoRoot, contentResources);

  const fileContents = [
    "// Generated by scripts/generate-content-manifest.ts. Do not edit by hand.",
    ...importLines,
    "import {",
    "  makeParsedEffectContentEntry,",
    "  makeParsedEntityContentEntry,",
    "  makeParsedItemContentEntry,",
    '} from "@shared/content/parseContent.ts";',
    "",
    ...arrayBlocks.flatMap((block, index) =>
      index === arrayBlocks.length - 1 ? [block, ""] : [block, "", ""],
    ),
  ].join("\n");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, fileContents);
  const prettier = Bun.spawnSync({
    cmd: ["bunx", "prettier", "--write", outputPath],
    cwd: repoRoot,
    stderr: "inherit",
    stdout: "inherit",
  });
  if (prettier.exitCode !== 0) {
    throw new Error(
      `Failed to format generated manifest at ${path.relative(repoRoot, outputPath)}.`,
    );
  }

  process.stdout.write(`Updated ${path.relative(repoRoot, outputPath)}\n`);
}

await main();
