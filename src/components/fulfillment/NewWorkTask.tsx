import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useEditor } from "@/lib/store";
import { serviceSpec, taskKinds } from "@/lib/operations";
import type { ServiceKind } from "@/lib/types";
import { useT, type MsgKey } from "@/lib/i18n";
import { LIMITS } from "@/lib/numberLimits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { DialogFooter, DialogHeader, DialogShell } from "@/components/ui/dialog-shell";
import { useServiceName } from "./useServiceName";

/**
 * Новая работа склада — маркировка, переупаковка, возвраты, свои услуги — в
 * панели справа, как и карточка любого задания (раньше форма висела над
 * списком работ). Работа попадает в ту же таблицу заданий.
 */
export function NewWorkTask({ onClose }: { onClose: () => void }) {
  const t = useT();
  const svcName = useServiceName();
  const settings = useEditor((s) => s.serviceSettings);
  const staff = useEditor((s) => s.warehouse.staff);
  const partners = useEditor((s) => s.warehouse.partners);
  const createTask = useEditor((s) => s.createTask);
  const kinds = taskKinds(settings);
  const [kind, setKind] = useState<ServiceKind>(kinds[0] as ServiceKind);
  const [qty, setQty] = useState("1");
  const [partnerId, setPartnerId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [note, setNote] = useState("");

  // Набор операций могли поменять в «Услугах и ценах» — выбранная могла выключиться.
  const current = kinds.includes(kind) ? kind : (kinds[0] as ServiceKind | undefined);
  const n = Number(qty);
  const bad = !current || !Number.isFinite(n) || n < 1;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (bad || !current) return;
    createTask({ kind: current, qty: n, partnerId, staffId, note });
    onClose();
  };

  return (
    <DialogShell size="md" onClose={onClose}>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <DialogHeader>
          <h2 className="text-base font-semibold">{t("tasks.newWork")}</h2>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={t("tasks.card.close")}
            onClick={onClose}
          >
            <X />
          </Button>
        </DialogHeader>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          {kinds.length === 0 || !current ? (
            // Почему нельзя и как устранить (правило Кирилла 21.11).
            <p className="text-sm text-muted-foreground">{t("ops.task.noKinds")}</p>
          ) : (
            <>
              <Field label={t("ops.task.kind")}>
                <Select value={current} onChange={(e) => setKind(e.target.value as ServiceKind)}>
                  {kinds.map((k) => (
                    <option key={k} value={k}>
                      {svcName(k)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label={`${t("ops.task.qty")} (${t(`ops.unit.${serviceSpec(current, settings)?.unit ?? "unit"}` as MsgKey)})`}
                error={bad ? t("ops.task.qtyBad") : undefined}
              >
                <Input
                  max={LIMITS.count.max}
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="tabular-nums"
                />
              </Field>
              <Field label={t("ops.task.partner")}>
                <Select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
                  <option value="">{t("ops.task.none")}</option>
                  {(partners ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("ops.task.staff")}>
                <Select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                  <option value="">{t("ops.task.none")}</option>
                  {(staff ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("ops.task.note")}>
                <Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={bad}>
            <Plus /> {t("ops.task.create")}
          </Button>
        </DialogFooter>
      </form>
    </DialogShell>
  );
}
