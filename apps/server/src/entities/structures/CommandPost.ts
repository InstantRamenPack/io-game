import { Structure } from "@server/entities/Structure.ts";

export class CommandPost extends Structure {
  public static override readonly resourceName = "command_post";

  constructor(id: number) {
    super(id);
  }
}
