import { isBotApiConfigured, kvDelete, kvGet, kvSet } from "../../bot-api";
import { vehicleSpecFor, type VehicleItemId } from "./vehicles";

const VEHICLE_NAMESPACE = "worldbox_vehicles";

export async function loadEquippedVehicle(ownerKey: string): Promise<VehicleItemId | null> {
  if (!isBotApiConfigured()) return null;
  try {
    const raw = await kvGet(VEHICLE_NAMESPACE, `eq:${ownerKey}`);
    const spec = vehicleSpecFor(raw);
    return spec ? spec.id : null;
  } catch {
    return null;
  }
}

export async function storeEquippedVehicle(
  ownerKey: string,
  vehicleId: VehicleItemId | null,
): Promise<boolean> {
  if (!isBotApiConfigured()) return false;
  try {
    if (!vehicleId) {
      await kvDelete(VEHICLE_NAMESPACE, `eq:${ownerKey}`);
    } else {
      await kvSet(VEHICLE_NAMESPACE, `eq:${ownerKey}`, vehicleId);
    }
    return true;
  } catch {
    return false;
  }
}
