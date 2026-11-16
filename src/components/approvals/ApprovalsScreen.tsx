import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useEditor } from "@/lib/store";
import { switchRepository, type SwitchRequest } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import { useT, type MsgKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { EmptyState, ScreenShell } from "@/components/fulfillment/ScreenShell";
import { Segmented } from "@/components/ui/segmented";
import { TableSearch } from "@/components/ui/data-table";
import { card } from "@/components/ui/card";

/**
 * «Подтверждения» (Кирилл 16.11): всё, что сотрудник у стола просит, а
 * старший разрешает, — одной страницей кабинета. Первым разделом — смена
 * процесса без выхода: упаковщик просит сортировку, старший разрешает здесь,
 * и ТСД переключается сам. Сюда же лягут отмены сканов и другие решения
 * старшего. Решение пишет сервер, с именем решившего.
 *
 * Вид — как у остальных экранов кабинета (Кирилл 16.11): поиск по
 * сотруднику, фильтр по виду заявки, вид — меткой в строке, а не
 * заголовком раздела; строки — в карточке.
 */

/** Виды заявок. Новый вид решения старшего — сюда, с подписью в словаре. */
type ApprovalKind = "switch";
const KINDS: readonly ApprovalKind[] = ["switch"];

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
        <ApprovalList
          items={items}
          busy={decide.pending}
          onAnswer={(id, ok) => void answer(id, ok)}
        />
      )}
    </ScreenShell>
  );
}

function ApprovalList({
  items,
  busy,
  onAnswer,
}: {
  items: SwitchRequest[];
  busy: boolean;
  onAnswer: (id: string, approve: boolean) => void;
}) {
  const t = useT();
  const [kind, setKind] = useState<ApprovalKind | "all">("all");
  const [query, setQuery] = useState("");
  const staff = useEditor((s) => s.warehouse.staff);
  const nameOf = (id: string) => staff?.find((m) => m.id === id)?.name ?? id;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (r) =>
        (kind === "all" || kind === "switch") &&
        (!q || nameOf(r.staffId).toLowerCase().includes(q)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, kind, query, staff]);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <TableSearch value={query} onChange={setQuery} placeholder={t("common.search")} />
        <Segmented
          size="sm"
          value={kind}
          onChange={setKind}
          ariaLabel={t("approvals.kindFilter")}
          options={[
            { value: "all" as const, label: `${t("approvals.kind.all")} ${items.length}` },
            ...KINDS.map((k) => ({
              value: k,
              label: `${t(`approvals.kind.${k}` as MsgKey)} ${items.length}`,
            })),
          ]}
        />
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("approvals.nothingFound")}</p>
      ) : (
        <ul className={card({ className: "flex flex-col divide-y divide-border" })}>
          {shown.map((r) => (
            <SwitchLine
              key={r.id}
              r={r}
              who={nameOf(r.staffId)}
              busy={busy}
              onAnswer={(ok) => onAnswer(r.id, ok)}
            />
          ))}
        </ul>
      )}
    </>
  );
}

function SwitchLine({
  r,
  who,
  busy,
  onAnswer,
}: {
  r: SwitchRequest;
  who: string;
  busy: boolean;
  onAnswer: (approve: boolean) => void;
}) {
  const t = useT();
  const time = new Date(r.at).toLocaleTimeString(t.lang === "ru" ? "ru-RU" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {who}
          <span className="rounded bg-muted px-1.5 py-0.5 text-2xs font-semibold text-muted-foreground">
            {t("approvals.kind.switch")}
          </span>
        </p>
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {r.from && <span>{t(`ws.station.${r.from}` as MsgKey)}</span>}
          {r.from && <ArrowRight className="size-3.5" />}
          <span className="font-medium text-foreground">
            {t(`ws.station.${r.station}` as MsgKey)}
          </span>
          <span className="tabular-nums">· {time}</span>
        </p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onAnswer(false)}>
          {t("approvals.decline")}
        </Button>
        <Button size="sm" disabled={busy} onClick={() => onAnswer(true)}>
          {t("approvals.approve")}
        </Button>
      </div>
    </li>
  );
}
