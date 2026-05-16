import { existsSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { rendererManifests } from "@client/render/entity/generated/rendererRegistry.ts";
import { getRegisteredEntityRendererResourceNames } from "@client/render/entity/rendererRegistry.ts";
import {
  buildEffectTypeEntries,
  buildEntityTypeEntries,
  buildItemTypeEntries,
} from "@server/registry/buildRegistries.ts";
import {
  effectRuntimeCtors,
  entityRuntimeCtors,
  itemRuntimeCtors,
} from "@server/registry/generated/runtimeRegistry.ts";
import {
  getAllEffectContentEntries,
  getAllEntityContentEntries,
  getAllItemContentEntries,
  requireEntityContent,
  requireItemContent,
} from "@shared/content/catalog.ts";
import { getResourcePath } from "@shared/ids/ResourceId.ts";

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

describe("content registry source", () => {
  test("loads shared content and resolves generated runtime and renderer registries", () => {
    expect(requireItemContent("item:basic_sword").label).toBe("Sword");
    expect(requireEntityContent("player:base").label).toBe("Player");

    const entityEntries = buildEntityTypeEntries();
    const itemEntries = buildItemTypeEntries();
    const effectEntries = buildEffectTypeEntries();

    expect(sorted(entityEntries.map((entry) => entry.typeId))).toEqual(
      sorted(getAllEntityContentEntries().map(([typeId]) => typeId)),
    );
    expect(sorted(itemEntries.map((entry) => entry.typeId))).toEqual(
      sorted(getAllItemContentEntries().map(([typeId]) => typeId)),
    );
    expect(sorted(effectEntries.map((entry) => entry.typeId))).toEqual(
      sorted(getAllEffectContentEntries().map(([typeId]) => typeId)),
    );

    expect(Number(entityRuntimeCtors.length)).toBe(entityEntries.length);
    expect(Number(itemRuntimeCtors.length)).toBe(itemEntries.length);
    expect(Number(effectRuntimeCtors.length)).toBe(effectEntries.length);

    const renderedResourceNames = getRegisteredEntityRendererResourceNames();
    const generatedRendererNames = sorted(
      rendererManifests.map(([resourceName]) => resourceName),
    );
    const entityResourceNames = sorted(
      getAllEntityContentEntries().map(([typeId]) => getResourcePath(typeId)),
    );

    expect(renderedResourceNames).toEqual(entityResourceNames);
    expect(generatedRendererNames).toEqual(entityResourceNames);
  });

  test("does not depend on authored registry json files", () => {
    expect(
      existsSync("packages/shared/src/content/registry/runtime-ctors.json"),
    ).toBe(false);
    expect(
      existsSync("packages/shared/src/content/registry/entity-renderers.json"),
    ).toBe(false);
  });
});
