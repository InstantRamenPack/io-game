import { Structure } from "@server/entities/Structure.ts";

export class MarketStall extends Structure {
  public static override readonly resourceName = "market_stall";

  constructor(id: number) {
    super(id);
  }
}
