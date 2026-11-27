import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  FileOutput,
  FileSpreadsheet,
  Loader2,
  Paperclip,
  X,
} from "lucide-react";
import { useEditor } from "@/lib/store";
import { useWarehouseProducts } from "@/lib/warehouseProducts";
import { catalogRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import type { Product } from "@/lib/types";
import { downloadSheet } from "@/lib/sheets";
import {
  EXAMPLE_ROWS,
  IMPORT_EXAMPLE,
  MAX_IMPORT_BYTES,
  TEMPLATE_HEADERS,
  barcodeSet,
  decodeImportText,
  parseImportFile,
  parseImportText,
  rowsToProducts,
  type ImportRow,
  type ParseResult,
} from "@/lib/importProducts";
import { catLabel, useT, type TFunc } from "@/lib/i18n";
import { DialogFooter, DialogHeader, DialogShell } from "@/components/ui/dialog-shell";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { Table, TableHeader, Th, Tr, Td } from "@/components/ui/table";

/**
 * Импорт товаров (ТЗ, разд. 2.5). Основной путь — загрузка .xlsx (SheetJS),
 * вторичный — вставка CSV/TSV. Два алерта §4: ошибка формата и несовпадение
 * колонок; плюс построчная валидация в предпросмотре.
 */
export function ImportDialog({ onClose }: { onClose: () => void }) {
  // Дубли ищем среди товаров этого склада: тот же артикул на соседнем складе — не дубль.
  const products = useWarehouseProducts();
  const notify = useEditor((s) => s.notify);
  const t = useT();

  const [text, setText] = useState("");
  const [fileResult, setFileResult] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const existingSkus = useMemo(() => new Set(products.map((p) => p.sku)), [products]);
  const existingBarcodes = useMemo(() => barcodeSet(products), [products]);

  // Файл имеет приоритет; иначе разбираем вставленный текст.
  const result: ParseResult = useMemo(() => {
    if (fileResult) return fileResult;
    return parseImportText(text, existingSkus, existingBarcodes);
  }, [fileResult, text, existingSkus, existingBarcodes]);

  const onFile = async (file: File) => {
    setFileName(file.name);
    setText("");
    if (file.size > MAX_IMPORT_BYTES) {
      setFileResult({ ok: false, kind: "format", reasonKey: "import.msg.tooBig" });
      return;
    }
    const buf = await file.arrayBuffer();
    // .csv/.txt/.tsv — как текст; остальное (в т.ч. .xlsx) — через SheetJS.
    const isText = /\.(csv|tsv|txt)$/i.test(file.name);
    setFileResult(
      isText
        ? parseImportText(decodeImportText(buf), existingSkus, existingBarcodes)
        : // Книгу читает библиотека, которая грузится по требованию: разбор
          // ждёт её и потому асинхронный. Ошибки разбора приходят результатом,
          // а не исключением, — ловить здесь нечего.
          await parseImportFile(buf, existingSkus, existingBarcodes),
    );
  };

  const clearFile = () => {
    setFileResult(null);
    setFileName(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const downloadTemplate = async () => {
    try {
      await downloadSheet(
        [TEMPLATE_HEADERS, ...EXAMPLE_ROWS],
        "Товары",
        "uklad-import-template.xlsx",
      );
    } catch {
      notify("error", "import.msg.templateFailed");
    }
  };

  const rows = result.ok ? result.rows : [];
  const validCount = result.ok ? result.validCount : 0;

  /**
   * Загрузка идёт через репозиторий (п.3.2.1) одним вызовом на весь файл:
   * сервер примет её одним запросом, а не тысячей. При отказе окно НЕ
   * закрывается — разобранный файл остаётся на экране вместе с предпросмотром,
   * и повтор не требует выбирать файл заново.
   */
  const load = useCommand((items: Omit<Product, "id">[]) => catalogRepository.importMany(items), {
    // Двойной щелчок раньше, чем кнопка погасла, не должен завести товары дважды.
    exclusive: true,
  });

  const doImport = async () => {
    if (!result.ok) return;
    const res = await load.run(rowsToProducts(result.rows));
    if (res.ok) onClose();
  };

  return (
    <DialogShell size="2xl" scroll onClose={onClose}>
      <DialogHeader align="start">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="size-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-semibold">{t("import.title")}</p>
            <p className="text-xs text-muted-foreground">{t("import.subtitle")}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </DialogHeader>

      {/* Источник данных */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-2.5">
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
          <Paperclip className="size-3.5" />
          {t("import.pickFile")}
        </Button>
        <Button size="sm" variant="ghost" onClick={downloadTemplate}>
          <FileOutput className="size-3.5" />
          {t("import.template")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            clearFile();
            setText(IMPORT_EXAMPLE);
          }}
        >
          {t("import.pasteExample")}
        </Button>
        {fileName && (
          <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs">
            {fileName}
            <button
              onClick={clearFile}
              className="text-muted-foreground hover:text-foreground"
              title={t("import.removeFile")}
            >
              <X className="size-3" />
            </button>
          </span>
        )}
      </div>

      {/* Ввод / предпросмотр */}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-3">
        {!fileName && (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("import.textareaPlaceholder")}
            className="scrollbar-thin h-24 w-full resize-none rounded-md border border-input bg-background p-2 font-mono text-xs"
          />
        )}

        <ResultView result={result} rows={rows} validCount={validCount} t={t} />
      </div>

      {/* Отказ отдельной строкой над подвалом: слева в подвале стоит счётчик
          разобранных строк, и он при повторе нужен не меньше сообщения. */}
      {load.error && (
        <FormError className="shrink-0 border-t border-border px-5 py-2.5">
          {t(load.error)}
        </FormError>
      )}

      {/* Действия */}
      <DialogFooter spread>
        <span className="text-xs text-muted-foreground">
          {result.ok
            ? t("import.footer", {
                found: rows.length,
                ready: validCount,
                errors: rows.length - validCount,
              })
            : " "}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            size="sm"
            disabled={!result.ok || validCount === 0 || load.pending}
            onClick={doImport}
          >
            {load.pending && <Loader2 className="animate-spin" />}
            {load.pending
              ? t("data.busy")
              : load.error
                ? t("data.retry")
                : t("import.doImport", { n: validCount > 0 ? validCount : "" })}
          </Button>
        </div>
      </DialogFooter>
    </DialogShell>
  );
}

/** Строк в предпросмотре: остальные тоже грузятся, просто не рисуются. */
const PREVIEW_ROWS = 200;

function ResultView({
  result,
  rows,
  validCount,
  t,
}: {
  result: ParseResult;
  rows: ImportRow[];
  validCount: number;
  t: TFunc;
}) {
  if (result.ok === false && result.kind === "empty") {
    return (
      <p className="mt-3 text-center text-xs text-muted-foreground">{t("import.emptyHint")}</p>
    );
  }

  if (result.ok === false && result.kind === "format") {
    return <Alert title={t("import.err.format.title")}>{t(result.reasonKey)}</Alert>;
  }

  if (result.ok === false && result.kind === "columns") {
    const missing = result.missing.map((k) => t(`field.${k}`)).join(", ");
    const found = result.headers.filter(Boolean).join(", ") || "—";
    return (
      <Alert title={t("import.err.columns.title")}>
        <span className="block">{t("import.err.columns.missing", { missing })}</span>
        <span className="mt-1 block text-muted-foreground">
          {t("import.err.columns.found", { headers: found })}
        </span>
      </Alert>
    );
  }

  return (
    <div className="mt-3">
      <Table size="sm" fill>
        <TableHeader>
          <Th>{t("import.col.status")}</Th>
          <Th>{t("table.col.sku")}</Th>
          <Th>{t("table.col.name")}</Th>
          <Th>{t("table.col.category")}</Th>
          <Th>{t("table.col.dims")}</Th>
        </TableHeader>
        <tbody>
          {rows.slice(0, PREVIEW_ROWS).map((r) => (
            <Tr key={r.index}>
              <Td>
                {r.ok ? (
                  <span className="inline-flex items-center gap-1 text-success">
                    <Check className="size-3" /> {t("import.ok")}
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center gap-1 text-destructive"
                    title={r.errors.map((e) => t(e.key, e.vars)).join("; ")}
                  >
                    <AlertTriangle className="size-3" />
                    {t(r.errors[0].key, r.errors[0].vars)}
                    {r.errors.length > 1 ? ` +${r.errors.length - 1}` : ""}
                  </span>
                )}
              </Td>
              <Td className="font-mono text-muted-foreground">{r.sku || "—"}</Td>
              <Td>{r.name || "—"}</Td>
              <Td>{r.category ? catLabel(t, r.category) : "—"}</Td>
              <Td className="whitespace-nowrap tabular-nums text-muted-foreground">
                {[r.widthCm, r.heightCm, r.depthCm].map((v) => (v == null ? "?" : v)).join(" × ")}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      {rows.length > PREVIEW_ROWS && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("import.previewCut", { shown: PREVIEW_ROWS, total: rows.length })}
        </p>
      )}
      {result.ok && result.ignored.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("import.ignored", { cols: result.ignored.join(", ") })}
        </p>
      )}
      {validCount < rows.length && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("import.onlyOk", { valid: validCount, total: rows.length })}
        </p>
      )}
    </div>
  );
}

function Alert({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <FormError className="mt-3">
      <span className="font-semibold">{title}</span>
      <span className="mt-0.5 block text-xs leading-relaxed">{children}</span>
    </FormError>
  );
}
