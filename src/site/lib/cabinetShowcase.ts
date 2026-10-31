import { readLocal } from "@/lib/safeStorage";
import { allCells, buildOccupancy } from "@/lib/placement";
import type { Account } from "@/lib/types/account";
import type { ServiceKind, ServiceSettings } from "@/lib/types/operations";
import type { Box, CellAddress, Warehouse as CabinetWarehouse } from "@/lib/types";
import type { IntegrationConfig } from "@/lib/integrations";
import { MARKETPLACES, type SchemeId, type ServiceId } from "../data/marketplaces";
import type { Warehouse } from "../data/warehouses";
import { c, type Copy } from "./copy";
import { NO_REPUTATION } from "./reputation";

/**
 * Предпросмотр карточки склада из кабинета (Кирилл 26 окт: «как это будет
 * выглядеть на витрине»). Кабинет и витрина живут на одном адресе, поэтому
 * витрина читает то же сохранение, что и кабинет, — `uklad-store-v1`, — и
 * собирает из него склад в форме витрины. Цифры не копируются, а берутся
 * каждый раз заново: поменяли цену в кабинете — предпросмотр показывает новую.
 *
 * Когда появится сервер, эта функция уйдёт: карточка будет приходить по API.
 * После переезда кабинета на app.u-klad.ru общего сохранения у них не будет —
 * до сервера предпросмотр работает, пока кабинет живёт по /app/.
 */

export const PREVIEW_ID = "preview";

const PERSIST_KEY = "uklad-store-v1";

/** Что витрине нужно из сохранения кабинета. */
export interface CabinetSaved {
  warehouse?: CabinetWarehouse;
  account?: Account;
  serviceSettings?: ServiceSettings;
  integrations?: Record<string, IntegrationConfig>;
  placements?: Record<string, CellAddress>;
  boxes?: Box[];
}

/** Услуги кабинета → услуги карточки витрины. */
const SERVICE_MAP: Partial<Record<ServiceKind, ServiceId>> = {
  marking: "marking",
  honest_sign: "honest",
  repacking: "repack",
  kitting: "picking",
  palletizing: "pallet",
  returns: "returns",
  quality_check: "reject",
  photo: "photo",
};

const same = (s: string): Copy => c(s, s);

export function readCabinetShowcase(): Warehouse | null {
  const raw = readLocal(PERSIST_KEY);
  if (!raw) return null;
  let saved: CabinetSaved;
  try {
    saved = (JSON.parse(raw) as { state?: CabinetSaved }).state ?? {};
  } catch {
    return null;
  }
  const w = saved?.warehouse;
  if (!w || !Array.isArray(w.floors)) return null;
  // Формы записи никто не проверял: старая версия кабинета или чужая запись
  // по тому же ключу должны дать «предпросмотра нет», а не упавшую страницу.
  try {
    return toShowcase(saved, w);
  } catch (e) {
    console.warn("Предпросмотр карточки: сохранение кабинета не разобрано", e);
    return null;
  }
}

export function toShowcase(saved: CabinetSaved, w: CabinetWarehouse): Warehouse {
  const spec = w.spec ?? {};
  const settings = {
    enabled: saved.serviceSettings?.enabled ?? {},
    prices: saved.serviceSettings?.prices ?? {},
  };
  const on = (k: ServiceKind) => Boolean(settings.enabled[k]);

  // Адрес в кабинете — одна строка «Город, улица, дом». Город — до запятой.
  const [cityPart, ...rest] = (w.address ?? "").split(",").map((s) => s.trim());
  const city = cityPart || "—";
  const street = rest.join(", ") || "—";

  const total = spec.palletCapacity ?? allCells(w).length;
  const busy = Object.keys(buildOccupancy(saved.placements ?? {}, saved.boxes ?? [])).length;

  const schemes: SchemeId[] = [];
  if (on("fbo_box")) schemes.push("FBO");
  if (on("packing")) schemes.push("FBS");

  const marketplaces = MARKETPLACES.map((m) => m.id).filter(
    (id) => saved.integrations?.[id]?.enabled,
  );

  const services = (Object.keys(SERVICE_MAP) as ServiceKind[])
    .filter(on)
    .map((k) => SERVICE_MAP[k]!)
    .filter((id, i, all) => all.indexOf(id) === i);

  const legal = saved.account?.org || saved.account?.name || w.name;

  return {
    id: PREVIEW_ID,
    name: same(w.name),
    legal: same(legal),
    city,
    cityTitle: same(city),
    region: same(city),
    address: same(street),
    lat: w.lat ?? 55.7558,
    lng: w.lng ?? 37.6173,
    since: spec.builtYear ?? new Date().getFullYear(),
    areaM2: spec.storageAreaM2 ?? spec.totalAreaM2 ?? 0,
    cellsTotal: total,
    cellsFree: Math.max(0, total - busy),
    schemes,
    marketplaces,
    services,
    price: {
      storage: w.storageRatePerCell ?? 0,
      receiving: settings.prices.cargo_box ?? 0,
      picking: settings.prices.picking ?? 0,
      marking: settings.prices.marking ?? 0,
    },
    confirmedAt: Date.now(),
    minPlaces: 0,
    reputation: NO_REPUTATION,
    responseHours: 24,
    verified: false,
    uklad: true,
    hue: 220,
    pitch: c(
      "Так карточка склада будет выглядеть на витрине. Все цифры — из кабинета.",
      "This is how the warehouse card will look on the marketplace. Every number comes from your account.",
    ),
  };
}
