import { Structure } from "@server/entities/Structure.ts";

export class BossThrone extends Structure {
  public static override readonly resourceName = "boss_throne";

  constructor(id: number) {
    super(id);
  }
}
