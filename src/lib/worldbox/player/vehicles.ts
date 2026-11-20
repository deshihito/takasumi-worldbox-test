export type VehicleItemId =
  | "electric_scooter"
  | "delivery_moped"
  | "cargo_truck"
  | "police_cruiser";

export interface VehicleSpec {
  id: VehicleItemId;
  name: string;
  price: number;
  tagline: string;
  speed: number; // Strictly <= 9.4 so road 1.04x/9.8 remains safely under MAX_MOVE_SPEED = 10
  deliveryBonusPct: number;
  bountyBonusPct: number;
  bodyColor: string;
  trimColor: string;
  hasSiren?: boolean;
}

export const VEHICLE_SPECS: Readonly<Record<VehicleItemId, VehicleSpec>> = {
  electric_scooter: {
    id: "electric_scooter",
    name: "電動キックボード",
    price: 4500,
    tagline: "小回りが効くエントリーEV",
    speed: 7.8,
    deliveryBonusPct: 10,
    bountyBonusPct: 0,
    bodyColor: "#06b6d4",
    trimColor: "#e2e8f0",
  },
  delivery_moped: {
    id: "delivery_moped",
    name: "配達用スクーター",
    price: 11000,
    tagline: "都市間配送の主力モデル",
    speed: 8.6,
    deliveryBonusPct: 20,
    bountyBonusPct: 0,
    bodyColor: "#ef4444",
    trimColor: "#ffffff",
  },
  cargo_truck: {
    id: "cargo_truck",
    name: "産業カーゴトラック",
    price: 24000,
    tagline: "最大報酬倍率の重輸送車両",
    speed: 9.4,
    deliveryBonusPct: 35,
    bountyBonusPct: 0,
    bodyColor: "#f59e0b",
    trimColor: "#334155",
  },
  police_cruiser: {
    id: "police_cruiser",
    name: "メトロパトロールカー",
    price: 32000,
    tagline: "緊急サイレン搭載・懸賞追跡仕様",
    speed: 9.4,
    deliveryBonusPct: 15,
    bountyBonusPct: 20,
    bodyColor: "#0f172a",
    trimColor: "#f8fafc",
    hasSiren: true,
  },
};

export const VEHICLE_IDS: readonly VehicleItemId[] = [
  "electric_scooter",
  "delivery_moped",
  "cargo_truck",
  "police_cruiser",
];

export function vehicleSpecFor(id: unknown): VehicleSpec | null {
  if (typeof id !== "string") return null;
  return VEHICLE_SPECS[id as VehicleItemId] ?? null;
}

export function effectiveVehicleMoveSpeed(
  vehicleId: unknown,
  onRoadBlock: boolean,
  swimming: boolean,
): number | null {
  const spec = vehicleSpecFor(vehicleId);
  if (!spec || swimming) return null;
  // Cap smoothly at 9.8 tiles/s so server MAX_MOVE_SPEED (10) continuity check always stays green
  return onRoadBlock ? Math.min(9.8, Number((spec.speed * 1.06).toFixed(2))) : spec.speed;
}
