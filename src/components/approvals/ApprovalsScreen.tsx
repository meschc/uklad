import { useEffect, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useEditor } from "@/lib/store";
import { switchRepository, type SwitchRequest } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import { useT, type MsgKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { EmptyState, ScreenShell } from "@/components/fulfillment/ScreenShell";

/**
 * «Подтверждения» (Кирилл 16.11): всё, что сотрудник у стола просит, а
 * старший разрешает, — одной страницей кабинета. Первым разделом — смена
 * процесса без выхода: упаковщик просит сортировку, старший разрешает здесь,
 * и ТСД переключается сам. Сюда же лягут отмены сканов и другие решения
 * старшего. Решение пишет сервер, с именем решившего.
 */

/** Как часто страница забирает новые заявки. */
const POLL_MS = 5000;

export function ApprovalsScreen() {
  const t = useT();
  const [items, setItems] = useState<SwitchRequest[] | null>(null);
  const [tick, setTick] = useState(0);
  const decide = useCommand(switchRepository.decide);

  useEffect(() => {
    let gone = false;
    void switchRepository.pending().then((res) => {
      if (!gone && res.ok) setItems(res.data);
    });
    const timer = setTimeout(() => setTick((n) => n + 1), POLL_MS);
    return () => {
      gone = true;
      clearTimeout(timer);
    };
  }, [tick]);

  const answer = async (id: string, approve: boolean) => {
    await decide.run(id, approve);
    // И при «уже решено другим» список надо обновить.
    setTick((n) => n + 1);
  };

  return (
    <ScreenShell title={t("approvals.title")} wide>
      {decide.error && <FormError>{t(decide.error)}</FormError>}
      {items === null ? null : items.length === 0 ? (
        <EmptyState icon={<ShieldCheck className="size-5" />} title={t("approvals.emptyTitle")} />
      ) : (
        <ul className="flex flex-col">
          {items.map((r) => (
            <SwitchLine
              key={r.id}
              r={r}
              busy={decide.pending}
              onAnswer={(ok) => void answer(r.id, ok)}
            />
          ))}
        </ul>
      )}
    </ScreenShell>
  );
}

function SwitchLine({
  r,
  busy,
  onAnswer,
}: {
  r: SwitchRequest;
  busy: boolean;
  onAnswer: (approve: boolean) => void;
}) {
  const t = useT();
  const who = useEditor((s) => s.warehouse.staff?.find((m) => m.id === r.staffId)?.name);
  const time = new Date(r.at).toLocaleTimeString(t.lang === "ru" ? "ru-RU" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <li className="flex flex-wrap items-center justify-between gap-4 border-t border-border py-4 first:border-t-0 first:pt-0">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-base font-medium">{who ?? r.staffId}</p>
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {r.from && <span>{t(`ws.station.${r.from}` as MsgKey)}</span>}
          {r.from && <ArrowRight className="size-4" />}
          <span className="font-medium text-foreground">
            {t(`ws.station.${r.station}` as MsgKey)}
          </span>
          <span className="tabular-nums">· {time}</span>
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" disabled={busy} onClick={() => onAnswer(false)}>
          {t("approvals.decline")}
        </Button>
        <Button disabled={busy} onClick={() => onAnswer(true)}>
          {t("approvals.approve")}
        </Button>
      </div>
    </li>
  );
}
