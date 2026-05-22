type JsonObject = Record<string, unknown>;

type BalanceFile = {
  path: string;
  data: JsonObject;
};

type BalanceField = {
  key: string;
  label: string;
  source: "item" | "weapon" | "projectile";
  path: string[];
  value: string | number | null;
  kind: "number" | "text";
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
  dpsNoReload: number | null;
  dpsWithReload: number | null;
  fields: BalanceField[];
};

const itemContentDirectory = "packages/shared/src/content/item";
const projectileContentDirectory = "packages/shared/src/content/projectile";

const weaponFieldSpecs = [
  {
    key: "cooldownTicks",
    label: "Cooldown",
    path: ["weapon", "cooldownTicks"],
  },
  { key: "magSize", label: "Mag Size", path: ["weapon", "magSize"] },
  { key: "reloadTicks", label: "Reload", path: ["weapon", "reloadTicks"] },
  { key: "spreadDeg", label: "Spread", path: ["weapon", "spreadDeg"] },
  { key: "range", label: "Range", path: ["weapon", "range"] },
  { key: "damage", label: "Weapon Damage", path: ["weapon", "damage"] },
  { key: "knockback", label: "Knockback", path: ["weapon", "knockback"] },
  { key: "sweepArcDeg", label: "Sweep Arc", path: ["weapon", "sweepArcDeg"] },
  { key: "jabWidth", label: "Jab Width", path: ["weapon", "jabWidth"] },
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

const hunkCostFieldSpec = {
  key: "hunkCost",
  label: "Hunk Cost",
  path: ["recipe", "costs", "item:hunk", "amount"],
} as const;

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

function resourceNameFromPath(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1, -".json".length);
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
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      throw new Error(`Cannot update missing object path ${path.join(".")}.`);
    }
    current = next as JsonObject;
  }

  current[path[path.length - 1]!] = value;
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
  const [itemFiles, projectileFiles] = await Promise.all([
    readContentFiles(itemContentDirectory),
    readContentFiles(projectileContentDirectory),
  ]);
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

function knownFieldForUpdate(
  row: BalanceRow,
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
): number | string | null {
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
    return parsedValue.trim();
  }

  if (typeof parsedValue !== "number") {
    throw new Error(`${field.label} must be a number.`);
  }

  return parsedValue;
}

async function saveUpdate(request: Request): Promise<Response> {
  const body = (await request.json()) as {
    weaponTypeId?: unknown;
    source?: unknown;
    path?: unknown;
    value?: unknown;
  };

  if (
    typeof body.weaponTypeId !== "string" ||
    !["item", "weapon", "projectile"].includes(String(body.source)) ||
    !Array.isArray(body.path) ||
    !body.path.every((part) => typeof part === "string")
  ) {
    return Response.json({ error: "Invalid save request." }, { status: 400 });
  }

  const source = body.source as BalanceField["source"];
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
        : row.projectileFile;
  if (!targetPath) {
    return Response.json(
      { error: "Weapon has no projectile file." },
      { status: 400 },
    );
  }

  const targetFile = await readJsonFile(targetPath);
  const parsedValue = parseFieldUpdateValue(field, body.value);
  if (field.key === "item.hunkCost") {
    setHunkCost(targetFile.data, parsedValue as number | null);
  } else {
    setValue(targetFile.data, body.path, parsedValue);
  }
  await Bun.write(targetPath, `${JSON.stringify(targetFile.data, null, 2)}\n`);

  return Response.json({ rows: await loadBalanceRows() });
}

const port = parseIntegerEnv("BALANCE_PORT", 4179);
const balancePageHtml = await Bun.file("scripts/balance-page.html").text();

const server = Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return new Response(balancePageHtml, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (request.method === "GET" && url.pathname === "/api/balance") {
      return Response.json({ rows: await loadBalanceRows() });
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

    return new Response("Not found", { status: 404 });
  },
});

const url = `http://127.0.0.1:${server.port}`;
console.log(`[balance] serving ${url}`);
console.log("[balance] set BALANCE_PORT to use a different port");

if (process.platform === "darwin") {
  Bun.spawn(["open", url], {
    stdout: "ignore",
    stderr: "ignore",
  });
}
