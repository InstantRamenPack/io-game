import { expect, test } from "bun:test";
import { balanceFetch } from "scripts/balance.ts";

const baseUrl = "http://balance.test";

function request(path: string, init?: RequestInit): Request {
  return new Request(`${baseUrl}${path}`, init);
}

test("balance API exposes domain tabs without burying waves and loot in raw JSON", async () => {
  const response = await balanceFetch(request("/api/balance"));
  expect(response.ok).toBe(true);
  const payload = (await response.json()) as {
    rows: unknown[];
    renderingRows: Array<{
      itemTypeId: string;
      fields: Array<{ key: string }>;
    }>;
    ammoRows: unknown[];
    enemyRows: unknown[];
    worldRows: Array<{ configId: string }>;
    listRows: Array<{ tab: string; label: string }>;
    jsonRows: unknown[];
  };

  expect(payload.rows.length).toBeGreaterThan(0);
  expect(payload.renderingRows.length).toBeGreaterThan(0);
  expect(
    payload.renderingRows.some(
      (row) =>
        row.itemTypeId === "item:basic_gun" &&
        row.fields.some((field) => field.key === "itemLike.assetPath"),
    ),
  ).toBe(true);
  expect(payload.ammoRows.length).toBeGreaterThan(0);
  expect(payload.enemyRows.length).toBeGreaterThan(0);
  expect(payload.worldRows.length).toBeGreaterThan(0);
  expect(payload.jsonRows.length).toBeGreaterThan(0);
  expect(
    payload.listRows.some(
      (row) => row.tab === "waves" && row.label === "Wave enemy weights",
    ),
  ).toBe(true);
  expect(
    payload.listRows.some(
      (row) =>
        row.tab === "waves" && row.label === "Tier floors and allowed tiers",
    ),
  ).toBe(true);
  expect(
    payload.listRows.some((row) => row.label.startsWith("Crate loot ")),
  ).toBe(true);
  expect(
    payload.listRows.some(
      (row) => row.label === "Legacy blueprint pickup order",
    ),
  ).toBe(true);
  expect(
    payload.worldRows.some((row) => row.configId === "blueprintPlacement"),
  ).toBe(true);
  expect(
    payload.listRows.some((row) =>
      row.label.startsWith("Blueprint pool excludes "),
    ),
  ).toBe(true);
});

test("balance API rejects invalid list and scalar saves before writing content", async () => {
  const invalidWaveResponse = await balanceFetch(
    request("/api/balance/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        listId:
          "packages/shared/src/config/waves.json:randomWaves.enemyWeights",
        action: "add",
        value: { entityType: "missing_enemy", tier: "common", weight: 1 },
      }),
    }),
  );
  expect(invalidWaveResponse.status).toBe(400);
  await expect(invalidWaveResponse.json()).resolves.toMatchObject({
    error: "Unknown type id: enemy:missing_enemy.",
  });

  const invalidScalarResponse = await balanceFetch(
    request("/api/balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "enemy",
        enemyTypeId: "enemy:drifter",
        path: ["spawnWeapons", "typeIds"],
        value: "item:not_real",
      }),
    }),
  );
  expect(invalidScalarResponse.status).toBe(400);
  await expect(invalidScalarResponse.json()).resolves.toMatchObject({
    error: "Unknown type id: item:not_real.",
  });

  const invalidRenderingResponse = await balanceFetch(
    request("/api/balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "itemLike",
        itemTypeId: "item:not_real",
        path: ["rendering", "icon", "x"],
        value: 2,
      }),
    }),
  );
  expect(invalidRenderingResponse.status).toBe(404);
  await expect(invalidRenderingResponse.json()).resolves.toMatchObject({
    error: "Unknown item.",
  });
});

test("balance API accepts negative rendering tuning saves", async () => {
  const initialResponse = await balanceFetch(request("/api/balance"));
  const initialPayload = (await initialResponse.json()) as {
    renderingRows: Array<{
      itemTypeId: string;
      fields: Array<{ key: string; value: unknown }>;
    }>;
  };
  const initialBasicGun = initialPayload.renderingRows.find(
    (row) => row.itemTypeId === "item:basic_gun",
  );
  const originalValue = initialBasicGun?.fields.find(
    (field) => field.key === "itemLike.spriteX",
  )?.value;
  expect(typeof originalValue).toBe("number");

  try {
    const response = await balanceFetch(
      request("/api/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "itemLike",
          itemTypeId: "item:basic_gun",
          path: ["rendering", "sprite", "x"],
          value: -12,
        }),
      }),
    );

    expect(response.ok).toBe(true);
    const payload = (await response.json()) as {
      renderingRows: Array<{
        itemTypeId: string;
        fields: Array<{ key: string; value: unknown }>;
      }>;
    };
    const basicGun = payload.renderingRows.find(
      (row) => row.itemTypeId === "item:basic_gun",
    );
    expect(
      basicGun?.fields.find((field) => field.key === "itemLike.spriteX")?.value,
    ).toBe(-12);
  } finally {
    await balanceFetch(
      request("/api/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "itemLike",
          itemTypeId: "item:basic_gun",
          path: ["rendering", "sprite", "x"],
          value: originalValue,
        }),
      }),
    );
  }
});
