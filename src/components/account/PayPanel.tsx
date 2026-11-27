import { useState } from "react";
import { Trash2, X } from "lucide-react";
import { useEditor } from "@/lib/store";
import { useWithArchive } from "@/lib/store/archive";
import { payRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import { signOf } from "@/lib/payExtras";
import type { StaffOutput } from "@/lib/staffReport";
import type { PayAdjustmentKind } from "@/lib/types";
import { useT, type MsgKey } from "@/lib/i18n";
import { formatTime } from "@/components/workstation/useNow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Segmented } from "@/components/ui/segmented";
import { Field, FormError } from "@/components/ui/field";
import { DatePicker } from "@/components/ui/date-picker";
import { fromIso, toIso } from "@/components/ui/dates";
import { DialogHeader, DialogShell } from "@/components/ui/dialog-shell";
import { eyebrow } from "@/components/ui/eyebrow";
import { digitsFor } from "@/lib/numberLimits";

/**
 * Оплата сотрудника за период справа от «Выработки»: из чего сложилось «к
 * выплате» и корректировки старшего — удержания, премии, разовые надбавки
 * (Кирилл 16.11). Удержание можно привязать к ошибке или браку из журнала
 * смены, чтобы через месяц было видно, за что.
 */
const KINDS: PayAdjustmentKind[] = ["deduction", "bonus", "allowance"];

const rub = (v: number) => `${v.toLocaleString("ru-RU")} ₽`;
const hrs = (ms: number) => (ms / 3_600_000).toFixed(1);

export function PayPanel({
  row,
  from,
  to,
  canEdit,
  onClose,
}: {
  row: StaffOutput;
  from: number;
  to: number;
  canEdit: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const all = useEditor((s) => s.payAdjustments);
  // Период зарплаты длиннее окна кабинета (7 дней): ошибки — с архивом.
  const events = useWithArchive("staffEvents");
  const list = all
    .filter((a) => a.staffId === row.staffId && a.at >= from && a.at < to)
    .sort((a, b) => b.at - a.at);
  // Ошибки и брак человека за период — к ним привязывают удержание.
  const faults = events
    .filter(
      (e) =>
        e.staffId === row.staffId &&
        e.at >= from &&
        e.at < to &&
        (e.type === "pack_error" || e.type === "pack_reject"),
    )
    .sort((a, b) => b.at - a.at);
  const faultText = (id: string | undefined) => {
    const e = id ? events.find((x) => x.id === id) : undefined;
    if (!e) return null;
    const what = t(e.type === "pack_error" ? "pay.fault.error" : "pay.fault.reject");
    const when = `${new Date(e.at).toLocaleDateString(t.lang)} ${formatTime(e.at, t.lang)}`;
    return `${what} · ${when}${e.orderId ? ` · ${e.orderId}` : ""}`;
  };

  const add = useCommand(payRepository.add, { exclusive: true });
  const remove = useCommand(payRepository.remove);
  // Конец периода: у текущего — «сейчас», у прошлого месяца — его последний день.
  const today = to - 1;
  const [kind, setKind] = useState<PayAdjustmentKind>("deduction");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [day, setDay] = useState(toIso(new Date(today)));
  const [eventId, setEventId] = useState("");

  const submit = async () => {
    const date = fromIso(day) ?? new Date(today);
    date.setHours(12, 0, 0, 0);
    const res = await add.run({
      staffId: row.staffId,
      kind,
      amount: Number(amount.replace(/\s/g, "").replace(",", ".")),
      reason,
      at: date.getTime(),
      ...(kind === "deduction" && eventId ? { eventId } : {}),
    });
    if (res.ok) {
      setAmount("");
      setReason("");
      setEventId("");
    }
  };

  const line = (label: string, value: string, tone?: "minus" | "total") => (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className={tone === "total" ? "font-semibold" : "text-muted-foreground"}>{label}</span>
      <span
        className={
          tone === "total"
            ? "font-semibold tabular-nums"
            : tone === "minus"
              ? "tabular-nums text-destructive"
              : "tabular-nums"
        }
      >
        {value}
      </span>
    </div>
  );

  return (
    <DialogShell size="md" scroll onClose={onClose}>
      <DialogHeader>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{row.name}</p>
          <p className="text-xs text-muted-foreground">{row.role}</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t("support.close")}>
          <X className="size-4" />
        </Button>
      </DialogHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
        <section className="flex flex-col gap-1.5">
          {row.earned == null ? (
            <p className="text-sm text-muted-foreground">{t("pay.noRate")}</p>
          ) : (
            <>
              {line(t("pay.byRate", { h: hrs(row.paidMs) }), rub(row.earned))}
              {row.nightMs > 0 &&
                line(t("pay.night", { h: hrs(row.nightMs) }), `+${rub(row.nightPay ?? 0)}`)}
              {row.holidayMs > 0 &&
                line(t("pay.holiday", { h: hrs(row.holidayMs) }), `+${rub(row.holidayPay ?? 0)}`)}
            </>
          )}
          {row.bonus > 0 && line(t("pay.sum.bonus"), `+${rub(row.bonus)}`)}
          {row.allowance > 0 && line(t("pay.sum.allowance"), `+${rub(row.allowance)}`)}
          {row.deduction > 0 && line(t("pay.sum.deduction"), `−${rub(row.deduction)}`, "minus")}
          {row.toPay != null && line(t("pay.toPay"), rub(row.toPay), "total")}
        </section>

        <section className="flex flex-col gap-2">
          <h3 className={eyebrow({ tone: "muted" })}>{t("pay.list")}</h3>
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("pay.empty")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {list.map((a) => (
                <li key={a.id} className="flex items-start gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-medium">{t(`pay.kind.${a.kind}` as MsgKey)}</span>
                      {" · "}
                      {a.reason}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(a.at).toLocaleDateString(t.lang)}
                      {a.by ? ` · ${a.by}` : ""}
                      {a.restored ? ` · ${t("restore.fromBackup")}` : ""}
                    </p>
                    {faultText(a.eventId) && (
                      <p className="text-xs text-muted-foreground">{faultText(a.eventId)}</p>
                    )}
                  </div>
                  <span
                    className={
                      signOf(a.kind) < 0
                        ? "text-sm tabular-nums text-destructive"
                        : "text-sm tabular-nums"
                    }
                  >
                    {signOf(a.kind) < 0 ? "−" : "+"}
                    {rub(a.amount)}
                  </span>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("pay.remove")}
                      disabled={remove.pending}
                      onClick={() => void remove.run(a.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {canEdit && (
          <section className="flex flex-col gap-3">
            <h3 className={eyebrow({ tone: "muted" })}>{t("pay.add")}</h3>
            <Segmented<PayAdjustmentKind>
              size="sm"
              ariaLabel={t("pay.kindLabel")}
              value={kind}
              onChange={setKind}
              options={KINDS.map((k) => ({ value: k, label: t(`pay.kind.${k}` as MsgKey) }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("pay.amount")}>
                <Input
                  inputMode="numeric"
                  maxLength={digitsFor("money") + 2}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>
              <Field label={t("pay.day")}>
                <DatePicker
                  value={day}
                  onChange={(v) => setDay(v || toIso(new Date(today)))}
                  lang={t.lang}
                  min={toIso(new Date(from))}
                  max={toIso(new Date(to - 1))}
                />
              </Field>
            </div>
            <Field label={t("pay.reason")}>
              <Input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
            </Field>
            {kind === "deduction" && faults.length > 0 && (
              <Field label={t("pay.fault")}>
                <Select value={eventId} onChange={(e) => setEventId(e.target.value)}>
                  <option value="">{t("pay.faultNone")}</option>
                  {faults.map((e) => (
                    <option key={e.id} value={e.id}>
                      {faultText(e.id)}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {add.error && <FormError className="text-xs">{t(add.error)}</FormError>}
            <div>
              <Button size="sm" disabled={add.pending} onClick={() => void submit()}>
                {t("pay.addButton")}
              </Button>
            </div>
          </section>
        )}
      </div>
    </DialogShell>
  );
}
