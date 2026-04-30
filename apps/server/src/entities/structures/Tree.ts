import { Structure } from "@server/entities/Structure.ts";

export class Tree extends Structure {
  public static override readonly resourceName = "tree";

  constructor(id: number) {
    super(id);
  }
}
