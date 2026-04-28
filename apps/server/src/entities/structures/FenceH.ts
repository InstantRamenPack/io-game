import { Structure } from "@server/entities/Structure.ts";

export class FenceH extends Structure {
  public static override readonly resourceName = "fence_h";

  constructor(id: number) {
    super(id);
  }
}
