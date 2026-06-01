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
    ammoRows: unknown[];
    enemyRows: unknown[];
    worldRows: Array<{ configId: string }>;
    listRows: Array<{ tab: string; label: string }>;
    jsonRows: unknown[];
  };

  expect(payload.rows.length).toBeGreaterThan(0);
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
});
