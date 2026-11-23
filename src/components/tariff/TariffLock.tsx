import { useState } from "react";
import { Check, Lock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { DialogFooter, DialogHeader, DialogShell } from "@/components/ui/dialog-shell";
import { useEditor } from "@/lib/store";
import { hasCabinetServer } from "@/lib/data/api";
import { planRepository } from "@/lib/data/planRepository";
import { useCommand } from "@/lib/useCommand";
import { cheapestWith, type TariffFeatures } from "@/lib/tariff";
import { useT, type MsgKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
// Цены и оффер — те же константы, что на сайте: цифра в кабинете не должна
// разойтись с витриной и офертой.
import { FIRST_WAREHOUSES, OFFER } from "@/site/data/offer";
import { PLANS } from "@/site/data/plans";

/**
 * Функция не входит в тариф: вместо серого «только в …» — синий замок, по
 * нажатию панель «Доступно в тарифе X» с ценой и предложением (Кирилл 19.11).
 *
 * Как у других: Notion, Slack, Linear показывают закрытую функцию на месте
 * с отметкой тарифа, а не прячут её — человек узнаёт, что она есть, и в один
 * шаг видит, где её взять. Панель справа, как все окна кабинета (ADR 0007).
 */
type Feature = keyof TariffFeatures;

const FEATURE_TEXT: Record<Feature, { title: MsgKey; body: MsgKey }> = {
  fullAnalytics: { title: "tariff.f.analytics", body: "lock.body.analytics" },
  weeklyEmailBackup: { title: "tariff.f.email", body: "lock.body.email" },
  personalManager: { title: "tariff.f.manager", body: "lock.body.manager" },
};

const priceOf = (id: string) => PLANS.find((p) => p.id === id)?.monthly ?? null;
const rub = (v: number) => `${v.toLocaleString("ru-RU")} ₽`;

/** Кнопка-замок с названием тарифа, где функция есть. */
export function TariffLock({ feature, className }: { feature: Feature; className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const plan = cheapestWith(feature);
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
        className={cn("text-primary hover:text-primary", className)}
      >
        <Lock className="size-3.5" />
        {t("lock.chip", { plan: t(`tariff.${plan}`) })}
      </Button>
      {open && <TariffUpsell feature={feature} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * Панель «Доступно в тарифе X». С сервером тариф назначает Уклад (#193),
 * поэтому кнопка отправляет просьбу; в демо — переключает тариф сразу, чтобы
 * посетитель увидел функцию.
 */
function TariffUpsell({ feature, onClose }: { feature: Feature; onClose: () => void }) {
  const t = useT();
  const current = useEditor((s) => s.subscription.tariff);
  const setTariff = useEditor((s) => s.setTariff);
  const goToProfile = useEditor((s) => s.goToProfile);
  const ask = useCommand(planRepository.request, { exclusive: true });
  const [asked, setAsked] = useState(false);

  const plan = cheapestWith(feature);
  const planName = t(`tariff.${plan}`);
  const price = priceOf(plan);
  const special = plan === FIRST_WAREHOUSES.plan;
  const text = FEATURE_TEXT[feature];
  const months = (n: number) =>
    `${n}\u00a0${t.plural(n, ["месяц", "месяца", "месяцев"], ["month", "months"])}`;

  const onPrimary = async () => {
    if (!hasCabinetServer) {
      setTariff(plan);
      onClose();
      return;
    }
    const r = await ask.run(plan);
    if (r.ok) setAsked(true);
  };

  return (
    <DialogShell size="md" onClose={onClose}>
      <DialogHeader align="start">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Lock className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">{t("lock.title", { plan: planName })}</p>
            <p className="text-xs text-muted-foreground">
              {t("lock.current", { plan: t(`tariff.${current}`) })}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t("lock.close")}>
          <X className="size-4" />
        </Button>
      </DialogHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold">{t(text.title)}</p>
          <p className="text-sm text-muted-foreground">{t(text.body)}</p>
        </div>

        {price != null && (
          <p className="text-sm">{t("lock.price", { plan: planName, sum: rub(price) })}</p>
        )}

        <ul className="flex flex-col gap-2 rounded-lg bg-primary/5 px-4 py-3 text-sm">
          {special && (
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              {t("lock.offer.special", {
                places: FIRST_WAREHOUSES.places,
                sum: rub(FIRST_WAREHOUSES.price),
                period: months(FIRST_WAREHOUSES.months),
              })}
            </li>
          )}
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" />
            {t("lock.offer.trial", { period: months(OFFER.freeMonths) })}
          </li>
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" />
            {t("lock.offer.noMove")}
          </li>
        </ul>

        {asked && <p className="text-sm text-success">{t("lock.asked", { plan: planName })}</p>}
        {ask.error && <FormError>{t(ask.error)}</FormError>}
      </div>

      <DialogFooter spread>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            onClose();
            goToProfile();
          }}
        >
          {t("lock.compare")}
        </Button>
        {asked ? (
          <Button size="sm" onClick={onClose}>
            {t("lock.ok")}
          </Button>
        ) : (
          <Button size="sm" disabled={ask.pending} onClick={() => void onPrimary()}>
            {t(hasCabinetServer ? "plan.ask" : "tariff.switchTo", { plan: planName })}
          </Button>
        )}
      </DialogFooter>
    </DialogShell>
  );
}
