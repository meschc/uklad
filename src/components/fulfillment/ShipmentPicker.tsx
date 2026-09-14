import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Download,
  FileSpreadsheet,
  Loader2,
  PackageSearch,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { useEditor } from "@/lib/store";
import { fulfillmentRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import { downloadSheet, readSheetMatrix } from "@/lib/sheets";
import {
  SHIPMENT_SOURCES,
  SHIPMENT_TEMPLATE_EXAMPLE,
  SHIPMENT_TEMPLATE_HEADERS,
  parseShipmentRows,
  type ShipmentParseResult,
} from "@/lib/shipmentSources";
import type { ExpectedShipment, ShipmentSource } from "@/lib/types";
import { useT, type TFunc } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { eyebrow } from "@/components/ui/eyebrow";
import { card } from "@/components/ui/card";
import { EmptyState } from "./ScreenShell";

/**
 * Шаг 5.1 — выбор ожидаемой поставки.
 *
 * Источник поставки — тонкий адаптер к общему формату (`shipmentSources.ts`),
 * а не логика, зашитая в экран: реальная интеграция с 1С/МойСклад/ГИС МТ позже
 * будет новым адаптером, а не переделкой приёмки. Отдельно есть универсальный
 * путь для поставщика без своей системы учёта — шаблон таблицы.
 */
export function ShipmentPicker({
  onPick,
  onFreeform,
}: {
  onPick: (shipmentId: string) => void;
  onFreeform: () => void;
}) {
  const shipments = useEditor((s) => s.expectedShipments);
  const t = useT();
  const [creating, setCreating] = useState(false);

  const open = shipments.filter((sh) => sh.status !== "closed");
  const closed = shipments.filter((sh) => sh.status === "closed");

  if (creating) {
    return <ShipmentForm onDone={onPick} onCancel={() => setCreating(false)} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {open.length === 0 ? (
        <EmptyState
          icon={<PackageSearch className="size-5" />}
          title={t("recv.pick.emptyTitle")}
          body={t("recv.pick.emptyBody")}
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="size-3.5" />
              {t("recv.pick.create")}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {open.map((sh) => (
            <ShipmentCard key={sh.id} shipment={sh} onPick={onPick} t={t} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {open.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <Plus className="size-3.5" />
            {t("recv.pick.create")}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onFreeform}>
          {t("recv.pick.freeform")}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">{t("recv.pick.freeformHint")}</p>

      {closed.length > 0 && (
        <div className="flex flex-col gap-2 pt-2">
          <p className={eyebrow()}>{t("recv.pick.closed")}</p>
          {closed.slice(0, 5).map((sh) => (
            <ShipmentCard key={sh.id} shipment={sh} onPick={onPick} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function ShipmentCard({
  shipment: sh,
  onPick,
  t,
}: {
  shipment: ExpectedShipment;
  onPick: (id: string) => void;
  t: TFunc;
}) {
  const expected = sh.lines.reduce((s, l) => s + l.expectedQty, 0);
  const received = sh.lines.reduce((s, l) => s + l.receivedQty, 0);
  const pct = expected ? Math.round((received / expected) * 100) : 0;
  const source = SHIPMENT_SOURCES.find((s) => s.id === sh.source);

  return (
    <button
      onClick={() => onPick(sh.id)}
      className={card({
        pad: "md",
        className:
          "flex flex-col gap-2 text-left transition-colors hover:border-primary/40 hover:bg-accent/40",
      })}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{sh.title || t("recv.pick.untitled")}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {source ? t(source.titleKey) : sh.source} ·{" "}
            {t("recv.pick.lines", {
              n: sh.lines.length,
              unit: t.plural(sh.lines.length, ["позиция", "позиции", "позиций"], ["line", "lines"]),
            })}{" "}
            · {new Date(sh.createdAt).toLocaleDateString()}
          </p>
        </div>
        {sh.crossDock && (
          <span className="shrink-0 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-400">
            {t("recv.crossDockBadge")}
          </span>
        )}
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold",
            sh.status === "receiving"
              ? "bg-primary/10 text-primary"
              : sh.status === "closed"
                ? "bg-muted text-muted-foreground"
                : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
          )}
        >
          {t(`recv.status.${sh.status}`)}
        </span>
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">{t("recv.pick.progress", { p: pct })}</span>
          <span className="font-medium tabular-nums">
            {received}/{expected}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </button>
  );
}

/** Создание поставки: источник + файл/вставка → строки общего формата. */
function ShipmentForm({
  onDone,
  onCancel,
}: {
  onDone: (id: string) => void;
  onCancel: () => void;
}) {
  const products = useEditor((s) => s.products);
  const showToast = useEditor((s) => s.showToast);
  const t = useT();

  const [source, setSource] = useState<ShipmentSource>("manual");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [fileMatrix, setFileMatrix] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [crossDock, setCrossDock] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const spec = SHIPMENT_SOURCES.find((s) => s.id === source)!;

  const result: ShipmentParseResult = useMemo(() => {
    const matrix =
      fileMatrix ??
      text
        .split(/\r?\n/)
        .filter((l) => l.trim() !== "")
        .map((l) => l.split(/[\t;,]/).map((c) => c.trim()));
    return parseShipmentRows(source, matrix, products);
  }, [fileMatrix, text, source, products]);

  const onFile = async (file: File) => {
    setFileName(file.name);
    setText("");
    const buf = await file.arrayBuffer();
    try {
      // Пустая матрица — это «файл прочитали, товара в нём нет»: разбор ниже
      // сам скажет об этом на понятном человеку языке. Книга без листов даёт
      // ровно тот же итог, поэтому отдельной ветки для неё здесь нет.
      setFileMatrix((await readSheetMatrix(buf)) ?? []);
    } catch {
      setFileMatrix([]);
    }
  };

  const downloadTemplate = async () => {
    try {
      await downloadSheet(
        [SHIPMENT_TEMPLATE_HEADERS, ...SHIPMENT_TEMPLATE_EXAMPLE],
        "Поставка",
        "uklad-shipment-template.xlsx",
      );
    } catch {
      showToast("import.msg.templateFailed");
    }
  };

  const pasteExample = () => {
    setFileMatrix(null);
    setFileName(null);
    setText(
      [
        SHIPMENT_TEMPLATE_HEADERS.join(";"),
        ...SHIPMENT_TEMPLATE_EXAMPLE.map((r) => r.join(";")),
      ].join("\n"),
    );
  };

  // Создание идёт через репозиторий (п.3.2.1). Разобранный файл при отказе
  // остаётся на экране: он и есть работа человека — заново подбирать таблицу
  // из-за обрыва связи было бы издевательством.
  const create = useCommand((lines: { productId: string; expectedQty: number }[]) =>
    fulfillmentRepository.createShipment(source, lines, title, { crossDock }),
  );

  const submit = async () => {
    if (!result.ok) return;
    const lines = result.rows
      .filter((r) => !r.errorKey && r.productId)
      .map((r) => ({ productId: r.productId!, expectedQty: r.qty }));
    if (!lines.length) return;
    const res = await create.run(lines);
    if (res.ok) onDone(res.data);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className={eyebrow()}>{t("recv.form.source")}</span>
        <div className="flex flex-wrap gap-1">
          {SHIPMENT_SOURCES.map((s) => (
            <button
              key={s.id}
              onClick={() => setSource(s.id)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                s.id === source
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {t(s.titleKey)}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">{t(spec.hintKey)}</p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={eyebrow()}>{t("recv.form.title")}</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("recv.form.titlePlaceholder")}
          className="h-9 rounded-md border border-input bg-background px-2.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>

      {/* Кроссдокинг (п.10.1): товар с рампы уходит прямо в заявку, минуя
          полку, и в занятость склада не попадает — он там не лежит. */}
      {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- поле и подпись внутри label, но текст лежит на уровень глубже, чем ждёт правило по умолчанию; имя элемента браузер собирает верно */}
      <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-muted/30 p-2.5">
        <input
          type="checkbox"
          checked={crossDock}
          onChange={(e) => setCrossDock(e.target.checked)}
          className="mt-0.5 size-3.5 accent-[hsl(var(--primary))]"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-xs font-medium">{t("recv.form.crossDock")}</span>
          <span className="text-[11px] text-muted-foreground">{t("recv.form.crossDockHint")}</span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,.xls,.csv,.tsv,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
          <Upload className="size-3.5" />
          {t("recv.form.pickFile")}
        </Button>
        <Button size="sm" variant="ghost" onClick={downloadTemplate}>
          <Download className="size-3.5" />
          {t("recv.form.template")}
        </Button>
        <Button size="sm" variant="ghost" onClick={pasteExample}>
          {t("recv.form.example")}
        </Button>
        {fileName && (
          <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs">
            <FileSpreadsheet className="size-3" />
            {fileName}
            <button
              onClick={() => {
                setFileMatrix(null);
                setFileName(null);
                if (fileInput.current) fileInput.current.value = "";
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </span>
        )}
      </div>

      {!fileName && (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("recv.form.pastePlaceholder")}
          className="scrollbar-thin h-24 w-full resize-none rounded-md border border-input bg-background p-2 font-mono text-xs"
        />
      )}

      <ShipmentPreview result={result} t={t} />

      <div className="flex items-center justify-end gap-2">
        {/* Отказ встаёт слева от кнопок, а не тостом: разобранная таблица
            остаётся на экране, и сообщение должно быть рядом с ней. */}
        {create.error && (
          <p role="alert" className="mr-auto min-w-0 text-xs text-destructive">
            {t(create.error)}
          </p>
        )}
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button
          size="sm"
          disabled={!result.ok || result.validCount === 0 || create.pending}
          onClick={() => void submit()}
        >
          {create.pending && <Loader2 className="animate-spin" />}
          {create.pending
            ? t("data.busy")
            : create.error
              ? t("data.retry")
              : t("recv.form.create", { n: result.ok ? result.validCount : 0 })}
        </Button>
      </div>
    </div>
  );
}

function ShipmentPreview({ result, t }: { result: ShipmentParseResult; t: TFunc }) {
  if (!result.ok) {
    return (
      <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>{t(result.errorKey)}</p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full border-collapse text-xs">
        <thead className="bg-muted/50">
          <tr className="text-left">
            <th className="px-2 py-1.5 font-medium">{t("import.col.status")}</th>
            <th className="px-2 py-1.5 font-medium">{t("table.col.sku")}</th>
            <th className="px-2 py-1.5 font-medium">{t("table.col.name")}</th>
            <th className="px-2 py-1.5 text-right font-medium">{t("recv.form.qty")}</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.slice(0, 30).map((r) => (
            <tr key={r.index} className="border-t border-border/60">
              <td className="px-2 py-1.5">
                {r.errorKey ? (
                  <span className="inline-flex items-center gap-1 text-destructive">
                    <AlertTriangle className="size-3" />
                    {t(r.errorKey)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <Check className="size-3" /> {t("import.ok")}
                  </span>
                )}
              </td>
              <td className="px-2 py-1.5 font-mono text-muted-foreground">{r.code || "—"}</td>
              <td className="px-2 py-1.5">{r.productName ?? "—"}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.qty}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
