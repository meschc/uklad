import { useState } from "react";
import { Ban, Undo2 } from "lucide-react";
import { useEditor } from "@/lib/store";
import { formatAddress } from "@/lib/address";
import { planPickUndo } from "@/lib/pickUndo";
import { workstationRepository } from "@/lib/data/workstationRepository";
import { useT, type MsgKey } from "@/lib/i18n";
import { Modal } from "./Modal";
import { CodeText } from "./CodeTail";

/**
 * Подтверждение отмены скана в сборке. Класс `confirm` (`actionRisk.ts`):
 * штука переезжает из тары обратно в короб, поэтому панель называет, что
 * именно вернётся, откуда и куда, и сколько станет собрано. Физически штуку
 * кладёт сам сборщик — панель говорит, куда, кнопка «Вернул в короб»
 * подтверждает. Что сделать — в заголовке, ниже простым текстом откуда и
 * сколько станет (Кирилл 16.11). Подписи «для справки» не нужны.
 *
 * Брак (`defect`, Кирилл 27.11) — та же отмена: штука в свой короб на учёт,
 * но спорным «брак» старшему и в карантин, пока он не решит.
 */
export function PickUndoPanel({
  pickId,
  staffId,
  onClose,
  onDone,
  defect = false,
}: {
  pickId: string;
  staffId: string;
  defect?: boolean;
  onClose: () => void;
  onDone: (left: number, total: number) => void;
}) {
  const t = useT();
  const staffEvents = useEditor((s) => s.staffEvents);
  const requests = useEditor((s) => s.requests);
  const boxes = useEditor((s) => s.boxes);
  const disputes = useEditor((s) => s.disputes);
  const warehouse = useEditor((s) => s.warehouse);
  const products = useEditor((s) => s.products);
  const [error, setError] = useState<MsgKey | null>(null);
  const [pending, setPending] = useState(false);
  // План считается по снимку до отмены: после неё скан уже отменён, а
  // панель закрывается сама.
  const [res] = useState(() =>
    planPickUndo({ staffEvents, requests, boxes, disputes }, pickId, staffId),
  );
  const problem: MsgKey | null = res.ok ? null : `pick.undo.${res.problem}`;

  const submit = async () => {
    if (!res.ok) return;
    setPending(true);
    const total = res.plan.request.qty;
    const left = (res.plan.request.pickedQty ?? 1) - 1;
    const out = await workstationRepository.pickUndo(pickId, defect);
    setPending(false);
    if (!out.ok) return setError(out.error);
    onDone(left, total);
  };

  return (
    <Modal
      title={
        res.ok ? (
          <CodeText
            text={t(defect ? "pick.defect.put" : "pick.undo.put", { box: res.plan.from.barcode })}
          />
        ) : (
          t(defect ? "pick.defect.title" : "pick.undo.title")
        )
      }
      icon={
        defect ? (
          <Ban className="size-4 text-warning" />
        ) : (
          <Undo2 className="size-4 text-muted-foreground" />
        )
      }
      onClose={onClose}
      onSubmit={() => void submit()}
      submitLabel={t(defect ? "pick.defect.confirm" : "pick.undo.confirm")}
      disabled={!res.ok}
      pending={pending}
      error={error ?? problem}
      tone="destructive"
      sheet
    >
      {res.ok && (
        <p className="text-sm">
          <CodeText
            text={t("pick.undo.body", {
              sku: products.find((p) => p.id === res.plan.pick.productId)?.sku ?? "—",
              addr: res.plan.from.address
                ? (formatAddress(warehouse, res.plan.from.address) ?? "")
                : "",
              left: (res.plan.request.pickedQty ?? 1) - 1,
              total: res.plan.request.qty,
            })}
          />
        </p>
      )}
    </Modal>
  );
}
