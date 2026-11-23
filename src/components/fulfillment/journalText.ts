import { useEditor } from "@/lib/store";
import { formatAddress } from "@/lib/address";
import { orderLabelCode } from "@/lib/packing";
import {
  AUDIT_KINDS,
  DESK_KINDS,
  type ActivityEntry,
  type JournalMove,
} from "@/lib/activityJournal";
import { useT, type MsgKey } from "@/lib/i18n";
import type { CellAddress } from "@/lib/types";

const REASONS = new Set([
  "bad",
  "stock",
  "mixed",
  "tote",
  "not_yours",
  "busy",
  "open",
  "warehouse",
  "nobody",
  "not_present",
  "time",
  "late",
  "backdated",
]);
/** Процессы стола (`ws.station.*`): переход между ними — `station_switch`. */
const STATIONS = new Set([
  "pack",
  "receiving",
  "picking",
  "sorting",
  "marking",
  "returns",
  "shipping",
  "inventory",
]);

const DISPUTES = new Set([
  "shortage",
  "not_in_tote",
  "extra",
  "not_packable",
  "receive_overage",
  "inventory_short",
  "inventory_over",
]);
/** Движений правки в строке: остальное — «и ещё N». */
const MOVES_SHOWN = 3;

/** Действия над сотрудником склада: цель — его `warehouse.staff[].id`. */
const STAFF_TARGET = new Set(["badge.issue", "badge.revoke", "staff.role"]);
/** Откуда пришло действие руководителя без человека за ним. */
const BY_KEY: Record<string, MsgKey> = {
  desk: "journal.by.desk",
  pull: "journal.by.pull",
  system: "journal.by.system",
};

const idList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
const count = (v: unknown) => (typeof v === "number" && v > 0 ? v : 0);

/** «floor/module/shelf/cell» журнала движений → адрес ячейки. */
function parseCell(ref: string): CellAddress | null {
  const [floorId, moduleId, shelf, cell] = ref.split("/");
  const shelfIndex = Number(shelf);
  const cellIndex = Number(cell);
  if (!floorId || !moduleId || !Number.isInteger(shelfIndex) || !Number.isInteger(cellIndex)) {
    return null;
  }
  return { floorId, moduleId, shelfIndex, cellIndex };
}

/**
 * Подписи строки журнала: кто, с чем, где. Чего нет в данных (товар удалили,
 * тара уже чужая), то не выдумываем — показываем код как есть или пропускаем.
 */
export function useEntryText() {
  const t = useT();
  const staff = useEditor((s) => s.warehouse.staff) ?? [];
  const warehouse = useEditor((s) => s.warehouse);
  const products = useEditor((s) => s.products);
  const boxes = useEditor((s) => s.boxes);
  const pallets = useEditor((s) => s.pallets);

  const product = (id?: string) => (id && products.find((p) => p.id === id)?.name) || id;
  const unit = (id?: string) =>
    id &&
    (boxes.find((b) => b.id === id)?.barcode ?? pallets.find((p) => p.id === id)?.barcode ?? id);
  const requests = useEditor((s) => s.requests);
  // Номер заказа — площадки, если он есть, иначе код его этикетки: по нему ищут.
  const order = (id?: string) =>
    id && (requests.find((r) => r.id === id)?.externalId || orderLabelCode(id));
  const cell = (a?: CellAddress | null) => (a ? formatAddress(warehouse, a) : undefined);

  const move = (m: JournalMove) => {
    const [at, box] = m.kind === "box_at" ? m.ref.split("#") : [m.ref, undefined];
    const place =
      m.kind === "cell" || m.kind === "box_at" ? (cell(parseCell(at)) ?? at) : unit(m.ref);
    const delta = m.delta > 0 ? `+${m.delta}` : String(m.delta);
    const head = `${t(`journal.place.${m.kind}`)} ${place}${box ? ` (${unit(box)})` : ""}`;
    return `${head}: ${product(m.productId)} ${delta}`;
  };

  const staffName = (ref: string) => staff.find((m) => m.id === ref)?.name ?? t("journal.nobody");

  /** Что сделал руководитель: имена товаров, сотрудник, человек, роль. */
  const audit = (e: ActivityEntry): string => {
    const d = e.details ?? {};
    if (e.kind.startsWith("product.")) {
      const ids = idList(d.ids);
      const shown = ids.slice(0, MOVES_SHOWN).map((id) => product(id) ?? id);
      const rest = Math.max(count(d.n), ids.length + count(d.more)) - shown.length;
      if (rest > 0) shown.push(t("journal.moves.more", { n: rest }));
      return shown.join(", ");
    }
    const subject = STAFF_TARGET.has(e.kind)
      ? e.target && staff.find((m) => m.id === e.target)?.name
      : e.targetName;
    const parts = [
      subject,
      e.roleName && t("journal.audit.toRole", { role: e.roleName }),
      typeof d.system === "string" && d.system,
    ];
    return parts.filter(Boolean).join(" · ");
  };
  return {
    order,
    product,
    staffName,
    who: (e: ActivityEntry) =>
      e.member?.name ||
      (e.staffRef && staff.find((m) => m.id === e.staffRef)?.name) ||
      (e.source === "audit" && e.by && BY_KEY[e.by] && t(BY_KEY[e.by])) ||
      (e.source === "cabinet" || e.source === "audit" ? t("journal.cabinet") : t("journal.nobody")),
    where: (e: ActivityEntry) => {
      if (e.source === "audit") return t(e.company ? "journal.company" : "journal.cabinet");
      return e.source === "cabinet" ? t("journal.cabinet") : (e.device?.name ?? "");
    },
    reason: (e: ActivityEntry) =>
      e.reason && REASONS.has(e.reason)
        ? t(`journal.reason.${e.reason}` as MsgKey)
        : t("journal.reason"),
    what: (e: ActivityEntry): string => {
      if (e.source === "audit") return audit(e);
      if (e.moves) {
        const shown = e.moves.slice(0, MOVES_SHOWN).map(move);
        const rest = (e.movesTotal ?? e.moves.length) - shown.length;
        if (rest > 0) shown.push(t("journal.moves.more", { n: rest }));
        return shown.join(" · ");
      }
      const r = e.refs;
      if (!r) return "";
      const name = product(r.productId);
      const orderRef = r.orderId ?? r.requestId;
      const parts = [
        name && (r.qty && r.qty > 1 ? `${name} × ${r.qty}` : name),
        unit(r.toteId ?? r.boxId),
        unit(r.palletId),
        cell(r.cell),
        r.outboundCode,
        r.sortCode && t("journal.sortTo", { code: r.sortCode }),
        orderRef && t("journal.order", { id: order(orderRef) ?? orderRef }),
        r.vehicle && t("journal.vehicle", { v: r.vehicle }),
        !name && r.code,
        r.station && STATIONS.has(r.station) && t(`ws.station.${r.station}` as MsgKey),
        r.dispute && DISPUTES.has(r.dispute) && t(`disputes.kind.${r.dispute}` as MsgKey),
      ].filter(Boolean);
      return parts.join(" · ");
    },
  };
}

/** Подпись действия: у упаковки и отметок смены — по виду события внутри. */
export function actionKey(e: ActivityEntry): MsgKey {
  if (e.source === "cabinet") return "journal.cabinetEdit";
  if (e.source === "audit") {
    return AUDIT_KINDS.has(e.kind) ? (`journal.audit.${e.kind}` as MsgKey) : "journal.audit.other";
  }
  const type = e.refs?.type;
  if ((e.kind === "pack_event" || e.kind === "shift_mark") && type) {
    return `ws.ev.${type}` as MsgKey;
  }
  if (DESK_KINDS.has(e.kind)) return `devices.op.${e.kind}` as MsgKey;
  return `ws.ev.${e.kind}` as MsgKey;
}
