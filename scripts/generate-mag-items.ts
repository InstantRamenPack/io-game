import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

type ItemContent = {
  label?: string;
  weapon?: {
    attackStyle?: string;
    magItemTypeId?: string;
    projectileTypeId?: string;
  };
  recipe?: unknown;
  pickupSpawn?: {
    pools?: string[];
  };
  runtime?: unknown;
};

const repoRoot = process.cwd();
const itemContentDir = path.join(repoRoot, "packages/shared/src/content/item");
const iconMapPath = path.join(repoRoot, "apps/client/public/item_icons.json");
const spriteMapPath = path.join(
  repoRoot,
  "apps/client/public/item_sprites.json",
);
const generatedIconDir = path.join(
  repoRoot,
  "apps/client/public/icons/generated",
);
const generatedSpriteDir = path.join(
  repoRoot,
  "apps/client/public/sprites/generated",
);

const explicitIconPaths: Record<string, string> = {
  "item:pistol_mag": "/icons/pistol_ammo.png",
  "item:rifle_mag": "/icons/rifle_ammo.png",
  "item:sniper_mag": "/icons/sniper_ammo.png",
};

const generatedIconSources: Record<string, string> = {
  pistol: "pistol_ammo.png",
  rifle: "rifle_ammo.png",
  sniper: "sniper_ammo.png",
};

function formatJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function toTitleCase(resourceName: string): string {
  return resourceName
    .split("_")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function getResourceName(typeId: string): string {
  const [, resourceName] = typeId.split(":");
  if (!resourceName) {
    throw new Error(`Invalid type id: ${typeId}`);
  }
  return resourceName;
}

function inferMagTypeId(weaponTypeId: string): string {
  return `item:${getResourceName(weaponTypeId)}_mag`;
}

function inferIconFamily(
  typeId: string,
  weaponTypeIds: readonly string[],
): string {
  const haystack = [typeId, ...weaponTypeIds].join(" ");
  if (haystack.includes("pistol") || haystack.includes("gun")) return "pistol";
  if (haystack.includes("sniper")) return "sniper";
  return "rifle";
}

function buildMagContent(
  typeId: string,
  weaponLabels: readonly string[],
): ItemContent {
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
    pickupSpawn: {
      pools: ["mag"],
    },
    runtime: {
      server: {
        classKind: "magazine",
      },
    },
  };
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function main(): Promise<void> {
  const fileNames = (await readdir(itemContentDir))
    .filter((fileName) => fileName.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right));
  const items = new Map<string, { filePath: string; content: ItemContent }>();

  for (const fileName of fileNames) {
    const filePath = path.join(itemContentDir, fileName);
    const typeId = `item:${fileName.slice(0, -".json".length)}`;
    items.set(typeId, {
      filePath,
      content: await readJson<ItemContent>(filePath),
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
    const filePath = path.join(itemContentDir, `${resourceName}.json`);
    const content = buildMagContent(
      magTypeId,
      magWeaponLabels.get(magTypeId) ?? weaponTypeIds,
    );
    await writeFile(filePath, formatJson(content));
    items.set(magTypeId, { filePath, content });
  }

  const iconMap = await readJson<Record<string, string>>(iconMapPath);
  const spriteMap = await readJson<Record<string, string>>(spriteMapPath);
  await mkdir(generatedIconDir, { recursive: true });
  await mkdir(generatedSpriteDir, { recursive: true });
  for (const [magTypeId, weaponTypeIds] of magWeaponTypeIds) {
    const explicitPath = explicitIconPaths[magTypeId];
    if (explicitPath) {
      iconMap[magTypeId] = explicitPath;
      continue;
    }

    const iconFamily = inferIconFamily(magTypeId, weaponTypeIds);
    const sourceFileName = generatedIconSources[iconFamily] ?? "rifle_ammo.png";
    const generatedFileName = `${getResourceName(magTypeId)}.png`;
    await copyFile(
      path.join(repoRoot, "apps/client/public/icons", sourceFileName),
      path.join(generatedIconDir, generatedFileName),
    );
    iconMap[magTypeId] = `/icons/generated/${generatedFileName}`;
    spriteMap[magTypeId] = `/sprites/generated/${generatedFileName}`;
  }

  for (const magTypeId of magWeaponTypeIds.keys()) {
    const resourceName = getResourceName(magTypeId);
    spriteMap[magTypeId] = `/sprites/generated/${resourceName}.png`;
  }

  const sortedIconMap = Object.fromEntries(
    Object.entries(iconMap).sort(([left], [right]) => {
      if (left === "__default__") return -1;
      if (right === "__default__") return 1;
      return left.localeCompare(right);
    }),
  );
  await writeFile(iconMapPath, formatJson(sortedIconMap));
  const sortedSpriteMap = Object.fromEntries(
    Object.entries(spriteMap).sort(([left], [right]) => {
      if (left === "__default__") return -1;
      if (right === "__default__") return 1;
      return left.localeCompare(right);
    }),
  );
  await writeFile(spriteMapPath, formatJson(sortedSpriteMap));
}

await main();
