import { normalizeAngle } from "@shared/math/angle.ts";
import type { ExplosionStyle, NetEvent } from "@shared/net/events.ts";
import type {
  ActiveEffectSnapshot,
  EntitySnapshot,
  EquippedItemSnapshot,
  InventorySnapshot,
  InventorySlotSnapshot,
  MapFeatureSnapshot,
  MapMarkerSnapshot,
  MapSectorSnapshot,
  MapSnapshot,
  WeaponSnapshot,
  WorldSnapshot,
} from "@shared/net/snapshots.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type {
  InputIntentMessage,
  ServerToClientMessage,
} from "@shared/net/protocol.ts";

const POSITION_SCALE = 10;
const ROTATION_SCALE = 65535 / (Math.PI * 2);

const ENTITY_KIND_TO_CODE = {
  player: 1,
  enemy: 2,
  building: 3,
  tower: 4,
  structure: 5,
  projectile: 6,
  pickup: 7,
} as const;

const ENTITY_CODE_TO_KIND = {
  1: "player",
  2: "enemy",
  3: "building",
  4: "tower",
  5: "structure",
  6: "projectile",
  7: "pickup",
} as const;

type EntityKindCode = keyof typeof ENTITY_CODE_TO_KIND;
type MinimapPlayerSnapshot = NonNullable<
  WorldSnapshot["minimapPlayers"]
>[number];

export function compactInputMessage(message: InputIntentMessage): unknown[] {
  return [
    message.seq,
    message.clientTimeMs ?? null,
    quantizeRotation(message.theta),
    packMovement(message.movement),
  ];
}

export function expandInputMessage(
  payload: unknown[],
): InputIntentMessage | null {
  const [seq, clientTimeMs, theta, movementMask] = payload;
  if (
    typeof seq !== "number" ||
    (clientTimeMs !== null && typeof clientTimeMs !== "number") ||
    typeof theta !== "number" ||
    typeof movementMask !== "number"
  ) {
    return null;
  }
  return {
    t: "input",
    seq,
    ...(clientTimeMs === null ? {} : { clientTimeMs }),
    theta: dequantizeRotation(theta),
    movement: unpackMovement(movementMask),
  };
}

export function compactServerMessage(message: ServerToClientMessage): unknown {
  if (message.t !== "snapshot") {
    return message;
  }
  return { t: "snapshot", s: compactWorldSnapshot(message.snapshot) };
}

export function expandServerMessage(value: unknown): unknown {
  if (
    !value ||
    typeof value !== "object" ||
    !("t" in value) ||
    (value as { t?: unknown }).t !== "snapshot" ||
    !("s" in value)
  ) {
    return value;
  }
  const expanded = expandWorldSnapshot((value as { s: unknown }).s);
  return expanded ? { t: "snapshot", snapshot: expanded } : value;
}

function compactWorldSnapshot(snapshot: WorldSnapshot): unknown[] {
  return [
    snapshot.tick,
    snapshot.lastProcessedSeq ?? null,
    compactDayNight(snapshot.dayNight),
    compactExtraction(snapshot.extraction),
    (snapshot.infrastructure.energyActive ? 1 : 0) |
      (snapshot.infrastructure.commsActive ? 2 : 0),
    snapshot.map ? compactMap(snapshot.map) : null,
    snapshot.visibility
      ? [
          snapshot.visibility.restricted ? 1 : 0,
          q(snapshot.visibility.radius),
          q(snapshot.visibility.centerX),
          q(snapshot.visibility.centerY),
        ]
      : null,
    snapshot.minimapPlayers?.map(compactMinimapPlayer) ?? null,
    snapshot.full ?? null,
    snapshot.entities.map(compactEntity),
    snapshot.removedEntityIds ?? null,
    compactEvents(snapshot.events),
  ];
}

function expandWorldSnapshot(value: unknown): WorldSnapshot | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const [
    tick,
    lastProcessedSeq,
    dayNight,
    extraction,
    infrastructureMask,
    map,
    visibility,
    minimapPlayers,
    full,
    entities,
    removedEntityIds,
    events,
  ] = value;
  if (
    typeof tick !== "number" ||
    typeof infrastructureMask !== "number" ||
    !Array.isArray(entities)
  ) {
    return null;
  }
  const expandedDayNight = expandDayNight(dayNight);
  const expandedExtraction = expandExtraction(extraction);
  if (!expandedDayNight || !expandedExtraction) {
    return null;
  }
  return {
    tick,
    ...(typeof lastProcessedSeq === "number" ? { lastProcessedSeq } : {}),
    dayNight: expandedDayNight,
    extraction: expandedExtraction,
    infrastructure: {
      energyActive: (infrastructureMask & 1) !== 0,
      commsActive: (infrastructureMask & 2) !== 0,
    },
    ...(map === null ? {} : { map: expandMap(map) }),
    ...(visibility === null
      ? {}
      : { visibility: expandVisibility(visibility) }),
    ...(minimapPlayers === null
      ? {}
      : {
          minimapPlayers: Array.isArray(minimapPlayers)
            ? minimapPlayers.map(expandMinimapPlayer).filter(isPresent)
            : [],
        }),
    ...(typeof full === "boolean" ? { full } : {}),
    entities: entities.map(expandEntity).filter(isPresent),
    ...(Array.isArray(removedEntityIds) ? { removedEntityIds } : {}),
    events: expandEvents(events),
  };
}

function compactEntity(entity: EntitySnapshot): unknown[] {
  const base = [
    entity.id,
    entity.typeId ?? null,
    q(entity.x),
    q(entity.y),
    q(entity.vx),
    q(entity.vy),
    quantizeRotation(entity.rotation),
    entity.hitboxes
      ? entity.hitboxes.map((hitbox) => [
          q(hitbox.offsetX),
          q(hitbox.offsetY),
          q(hitbox.width),
          q(hitbox.height),
        ])
      : null,
    entity.hp ?? null,
    entity.maxHp ?? null,
    entity.alive ?? null,
    entity.ownerId ?? null,
  ];

  switch (entity.kind) {
    case "player":
      return [
        ENTITY_KIND_TO_CODE.player,
        base,
        [
          entity.name,
          compactInventory(entity.inventory),
          entity.activeEffects.map(compactActiveEffect),
          q(entity.moveSpeed),
          entity.equippedItem ? compactEquippedItem(entity.equippedItem) : null,
          entity.armorTypeId ?? null,
          entity.armorTier ?? null,
          entity.armorDamageReductionPct ?? null,
        ],
      ];
    case "enemy":
      return [
        ENTITY_KIND_TO_CODE.enemy,
        base,
        [
          entity.targetId ?? null,
          entity.equippedItem ? compactEquippedItem(entity.equippedItem) : null,
          (entity.activeEffects ?? []).map(compactActiveEffect),
          entity.armorTypeId ?? null,
          entity.armorTier ?? null,
          entity.armorDamageReductionPct ?? null,
        ],
      ];
    case "building":
      return [
        ENTITY_KIND_TO_CODE.building,
        base,
        [
          entity.label,
          entity.tier,
          entity.chestSlots?.map(compactInventorySlot) ?? null,
        ],
      ];
    case "tower":
      return [
        ENTITY_KIND_TO_CODE.tower,
        base,
        [
          entity.label,
          entity.tier,
          entity.chestSlots?.map(compactInventorySlot) ?? null,
        ],
      ];
    case "structure":
      return [ENTITY_KIND_TO_CODE.structure, base, [entity.label]];
    case "projectile":
      return [ENTITY_KIND_TO_CODE.projectile, base, []];
    case "pickup":
      return [
        ENTITY_KIND_TO_CODE.pickup,
        base,
        [compactInventory(entity.inventory)],
      ];
  }
}

function expandEntity(value: unknown): EntitySnapshot | null {
  if (!Array.isArray(value) || value.length < 3) {
    return null;
  }
  const [kindCode, baseValue, extraValue] = value;
  if (typeof kindCode !== "number" || !Array.isArray(baseValue)) {
    return null;
  }
  const kind = ENTITY_CODE_TO_KIND[kindCode as EntityKindCode];
  if (!kind) {
    return null;
  }
  const base = expandEntityBase(baseValue);
  if (!base || !Array.isArray(extraValue)) {
    return null;
  }
  switch (kind) {
    case "player": {
      const [
        name,
        inventory,
        activeEffects,
        moveSpeed,
        equippedItem,
        armorTypeId,
        armorTier,
        armorDamageReductionPct,
      ] = extraValue;
      if (typeof name !== "string" || typeof moveSpeed !== "number") {
        return null;
      }
      return {
        ...base,
        kind,
        name,
        inventory: expandInventory(inventory),
        activeEffects: Array.isArray(activeEffects)
          ? activeEffects.map(expandActiveEffect).filter(isPresent)
          : [],
        moveSpeed: dq(moveSpeed),
        ...(equippedItem === null
          ? {}
          : { equippedItem: expandEquippedItem(equippedItem) }),
        ...(typeof armorTypeId === "string"
          ? { armorTypeId: armorTypeId as ResourceId }
          : {}),
        ...(armorTier === 1 ||
        armorTier === 2 ||
        armorTier === 3 ||
        armorTier === 4
          ? { armorTier }
          : {}),
        ...(typeof armorDamageReductionPct === "number"
          ? { armorDamageReductionPct }
          : {}),
      };
    }
    case "enemy": {
      const [
        targetId,
        equippedItem,
        activeEffects,
        armorTypeId,
        armorTier,
        armorDamageReductionPct,
      ] = extraValue;
      return {
        ...base,
        kind,
        ...(typeof targetId === "number" ? { targetId } : {}),
        ...(equippedItem === null
          ? {}
          : { equippedItem: expandEquippedItem(equippedItem) }),
        ...(Array.isArray(activeEffects)
          ? {
              activeEffects: activeEffects
                .map(expandActiveEffect)
                .filter(isPresent),
            }
          : {}),
        ...(typeof armorTypeId === "string"
          ? { armorTypeId: armorTypeId as ResourceId }
          : {}),
        ...(armorTier === 1 ||
        armorTier === 2 ||
        armorTier === 3 ||
        armorTier === 4
          ? { armorTier }
          : {}),
        ...(typeof armorDamageReductionPct === "number"
          ? { armorDamageReductionPct }
          : {}),
      };
    }
    case "building":
    case "tower": {
      const [label, tier, chestSlots] = extraValue;
      if (typeof label !== "string" || typeof tier !== "number") {
        return null;
      }
      return {
        ...base,
        kind,
        label,
        tier,
        ...(Array.isArray(chestSlots)
          ? { chestSlots: chestSlots.map(expandInventorySlot) }
          : {}),
      };
    }
    case "structure": {
      const [label] = extraValue;
      return typeof label === "string" ? { ...base, kind, label } : null;
    }
    case "projectile":
      return { ...base, kind };
    case "pickup": {
      const [inventory] = extraValue;
      return { ...base, kind, inventory: expandInventory(inventory) };
    }
  }
}

function expandEntityBase(
  value: unknown[],
): (Omit<EntitySnapshot, "kind" | "typeId"> & { typeId?: ResourceId }) | null {
  const [
    id,
    typeId,
    x,
    y,
    vx,
    vy,
    rotation,
    hitboxes,
    hp,
    maxHp,
    alive,
    ownerId,
  ] = value;
  if (
    typeof id !== "number" ||
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof vx !== "number" ||
    typeof vy !== "number" ||
    typeof rotation !== "number"
  ) {
    return null;
  }
  return {
    id,
    ...(typeof typeId === "string" ? { typeId: typeId as ResourceId } : {}),
    x: dq(x),
    y: dq(y),
    vx: dq(vx),
    vy: dq(vy),
    rotation: dequantizeRotation(rotation),
    ...(Array.isArray(hitboxes)
      ? {
          hitboxes: hitboxes
            .filter(Array.isArray)
            .map(([offsetX, offsetY, width, height]) => ({
              offsetX: dq(Number(offsetX)),
              offsetY: dq(Number(offsetY)),
              width: dq(Number(width)),
              height: dq(Number(height)),
            })),
        }
      : {}),
    ...(typeof hp === "number" ? { hp } : {}),
    ...(typeof maxHp === "number" ? { maxHp } : {}),
    ...(typeof alive === "boolean" ? { alive } : {}),
    ...(typeof ownerId === "number" ? { ownerId } : {}),
  };
}

function compactInventory(inventory: InventorySnapshot): unknown[] {
  return [
    inventory.resources.map((resource) => [resource.typeId, resource.amount]),
    inventory.hotbarSlots.map(compactInventorySlot),
    inventory.selectedHotbarIndex,
    inventory.unlockedRecipeTypeIds,
  ];
}

function expandInventory(value: unknown): InventorySnapshot {
  if (!Array.isArray(value)) {
    return {
      resources: [],
      hotbarSlots: [],
      selectedHotbarIndex: 0,
      unlockedRecipeTypeIds: [],
    };
  }
  const [resources, hotbarSlots, selectedHotbarIndex, unlockedRecipeTypeIds] =
    value;
  return {
    resources: Array.isArray(resources)
      ? resources.filter(Array.isArray).map(([typeId, amount]) => ({
          typeId: String(typeId) as ResourceId,
          amount: Number(amount),
        }))
      : [],
    hotbarSlots: Array.isArray(hotbarSlots)
      ? hotbarSlots.map(expandInventorySlot)
      : [],
    selectedHotbarIndex:
      typeof selectedHotbarIndex === "number" ? selectedHotbarIndex : 0,
    unlockedRecipeTypeIds: Array.isArray(unlockedRecipeTypeIds)
      ? unlockedRecipeTypeIds.map((typeId) => String(typeId) as ResourceId)
      : [],
  };
}

function compactInventorySlot(slot: InventorySlotSnapshot): unknown[] {
  if (slot.kind === "empty") {
    return [0];
  }
  if (slot.kind === "weapon") {
    return [1, compactWeapon(slot)];
  }
  return [2, slot.typeId, slot.count];
}

function expandInventorySlot(value: unknown): InventorySlotSnapshot {
  if (!Array.isArray(value)) {
    return { kind: "empty" };
  }
  const [kindCode, first, second] = value;
  if (kindCode === 1) {
    return { kind: "weapon", ...expandWeapon(first) };
  }
  if (
    kindCode === 2 &&
    typeof first === "string" &&
    typeof second === "number"
  ) {
    return { kind: "buildable", typeId: first as ResourceId, count: second };
  }
  return { kind: "empty" };
}

function compactWeapon(weapon: WeaponSnapshot): unknown[] {
  return [
    weapon.typeId,
    weapon.ownerId ?? null,
    weapon.cooldownTicksRemaining ?? null,
    weapon.ammoInMag ?? null,
    weapon.magSize ?? null,
    weapon.reserveMagCount ?? null,
    weapon.reloadTicks ?? null,
    weapon.reloadTicksRemaining ?? null,
  ];
}

function expandWeapon(value: unknown): WeaponSnapshot {
  if (!Array.isArray(value)) {
    return { typeId: "invalid:missing" };
  }
  const [
    typeId,
    ownerId,
    cooldownTicksRemaining,
    ammoInMag,
    magSize,
    reserveMagCount,
    reloadTicks,
    reloadTicksRemaining,
  ] = value;
  return {
    typeId: String(typeId) as ResourceId,
    ...(typeof ownerId === "number" ? { ownerId } : {}),
    ...(typeof cooldownTicksRemaining === "number"
      ? { cooldownTicksRemaining }
      : {}),
    ...(typeof ammoInMag === "number" ? { ammoInMag } : {}),
    ...(typeof magSize === "number" ? { magSize } : {}),
    ...(typeof reserveMagCount === "number" ? { reserveMagCount } : {}),
    ...(typeof reloadTicks === "number" ? { reloadTicks } : {}),
    ...(typeof reloadTicksRemaining === "number"
      ? { reloadTicksRemaining }
      : {}),
  };
}

function compactEquippedItem(item: EquippedItemSnapshot): unknown[] {
  return [
    item.typeId,
    item.attackStyle,
    item.cooldownTicksRemaining,
    item.ammoInMag ?? null,
    item.magSize ?? null,
    item.reserveMagCount ?? null,
    item.reloadTicks ?? null,
    item.reloadTicksRemaining ?? null,
  ];
}

function expandEquippedItem(value: unknown): EquippedItemSnapshot | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const [
    typeId,
    attackStyle,
    cooldownTicksRemaining,
    ammoInMag,
    magSize,
    reserveMagCount,
    reloadTicks,
    reloadTicksRemaining,
  ] = value;
  if (
    typeof typeId !== "string" ||
    (attackStyle !== "swing" &&
      attackStyle !== "jab" &&
      attackStyle !== "shoot") ||
    typeof cooldownTicksRemaining !== "number"
  ) {
    return undefined;
  }
  return {
    typeId: typeId as ResourceId,
    attackStyle,
    cooldownTicksRemaining,
    ...(typeof ammoInMag === "number" ? { ammoInMag } : {}),
    ...(typeof magSize === "number" ? { magSize } : {}),
    ...(typeof reserveMagCount === "number" ? { reserveMagCount } : {}),
    ...(typeof reloadTicks === "number" ? { reloadTicks } : {}),
    ...(typeof reloadTicksRemaining === "number"
      ? { reloadTicksRemaining }
      : {}),
  };
}

function compactActiveEffect(effect: ActiveEffectSnapshot): unknown[] {
  return [
    effect.typeId,
    effect.ticksRemaining,
    effect.preventsAction ?? null,
    effect.speedMultiplier === undefined ? null : q(effect.speedMultiplier),
  ];
}

function expandActiveEffect(value: unknown): ActiveEffectSnapshot | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const [typeId, ticksRemaining, preventsAction, speedMultiplier] = value;
  if (typeof typeId !== "string" || typeof ticksRemaining !== "number") {
    return null;
  }
  return {
    typeId: typeId as ResourceId,
    ticksRemaining,
    ...(typeof preventsAction === "boolean" ? { preventsAction } : {}),
    ...(typeof speedMultiplier === "number"
      ? { speedMultiplier: dq(speedMultiplier) }
      : {}),
  };
}

function compactDayNight(dayNight: WorldSnapshot["dayNight"]): unknown[] {
  return [
    dayNight.dayCount,
    dayNight.phase === "night" ? 1 : 0,
    dayNight.phaseElapsedMs,
    dayNight.dayDurationMs,
    dayNight.nightDurationMs,
    dayNight.waveEnemiesRemaining,
    dayNight.waveSpawnsPending,
    dayNight.waveThreatTotal,
  ];
}

function expandDayNight(value: unknown): WorldSnapshot["dayNight"] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const [
    dayCount,
    phase,
    phaseElapsedMs,
    dayDurationMs,
    nightDurationMs,
    waveEnemiesRemaining = 0,
    waveSpawnsPending = 0,
    waveThreatTotal = 0,
  ] = value;
  if (
    typeof dayCount !== "number" ||
    typeof phase !== "number" ||
    typeof phaseElapsedMs !== "number" ||
    typeof dayDurationMs !== "number" ||
    typeof nightDurationMs !== "number"
  ) {
    return null;
  }
  return {
    dayCount,
    phase: phase === 1 ? "night" : "day",
    phaseElapsedMs,
    dayDurationMs,
    nightDurationMs,
    waveEnemiesRemaining:
      typeof waveEnemiesRemaining === "number" ? waveEnemiesRemaining : 0,
    waveSpawnsPending:
      typeof waveSpawnsPending === "number" ? waveSpawnsPending : 0,
    waveThreatTotal: typeof waveThreatTotal === "number" ? waveThreatTotal : 0,
  };
}

function compactExtraction(extraction: WorldSnapshot["extraction"]): unknown[] {
  const stageCode = {
    locked: 0,
    active: 1,
    board_timer: 2,
    chopper_incoming: 3,
    complete: 4,
  }[extraction.stage];
  return [
    stageCode,
    extraction.lockedReason === "comms_offline" ? 0 : null,
    extraction.boardElapsedMs,
    extraction.chopperElapsedMs,
    extraction.playersOnPad,
    extraction.totalAlivePlayers,
    extraction.enemiesInRadius,
  ];
}

function expandExtraction(value: unknown): WorldSnapshot["extraction"] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const [
    stage,
    lockedReason,
    boardElapsedMs,
    chopperElapsedMs,
    playersOnPad,
    totalAlivePlayers,
    enemiesInRadius,
  ] = value;
  const stages = [
    "locked",
    "active",
    "board_timer",
    "chopper_incoming",
    "complete",
  ] as const;
  if (
    typeof stage !== "number" ||
    typeof boardElapsedMs !== "number" ||
    typeof chopperElapsedMs !== "number" ||
    typeof playersOnPad !== "number" ||
    typeof totalAlivePlayers !== "number" ||
    typeof enemiesInRadius !== "number"
  ) {
    return null;
  }
  return {
    stage: stages[stage] ?? "locked",
    ...(lockedReason === 0 ? { lockedReason: "comms_offline" as const } : {}),
    boardElapsedMs,
    chopperElapsedMs,
    playersOnPad,
    totalAlivePlayers,
    enemiesInRadius,
  };
}

function compactMap(map: MapSnapshot): unknown[] {
  return [
    map.seed,
    map.sectorSize,
    map.centerSectorId,
    map.extractionSectorId,
    map.dungeonSectorId,
    [
      q(map.dungeonBounds.minX),
      q(map.dungeonBounds.minY),
      q(map.dungeonBounds.maxX),
      q(map.dungeonBounds.maxY),
    ],
    map.militarySectorId,
    map.forestSectorId,
    map.sectors.map(compactSector),
    map.features.map(compactFeature),
    map.markers.map(compactMarker),
  ];
}

function expandMap(value: unknown): MapSnapshot | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const [
    seed,
    sectorSize,
    centerSectorId,
    extractionSectorId,
    dungeonSectorId,
    dungeonBounds,
    militarySectorId,
    forestSectorId,
    sectors,
    features,
    markers,
  ] = value;
  if (
    typeof seed !== "number" ||
    typeof sectorSize !== "number" ||
    typeof centerSectorId !== "string" ||
    typeof extractionSectorId !== "string" ||
    typeof dungeonSectorId !== "string" ||
    !Array.isArray(dungeonBounds) ||
    typeof militarySectorId !== "string" ||
    typeof forestSectorId !== "string"
  ) {
    return undefined;
  }
  return {
    seed,
    sectorSize,
    centerSectorId,
    extractionSectorId,
    dungeonSectorId,
    dungeonBounds: {
      minX: dq(Number(dungeonBounds[0])),
      minY: dq(Number(dungeonBounds[1])),
      maxX: dq(Number(dungeonBounds[2])),
      maxY: dq(Number(dungeonBounds[3])),
    },
    militarySectorId,
    forestSectorId,
    sectors: Array.isArray(sectors)
      ? sectors.map(expandSector).filter(isPresent)
      : [],
    features: Array.isArray(features)
      ? features.map(expandFeature).filter(isPresent)
      : [],
    markers: Array.isArray(markers)
      ? markers.map(expandMarker).filter(isPresent)
      : [],
  };
}

function compactSector(sector: MapSectorSnapshot): unknown[] {
  return [
    sector.id,
    sector.label,
    sector.archetype,
    sector.row,
    sector.col,
    q(sector.minX),
    q(sector.minY),
    q(sector.maxX),
    q(sector.maxY),
    sector.hasLightsOut ? 1 : 0,
  ];
}

function expandSector(value: unknown): MapSectorSnapshot | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const [id, label, archetype, row, col, minX, minY, maxX, maxY, hasLightsOut] =
    value;
  return typeof id === "string" &&
    typeof label === "string" &&
    typeof archetype === "string" &&
    typeof row === "number" &&
    typeof col === "number"
    ? {
        id,
        label,
        archetype,
        row,
        col,
        minX: dq(Number(minX)),
        minY: dq(Number(minY)),
        maxX: dq(Number(maxX)),
        maxY: dq(Number(maxY)),
        hasLightsOut: hasLightsOut === 1,
      }
    : null;
}

function compactFeature(feature: MapFeatureSnapshot): unknown[] {
  const riskCode = { low: 0, medium: 1, high: 2, boss: 3 }[feature.risk];
  return [
    feature.id,
    feature.label,
    feature.role,
    riskCode,
    feature.hasReward ? 1 : 0,
    q(feature.minX),
    q(feature.minY),
    q(feature.maxX),
    q(feature.maxY),
    q(feature.centerX),
    q(feature.centerY),
  ];
}

function expandFeature(value: unknown): MapFeatureSnapshot | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const [
    id,
    label,
    role,
    risk,
    hasReward,
    minX,
    minY,
    maxX,
    maxY,
    centerX,
    centerY,
  ] = value;
  const risks = ["low", "medium", "high", "boss"] as const;
  return typeof id === "string" &&
    typeof label === "string" &&
    typeof role === "string" &&
    typeof risk === "number"
    ? {
        id,
        label,
        role,
        risk: risks[risk] ?? "low",
        hasReward: hasReward === 1,
        minX: dq(Number(minX)),
        minY: dq(Number(minY)),
        maxX: dq(Number(maxX)),
        maxY: dq(Number(maxY)),
        centerX: dq(Number(centerX)),
        centerY: dq(Number(centerY)),
      }
    : null;
}

function compactMarker(marker: MapMarkerSnapshot): unknown[] {
  const importanceCode = {
    sector: 0,
    major: 1,
    reward: 2,
    route: 3,
  }[marker.importance];
  const compacted: unknown[] = [
    marker.id,
    marker.label,
    marker.archetype,
    importanceCode,
    marker.discoveredByDefault ? 1 : 0,
    q(marker.x),
    q(marker.y),
  ];
  if (marker.risk !== undefined || marker.tier !== undefined) {
    compacted.push(
      marker.risk === undefined
        ? null
        : ({ low: 0, medium: 1, high: 2, boss: 3 } as const)[marker.risk],
      marker.tier === undefined
        ? null
        : ({ common: 0, uncommon: 1, rare: 2, epic: 3 } as const)[marker.tier],
    );
  }
  return compacted;
}

function expandMarker(value: unknown): MapMarkerSnapshot | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const [
    id,
    label,
    archetype,
    importance,
    discoveredByDefault,
    x,
    y,
    risk,
    tier,
  ] = value;
  const importanceValues = ["sector", "major", "reward", "route"] as const;
  const riskValues = ["low", "medium", "high", "boss"] as const;
  const tierValues = ["common", "uncommon", "rare", "epic"] as const;
  return typeof id === "string" &&
    typeof label === "string" &&
    typeof archetype === "string" &&
    typeof importance === "number"
    ? {
        id,
        label,
        archetype,
        importance: importanceValues[importance] ?? "sector",
        discoveredByDefault: discoveredByDefault === 1,
        x: dq(Number(x)),
        y: dq(Number(y)),
        ...(typeof risk === "number" && riskValues[risk] !== undefined
          ? { risk: riskValues[risk] }
          : {}),
        ...(typeof tier === "number" && tierValues[tier] !== undefined
          ? { tier: tierValues[tier] }
          : {}),
      }
    : null;
}

function expandVisibility(value: unknown): WorldSnapshot["visibility"] {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const [restricted, radius, centerX, centerY] = value;
  return {
    restricted: restricted === 1,
    radius: dq(Number(radius)),
    centerX: dq(Number(centerX)),
    centerY: dq(Number(centerY)),
  };
}

function compactMinimapPlayer(player: MinimapPlayerSnapshot): unknown[] {
  return [player.id, q(player.x), q(player.y), player.alive ? 1 : 0];
}

function expandMinimapPlayer(value: unknown): MinimapPlayerSnapshot | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const [id, x, y, alive] = value;
  return typeof id === "number"
    ? { id, x: dq(Number(x)), y: dq(Number(y)), alive: alive === 1 }
    : null;
}

function compactEvents(events: readonly NetEvent[]): unknown[] {
  return events.map((event) => {
    if (event.type === "damage") {
      const payload = event.payload;
      return [
        1,
        payload.sourceId,
        payload.targetId,
        payload.targetTypeId ?? null,
        payload.amount,
        payload.remainingHp,
        payload.maxHp,
        q(payload.x),
        q(payload.y),
        payload.isFatal ? 1 : 0,
      ];
    }
    if (event.type === "explosion") {
      const payload = event.payload;
      return [
        2,
        payload.sourceId,
        q(payload.x),
        q(payload.y),
        q(payload.radius),
        payload.style,
      ];
    }
    if (event.type === "wither_beam") {
      const payload = event.payload;
      return [
        4,
        payload.sourceId,
        q(payload.x),
        q(payload.y),
        q(payload.angle),
        q(payload.length),
        q(payload.width),
      ];
    }
    if (event.type === "wither_airstrike_warning") {
      const payload = event.payload;
      return [
        5,
        q(payload.x),
        q(payload.y),
        q(payload.radius),
        payload.warningTicks,
      ];
    }
    if (event.type === "tesla_shock") {
      const payload = event.payload;
      return [
        6,
        payload.sourceId,
        q(payload.x),
        q(payload.y),
        q(payload.radius),
      ];
    }
    const payload = event.payload;
    return [
      3,
      payload.sourceId,
      q(payload.x),
      q(payload.y),
      payload.attackStyle,
    ];
  });
}

function expandEvents(value: unknown): NetEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((event): NetEvent | null => {
      if (!Array.isArray(event) || typeof event[0] !== "number") {
        return null;
      }
      if (event[0] === 1) {
        return {
          type: "damage",
          payload: {
            sourceId: Number(event[1]),
            targetId: Number(event[2]),
            ...(typeof event[3] === "string" ? { targetTypeId: event[3] } : {}),
            amount: Number(event[4]),
            remainingHp: Number(event[5]),
            maxHp: Number(event[6]),
            x: dq(Number(event[7])),
            y: dq(Number(event[8])),
            isFatal: event[9] === 1,
          },
        };
      }
      if (event[0] === 2) {
        return {
          type: "explosion",
          payload: {
            sourceId: Number(event[1]),
            x: dq(Number(event[2])),
            y: dq(Number(event[3])),
            radius: dq(Number(event[4])),
            style: String(event[5]) as ExplosionStyle,
          },
        } as NetEvent;
      }
      if (event[0] === 4) {
        return {
          type: "wither_beam",
          payload: {
            sourceId: Number(event[1]),
            x: dq(Number(event[2])),
            y: dq(Number(event[3])),
            angle: dq(Number(event[4])),
            length: dq(Number(event[5])),
            width: dq(Number(event[6])),
          },
        } as NetEvent;
      }
      if (event[0] === 5) {
        return {
          type: "wither_airstrike_warning",
          payload: {
            x: dq(Number(event[1])),
            y: dq(Number(event[2])),
            radius: dq(Number(event[3])),
            warningTicks: Number(event[4]),
          },
        } as NetEvent;
      }
      if (event[0] === 6) {
        return {
          type: "tesla_shock",
          payload: {
            sourceId: Number(event[1]),
            x: dq(Number(event[2])),
            y: dq(Number(event[3])),
            radius: dq(Number(event[4])),
          },
        } as NetEvent;
      }
      return {
        type: "attack",
        payload: {
          sourceId: Number(event[1]),
          x: dq(Number(event[2])),
          y: dq(Number(event[3])),
          attackStyle: String(event[4]) as "swing" | "jab" | "shoot",
        },
      };
    })
    .filter(isPresent);
}

function packMovement(movement: InputIntentMessage["movement"]): number {
  return (
    (movement.up ? 1 : 0) |
    (movement.down ? 2 : 0) |
    (movement.left ? 4 : 0) |
    (movement.right ? 8 : 0)
  );
}

function unpackMovement(mask: number): InputIntentMessage["movement"] {
  return {
    up: (mask & 1) !== 0,
    down: (mask & 2) !== 0,
    left: (mask & 4) !== 0,
    right: (mask & 8) !== 0,
  };
}

function q(value: number): number {
  return Math.round(value * POSITION_SCALE);
}

function dq(value: number): number {
  return value / POSITION_SCALE;
}

function quantizeRotation(value: number): number {
  return Math.round(normalizeAngle(value) * ROTATION_SCALE);
}

function dequantizeRotation(value: number): number {
  return normalizeAngle(value / ROTATION_SCALE);
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
