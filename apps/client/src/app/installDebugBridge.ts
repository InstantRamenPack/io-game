import type { GameSelectors } from "@client/app/gameSelectors.ts";
import type { HudController } from "@client/app/HudController.ts";
import type { SessionUiController } from "@client/app/session/SessionUiController.ts";
import type { GameClient } from "@client/client/GameClient.ts";
import {
  parseDebugNetworkProfileName,
  type DebugNetworkProfileName,
} from "@client/net/DebugNetworkSimulator.ts";
import { getResourceNamespace } from "@shared/ids/ResourceId.ts";
import { isJsonValue, type JsonValue } from "@shared/json.ts";

type DebugBridgeOptions = {
  gameClient: GameClient;
  selectors: GameSelectors;
  hudController: HudController;
  sessionUiController: SessionUiController;
};

/**
 * Installs opt-in browser debug globals for local development sessions.
 */
export function installDebugBridge({
  gameClient,
  selectors,
  hudController,
  sessionUiController,
}: DebugBridgeOptions): void {
  const rollingSamples: NetcodeDebugSample[] = [];

  function getInterpolationLog(): string {
    return JSON.stringify(gameClient.getInterpolationDebugLog(), null, 2);
  }

  function getNetcodeDebugMetrics(): Record<string, unknown> {
    return gameClient.getNetcodeDebugMetrics();
  }

  function setNetworkProfile(profileName: string, seed = 1): void {
    const parsedProfileName = parseDebugNetworkProfileName(profileName);
    if (!parsedProfileName) {
      throw new Error(`Unknown network profile: ${profileName}`);
    }
    gameClient.setDebugNetworkProfile(parsedProfileName, seed);
  }

  function setNetworkProfileTyped(
    profileName: DebugNetworkProfileName,
    seed = 1,
  ): void {
    gameClient.setDebugNetworkProfile(profileName, seed);
  }

  function clearInterpolationLog(): void {
    gameClient.clearInterpolationDebugLog();
  }

  function downloadInterpolationLog(): void {
    const blob = new Blob([getInterpolationLog()], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `interpolation-debug-log-${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function fetchServerLog(): Promise<JsonValue> {
    try {
      const response = await fetch("/debug-log", {
        cache: "no-store",
      });
      if (!response.ok) {
        return {
          error: `server_debug_log_http_${response.status}`,
        };
      }
      const payload: JsonValue = await response.json();
      return isJsonValue(payload)
        ? payload
        : { error: "server_debug_log_invalid_json" };
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : "server_debug_log_fetch_failed",
      };
    }
  }

  async function getLog(): Promise<string> {
    return JSON.stringify(
      {
        generatedAtMs: Date.now(),
        client: {
          interpolation: gameClient.getInterpolationDebugLog(),
          netcode: gameClient.getNetcodeDebugMetrics(),
        },
        server: await fetchServerLog(),
      },
      null,
      2,
    );
  }

  async function clearLog(): Promise<void> {
    const response = await fetch("/debug-log", {
      method: "DELETE",
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`server_debug_log_http_${response.status}`);
    }

    clearInterpolationLog();
  }

  async function downloadLog(): Promise<void> {
    const blob = new Blob([await getLog()], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `debug-log-${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function renderGameToText(): string {
    const playerEntity = selectors.getPlayerEntity();
    const worldEntities = selectors.getWorldEntities();
    const inventory = selectors.getInventory();
    const hudState = hudController.getState();
    const performanceRates = gameClient.getMeasuredRates();

    return JSON.stringify({
      mode: sessionUiController.getState().mode,
      connected: gameClient.isTransportConnected(),
      sessionReady: gameClient.isSessionReady(),
      coordinateSystem: "origin top-left; +x right; +y down",
      tick: gameClient.worldState?.latestTick ?? null,
      performance: {
        tickRate: performanceRates.tickRate,
        frameRate: performanceRates.frameRate,
      },
      playerEntityId: gameClient.playerEntityId ?? null,
      player: playerEntity
        ? {
            id: playerEntity.id,
            name: playerEntity.name ?? null,
            x: Math.round(playerEntity.x),
            y: Math.round(playerEntity.y),
            hp: playerEntity.hp,
            maxHp: playerEntity.maxHp,
          }
        : null,
      inventory: {
        resources: inventory?.resources ?? [],
        selectedHotbarIndex: inventory?.selectedHotbarIndex ?? 0,
        hotbarSlots: (inventory?.hotbarSlots ?? []).map((slot, slotIndex) => ({
          ...slot,
          label:
            slot.kind === "weapon" || slot.kind === "buildable"
              ? selectors.formatTypeLabel(slot.typeId)
              : "Empty",
          active: slotIndex === (inventory?.selectedHotbarIndex ?? 0),
        })),
      },
      ui: {
        craftingMenuOpen: hudState.craftingMenuOpen,
        inventoryOpen: hudState.inventoryOpen,
        selectedCraft: hudState.selectedCraft,
        previewedCraft: hudState.previewedCraft,
        hoveredInventorySlotRef: hudState.hoveredInventorySlotRef,
        heldInventorySlotRef: hudState.heldInventorySlotRef,
      },
      buildings: worldEntities
        .filter((entity) => {
          const namespace = getResourceNamespace(entity.typeId);
          return namespace === "building" || namespace === "tower";
        })
        .map((entity) => ({
          id: entity.id,
          label:
            entity.label ??
            entity.name ??
            selectors.formatTypeLabel(entity.typeId),
          x: Math.round(entity.x),
          y: Math.round(entity.y),
          typeId: entity.typeId,
          buildingType: selectors.getTypePath(entity.typeId),
        })),
      structures: worldEntities
        .filter((entity) => getResourceNamespace(entity.typeId) === "structure")
        .map((entity) => ({
          id: entity.id,
          label:
            entity.label ??
            entity.name ??
            selectors.formatTypeLabel(entity.typeId),
          x: Math.round(entity.x),
          y: Math.round(entity.y),
          typeId: entity.typeId,
          structureType: selectors.getTypePath(entity.typeId),
        })),
      enemies: worldEntities
        .filter((entity) => getResourceNamespace(entity.typeId) === "enemy")
        .map((entity) => ({
          id: entity.id,
          x: Math.round(entity.x),
          y: Math.round(entity.y),
          hp: entity.hp,
          maxHp: entity.maxHp,
        })),
      projectiles: worldEntities
        .filter(
          (entity) => getResourceNamespace(entity.typeId) === "projectile",
        )
        .map((entity) => ({
          id: entity.id,
          x: Math.round(entity.x),
          y: Math.round(entity.y),
        })),
      events: gameClient.worldState?.clientWorld?.events ?? [],
    });
  }

  window.render_game_to_text = renderGameToText;
  window.advanceTime = (ms: number) => {
    gameClient.advanceTime(ms);
    hudController.refreshUi();
  };
  window.get_log = getLog;
  window.clear_log = clearLog;
  window.download_log = downloadLog;
  window.get_interpolation_debug_log = getInterpolationLog;
  window.clear_interpolation_debug_log = clearInterpolationLog;
  window.download_interpolation_debug_log = downloadInterpolationLog;
  window.get_netcode_debug_metrics = getNetcodeDebugMetrics;
  window.__NETCODE_DEBUG__ = {
    getMetrics: getNetcodeDebugMetrics,
    setNetworkProfile,
    setProfile: setNetworkProfileTyped,
    disableNetworkSimulation: () => gameClient.disableDebugNetworkSimulation(),
  };
  installNetcodeDebugOverlay();

  function installNetcodeDebugOverlay(): void {
    const params = new URLSearchParams(window.location.search);
    if (params.get("netDebug") !== "1") {
      return;
    }
    const scenario = params.get("netScenario") ?? "idle";

    const overlay = document.createElement("pre");
    overlay.id = "netcode-debug-overlay";
    overlay.style.position = "fixed";
    overlay.style.left = "12px";
    overlay.style.top = "12px";
    overlay.style.zIndex = "10000";
    overlay.style.margin = "0";
    overlay.style.padding = "8px 10px";
    overlay.style.maxWidth = "420px";
    overlay.style.maxHeight = "260px";
    overlay.style.overflow = "auto";
    overlay.style.background = "rgba(0, 0, 0, 0.72)";
    overlay.style.color = "#e8fff1";
    overlay.style.font = "12px/1.35 ui-monospace, SFMono-Regular, monospace";
    overlay.style.pointerEvents = "none";
    overlay.textContent = "netcode debug initializing";
    document.body.appendChild(overlay);
    let logCounter = 0;

    window.setInterval(() => {
      const metrics = gameClient.getNetcodeDebugMetrics();
      recordNetcodeSample(metrics, performance.now());
      overlay.textContent = formatNetcodeOverlay(metrics, summarizeSamples());
      logCounter += 1;
      if (logCounter % 4 === 0) {
        console.warn(`[netcode]\n${overlay.textContent}`);
      }
    }, 250);
    installNetcodeScenario(scenario);
  }

  function installNetcodeScenario(scenario: string): void {
    if (scenario === "idle") {
      return;
    }
    const startedAtMs = performance.now();
    let collisionSpawnSent = false;
    let deathSent = false;
    let respawnSent = false;
    window.setInterval(() => {
      const elapsedMs = performance.now() - startedAtMs;
      switch (scenario) {
        case "right":
          gameClient.setDebugMovementIntent({ right: true });
          break;
        case "diagonal":
          gameClient.setDebugMovementIntent({ right: true, down: true });
          break;
        case "startstop":
          gameClient.setDebugMovementIntent(
            Math.floor(elapsedMs / 1500) % 2 === 0 ? { right: true } : {},
          );
          break;
        case "directions": {
          const phase = Math.floor(elapsedMs / 750) % 4;
          const movement =
            phase === 0
              ? { right: true }
              : phase === 1
                ? { down: true }
                : phase === 2
                  ? { left: true }
                  : { up: true };
          gameClient.setDebugMovementIntent(movement);
          break;
        }
        case "collision":
          if (!collisionSpawnSent && gameClient.isSessionReady()) {
            gameClient.sendChat("/spawn building:wall 1 5064 3500 0");
            collisionSpawnSent = true;
          }
          gameClient.setDebugMovementIntent({ right: true });
          break;
        case "deathrespawn":
          if (!deathSent && elapsedMs > 1500 && gameClient.isSessionReady()) {
            gameClient.sendChat("/kill @a");
            deathSent = true;
          }
          if (!respawnSent && elapsedMs > 3500) {
            gameClient.requestRespawn();
            respawnSent = true;
          }
          break;
      }
    }, 50);
  }

  function recordNetcodeSample(
    metrics: Record<string, unknown>,
    nowMs: number,
  ): void {
    const camera = asRecord(metrics.camera);
    const localPlayerScreenPosition = asRecord(
      metrics.localPlayerScreenPosition,
    );
    const correctionDirection = asRecord(metrics.correctionDirection);
    rollingSamples.push({
      timeMs: nowMs,
      cameraX: asNumber(camera.x),
      cameraY: asNumber(camera.y),
      localScreenX: asNumber(localPlayerScreenPosition.x),
      localScreenY: asNumber(localPlayerScreenPosition.y),
      correctionDirectionX: asNumber(correctionDirection.x),
      correctionDirectionY: asNumber(correctionDirection.y),
      snapCount: asNumber(metrics.snapCount),
      extrapolatedFrameCount: asNumber(metrics.extrapolatedFrameCount),
    });
    const cutoff = nowMs - 3000;
    while (rollingSamples.length > 0) {
      const first = rollingSamples[0];
      if (!first || first.timeMs >= cutoff) {
        break;
      }
      rollingSamples.shift();
    }
  }

  function summarizeSamples(): NetcodeDebugSummary {
    if (rollingSamples.length < 2) {
      return {
        sampleCount: rollingSamples.length,
        localScreenRmsCssPx: 0,
        cameraResidualRmsCssPx: 0,
        correctionFlipStreak: 0,
        snapsInWindow: 0,
        extrapolatedFramesInWindow: 0,
      };
    }

    const first = rollingSamples[0];
    const last = rollingSamples[rollingSamples.length - 1];
    if (!first || !last) {
      return {
        sampleCount: 0,
        localScreenRmsCssPx: 0,
        cameraResidualRmsCssPx: 0,
        correctionFlipStreak: 0,
        snapsInWindow: 0,
        extrapolatedFramesInWindow: 0,
      };
    }

    return {
      sampleCount: rollingSamples.length,
      localScreenRmsCssPx: computePositionRms(
        rollingSamples.map((sample) => ({
          x: sample.localScreenX,
          y: sample.localScreenY,
        })),
      ),
      cameraResidualRmsCssPx: computeLinearPathResidualRms(
        rollingSamples.map((sample) => ({
          timeMs: sample.timeMs,
          x: sample.cameraX,
          y: sample.cameraY,
        })),
      ),
      correctionFlipStreak: computeCorrectionFlipStreak(rollingSamples),
      snapsInWindow: last.snapCount - first.snapCount,
      extrapolatedFramesInWindow:
        last.extrapolatedFrameCount - first.extrapolatedFrameCount,
    };
  }

  function formatNetcodeOverlay(
    metrics: Record<string, unknown>,
    summary: NetcodeDebugSummary,
  ): string {
    const networkSimulation = asRecord(metrics.networkSimulation);
    const inbound = asRecord(networkSimulation.inbound);
    const profile = asRecord(inbound.profile);
    const cameraPosition = asRecord(metrics.cameraPosition);
    const cameraDelta = asRecord(metrics.cameraDelta);
    const localPlayer = asRecord(metrics.localPlayer);
    return [
      `NET ${String(profile.name ?? "none")} seed=${String(inbound.seed ?? "")}`,
      `tick=${String(metrics.serverTick)} latest=${String(metrics.latestReceivedSnapshotTick)} render=${formatNumber(metrics.renderTick)}`,
      `mode=${String(metrics.interpolationMode)} delay=${formatNumber(metrics.renderDelayTicks)} jitterMs=${formatNumber(metrics.jitterEstimateMs)}`,
      `server=(${formatNumber(localPlayer.authoritativeX)}, ${formatNumber(localPlayer.authoritativeY)}) render=(${formatNumber(localPlayer.renderedX)}, ${formatNumber(localPlayer.renderedY)})`,
      `camera=(${formatNumber(cameraPosition.x)}, ${formatNumber(cameraPosition.y)}) d=(${formatNumber(cameraDelta.screenX)}, ${formatNumber(cameraDelta.screenY)})`,
      `localScreenRmsCssPx=${summary.localScreenRmsCssPx.toFixed(3)} cameraResidualRmsCssPx=${summary.cameraResidualRmsCssPx.toFixed(3)}`,
      `snaps3s=${summary.snapsInWindow} extrapFrames3s=${summary.extrapolatedFramesInWindow} flipStreak=${summary.correctionFlipStreak}`,
      `dup=${String(metrics.duplicateSnapshotCount)} outOfOrder=${String(metrics.outOfOrderSnapshotCount)} samples=${summary.sampleCount}`,
    ].join("\n");
  }
}

type NetcodeDebugSample = {
  timeMs: number;
  cameraX: number;
  cameraY: number;
  localScreenX: number;
  localScreenY: number;
  correctionDirectionX: number;
  correctionDirectionY: number;
  snapCount: number;
  extrapolatedFrameCount: number;
};

type NetcodeDebugSummary = {
  sampleCount: number;
  localScreenRmsCssPx: number;
  cameraResidualRmsCssPx: number;
  correctionFlipStreak: number;
  snapsInWindow: number;
  extrapolatedFramesInWindow: number;
};

function computePositionRms(points: Array<{ x: number; y: number }>): number {
  if (points.length === 0) {
    return 0;
  }
  const meanX =
    points.reduce((total, point) => total + point.x, 0) / points.length;
  const meanY =
    points.reduce((total, point) => total + point.y, 0) / points.length;
  return Math.sqrt(
    points.reduce((total, point) => {
      const dx = point.x - meanX;
      const dy = point.y - meanY;
      return total + dx * dx + dy * dy;
    }, 0) / points.length,
  );
}

function computeLinearPathResidualRms(
  points: Array<{ timeMs: number; x: number; y: number }>,
): number {
  return Math.hypot(
    computeLinearResidualRms(
      points.map((point) => ({ timeMs: point.timeMs, value: point.x })),
    ),
    computeLinearResidualRms(
      points.map((point) => ({ timeMs: point.timeMs, value: point.y })),
    ),
  );
}

function computeLinearResidualRms(
  points: Array<{ timeMs: number; value: number }>,
): number {
  if (points.length < 2) {
    return 0;
  }
  const meanTime =
    points.reduce((total, point) => total + point.timeMs, 0) / points.length;
  const meanValue =
    points.reduce((total, point) => total + point.value, 0) / points.length;
  let covariance = 0;
  let variance = 0;
  for (const point of points) {
    const timeOffset = point.timeMs - meanTime;
    covariance += timeOffset * (point.value - meanValue);
    variance += timeOffset * timeOffset;
  }
  const slope = variance <= Number.EPSILON ? 0 : covariance / variance;
  const intercept = meanValue - slope * meanTime;
  return Math.sqrt(
    points.reduce((total, point) => {
      const residual = point.value - (slope * point.timeMs + intercept);
      return total + residual * residual;
    }, 0) / points.length,
  );
}

function computeCorrectionFlipStreak(
  samples: readonly NetcodeDebugSample[],
): number {
  let lastSign = 0;
  let currentStreak = 0;
  let maxStreak = 0;
  for (const sample of samples) {
    const dominantDirection =
      Math.abs(sample.correctionDirectionX) >=
      Math.abs(sample.correctionDirectionY)
        ? sample.correctionDirectionX
        : sample.correctionDirectionY;
    const sign = Math.sign(dominantDirection);
    if (sign !== 0 && lastSign !== 0 && sign !== lastSign) {
      currentStreak += 1;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else if (sign !== 0) {
      currentStreak = 0;
    }
    if (sign !== 0) {
      lastSign = sign;
    }
  }
  return maxStreak;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatNumber(value: unknown): string {
  return asNumber(value).toFixed(2);
}

declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (ms: number) => void;
    get_log: () => Promise<string>;
    clear_log: () => Promise<void>;
    download_log: () => Promise<void>;
    get_interpolation_debug_log: () => string;
    clear_interpolation_debug_log: () => void;
    download_interpolation_debug_log: () => void;
    get_netcode_debug_metrics: () => Record<string, unknown>;
    __NETCODE_DEBUG__: {
      getMetrics: () => Record<string, unknown>;
      setNetworkProfile: (profileName: string, seed?: number) => void;
      setProfile: (profileName: DebugNetworkProfileName, seed?: number) => void;
      disableNetworkSimulation: () => void;
    };
  }
}
