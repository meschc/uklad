import { useEditor } from "@/lib/store";
import { useT } from "@/lib/i18n";
import type { FulfillmentRequest } from "@/lib/types";
import { DestinationChip } from "@/components/workstation/DestinationChip";
import { Modal } from "./Modal";

/**
 * «Отгрузить» из «Заданий»: сначала подтверждение, а не прыжок на стол.
 *
 * Сама погрузка — сканом на столе отгрузки: так в рейс попадают только
 * короба этого назначения, а повторный или чужой короб стол остановит. Здесь
 * руководитель видит, что уезжает и чего не хватает, и решает, идти ли грузить.
 */
export function ShipConfirm({
  target,
  items,
  onClose,
}: {
  target: string;
  items: FulfillmentRequest[];
  onClose: () => void;
}) {
  const t = useT();
  const goToView = useEditor((s) => s.goToView);
  const qty = items.reduce((n, r) => n + (r.pickedQty ?? r.qty), 0);
  const short = items.reduce((n, r) => n + Math.max(0, r.qty - (r.pickedQty ?? r.qty)), 0);
  return (
    <Modal
      title={t("ship.title")}
      submitLabel={t("ship.confirm")}
      onClose={onClose}
      onSubmit={() => {
        onClose();
        goToView("workstation");
      }}
    >
      <DestinationChip destination={target} className="self-start" />
      <p className="text-sm">{t("ship.subtitle", { n: items.length })}</p>
      <p className="text-sm text-muted-foreground">{t("ship.units", { n: qty })}</p>
      {short > 0 && (
        <p role="alert" className="text-sm font-medium text-warning">
          {t("ship.short", { n: short })}
        </p>
      )}
      <p className="text-sm text-muted-foreground">{t("ship.how")}</p>
    </Modal>
  );
}
