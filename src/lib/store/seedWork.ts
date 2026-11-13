import { nowMs, uid } from "../utils";
import { SERVICES } from "../operations";
import { rng } from "./seedHistory";
import type {
  Device,
  Partner,
  Product,
  ServiceKind,
  ServiceSettings,
  StaffEvent,
  StaffMember,
  WarehouseTask,
} from "../types";

/**
 * Работа людей демо-склада: смены, пики, задания на услуги, прайс и столы.
 *
 * Зачем: `seedHistory` двигает товар, но без людей экраны «Операции и услуги»,
 * «Устройства» и журнал смены на рабочем месте открывались нулями — отчёт
 * без цен, заданий нет, у сотрудника ноль часов и ноль пиков. Здесь ничего не
 * двигает товар: задания на услуги и отметки смены остатков не меняют, поэтому
 * инвариант «товар не появляется и не исчезает» не затронут.
 *
 * Как и история, данные детерминированные (своё зерно), а время отсчитывается
 * от «сейчас» — после сброса демо склад снова выглядит работающим сегодня.
 */

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MIN = 60_000;

/** Прайс типового фулфилмента, ₽ за единицу услуги. */
const PRICES: Record<ServiceKind, number> = {
  unloading: 1500,
  cargo_pallet: 350,
  cargo_box: 45,
  item_receiving: 4,
  quality_check: 6,
  marking: 5,
  honest_sign: 8,
  repacking: 18,
  kitting: 25,
  picking: 9,
  packing: 22,
  fbo_box: 60,
  palletizing: 250,
  loading: 900,
  ship_parcel: 15,
  ship_box: 40,
  ship_pallet: 200,
  returns: 30,
  inventory: 12,
  photo: 40,
};

/** Сверх включённых по умолчанию склад в демо продаёт ещё и это. */
const EXTRA_ON: ServiceKind[] = ["quality_check", "honest_sign", "repacking", "kitting", "fbo_box"];

/** Объём одного задания: от и до, в единицах услуги. */
const TASK_QTY: Partial<Record<ServiceKind, [number, number]>> = {
  unloading: [1, 2],
  quality_check: [40, 300],
  marking: [50, 600],
  honest_sign: [100, 800],
  repacking: [20, 150],
  kitting: [10, 80],
  packing: [20, 120],
  fbo_box: [4, 30],
  palletizing: [1, 6],
  returns: [3, 25],
};

interface SeededWork {
  serviceSettings: ServiceSettings;
  tasks: WarehouseTask[];
  staffEvents: StaffEvent[];
  devices: Device[];
}

export function seedWork(
  staff: StaffMember[],
  partners: Partner[],
  products: Product[],
  now = nowMs(),
): SeededWork {
  const rand = rng(20261110);
  const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
  const between = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const someone = (pool: StaffMember[]) => (pool.length ? pick(pool).id : undefined);

  const enabled: ServiceSettings["enabled"] = {};
  for (const k of EXTRA_ON) enabled[k] = true;
  const serviceSettings: ServiceSettings = { enabled, prices: { ...PRICES } };

  const floor = staff.filter((s) => !/управля/i.test(s.role));
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const day0 = today.getTime();

  // --- Задания: месяц закрытых, сегодня — в работе и ждут исполнителя.
  const kinds = SERVICES.filter((s) => !s.auto && (s.defaultOn || enabled[s.kind])).map(
    (s) => s.kind,
  );
  const tasks: WarehouseTask[] = [];
  const addTask = (status: WarehouseTask["status"], createdAt: number) => {
    const kind = pick(kinds);
    const [lo, hi] = TASK_QTY[kind] ?? [1, 20];
    const startedAt = status === "open" ? undefined : createdAt + between(10, 90) * MIN;
    const doneAt = status === "done" && startedAt ? startedAt + between(1, 5) * HOUR : undefined;
    tasks.push({
      id: uid("task"),
      kind,
      status,
      qty: between(lo, hi),
      partnerId: partners.length ? pick(partners).id : undefined,
      staffId: status === "open" && rand() < 0.5 ? undefined : someone(floor),
      createdAt,
      startedAt,
      doneAt,
    });
  };
  for (let d = 30; d >= 1; d--) {
    const start = day0 - d * DAY + 9 * HOUR;
    for (let i = between(1, 3); i > 0; i--) addTask("done", start + between(0, 6) * HOUR);
  }
  const morning = Math.min(now - 2 * HOUR, day0 + 9 * HOUR);
  for (let i = 0; i < 3; i++) addTask("in_progress", morning + i * 20 * MIN);
  for (let i = 0; i < 4; i++) addTask("open", morning + i * 30 * MIN);

  // --- Столы и ТСД склада, привязанные заранее; один отвязан.
  const device = (name: string, station: Device["station"], daysAgo: number): Device => ({
    id: uid("dev"),
    name,
    station,
    createdAt: day0 - daysAgo * DAY,
  });
  const devices: Device[] = [
    device("Стол упаковки 1", "pack", 40),
    device("Стол упаковки 2", "pack", 40),
    device("Приёмка, ворота 1", "receiving", 35),
    device("ТСД 3", "picking", 20),
    { ...device("ТСД 1", "picking", 60), revokedAt: day0 - 12 * DAY },
  ];

  // --- Смены: две недели будней, у кладовщиков и комплектовщиков — пики.
  const staffEvents: StaffEvent[] = [];
  // Журнал устройства: упаковщики работают за столами упаковки, сборщики — с
  // ТСД. Стол закреплён за человеком, чтобы журнал читался как настоящий.
  const packDesks = devices.filter((d) => d.station === "pack" && !d.revokedAt);
  const pickDesk = devices.find((d) => d.station === "picking" && !d.revokedAt);
  const deskOf = new Map<string, string>();
  const ev = (e: Omit<StaffEvent, "id">) => {
    if (e.at > now) return;
    const deviceId = deskOf.get(e.staffId);
    staffEvents.push({ id: uid("sev"), ...e, ...(deviceId ? { deviceId } : {}) });
  };
  const packers = new Set(floor.filter((s) => /кладов|комплект/i.test(s.role)).map((s) => s.id));
  // Стол — одному человеку: двое за одним столом в одну смену не работают.
  let packN = 0;
  for (const s of floor) {
    if (!packers.has(s.id)) continue;
    const desk = /кладов/i.test(s.role) ? packDesks[packN++] : pickDesk;
    if (desk) deskOf.set(s.id, desk.id);
  }
  for (let d = 14; d >= 0; d--) {
    const dayAt = day0 - d * DAY;
    const wd = new Date(dayAt).getDay();
    if (wd === 0 || wd === 6) continue;
    for (const s of floor) {
      if (d > 0 && rand() < 0.1) continue; // выходной или больничный
      const start = dayAt + 9 * HOUR - between(0, 20) * MIN;
      const lunch = dayAt + 13 * HOUR + between(0, 30) * MIN;
      const back = lunch + between(30, 50) * MIN;
      const end = dayAt + 18 * HOUR + between(0, 40) * MIN;
      ev({ staffId: s.id, type: "shift_start", at: start });
      ev({ staffId: s.id, type: "break_start", at: lunch });
      ev({ staffId: s.id, type: "break_end", at: back });
      // Пики — только за последнюю неделю: журнал штуками за две недели
      // раздул бы сохранение в браузере, а экраны смотрят день и месяц.
      if (d <= 7 && products.length && packers.has(s.id)) {
        const pack = /кладов/i.test(s.role);
        for (let i = between(25, 45); i > 0; i--) {
          const at =
            rand() < 0.5
              ? start + 20 * MIN + Math.floor(rand() * (lunch - start - 30 * MIN))
              : back + 10 * MIN + Math.floor(rand() * (end - back - 20 * MIN));
          const productId = pick(products).id;
          ev(
            pack
              ? {
                  staffId: s.id,
                  type: "pack_label",
                  at,
                  station: "pack",
                  productId,
                  ms: between(25, 90) * 1000,
                }
              : { staffId: s.id, type: "pick_scan", at, productId },
          );
        }
      }
      ev({ staffId: s.id, type: "shift_end", at: end });
    }
  }
  staffEvents.sort((a, b) => a.at - b.at);

  return { serviceSettings, tasks, staffEvents, devices };
}
