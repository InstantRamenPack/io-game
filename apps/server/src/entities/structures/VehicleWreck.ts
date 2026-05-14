import { Structure } from "@server/entities/Structure.ts";

export class VehicleWreck extends Structure {
  public static override readonly resourceName = "vehicle_wreck";

  constructor(id: number) {
    super(id);
  }
}
