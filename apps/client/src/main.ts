import "../index.css";
import {
  AuthController,
  createAuthGateViewState,
  type RuntimeConfig,
} from "@client/auth/Auth.ts";
import { GameClient } from "@client/client/GameClient.ts";
import { DEBUG_HITBOX, DEBUG_INTERPOLATION_MODE } from "@client/debug.ts";
import type { ClientEntity } from "@client/net/ClientEntity.ts";
import { GameConfig } from "@shared/config/GameConfig.ts";
import { getResourceNamespace } from "@shared/ids/ResourceId.ts";

type MenuMode = "play" | "loadout" | "settings" | "account";
type BuildChoice = "wall" | "tower" | "windmill" | "crafting_station";
type RecipeDefinition = {
  key: BuildChoice;
  label: string;
  itemTypeId: string;
  costs: Array<{ typeId: string; amount: number }>;
  hint: string;
};

const titles: Record<MenuMode, string> = {
  play: "OUTBREAK SECTOR",
  loadout: "LOADOUT",
  settings: "SETTINGS",
  account: "ACCOUNT",
};

const BUILD_RECIPES: Record<BuildChoice, RecipeDefinition> = {
  wall: {
    key: "wall",
    label: "Wall Item",
    itemTypeId: "item:wall",
    costs: [
      { typeId: "item:wood", amount: 20 },
      { typeId: "item:stone", amount: 6 },
    ],
    hint: "Fast perimeter coverage. Cheap and disposable.",
  },
  tower: {
    key: "tower",
    label: "Tower Item",
    itemTypeId: "item:tower",
    costs: [
      { typeId: "item:wood", amount: 35 },
      { typeId: "item:stone", amount: 30 },
    ],
    hint: "High ground pressure for outer lanes.",
  },
  windmill: {
    key: "windmill",
    label: "Windmill Item",
    itemTypeId: "item:windmill",
    costs: [
      { typeId: "item:wood", amount: 45 },
      { typeId: "item:stone", amount: 20 },
    ],
    hint: "Economy piece. Best tucked behind walls.",
  },
  crafting_station: {
    key: "crafting_station",
    label: "Crafting Station Item",
    itemTypeId: "item:crafting_station",
    costs: [
      { typeId: "item:wood", amount: 30 },
      { typeId: "item:stone", amount: 12 },
    ],
    hint: "Unlocks deeper crafting near base center.",
  },
};

const BUILD_ORDER: BuildChoice[] = [
  "wall",
  "tower",
  "windmill",
  "crafting_station",
];

const RESOURCE_TYPE_IDS = ["item:wood", "item:stone", "item:food"] as const;
const HOTBAR_SLOT_COUNT = 9;
const PLAYER_NAME_STORAGE_KEY = "zombs-player-name";

const ITEM_LABELS: Record<string, string> = {
  "item:basic_gun": "Gun",
  "item:basic_sword": "Sword",
  "item:zombie_sword": "Zombie Sword",
  "item:food": "Food",
  "item:wood": "Wood",
  "item:stone": "Stone",
  "item:wall": "Wall Item",
  "item:tower": "Tower Item",
  "item:windmill": "Windmill Item",
  "item:crafting_station": "Crafting Station Item",
  "building:wall": "Wall",
  "building:tower": "Tower",
  "building:windmill": "Windmill",
  "building:crafting_station": "Crafting Station",
};

const hudState = {
  buildMenuOpen: false,
  craftingMenuOpen: false,
  selectedBuild: "wall" as BuildChoice,
};

let currentMode: MenuMode = "play";
let runtimeStatusTimer: number | undefined;

const titleEl = document.getElementById("menu-title");
const sideButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>(".side-menu button"),
);
const launchBtn = document.getElementById("launch-btn");
const accountGate = document.getElementById("account-gate");
const accountGateText = document.getElementById("account-gate-text");
const accountBtn = document.getElementById("account-btn");
const googleSignInTarget = document.getElementById("google-signin-target");
const menuRoot = document.querySelector<HTMLElement>('[data-screen="menu"]');
const gameRoot = document.getElementById("game-root");
const hudRoot = document.getElementById("hud-root");
const worldStat = document.getElementById("world-stat");
const worldDetail = document.getElementById("world-detail");
const resourceStrip = document.getElementById("resource-strip");
const effectStrip = document.getElementById("effect-strip");
const hotbarList = document.getElementById("hotbar-list");
const placementPanel = document.getElementById("placement-panel");
const buildList = document.getElementById("build-list");
const buildHint = document.getElementById("build-hint");
const craftingPanel = document.getElementById("crafting-panel");
const craftingList = document.getElementById("crafting-list");
const craftingHint = document.getElementById("crafting-hint");
const runtimeStatus = document.getElementById("runtime-status");
const playerNameInput = document.getElementById(
  "player-name-input",
) as HTMLInputElement | null;

const gameConfig = new GameConfig();
const gameClient = new GameClient(gameConfig, {
  debugHitbox: DEBUG_HITBOX,
  debugInterpolationMode: DEBUG_INTERPOLATION_MODE,
});
const authController = new AuthController();
gameClient.bindInput(window);

function createDefaultPlayerName(): string {
  return `Player-${Math.floor(100 + Math.random() * 900)}`;
}

function loadInitialPlayerName(): string {
  const storedPlayerName = window.localStorage
    .getItem(PLAYER_NAME_STORAGE_KEY)
    ?.trim();
  return storedPlayerName || createDefaultPlayerName();
}

function resolvePlayerName(): string {
  const rawPlayerName = playerNameInput?.value ?? "";
  const trimmedPlayerName = rawPlayerName.trim();
  const nextPlayerName = trimmedPlayerName || createDefaultPlayerName();
  window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, nextPlayerName);
  if (playerNameInput) {
    playerNameInput.value = nextPlayerName;
  }
  return nextPlayerName;
}

function getTypePath(typeId: string): string {
  const [, path = typeId] = typeId.split(":");
  return path;
}

function formatTypeLabel(typeId: string): string {
  const overrideLabel = ITEM_LABELS[typeId];
  if (overrideLabel) {
    return overrideLabel;
  }

  const baseLabel = getTypePath(typeId).split("/").pop() ?? typeId;
  return baseLabel
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getWorldEntities(): ClientEntity[] {
  return [...(gameClient.worldState?.clientWorld?.entities.values() ?? [])];
}

function getPlayerEntity(): ClientEntity | undefined {
  if (gameClient.playerEntityId === undefined) {
    return undefined;
  }

  return gameClient.worldState?.clientWorld?.entities.get(
    gameClient.playerEntityId,
  );
}

function getTrackedBuildings(): ClientEntity[] {
  return getWorldEntities().filter(
    (entity) => getResourceNamespace(entity.typeId) === "building",
  );
}

function getInventoryStacks() {
  return getPlayerEntity()?.inventory ?? [];
}

function countInventoryType(typeId: string): number {
  return getInventoryStacks().reduce((total, stack) => {
    if (!stack || stack.typeId !== typeId) {
      return total;
    }
    return total + stack.stackSize;
  }, 0);
}

function hasRecipeResources(recipe: RecipeDefinition): boolean {
  return recipe.costs.every(
    (cost) => countInventoryType(cost.typeId) >= cost.amount,
  );
}

function formatCosts(costs: Array<{ typeId: string; amount: number }>): string {
  return costs
    .map((cost) => `${cost.amount} ${formatTypeLabel(cost.typeId)}`)
    .join(" / ");
}

function getActiveEffects(): string[] {
  const activeEffectPayload = getPlayerEntity()?.data?.activeEffects;
  if (
    Array.isArray(activeEffectPayload) &&
    activeEffectPayload.every((entry) => typeof entry === "string")
  ) {
    return [...activeEffectPayload];
  }
  return [];
}

function syncGoogleSignInButton(): void {
  if (!accountBtn || !googleSignInTarget) {
    return;
  }

  const fallbackButton = accountBtn as HTMLButtonElement;
  const shouldShowGoogleButton = authController.canRenderGoogleButton();

  fallbackButton.hidden = shouldShowGoogleButton;
  googleSignInTarget.hidden = !shouldShowGoogleButton;

  if (shouldShowGoogleButton) {
    authController.renderGoogleButton(googleSignInTarget);
  }
}

function refreshGateUi(): void {
  if (!launchBtn || !accountGate || !accountGateText || !accountBtn) {
    return;
  }

  const authState = authController.getState();
  const gateView = createAuthGateViewState(authState);
  const deployButton = launchBtn as HTMLButtonElement;
  const createButton = accountBtn as HTMLButtonElement;

  accountGate.classList.toggle("ok", gateView.showReadyState);
  accountGateText.textContent = gateView.gateText;
  createButton.textContent = gateView.accountButtonText;
  createButton.disabled = gateView.accountButtonDisabled;
  deployButton.disabled = gateView.deployButtonDisabled;

  syncGoogleSignInButton();
}

function updateMode(mode: MenuMode): void {
  currentMode = mode;
  if (titleEl) {
    titleEl.textContent = titles[mode];
  }
  sideButtons.forEach((button) => {
    button.setAttribute(
      "aria-current",
      button.dataset.view === mode ? "true" : "false",
    );
  });
}

function refreshHudUi(): void {
  if (!hudRoot) {
    return;
  }

  const playerEntity = getPlayerEntity();
  const worldEntities = getWorldEntities();
  const buildings = getTrackedBuildings();
  const activeEffects = getActiveEffects();

  if (worldStat) {
    worldStat.textContent = playerEntity
      ? `${playerEntity.name ?? "Survivor"}  HP ${playerEntity.hp ?? 0}/${playerEntity.maxHp ?? 0}`
      : "Awaiting welcome packet...";
  }

  if (worldDetail) {
    worldDetail.textContent = `Tick ${gameClient.worldState?.latestTick ?? 0} // ${buildings.length} structures // ${worldEntities.length} entities`;
  }

  if (resourceStrip) {
    resourceStrip.innerHTML = RESOURCE_TYPE_IDS.map((typeId) => {
      return `
        <div class="resource-chip">
          <strong>${countInventoryType(typeId)}</strong>
          <span>${escapeHtml(formatTypeLabel(typeId))}</span>
        </div>
      `;
    }).join("");
  }

  if (effectStrip) {
    const effects =
      activeEffects.length > 0 ? activeEffects : ["No active buffs"];
    effectStrip.innerHTML = effects
      .map((effect) => {
        return `
          <div class="effect-chip">
            <strong>${escapeHtml(effect)}</strong>
            <span>${effect === "No active buffs" ? "Status" : "Aura"}</span>
          </div>
        `;
      })
      .join("");
  }

  if (hotbarList) {
    hotbarList.innerHTML = Array.from(
      { length: HOTBAR_SLOT_COUNT },
      (_, slotIndex) => {
        const stack = getInventoryStacks()[slotIndex] ?? null;
        if (!stack) {
          return `
            <div class="hotbar-slot">
              <div class="slot-index">Slot ${slotIndex + 1}</div>
              <div class="slot-label">Empty</div>
            </div>
          `;
        }

        const isActive = playerEntity?.activeSlot === slotIndex;
        return `
          <div class="hotbar-slot${isActive ? " active" : ""}">
            <div class="slot-index">Slot ${slotIndex + 1}</div>
            <div class="slot-label">${escapeHtml(formatTypeLabel(stack.typeId))}</div>
            <div class="slot-count">x${stack.stackSize}</div>
          </div>
        `;
      },
    ).join("");
  }

  if (placementPanel) {
    placementPanel.hidden = !hudState.buildMenuOpen;
  }

  if (buildList) {
    buildList.innerHTML = BUILD_ORDER.map((buildKey, index) => {
      const recipe = BUILD_RECIPES[buildKey];
      const availableCount = countInventoryType(recipe.itemTypeId);
      return `
        <div class="build-card${hudState.selectedBuild === buildKey ? " selected" : ""}${availableCount > 0 ? "" : " locked"}">
          <div class="build-meta">${index + 1} // ${availableCount > 0 ? `${availableCount} ready` : "Out of stock"}</div>
          <div class="build-title">${escapeHtml(recipe.label)}</div>
          <div class="build-cost">${escapeHtml(formatCosts(recipe.costs))}</div>
        </div>
      `;
    }).join("");
  }

  if (buildHint) {
    const selectedRecipe = BUILD_RECIPES[hudState.selectedBuild];
    const availableCount = countInventoryType(selectedRecipe.itemTypeId);
    buildHint.textContent = `${selectedRecipe.hint}  ${availableCount} in inventory. Press 1-4 while this panel is open to switch selection.`;
  }

  if (craftingPanel) {
    craftingPanel.hidden = !hudState.craftingMenuOpen;
  }

  if (craftingList) {
    craftingList.innerHTML = BUILD_ORDER.map((buildKey) => {
      const recipe = BUILD_RECIPES[buildKey];
      const available = hasRecipeResources(recipe);
      return `
        <div class="recipe-card${available ? "" : " locked"}">
          <div class="recipe-meta">${available ? "Craftable" : "Missing materials"}</div>
          <div class="recipe-title">${escapeHtml(recipe.label)}</div>
          <div class="recipe-cost">${escapeHtml(formatCosts(recipe.costs))}</div>
        </div>
      `;
    }).join("");
  }

  if (craftingHint) {
    const nearbyLabels = buildings
      .map((entity) => entity.name ?? formatTypeLabel(entity.typeId))
      .slice(0, 3)
      .join(", ");
    craftingHint.textContent =
      nearbyLabels.length > 0
        ? `Nearby structures: ${nearbyLabels}`
        : "Build a crafting station near your base core to expand recipes.";
  }
}

function refreshRuntimeStatus(): void {
  if (!runtimeStatus) {
    return;
  }

  const hudStateSnapshot = gameClient.getGameplayHudState();
  if (!hudStateSnapshot) {
    runtimeStatus.textContent = [
      "Weapon Syncing...",
      "Ammo Awaiting snapshot",
      "Slots 1 Sword  2 Gun",
      "Fire Left click",
      "B Build  C Craft",
    ].join("\n");
    refreshHudUi();
    return;
  }

  const ammoLine = hudStateSnapshot.reloadTicksRemaining
    ? `Reload ${hudStateSnapshot.reloadTicksRemaining} ticks`
    : hudStateSnapshot.ammoLabel
      ? `Ammo ${hudStateSnapshot.ammoLabel}`
      : "Ammo Melee";

  runtimeStatus.textContent = [
    `Weapon ${hudStateSnapshot.activeWeaponLabel}`,
    ammoLine,
    `Slots ${hudStateSnapshot.slotLabels.join("  ")}`,
    "Fire Left click",
    "B Build  C Craft",
  ].join("\n");
  refreshHudUi();
}

function startRuntimeStatus(): void {
  if (!runtimeStatus) {
    return;
  }

  runtimeStatus.hidden = false;
  refreshRuntimeStatus();
  if (runtimeStatusTimer !== undefined) {
    window.clearInterval(runtimeStatusTimer);
  }
  runtimeStatusTimer = window.setInterval(refreshRuntimeStatus, 50);
}

function stopRuntimeStatus(): void {
  if (!runtimeStatus) {
    return;
  }

  if (runtimeStatusTimer !== undefined) {
    window.clearInterval(runtimeStatusTimer);
    runtimeStatusTimer = undefined;
  }
  runtimeStatus.hidden = true;
  runtimeStatus.textContent = "";
}

if (playerNameInput) {
  playerNameInput.value = loadInitialPlayerName();
}

sideButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const requested = button.dataset.view as MenuMode | undefined;
    if (!requested) {
      return;
    }
    updateMode(requested);
  });
});

window.addEventListener("keydown", (event) => {
  if (event.repeat || menuRoot?.style.display !== "none") {
    return;
  }

  const activeTag = document.activeElement?.tagName;
  if (
    activeTag === "INPUT" ||
    activeTag === "SELECT" ||
    activeTag === "TEXTAREA"
  ) {
    return;
  }

  const key = event.key.toLowerCase();
  if (key === "b") {
    hudState.buildMenuOpen = !hudState.buildMenuOpen;
    refreshHudUi();
    return;
  }

  if (key === "c") {
    hudState.craftingMenuOpen = !hudState.craftingMenuOpen;
    refreshHudUi();
    return;
  }

  if (hudState.buildMenuOpen && ["1", "2", "3", "4"].includes(key)) {
    hudState.selectedBuild =
      BUILD_ORDER[Number(key) - 1] ?? hudState.selectedBuild;
    refreshHudUi();
  }
});

launchBtn?.addEventListener("click", () => {
  if (authController.getState().authMode === "none") {
    authController.activateGuest();
  }

  const button = launchBtn as HTMLButtonElement;
  button.textContent = "Connecting...";
  button.disabled = true;
  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
  const token = authController.getLaunchToken();
  const playerName = resolvePlayerName();

  if (!gameRoot) {
    if (accountGateText) {
      accountGateText.textContent = "Game root is unavailable.";
    }
    button.textContent = "Deploy";
    button.disabled = false;
    return;
  }

  void gameClient
    .initRenderer(gameRoot)
    .then(() => {
      gameClient.start(wsUrl, {
        googleIdToken: token,
        playerName,
      });
    })
    .catch(() => {
      if (accountGateText) {
        accountGateText.textContent =
          "Renderer failed to load. Check network and refresh.";
      }
      button.textContent = "Deploy";
      button.disabled = false;
    });
});

accountBtn?.addEventListener("click", () => {
  const authState = authController.getState();
  if (authState.authMode === "google") {
    return;
  }
  if (!authState.initialized) {
    return;
  }
  if (!googleSignInTarget?.hidden) {
    return;
  }
  authController.promptGoogleSignIn();
});

authController.onChange((authState) => {
  if (
    (authState.authMode === "google" || authState.authMode === "guest") &&
    currentMode === "account"
  ) {
    updateMode("play");
  }
  refreshGateUi();
});

gameClient.networkClient.onOpen(() => {
  if (gameRoot) {
    gameRoot.hidden = false;
  }
  if (hudRoot) {
    hudRoot.hidden = false;
  }
  startRuntimeStatus();
  if (menuRoot) {
    menuRoot.style.display = "none";
  }
  if (launchBtn) {
    const button = launchBtn as HTMLButtonElement;
    button.textContent = "Connected";
    button.disabled = true;
  }
  refreshHudUi();
});

gameClient.networkClient.onClose(() => {
  stopRuntimeStatus();
  hudState.buildMenuOpen = false;
  hudState.craftingMenuOpen = false;
  if (launchBtn) {
    const button = launchBtn as HTMLButtonElement;
    button.textContent = "Deploy";
    button.disabled = false;
  }
  if (gameRoot) {
    gameRoot.hidden = true;
  }
  if (hudRoot) {
    hudRoot.hidden = true;
  }
  if (menuRoot) {
    menuRoot.style.display = "";
  }
  refreshHudUi();
});

gameClient.networkClient.onError((message) => {
  stopRuntimeStatus();
  if (authController.handleNetworkError(message)) {
    updateMode("account");
  }

  hudState.buildMenuOpen = false;
  hudState.craftingMenuOpen = false;

  if (message === "socket_error" && accountGateText) {
    accountGateText.textContent =
      "Connection failed before gameplay started. Check the server and refresh.";
  }

  if (launchBtn) {
    const button = launchBtn as HTMLButtonElement;
    button.textContent = "Deploy";
    button.disabled = false;
  }
  if (hudRoot) {
    hudRoot.hidden = true;
  }
  refreshGateUi();
  refreshHudUi();
});

refreshGateUi();
void authController.initialize((runtimeConfig: RuntimeConfig) => {
  if (
    typeof runtimeConfig.protocolVersion === "number" &&
    Number.isFinite(runtimeConfig.protocolVersion)
  ) {
    gameConfig.protocolVersion = runtimeConfig.protocolVersion;
  }

  if (
    typeof runtimeConfig.tickRate === "number" &&
    Number.isFinite(runtimeConfig.tickRate) &&
    runtimeConfig.tickRate > 0
  ) {
    gameConfig.tickRate = Math.floor(runtimeConfig.tickRate);
  }

  if (
    runtimeConfig.worldSize &&
    Number.isFinite(runtimeConfig.worldSize.w) &&
    Number.isFinite(runtimeConfig.worldSize.h) &&
    runtimeConfig.worldSize.w > 0 &&
    runtimeConfig.worldSize.h > 0
  ) {
    gameClient.setWorldSize({
      w: runtimeConfig.worldSize.w,
      h: runtimeConfig.worldSize.h,
    });
  }
});

function renderGameToText(): string {
  const playerEntity = getPlayerEntity();
  const worldEntities = getWorldEntities();

  return JSON.stringify({
    mode: menuRoot?.style.display === "none" ? "game" : "menu",
    connected:
      gameClient.networkClient.socket?.readyState === WebSocket.OPEN &&
      menuRoot?.style.display === "none",
    coordinateSystem: "origin top-left; +x right; +y down",
    tick: gameClient.worldState?.latestTick ?? null,
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
    resources: {
      wood: countInventoryType("item:wood"),
      stone: countInventoryType("item:stone"),
      food: countInventoryType("item:food"),
      wallItems: countInventoryType("item:wall"),
      towerItems: countInventoryType("item:tower"),
      windmillItems: countInventoryType("item:windmill"),
      craftingStationItems: countInventoryType("item:crafting_station"),
    },
    ui: {
      buildingMenuOpen: hudState.buildMenuOpen,
      craftingMenuOpen: hudState.craftingMenuOpen,
      selectedBuild: hudState.selectedBuild,
    },
    buildings: worldEntities
      .filter((entity) => getResourceNamespace(entity.typeId) === "building")
      .map((entity) => ({
        id: entity.id,
        label: entity.name ?? formatTypeLabel(entity.typeId),
        x: Math.round(entity.x),
        y: Math.round(entity.y),
        typeId: entity.typeId,
        buildingType: getTypePath(entity.typeId),
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
      .filter((entity) => getResourceNamespace(entity.typeId) === "projectile")
      .map((entity) => ({
        id: entity.id,
        x: Math.round(entity.x),
        y: Math.round(entity.y),
      })),
  });
}

window.render_game_to_text = renderGameToText;
window.advanceTime = (ms: number) => {
  gameClient.advanceTime(ms);
  refreshHudUi();
};

declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (ms: number) => void;
  }
}
