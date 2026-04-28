import { Structure } from "@server/entities/Structure.ts";

export class FenceV extends Structure {
  public static override readonly resourceName = "fence_v";

  constructor(id: number) {
    super(id);
  }
}
