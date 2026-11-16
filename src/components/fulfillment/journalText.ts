import { useEditor } from "@/lib/store";
import { formatAddress } from "@/lib/address";
import type { ActivityEntry, JournalMove } from "@/lib/activityJournal";
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
  const cell = (a?: CellAddress | null) => (a ? formatAddress(warehouse, a) : undefined);

  const move = (m: JournalMove) => {
    const [at, box] = m.kind === "box_at" ? m.ref.split("#") : [m.ref, undefined];
    const place =
      m.kind === "cell" || m.kind === "box_at" ? (cell(parseCell(at)) ?? at) : unit(m.ref);
    const delta = m.delta > 0 ? `+${m.delta}` : String(m.delta);
    const head = `${t(`journal.place.${m.kind}`)} ${place}${box ? ` (${unit(box)})` : ""}`;
    return `${head}: ${product(m.productId)} ${delta}`;
  };

  return {
    who: (e: ActivityEntry) =>
      e.member?.name ||
      (e.staffRef && staff.find((m) => m.id === e.staffRef)?.name) ||
      (e.source === "cabinet" ? t("journal.cabinet") : t("journal.nobody")),
    where: (e: ActivityEntry) =>
      e.source === "cabinet" ? t("journal.cabinet") : (e.device?.name ?? ""),
    reason: (e: ActivityEntry) =>
      e.reason && REASONS.has(e.reason)
        ? t(`journal.reason.${e.reason}` as MsgKey)
        : t("journal.reason"),
    what: (e: ActivityEntry): string => {
      if (e.moves) {
        const shown = e.moves.slice(0, MOVES_SHOWN).map(move);
        const rest = (e.movesTotal ?? e.moves.length) - shown.length;
        if (rest > 0) shown.push(t("journal.moves.more", { n: rest }));
        return shown.join(" · ");
      }
      const r = e.refs;
      if (!r) return "";
      const name = product(r.productId);
      const parts = [
        name && (r.qty && r.qty > 1 ? `${name} × ${r.qty}` : name),
        unit(r.toteId ?? r.boxId),
        unit(r.palletId),
        cell(r.cell),
        r.outboundCode,
        r.sortCode && t("journal.sortTo", { code: r.sortCode }),
        r.orderId && t("journal.order", { id: r.orderId }),
        !name && r.code,
        r.dispute && DISPUTES.has(r.dispute) && t(`disputes.kind.${r.dispute}` as MsgKey),
      ].filter(Boolean);
      return parts.join(" · ");
    },
  };
}
