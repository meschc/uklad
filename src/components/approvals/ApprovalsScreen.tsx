import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useEditor } from "@/lib/store";
import { receivingAnswersRepository, switchRepository, type SwitchRequest } from "@/lib/data";
import { mayDecideSwitch, usePendingSwitches, type PendingSwitches } from "./usePendingSwitches";
import { useCommand } from "@/lib/useCommand";
import { useT, type MsgKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { EmptyState, ScreenShell } from "@/components/fulfillment/ScreenShell";
import { Segmented } from "@/components/ui/segmented";
import { TableSearch } from "@/components/ui/data-table";
import { card } from "@/components/ui/card";
import { EmbeddedShell } from "@/components/fulfillment/embeddedShell";
import { DisputesScreen } from "@/components/workstation/DisputesScreen";
import type { DisputeKind } from "@/lib/types";
import { openObjections } from "@/lib/supplyAct";
import { SellerObjections } from "./SellerObjections";

/**
 * «Подтверждения» (Кирилл 16.11): всё, что ждёт решения старшего, — одной
 * страницей кабинета. Смена процесса без выхода (сотрудник просит на ТСД,
 * старший разрешает здесь, и ТСД переключается сам) и спорный товар со
 * столов: недостача, пересорт, брак, расхождения пересчёта. Отдельного пункта
 * «Спорные» в меню больше нет, старая ссылка на него ведёт сюда.
 *
 * Вид — как у остальных экранов кабинета: поиск, фильтр по виду заявки,
 * вид — меткой в строке. Смотреть можно с `goods.view`, решать — по праву:
 * смену процесса — `goods.decide` (сервер отдаёт заявки только с ним),
 * спорное — по правилам `DisputesScreen`.
 */

/** Виды заявок. Новый вид решения старшего — сюда, с подписью в словаре. */
type ApprovalKind = "switch" | "seller" | "shortage" | "mismatch" | "defect" | "inventory";
type GoodsKind = Exclude<ApprovalKind, "switch" | "seller">;

/** Какие виды спорного под какой меткой фильтра. */
const GOODS: Record<GoodsKind, readonly DisputeKind[]> = {
  shortage: ["shortage", "not_in_tote"],
  mismatch: ["extra", "receive_overage"],
  defect: ["not_packable"],
  inventory: ["inventory_short", "inventory_over"],
};
const KINDS: readonly ApprovalKind[] = [
  "switch",
  "seller",
  "shortage",
  "mismatch",
  "defect",
  "inventory",
];

/** Как часто страница забирает возражения продавцов. */
const POLL_MS = 5000;

/**
 * `embedded` — внутри «Заданий» чипом «Подтверждения» (Кирилл 24.11: «подтверждения
 * переноси, журнал оставляю»): без своей шапки, заголовок и подзаголовок у «Заданий».
 * `switches` — заявки, которые уже забирает «Задания» для счётчика чипа: второй
 * опрос того же списка не нужен.
 */
export function ApprovalsScreen({
  embedded = false,
  switches: shared,
}: { embedded?: boolean; switches?: PendingSwitches } = {}) {
  const t = useT();
  const perms = useEditor((s) => s.session.permissions);
  const maySwitch = mayDecideSwitch(perms);
  const mayDecide = !perms || perms.includes("goods.decide");
  const own = usePendingSwitches(maySwitch && !shared);
  const { items, refresh } = shared ?? own;
  const decide = useCommand(switchRepository.decide);
  const [kind, setKind] = useState<ApprovalKind | "all">("all");
  // Вкладки «Ждут решения» / «Решённые» (Кирилл 24.11). Решённым бывает только
  // спорный товар: смена процесса и возражения продавца после ответа уходят.
  const [tab, setTab] = useState<"open" | "done">("open");
  const [query, setQuery] = useState("");
  const disputes = useEditor((s) => s.disputes);
  const staff = useEditor((s) => s.warehouse.staff);
  const answers = useEditor((s) => s.receivingAnswers);

  // Возражения продавцов — с сервера своим опросом; в демо они уже в сторе.
  // Тем же опросом — решённые заявки на смену процесса: видно, применил ли их стол.
  const [tick, setTick] = useState(0);
  const [decided, setDecided] = useState<SwitchRequest[]>([]);
  useEffect(() => {
    let gone = false;
    void receivingAnswersRepository.load();
    if (maySwitch)
      void switchRepository.decided().then((res) => {
        if (!gone && res.ok) setDecided(res.data);
      });
    const timer = setTimeout(() => setTick((n) => n + 1), POLL_MS);
    return () => {
      gone = true;
      clearTimeout(timer);
    };
  }, [tick, maySwitch]);

  const answer = async (r: SwitchRequest, approve: boolean) => {
    const res = await decide.run(r.id, approve);
    // И при «уже решено другим» список надо обновить.
    refresh();
    setTick((n) => n + 1);
    // Заявка уходит из списка — говорим, что с ней стало, а не молчим (разбор 27.11).
    if (res.ok)
      useEditor
        .getState()
        .notify("success", approve ? "approvals.switch.approved" : "approvals.switch.declined", {
          vars: { who: nameOf(r.staffId), station: t(`ws.station.${r.station}` as MsgKey) },
        });
  };

  const counts = useMemo(() => {
    // Метки вида считают то, что во вкладке: ждущее или решённое.
    const inTab = disputes.filter((d) => (tab === "done") === Boolean(d.resolution));
    const out = {
      switch: tab === "open" ? (items?.length ?? 0) : decided.length,
      seller: tab === "open" ? openObjections(answers).length : 0,
    } as Record<ApprovalKind, number>;
    for (const k of Object.keys(GOODS) as GoodsKind[])
      out[k] = inTab.filter((d) => GOODS[k].includes(d.kind)).length;
    return out;
  }, [disputes, items, answers, tab, decided]);
  const inTabTotal = KINDS.reduce((n, k) => n + counts[k], 0);
  const total =
    (items?.length ?? 0) +
    openObjections(answers).length +
    disputes.filter((d) => !d.resolution).length;
  const doneCount = disputes.filter((d) => d.resolution).length + decided.length;
  const hasHistory = doneCount > 0;

  const nameOf = (id: string) => staff?.find((m) => m.id === id)?.name ?? id;
  const q = query.trim().toLowerCase();
  const byName = (r: SwitchRequest) => !q || nameOf(r.staffId).toLowerCase().includes(q);
  const switches = (tab === "open" ? (items ?? []) : decided).filter(byName);
  const showSwitch = maySwitch && (kind === "all" || kind === "switch");
  const showSeller = tab === "open" && (kind === "all" || kind === "seller");
  const goodsKinds =
    kind === "all" ? undefined : kind === "switch" || kind === "seller" ? null : GOODS[kind];

  // Метка фильтра — только у вида, где что-то ждёт, и у выбранного: шесть
  // пустых сегментов на телефоне не помещаются и ничего не говорят.
  const options = [
    { value: "all" as const, label: `${t("approvals.kind.all")} ${inTabTotal}` },
    ...KINDS.filter((k) => (k !== "switch" || maySwitch) && (counts[k] > 0 || k === kind)).map(
      (k) => ({ value: k, label: `${t(`approvals.kind.${k}` as MsgKey)} ${counts[k]}` }),
    ),
  ];

  // Функция, а не вложенный компонент: новый тип на каждый рендер пересоздавал
  // бы всё внутри, и поиск терял бы фокус на каждой букве.
  const shell = (children: ReactNode) =>
    embedded ? (
      <div className="flex flex-col gap-5">{children}</div>
    ) : (
      <ScreenShell title={t("approvals.title")} subtitle={t("approvals.lead")} wide>
        {children}
      </ScreenShell>
    );

  if (items === null) return shell(null);

  return shell(
    <>
      {decide.error && <FormError>{t(decide.error)}</FormError>}
      {total === 0 && !hasHistory ? (
        <EmptyState icon={<ShieldCheck className="size-5" />} title={t("approvals.emptyTitle")} />
      ) : (
        <>
          <Segmented
            value={tab}
            onChange={setTab}
            ariaLabel={t("approvals.tab")}
            options={[
              { value: "open", label: `${t("approvals.tab.open")} ${total}` },
              { value: "done", label: `${t("approvals.tab.done")} ${doneCount}` },
            ]}
          />
          <div className="flex flex-wrap items-center gap-2">
            <TableSearch value={query} onChange={setQuery} placeholder={t("common.search")} />
            {/* На телефоне виды не помещаются в строку — листаются вбок. */}
            <div className="max-w-full overflow-x-auto">
              <Segmented
                size="sm"
                value={kind}
                onChange={setKind}
                ariaLabel={t("approvals.kindFilter")}
                options={options}
              />
            </div>
          </div>
          {tab === "open" && total === 0 && (
            <EmptyState
              icon={<ShieldCheck className="size-5" />}
              title={t("approvals.emptyTitle")}
            />
          )}
          {showSwitch && switches.length > 0 && (
            <ul className={card({ className: "flex flex-col divide-y divide-border" })}>
              {switches.map((r) =>
                tab === "open" ? (
                  <SwitchLine
                    key={r.id}
                    r={r}
                    who={nameOf(r.staffId)}
                    busy={decide.pending}
                    onAnswer={(ok) => void answer(r, ok)}
                  />
                ) : (
                  <SwitchLine
                    key={r.id}
                    r={r}
                    who={nameOf(r.staffId)}
                    decidedBy={
                      r.decidedBy && !r.decidedBy.startsWith("member:")
                        ? nameOf(r.decidedBy)
                        : undefined
                    }
                  />
                ),
              )}
            </ul>
          )}
          {showSeller && <SellerObjections query={query} canDecide={mayDecide} />}
          {goodsKinds !== null && (
            <EmbeddedShell.Provider value={true}>
              <DisputesScreen kinds={goodsKinds} query={query} inApprovals show={tab} />
            </EmbeddedShell.Provider>
          )}
        </>
      )}
    </>,
  );
}

const DONE_KEY: Partial<Record<SwitchRequest["status"], MsgKey>> = {
  applied: "approvals.switch.applied",
  approved: "approvals.switch.waiting",
  declined: "approvals.switch.wasDeclined",
};

/** Строка заявки: ждущая — с кнопками решения, решённая — с тем, что с ней стало. */
function SwitchLine({
  r,
  who,
  busy = false,
  decidedBy,
  onAnswer,
}: {
  r: SwitchRequest;
  who: string;
  busy?: boolean;
  decidedBy?: string;
  onAnswer?: (approve: boolean) => void;
}) {
  const t = useT();
  const clock = (ms: number) =>
    new Date(ms).toLocaleTimeString(t.lang === "ru" ? "ru-RU" : "en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  const done = DONE_KEY[r.status];
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
          <span className="tabular-nums">· {clock(r.at)}</span>
        </p>
      </div>
      {onAnswer ? (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onAnswer(false)}>
            {t("approvals.decline")}
          </Button>
          <Button size="sm" disabled={busy} onClick={() => onAnswer(true)}>
            {t("approvals.approve")}
          </Button>
        </div>
      ) : (
        done && (
          <p className="text-right text-xs text-muted-foreground">
            <span
              className={
                r.status === "declined"
                  ? "text-destructive"
                  : r.status === "applied"
                    ? "text-success"
                    : ""
              }
            >
              {t(done)}
            </span>
            {r.decidedAt && <span className="tabular-nums"> · {clock(r.decidedAt)}</span>}
            {decidedBy && <span> · {t("approvals.switch.by", { who: decidedBy })}</span>}
          </p>
        )
      )}
    </li>
  );
}
