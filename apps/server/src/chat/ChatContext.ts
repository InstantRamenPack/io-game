import type { NetworkServerLike } from "@server/net/NetworkServerLike.ts";
import type { World } from "@server/world/World.ts";
import type { ResourceId } from "@shared/ids/ResourceId.ts";
import type { ServerToClientMessage } from "@shared/net/protocol.ts";
import type { Entity } from "@server/entities/Entity.ts";
import { Player } from "@server/entities/Player.ts";
import { Structure } from "@server/entities/Structure.ts";
import type { ProjectileSpawnConfig } from "@server/entities/Projectile.ts";
import type { Effect } from "@server/effects/Effect.ts";
import {
  effectTypeRegistry,
  entityTypeRegistry,
  itemTypeRegistry,
  type EntityTypeEntry,
  type ItemTypeEntry,
} from "@server/registry/registries.ts";
import {
  isBuildingCtor,
  isProjectileCtor,
  isSpawnableEntityCtor,
  isStructureCtor,
} from "@server/runtime/ctorGuards.ts";

type FilterResult = {
  text: string;
  flagged: boolean;
};

type ChatContextOptions = {
  networkServer: NetworkServerLike;
  world: World;
  playerIdByClientId: Map<string, number>;
  filterText: (text: string) => FilterResult;
};

function isPlayerCtor(ctor: EntityTypeEntry["ctor"]): ctor is typeof Player {
  return ctor.prototype instanceof Player;
}

/**
 * Shared server chat runtime helpers and state.
 */
export class ChatContext {
  public readonly networkServer: NetworkServerLike;
  public readonly world: World;
  public readonly playerIdByClientId: Map<string, number>;
  private readonly filterTextImpl: (text: string) => FilterResult;
  private readonly lastWhisperByClientId = new Map<string, string>();
  private readonly maxSpawnAmount = 1000;

  constructor({
    networkServer,
    world,
    playerIdByClientId,
    filterText,
  }: ChatContextOptions) {
    this.networkServer = networkServer;
    this.world = world;
    this.playerIdByClientId = playerIdByClientId;
    this.filterTextImpl = filterText;
  }

  public filterText(text: string): FilterResult {
    return this.filterTextImpl(text);
  }

  public broadcast(
    text: string,
    kind: "global" | "system" | "emote" | "whisper",
    from?: string,
  ): void {
    const message: ServerToClientMessage = { t: "chat", text, kind, from };
    this.networkServer.broadcast(JSON.stringify(message));
  }

  public sendSystem(clientId: string, text: string): void {
    this.sendToClient(clientId, text, "system");
  }

  public sendToClient(
    clientId: string,
    text: string,
    kind: "global" | "system" | "emote" | "whisper",
    from?: string,
  ): void {
    const message: ServerToClientMessage = { t: "chat", text, kind, from };
    this.networkServer.send(clientId, JSON.stringify(message));
  }

  public getPlayerByClientId(clientId: string): Player | undefined {
    const playerId = this.playerIdByClientId.get(clientId);
    if (!playerId) {
      return undefined;
    }
    return this.world.get<Player>(playerId);
  }

  public getOnlinePlayers(): Player[] {
    return this.world.entities
      .all()
      .filter((entity): entity is Player => entity instanceof Player);
  }

  public findPlayerByName(name: string): Player | undefined {
    const lowered = name.toLowerCase();
    return this.getOnlinePlayers().find(
      (player) => player.name.toLowerCase() === lowered,
    );
  }

  public requireClientId(player: Player): string {
    for (const [clientId, playerId] of this.playerIdByClientId.entries()) {
      if (playerId === player.id) {
        return clientId;
      }
    }
    return "";
  }

  public rememberWhisperPair(
    leftClientId: string,
    rightClientId: string,
  ): void {
    this.lastWhisperByClientId.set(leftClientId, rightClientId);
    this.lastWhisperByClientId.set(rightClientId, leftClientId);
  }

  public getLastWhisperClientId(clientId: string): string | undefined {
    return this.lastWhisperByClientId.get(clientId);
  }

  public resolveEffectEntry(effectToken: string): {
    typeId: ResourceId;
    ctor: new () => Effect;
  } | null {
    const normalized = this.normalizeEntityKey(effectToken);
    for (const [typeId, entry] of effectTypeRegistry.entries()) {
      const candidateKeys = new Set<string>();
      candidateKeys.add(this.normalizeEntityKey(typeId));
      candidateKeys.add(this.normalizeEntityKey(typeId.split(":")[1] ?? ""));
      candidateKeys.add(this.normalizeEntityKey(entry.content.label));
      const resourceName =
        (entry.ctor as { resourceName?: string }).resourceName ?? "";
      candidateKeys.add(this.normalizeEntityKey(resourceName));
      if (candidateKeys.has(normalized)) {
        return entry as { typeId: ResourceId; ctor: new () => Effect };
      }
    }
    return null;
  }

  public resolveItemEntry(itemToken: string): ItemTypeEntry | null {
    const normalized = this.normalizeEntityKey(itemToken);
    for (const [typeId, entry] of itemTypeRegistry.entries()) {
      if (entry.content.hidden) {
        continue;
      }
      const candidateKeys = new Set<string>();
      candidateKeys.add(this.normalizeEntityKey(typeId));
      candidateKeys.add(this.normalizeEntityKey(typeId.split(":")[1] ?? ""));
      candidateKeys.add(this.normalizeEntityKey(entry.ctor.name));
      candidateKeys.add(this.normalizeEntityKey(entry.content.label));
      const resourceName = entry.ctor.resourceName ?? "";
      candidateKeys.add(this.normalizeEntityKey(resourceName));

      if (candidateKeys.has(normalized)) {
        return entry;
      }
    }
    return null;
  }

  public resolveEntityEntry(entityToken: string): EntityTypeEntry | null {
    const normalized = this.normalizeEntityKey(entityToken);
    for (const [typeId, entry] of entityTypeRegistry.entries()) {
      const candidateKeys = new Set<string>();
      candidateKeys.add(this.normalizeEntityKey(typeId));
      candidateKeys.add(this.normalizeEntityKey(typeId.split(":")[1] ?? ""));
      candidateKeys.add(this.normalizeEntityKey(entry.ctor.name));
      candidateKeys.add(this.normalizeEntityKey(entry.content.label));
      const resourceName = (entry.ctor as typeof Entity).resourceName ?? "";
      candidateKeys.add(this.normalizeEntityKey(resourceName));

      if (candidateKeys.has(normalized)) {
        return entry;
      }
    }
    return null;
  }

  public killEntity(entity: Entity): void {
    if (entity instanceof Structure) {
      return;
    }
    entity.hp = 0;
    if (entity instanceof Player) {
      entity.handleDeath(this.world);
      return;
    }

    entity.alive = false;
    entity.handleDeath(this.world);
    if (this.world.entities.has(entity.id)) {
      this.world.despawn(entity.id);
    }
  }

  public giveItemToPlayer(
    target: Player,
    itemEntry: ItemTypeEntry,
    amount: number,
  ): boolean {
    return target.inventory.grantItemCtor(itemEntry.ctor, amount);
  }

  public resolveSpawnTarget(
    player: Player,
    args: string[],
  ): { x: number; y: number } | null {
    if (args.length === 0) {
      return { x: player.x, y: player.y };
    }

    if (args.length === 1) {
      const token = args[0] ?? "";
      if (token.toLowerCase() === "@a") {
        return { x: player.x, y: player.y };
      }

      const targetPlayer = this.findPlayerByName(token);
      if (!targetPlayer) {
        return null;
      }
      return { x: targetPlayer.x, y: targetPlayer.y };
    }

    if (args.length >= 3) {
      const parsedX = this.parseCoordinate(args[0] ?? "", player.x);
      const parsedY = this.parseCoordinate(args[1] ?? "", player.y);
      const parsedZ = this.parseCoordinate(args[2] ?? "", 0);
      if (
        parsedX === null ||
        parsedY === null ||
        parsedZ === null ||
        args.length > 3
      ) {
        return null;
      }
      return { x: parsedX, y: parsedY };
    }

    return null;
  }

  public clampToWorldBounds(x: number, y: number): { x: number; y: number } {
    return {
      x: Math.max(0, Math.min(this.world.gameConfig.worldSize.w, x)),
      y: Math.max(0, Math.min(this.world.gameConfig.worldSize.h, y)),
    };
  }

  public instantiateEntity(
    entry: EntityTypeEntry,
    player: Player,
    position: { x: number; y: number },
  ): Entity | null {
    const entityId = this.world.allocEntityId();
    const ctor = entry.ctor;

    if (entry.kind === "projectile") {
      if (!isProjectileCtor(ctor)) {
        return null;
      }
      const config: ProjectileSpawnConfig = {
        ownerId: player.id,
        x: position.x,
        y: position.y,
        directionX: 1,
        directionY: 0,
        rotation: 0,
      };
      return new ctor(entityId, config);
    }

    if (entry.kind === "building" && isBuildingCtor(ctor)) {
      const building = new ctor(entityId, 1, player.id);
      building.x = position.x;
      building.y = position.y;
      return building;
    }

    if (entry.kind === "structure" && isStructureCtor(ctor)) {
      const structure = new ctor(entityId);
      structure.x = position.x;
      structure.y = position.y;
      return structure;
    }

    if (entry.kind === "player" && isPlayerCtor(ctor)) {
      const spawnedPlayer = new ctor(entityId, `spawned-${entityId}`);
      spawnedPlayer.x = position.x;
      spawnedPlayer.y = position.y;
      return spawnedPlayer;
    }

    if (!isSpawnableEntityCtor(ctor)) {
      return null;
    }

    const entity = new ctor(entityId);
    entity.x = position.x;
    entity.y = position.y;
    return entity;
  }

  public getMaxSpawnAmount(): number {
    return this.maxSpawnAmount;
  }

  public isIntegerLike(value: string): boolean {
    return /^-?\d+$/.test(value.trim());
  }

  private parseCoordinate(token: string, base: number): number | null {
    const trimmed = token.trim();
    if (!trimmed) {
      return null;
    }
    if (trimmed.startsWith("~")) {
      if (trimmed === "~") {
        return base;
      }
      const offset = Number(trimmed.slice(1));
      return Number.isFinite(offset) ? base + offset : null;
    }
    const absolute = Number(trimmed);
    return Number.isFinite(absolute) ? absolute : null;
  }

  private normalizeEntityKey(value: string): string {
    return value.replace(/\s+/g, "").replace(/_/g, "").toLowerCase();
  }
}
