import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, History, Route } from "lucide-react";
import { useEditor } from "@/lib/store";
import { journalRepository } from "@/lib/data";
import {
  JOURNAL_STEPS,
  isJournalError,
  mergeEntries,
  type ActivityEntry,
  type JournalFilters,
  type JournalStep,
} from "@/lib/activityJournal";
import { findByCode, findProduct } from "@/lib/barcode";
import { useT, type MsgKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Segmented } from "@/components/ui/segmented";
import { FormError } from "@/components/ui/field";
import { EmptyState, ScreenShell } from "./ScreenShell";
import { actionKey, useEntryText } from "./journalText";
import { GoodsPath } from "./GoodsPath";
import { TableScroll, TABLE_HEAD, TABLE_HEAD_ROW, TABLE_ROW } from "@/components/ui/table-scroll";

/** Свежие действия подтягиваются сами, пока экран открыт и смотрят «сейчас». */
const LIVE_MS = 5000;

/**
 * «Журнал действий» (Кирилл 15.11): общий журнал склада для руководителя.
 * Каждый скан, этикетка, отметка смены, решение старшего и правка в кабинете —
 * строкой со временем до секунды, сотрудником и устройством. Фильтры по
 * процессу, сотруднику, товару или таре и «только ошибки»; «До момента» —
 * посмотреть конкретную секунду, например под запись камеры.
 */
export function JournalScreen() {
  const t = useT();
  const [mode, setMode] = useState<"feed" | "path">("feed");
  const tabs = (
    <Segmented
      value={mode}
      onChange={setMode}
      ariaLabel={t("journal.title")}
      options={[
        { value: "feed", label: t("journal.mode.feed"), icon: <History /> },
        { value: "path", label: t("journal.mode.path"), icon: <Route /> },
      ]}
    />
  );
  if (mode === "path") {
    return (
      <ScreenShell wide title={t("journal.title")} subtitle={t("goodsPath.lead")}>
        <div>{tabs}</div>
        <GoodsPath />
      </ScreenShell>
    );
  }
  return <JournalFeed tabs={tabs} />;
}

function JournalFeed({ tabs }: { tabs: ReactNode }) {
  const t = useT();
  const staff = useEditor((s) => s.warehouse.staff) ?? [];
  const warehouseId = useEditor((s) => s.warehouse.id);
  const products = useEditor((s) => s.products);
  const boxes = useEditor((s) => s.boxes);
  const pallets = useEditor((s) => s.pallets);
  const [step, setStep] = useState<JournalStep | "">("");
  const [who, setWho] = useState("");
  const [errors, setErrors] = useState<"all" | "errors">("all");
  const [moment, setMoment] = useState("");
  const [find, setFind] = useState("");
  const [code, setCode] = useState("");
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [failed, setFailed] = useState<MsgKey | null>(null);
  const text = useEntryText();

  // Что ищем по коду: товар (штрихкод, артикул), тара или паллета (ярлык),
  // иначе код как есть — короб отгрузки или место сортировки.
  const found = useMemo(() => {
    if (!code) return null;
    const product = findProduct(products, code);
    if (product) return { product: product.id, label: product.name };
    const unit = findByCode(boxes, code) ?? findByCode(pallets, code);
    return { place: unit?.id ?? code, label: unit?.barcode ?? code };
  }, [code, products, boxes, pallets]);

  const before = moment ? new Date(moment).getTime() : undefined;
  const filters = useMemo<JournalFilters>(
    () => ({
      steps: step ? [step] : undefined,
      staff: who || undefined,
      product: found?.product,
      place: found?.place,
      errors: errors === "errors",
      before: before !== undefined && Number.isFinite(before) ? before : undefined,
    }),
    [step, who, found, errors, before],
  );

  // Новые фильтры — новая первая страница; прежние строки видны, пока она
  // идёт. Ответ на устаревшие фильтры не затирает свежий.
  useEffect(() => {
    let current = true;
    void journalRepository.page(filters).then((res) => {
      if (!current) return;
      setFailed(res.ok ? null : (res.error as MsgKey));
      if (!res.ok) return;
      setEntries(res.data.entries);
      setNext(res.data.next);
    });
    return () => {
      current = false;
    };
  }, [filters, warehouseId]);

  // Свежее сверху (`live`) и страница раньше (`more`) — поверх показанного.
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);
  const load = useCallback(async (mode: "live" | "more", cursor?: number) => {
    const asked = filtersRef.current;
    const res = await journalRepository.page(asked, cursor);
    if (asked !== filtersRef.current) return;
    if (!res.ok) {
      if (mode === "more") setFailed(res.error as MsgKey);
      return;
    }
    setEntries((shown) => mergeEntries(shown ?? [], res.data.entries));
    if (mode === "more") setNext(res.data.next);
  }, []);

  const live = filters.before === undefined;
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load("live");
    }, LIVE_MS);
    return () => window.clearInterval(id);
  }, [live, load]);

  const filtered = !!(step || who || code || errors === "errors" || moment);
  const reset = () => {
    setStep("");
    setWho("");
    setErrors("all");
    setMoment("");
    setFind("");
    setCode("");
  };

  return (
    <ScreenShell
      wide
      title={t("journal.title")}
      subtitle={t("journal.lead")}
      actions={
        live ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-2 animate-pulse rounded-full bg-success" />
            {t("journal.live")}
          </span>
        ) : undefined
      }
    >
      <div>{tabs}</div>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          size="sm"
          value={step}
          aria-label={t("journal.filter.step")}
          onChange={(e) => setStep(e.target.value as JournalStep | "")}
          className="w-44"
        >
          <option value="">{t("journal.filter.allSteps")}</option>
          {JOURNAL_STEPS.map((s) => (
            <option key={s} value={s}>
              {t(`journal.step.${s}`)}
            </option>
          ))}
        </Select>
        <Select
          size="sm"
          value={who}
          aria-label={t("journal.filter.staff")}
          onChange={(e) => setWho(e.target.value)}
          className="w-44"
        >
          <option value="">{t("journal.filter.allStaff")}</option>
          {staff.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
        <Input
          className="h-8 w-52"
          value={find}
          placeholder={t("journal.filter.find")}
          aria-label={t("journal.filter.find")}
          onChange={(e) => {
            setFind(e.target.value);
            if (!e.target.value.trim()) setCode("");
          }}
          onBlur={() => setCode(find.trim())}
          onKeyDown={(e) => {
            if (e.key === "Enter") setCode(find.trim());
          }}
        />
        <Input
          type="datetime-local"
          step={1}
          className="h-8 w-52"
          value={moment}
          title={t("journal.filter.moment")}
          aria-label={t("journal.filter.moment")}
          onChange={(e) => setMoment(e.target.value)}
        />
        <Segmented
          value={errors}
          onChange={setErrors}
          ariaLabel={t("journal.filter.errors")}
          options={[
            { value: "all", label: t("journal.filter.all") },
            { value: "errors", label: t("journal.filter.errors") },
          ]}
        />
        {filtered && (
          <Button variant="ghost" size="sm" onClick={reset}>
            {t("journal.filter.reset")}
          </Button>
        )}
      </div>
      {found && (
        <p className="-mt-3 text-xs text-muted-foreground">
          {found.product
            ? t("journal.filter.found.product", { name: found.label })
            : t("journal.filter.found.place", { code: found.label })}
        </p>
      )}

      {failed ? (
        <FormError>{t(failed)}</FormError>
      ) : !entries ? (
        <p className="text-sm text-muted-foreground">{t("data.busy")}</p>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<History className="size-5" />}
          title={t(filtered ? "journal.empty.filtered" : "journal.empty")}
          body={filtered ? undefined : t("journal.empty.body")}
        />
      ) : (
        <TableScroll>
          <table className="table-stack w-full border-collapse text-sm">
            <thead className={TABLE_HEAD}>
              <tr className={TABLE_HEAD_ROW}>
                <th className="px-3 py-2 font-medium">{t("journal.col.time")}</th>
                <th className="px-3 py-2 font-medium">{t("journal.col.staff")}</th>
                <th className="px-3 py-2 font-medium">{t("journal.col.action")}</th>
                <th className="px-3 py-2 font-medium">{t("journal.col.what")}</th>
                <th className="px-3 py-2 font-medium">{t("journal.col.where")}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <Row key={e.id} e={e} text={text} />
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
      {next !== null && entries && entries.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="self-center"
          onClick={() => void load("more", next)}
        >
          {t("journal.more")}
        </Button>
      )}
    </ScreenShell>
  );
}

function Row({ e, text }: { e: ActivityEntry; text: ReturnType<typeof useEntryText> }) {
  const t = useT();
  const error = isJournalError(e);
  const stamp = (ms: number) =>
    new Date(ms).toLocaleString(t.lang, {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  return (
    <tr className={`${TABLE_ROW} align-top`}>
      <td
        className="whitespace-nowrap px-4 py-2 tabular-nums text-muted-foreground"
        title={t("journal.timeHint", { device: stamp(e.at), server: stamp(e.receivedAt) })}
      >
        {stamp(e.at)}
      </td>
      <td className="px-4 py-2" data-label={t("journal.col.staff")}>
        {text.who(e)}
      </td>
      <td className="px-4 py-2" data-label={t("journal.col.action")}>
        <span className="flex flex-wrap items-center gap-1.5">
          {/* У правки кабинета процесс и действие — одно и то же: без повтора. */}
          {e.source !== "cabinet" && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {t(`journal.step.${e.step}`)}
            </span>
          )}
          <span className={cn("font-medium", error && "text-destructive")}>
            {error && <AlertTriangle className="mr-1 inline size-3.5 align-[-2px]" />}
            {t(actionKey(e))}
          </span>
          {e.counted && (
            <span
              className="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success"
              title={t("journal.counted.hint")}
            >
              {t("journal.counted")}
            </span>
          )}
        </span>
        {/* Отказ сервера — не ошибка формы: строка журнала, приглушённо под действием. */}
        {e.flagged && <p className="mt-0.5 text-xs text-muted-foreground">{text.reason(e)}</p>}
      </td>
      <td className="px-4 py-2 text-muted-foreground" data-label={t("journal.col.what")}>
        {text.what(e)}
      </td>
      <td
        className="whitespace-nowrap px-4 py-2 text-muted-foreground"
        data-label={t("journal.col.where")}
      >
        {text.where(e)}
      </td>
    </tr>
  );
}
