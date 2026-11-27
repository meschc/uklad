import { Undo2 } from "lucide-react";
import { workstationRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import { useT } from "@/lib/i18n";
import { Modal } from "@/components/fulfillment/Modal";
import { CodeText } from "@/components/fulfillment/CodeTail";

/**
 * Вынуть свою последнюю посылку с места сортировки (Кирилл 27.11): положил
 * не туда или не ту. Класс `confirm`, как отмена скана в сборке: что сделать —
 * в заголовке, ниже — что будет дальше. Физически посылку вынимает сам
 * человек, кнопка «Вынул» это подтверждает.
 */
export function SortUndoPanel({
  code,
  point,
  onClose,
  onDone,
}: {
  code: string;
  point: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const undo = useCommand(workstationRepository.sortUndo, { exclusive: true });
  return (
    <Modal
      title={<CodeText text={t("ws.sort.undo.put", { code, point })} />}
      icon={<Undo2 className="size-4 text-muted-foreground" />}
      submitLabel={t("ws.sort.undo.confirm")}
      pending={undo.pending}
      error={undo.error}
      tone="destructive"
      onClose={onClose}
      onSubmit={async () => {
        const res = await undo.run(code);
        if (res.ok) onDone();
      }}
      sheet
    >
      <p className="text-sm">{t("ws.sort.undo.body")}</p>
    </Modal>
  );
}
