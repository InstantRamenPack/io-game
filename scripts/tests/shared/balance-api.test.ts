import { afterAll, beforeAll, expect, test } from "bun:test";

const port = 4300 + Math.floor(Math.random() * 500);
const baseUrl = `http://127.0.0.1:${port}`;
let serverProcess: ReturnType<typeof Bun.spawn>;

async function waitForBalanceServer(): Promise<void> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/balance`);
      if (response.ok) {
        return;
      }
    } catch {
      // Server is still starting.
    }
    await Bun.sleep(100);
  }
  throw new Error("Timed out waiting for balance server.");
}

beforeAll(async () => {
  serverProcess = Bun.spawn(["bun", "run", "scripts/balance.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      BALANCE_OPEN: "0",
      BALANCE_PORT: String(port),
    },
    stdout: "ignore",
    stderr: "pipe",
  });
  await waitForBalanceServer();
});

afterAll(() => {
  serverProcess.kill();
});

test("balance API exposes domain tabs without burying waves and loot in raw JSON", async () => {
  const response = await fetch(`${baseUrl}/api/balance`);
  expect(response.ok).toBe(true);
  const payload = (await response.json()) as {
    rows: unknown[];
    ammoRows: unknown[];
    enemyRows: unknown[];
    worldRows: unknown[];
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
});

test("balance API rejects invalid list and scalar saves before writing content", async () => {
  const invalidWaveResponse = await fetch(`${baseUrl}/api/balance/list`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      listId: "packages/shared/src/config/waves.json:randomWaves.enemyWeights",
      action: "add",
      value: { entityType: "missing_enemy", tier: "common", weight: 1 },
    }),
  });
  expect(invalidWaveResponse.status).toBe(400);
  await expect(invalidWaveResponse.json()).resolves.toMatchObject({
    error: "Unknown type id: enemy:missing_enemy.",
  });

  const invalidScalarResponse = await fetch(`${baseUrl}/api/balance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: "enemy",
      enemyTypeId: "enemy:drifter",
      path: ["spawnWeapons", "typeIds"],
      value: "item:not_real",
    }),
  });
  expect(invalidScalarResponse.status).toBe(400);
  await expect(invalidScalarResponse.json()).resolves.toMatchObject({
    error: "Unknown type id: item:not_real.",
  });
});
