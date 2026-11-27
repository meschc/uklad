import { isInventoryDispute } from "@/lib/disputes";
import type { Dispute, DisputeKind, DisputeResolution } from "@/lib/types";
import type { MsgKey } from "@/lib/i18n";

/** Подписи спорного — общие для списка «Ждут решения» и таблицы решённого. */
const KIND_KEY: Record<DisputeKind, MsgKey> = {
  shortage: "disputes.kind.shortage",
  not_in_tote: "disputes.kind.not_in_tote",
  extra: "disputes.kind.extra",
  not_packable: "disputes.kind.not_packable",
  receive_overage: "disputes.kind.receive_overage",
  inventory_short: "disputes.kind.inventory_short",
  inventory_over: "disputes.kind.inventory_over",
};

/** Подпись вида: «нет на месте» из сборки (`mis-…`) — своей строкой. */
export const kindKey = (d: Pick<Dispute, "id" | "kind">): MsgKey =>
  d.kind === "inventory_short" && d.id.startsWith("mis-")
    ? "disputes.kind.pick_missing"
    : KIND_KEY[d.kind];

const RES_KEY: Record<DisputeResolution, MsgKey> = {
  returned: "disputes.res.returned",
  moved: "disputes.res.moved",
  written_off: "disputes.res.written_off",
  accepted: "disputes.res.accepted",
};

/** Чем закончилось: у пересчёта свои слова. */
export function resKey(d: Dispute): MsgKey {
  if (isInventoryDispute(d) && d.resolution === "returned") return "disputes.res.inventoryClose";
  if (isInventoryDispute(d) && d.resolution === "accepted") return "disputes.res.inventoryAdopt";
  return RES_KEY[d.resolution!];
}

export const fmtAt = (at: number) =>
  new Date(at).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
