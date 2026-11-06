import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeGeneratedFile } from "scripts/generate-content-manifest.ts";

test("generation compares formatted output before writing and preserves unchanged mtimes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "io-game-generation-test-"));
  try {
    const file = join(dir, "generated.ts");
    expect(await writeGeneratedFile(file, "export const x=1;")).toBe(true);
    const before = await stat(file);
    expect(await writeGeneratedFile(file, "export const x = 1;\n")).toBe(false);
    expect((await stat(file)).mtimeMs).toBe(before.mtimeMs);
    expect(await writeGeneratedFile(file, "export const x=2;")).toBe(true);
    expect(await readFile(file, "utf8")).toBe("export const x = 2;\n");
  } finally {
    await rm(dir, { recursive: true });
  }
});
