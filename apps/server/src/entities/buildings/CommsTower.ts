import { Tower } from "@server/entities/buildings/Tower.ts";

export class CommsTower extends Tower {
  public static override readonly resourceName = "comms";

  constructor(id: number) {
    super(id, 1, undefined);
  }
}
