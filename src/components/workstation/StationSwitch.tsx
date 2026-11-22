import { Check, Hourglass } from "lucide-react";
import { useEditor } from "@/lib/store";
import { switchRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import { stationsFor } from "@/lib/stationSwitch";
import type { WorkstationKind } from "@/lib/types";
import { useT, type MsgKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/**
 * Смена процесса без выхода (Кирилл 15–16.11): упаковщик идёт на сортировку
 * с тем же ТСД — выбирает процесс, старший разрешает в кабинете на странице
 * «Подтверждения», и процесс меняется сам. Бесконтрольно переходить нельзя:
 * на складе в 50 человек каждый переход кто-то разрешает. В списке только
 * процессы роли сотрудника (`stationsFor`); пока ждём, он работает в прежнем.
 */
/**
 * На телефоне короткое содержимое панели — по центру экрана (Кирилл 16.11):
 * ожидание и короткий список не прилипают к шапке. На широком экране панель
 * справа, там как обычно сверху.
 */
const CENTER = "flex flex-1 flex-col justify-center gap-4 md:flex-none md:justify-start";

export function StationSwitch({ onDone }: { onDone: () => void }) {
  const t = useT();
  const session = useEditor((s) => s.stationSession);
  const pending = useEditor((s) => s.pendingSwitch);
  const ask = useCommand(switchRepository.request, { exclusive: true });
  const drop = useCommand(switchRepository.cancel, { exclusive: true });
  if (!session) return null;
  const options = stationsFor(session.permissions);
  const current = session.station;
  const name = (st: WorkstationKind) => t(`ws.station.${st}` as MsgKey);

  if (pending) {
    return (
      <div className={CENTER}>
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4">
          <Hourglass className="mt-0.5 size-5 shrink-0 text-warning" />
          <div className="flex flex-col gap-1">
            <p className="font-medium">
              {t("ws.switch.waitTitle", { name: name(pending.station) })}
            </p>
            <p className="text-sm text-muted-foreground">{t("ws.switch.waitBody")}</p>
          </div>
        </div>
        <Button
          variant="outline"
          className="w-full md:w-auto md:self-start"
          disabled={drop.pending}
          onClick={() => void drop.run(pending.id)}
        >
          {t("ws.switch.cancel")}
        </Button>
      </div>
    );
  }

  return (
    <div className={CENTER}>
      <p className="text-sm text-muted-foreground">{t("ws.switch.body")}</p>
      <ul className="flex flex-col gap-2">
        {options.map((st) => {
          const here = st === current;
          return (
            <li key={st}>
              <button
                type="button"
                disabled={ask.pending}
                aria-current={here || undefined}
                onClick={() => (here ? onDone() : void ask.run(st))}
                className={cn(
                  // Крупно, под палец: на ТСД это нажимают на ходу.
                  "flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border px-4 text-left text-base font-medium transition-colors",
                  here
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border hover:border-primary hover:bg-muted/60",
                )}
              >
                {name(st)}
                {here && (
                  <span className="flex items-center gap-1 text-xs font-medium">
                    <Check className="size-4" />
                    {t("ws.switch.current")}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        {t(options.length <= 1 ? "ws.switch.only" : "ws.switch.unsaved")}
      </p>
      {ask.error && <FormError>{t(ask.error)}</FormError>}
    </div>
  );
}
