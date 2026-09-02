import { useState } from "react";
import { useEditor } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { staffOptionLabel } from "@/lib/staff";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "./Modal";

/**
 * Погрузка рейса: собранные заявки одного назначения уезжают одной машиной.
 *
 * Отдельный шаг после сборки — потому что для продавца «снято с полок» и
 * «уехало» это разные события, и отвечает за них склад как подрядчик. Номер
 * машины и ответственный необязательны: в жизни машина бывает без номера в
 * заявке, а блокировать отгрузку из-за пустого поля — вредить работе.
 */
export function ShipDialog({
  requestIds,
  onClose,
}: {
  requestIds: string[];
  onClose: () => void;
}) {
  const shipRequests = useEditor((s) => s.shipRequests);
  const staff = useEditor((s) => s.warehouse.staff ?? []);
  const t = useT();
  // Если машину назвал продавец в заявке — подставляем её, кладовщику
  // остаётся только подтвердить. Разные машины в пакете не склеиваем.
  const fromSeller = useEditor((s) => {
    const picked = s.requests.filter((r) => requestIds.includes(r.id));
    const named = [...new Set(picked.map((r) => r.vehicle).filter(Boolean))];
    return named.length === 1 ? (named[0] as string) : "";
  });
  const [vehicle, setVehicle] = useState(fromSeller);
  const [staffId, setStaffId] = useState("");

  const submit = () => {
    shipRequests(requestIds, { vehicle, staffId: staffId || undefined });
    onClose();
  };

  return (
    <Modal
      title={t("ship.title")}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={t("ship.confirm")}
    >
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          {t("ship.subtitle", { n: requestIds.length })}
        </p>

        <label className="flex flex-col gap-1.5">
          <Label>
            {t("ship.vehicle")}
            <span className="ml-1.5 font-normal normal-case text-muted-foreground/70">
              · {t("common.optional")}
            </span>
          </Label>
          <Input
            autoFocus
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value)}
            placeholder={t("ship.vehiclePlaceholder")}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
        </label>

        {staff.length > 0 && (
          <label className="flex flex-col gap-1.5">
            <Label>
              {t("ship.staff")}
              <span className="ml-1.5 font-normal normal-case text-muted-foreground/70">
                · {t("common.optional")}
              </span>
            </Label>
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">—</option>
              {staff.map((m) => (
                <option key={m.id} value={m.id}>
                  {staffOptionLabel(m)}
                </option>
              ))}
            </select>
          </label>
        )}

      </div>
    </Modal>
  );
}
