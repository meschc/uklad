import { Layers, Plus } from "lucide-react";
import type { Pallet } from "@/lib/types";
import { type TFunc } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { ScanField, type ScanStatus } from "../ScanField";
import { ActiveTag } from "./ActiveTag";

/**
 * Шаг «тара»: на открытую паллету заводится или сканируется коробка.
 *
 * «Закрыть паллету» появляется только когда паллета открыта — кнопка, которой
 * нечего закрывать, обещает действие и ничего не делает.
 */
export function BoxStep({
  pallet,
  status,
  busy,
  onScan,
  onNew,
  onClosePallet,
  t,
}: {
  pallet: Pallet | null;
  status: ScanStatus;
  busy: boolean;
  onScan: (raw: string) => void;
  onNew: () => void;
  onClosePallet: () => void;
  t: TFunc;
}) {
  return (
    <div className="flex flex-col gap-4">
      {pallet && <ActiveTag label={t("recv.pallet.active", { code: pallet.barcode })} />}
      <ScanField
        label={t("recv.box.label")}
        hint={t("recv.box.hint")}
        status={status}
        onSubmit={onScan}
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onNew} disabled={busy}>
          <Plus className="size-3.5" />
          {t("recv.box.new")}
        </Button>
        {pallet && (
          <Button onClick={onClosePallet}>
            <Layers className="size-3.5" />
            {t("recv.pallet.close")}
          </Button>
        )}
      </div>
    </div>
  );
}
