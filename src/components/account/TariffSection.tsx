import { useEffect, useState } from "react";
import { Check, Headset, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { useEditor } from "@/lib/store";
import { hasCabinetServer } from "@/lib/data/api";
import { isTariffId, planRepository, type CompanyPlan } from "@/lib/data/planRepository";
import { useCommand } from "@/lib/useCommand";
import { TARIFF_FEATURES } from "@/lib/tariff";
import type { TariffId } from "@/lib/types";
import { useT, type MsgKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Row } from "./ProfileRow";
import { TariffLock } from "@/components/tariff/TariffLock";

/**
 * В кабинете тарифы идут по возрастанию возможностей: Старт → Склад →
 * Оператор. На витрине порядок маркетинговый, здесь — рабочий.
 */
const CABINET_ORDER: TariffId[] = ["start", "warehouse", "operator"];

/** Что показываем на плитке тарифа — то, чем тарифы различаются в кабинете. */
const FEATURE_LABELS: { key: keyof (typeof TARIFF_FEATURES)["start"]; label: MsgKey }[] = [
  { key: "fullAnalytics", label: "tariff.f.analytics" },
  { key: "weeklyEmailBackup", label: "tariff.f.email" },
  { key: "personalManager", label: "tariff.f.manager" },
];

/** 2027-01-15T… → 15.01.2027. */
const day = (iso: string | null | undefined) =>
  iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "";
const rub = (v: number) => `${v.toLocaleString("ru-RU")} ₽`;

/**
 * Тариф плитками и персональный менеджер. Плитки, а не переключатель: рядом с
 * названием видно, чем тарифы различаются. Менеджера назначает Уклад, поэтому
 * строка только для чтения.
 *
 * С сервером тариф назначает только Уклад (админка): плитка другого тарифа
 * отправляет просьбу, а не переключает (Кирилл 18.11). Кабинет берёт тариф с
 * сервера и подстраивает под него свои функции. Демо без сервера переключает
 * тариф в браузере — посмотреть, чем тарифы отличаются.
 */
export function TariffSection() {
  const t = useT();
  const sub = useEditor((s) => s.subscription);
  const setTariff = useEditor((s) => s.setTariff);
  const hasManager = TARIFF_FEATURES[sub.tariff].personalManager;
  // Смена тарифа — в два шага: выбрать плитку и подтвердить. Один клик по
  // плитке тариф больше не переключает.
  const [pick, setPick] = useState<TariffId | null>(null);
  const [plan, setPlan] = useState<CompanyPlan | null>(null);
  const load = useCommand(planRepository.get);
  const ask = useCommand(planRepository.request);

  useEffect(() => {
    if (!hasCabinetServer) return;
    void load.run().then((r) => {
      if (!r.ok) return;
      setPlan(r.data);
      // Функции кабинета — по назначенному тарифу, а не по выбранному когда-то
      // в браузере.
      if (r.data && isTariffId(r.data.tariff)) setTariff(r.data.tariff);
    });
    // Один раз при открытии вкладки.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current: TariffId = hasCabinetServer
    ? plan && isTariffId(plan.tariff)
      ? plan.tariff
      : sub.tariff
    : sub.tariff;
  // Без сервера — плитки переключают; с сервером — только когда план пришёл.
  const canPick = !hasCabinetServer || Boolean(plan);

  const confirm = async () => {
    if (!pick) return;
    if (!hasCabinetServer) {
      setTariff(pick);
      setPick(null);
      return;
    }
    const r = await ask.run(pick);
    if (r.ok) {
      setPlan(r.data);
      setPick(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {hasCabinetServer && <PlanStatus plan={plan} loading={load.pending} error={load.error} />}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {CABINET_ORDER.map((id) => {
          const active = id === current;
          const picked = id === pick;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              disabled={!canPick}
              onClick={() => setPick(active ? null : id)}
              className={cn(
                "flex cursor-pointer flex-col gap-2 rounded-xl bg-muted/50 p-3 text-left transition-colors hover:bg-muted disabled:cursor-default",
                active && "ring-2 ring-primary",
                picked && "ring-2 ring-primary/40",
              )}
            >
              <span className="flex items-center justify-between text-sm font-semibold">
                {t(`tariff.${id}`)}
                {active && <Check className="size-4 text-primary" />}
              </span>
              <ul className="flex flex-col gap-1">
                {FEATURE_LABELS.map((f) => {
                  const on = TARIFF_FEATURES[id][f.key];
                  return (
                    <li
                      key={f.key}
                      className={cn(
                        "flex items-center gap-1.5 text-xs",
                        on ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {on ? (
                        <Check className="size-3 shrink-0 text-primary" />
                      ) : (
                        <Minus className="size-3 shrink-0" />
                      )}
                      {t(f.label)}
                    </li>
                  );
                })}
              </ul>
            </button>
          );
        })}
      </div>

      {pick && pick !== current && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void confirm()} disabled={ask.pending}>
            {hasCabinetServer
              ? t("plan.ask", { plan: t(`tariff.${pick}`) })
              : t("tariff.switchTo", { plan: t(`tariff.${pick}`) })}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPick(null)}>
            {t("tariff.keep")}
          </Button>
          {ask.error && <FormError>{t(ask.error)}</FormError>}
        </div>
      )}
      {plan?.request && (
        <p className="px-1 text-xs text-muted-foreground">
          {t("plan.asked", {
            plan: t(`tariff.${plan.request.tariff}`),
            date: day(plan.request.at),
          })}
        </p>
      )}

      <div>
        <Row icon={<Headset className="size-4" />} label={t("manager.label")}>
          {!hasManager ? (
            <TariffLock feature="personalManager" />
          ) : sub.manager ? (
            <div className="flex flex-col items-end text-sm">
              <span className="font-medium">{sub.manager.name}</span>
              <span className="text-xs text-muted-foreground">
                {[sub.manager.phone, sub.manager.email].filter(Boolean).join(" · ")}
              </span>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">{t("manager.pending")}</span>
          )}
        </Row>
      </div>
      <p className="px-1 text-xs text-muted-foreground">
        {t(hasCabinetServer ? "plan.hint" : "tariff.hint")}
      </p>
    </div>
  );
}

/** Срок, цена и счёт: одна-две строки над плитками. */
function PlanStatus({
  plan,
  loading,
  error,
}: {
  plan: CompanyPlan | null;
  loading: boolean;
  error: MsgKey | null;
}) {
  const t = useT();
  if (loading) return null;
  if (error) return <p className="px-1 text-sm text-muted-foreground">{t(error)}</p>;
  if (!plan) return <p className="px-1 text-sm text-muted-foreground">{t("plan.none")}</p>;
  const term =
    plan.state === "trial"
      ? t("plan.state.trial", { date: day(plan.trialUntil) })
      : plan.state === "paid"
        ? t("plan.state.paid", { date: day(plan.paidUntil) })
        : plan.state === "overdue"
          ? t("plan.state.overdue")
          : t("plan.state.blocked");
  return (
    <div className="flex flex-col gap-1 px-1 text-sm">
      <p>
        <span
          className={cn(
            "font-medium",
            plan.state === "overdue" || plan.state === "blocked"
              ? "text-destructive"
              : "text-foreground",
          )}
        >
          {term}
        </span>
        {plan.price != null && (
          <span className="text-muted-foreground">
            {" · "}
            {t("plan.price", { sum: rub(plan.price) })}
          </span>
        )}
      </p>
      {plan.invoice && (
        <p className="text-muted-foreground">
          {t("plan.invoice", {
            number: plan.invoice.number,
            sum: rub(plan.invoice.amount),
            date: day(plan.invoice.dueAt),
          })}
        </p>
      )}
    </div>
  );
}
