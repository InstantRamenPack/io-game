import { describe, expect, test } from "bun:test";
import { getRegisteredEntityRendererResourceNames } from "@client/render/entity/rendererRegistry.ts";
import {
  buildEffectTypeEntries,
  buildEntityTypeEntries,
  buildItemTypeEntries,
} from "@server/registry/buildRegistries.ts";
import {
  getAllEffectContentEntries,
  getAllEntityContentEntries,
  getAllItemContentEntries,
  requireEntityContent,
  requireItemContent,
} from "@shared/content/catalog.ts";
import { getResourcePath } from "@shared/ids/ResourceId.ts";

describe("content registry source", () => {
  test("loads shared content and resolves runtime and renderer registries", () => {
    expect(requireItemContent("item:basic_sword").label).toBe("Sword");
    expect(requireEntityContent("player:base").label).toBe("Player");

    const entityEntries = buildEntityTypeEntries();
    const itemEntries = buildItemTypeEntries();
    const effectEntries = buildEffectTypeEntries();

    expect(entityEntries.map((entry) => entry.typeId).sort()).toEqual(
      getAllEntityContentEntries()
        .map(([typeId]) => typeId)
        .sort(),
    );
    expect(itemEntries.map((entry) => entry.typeId).sort()).toEqual(
      getAllItemContentEntries()
        .map(([typeId]) => typeId)
        .sort(),
    );
    expect(effectEntries.map((entry) => entry.typeId).sort()).toEqual(
      getAllEffectContentEntries()
        .map(([typeId]) => typeId)
        .sort(),
    );

    const renderedResourceNames = getRegisteredEntityRendererResourceNames();
    const entityResourceNames = getAllEntityContentEntries()
      .map(([typeId]) => getResourcePath(typeId))
      .sort();

    expect(renderedResourceNames).toEqual(entityResourceNames);
  });
});
