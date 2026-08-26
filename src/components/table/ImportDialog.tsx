import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  AlertTriangle,
  Check,
  Download,
  FileSpreadsheet,
  Upload,
  X,
} from "lucide-react";
import { useEditor } from "@/lib/store";
import {
  EXAMPLE_ROWS,
  IMPORT_EXAMPLE,
  TEMPLATE_HEADERS,
  parseImportFile,
  parseImportText,
  rowsToProducts,
  type ImportRow,
  type ParseResult,
} from "@/lib/importProducts";
import { catLabel, useT, type TFunc } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

/**
 * Импорт товаров (ТЗ, разд. 2.5). Основной путь — загрузка .xlsx (SheetJS),
 * вторичный — вставка CSV/TSV. Два алерта §4: ошибка формата и несовпадение
 * колонок; плюс построчная валидация в предпросмотре.
 */
export function ImportDialog({ onClose }: { onClose: () => void }) {
  const products = useEditor((s) => s.products);
  const importProducts = useEditor((s) => s.importProducts);
  const t = useT();

  const [text, setText] = useState("");
  const [fileResult, setFileResult] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const existingSkus = useMemo(
    () => new Set(products.map((p) => p.sku)),
    [products],
  );

  // Файл имеет приоритет; иначе разбираем вставленный текст.
  const result: ParseResult = useMemo(() => {
    if (fileResult) return fileResult;
    return parseImportText(text, existingSkus);
  }, [fileResult, text, existingSkus]);

  const onFile = async (file: File) => {
    setFileName(file.name);
    setText("");
    const buf = await file.arrayBuffer();
    // .csv/.txt/.tsv — как текст; остальное (в т.ч. .xlsx) — через SheetJS.
    const isText = /\.(csv|tsv|txt)$/i.test(file.name);
    setFileResult(
      isText
        ? parseImportText(new TextDecoder().decode(buf), existingSkus)
        : parseImportFile(buf, existingSkus),
    );
  };

  const clearFile = () => {
    setFileResult(null);
    setFileName(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...EXAMPLE_ROWS]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Товары");
    XLSX.writeFile(wb, "uklad-import-template.xlsx");
  };

  const rows = result.ok ? result.rows : [];
  const validCount = result.ok ? result.validCount : 0;

  const doImport = () => {
    if (!result.ok) return;
    importProducts(rowsToProducts(result.rows));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 animate-fade-in bg-black/40 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div className="relative flex max-h-[86vh] w-full max-w-2xl animate-scale-in flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="size-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold">{t("import.title")}</p>
              <p className="text-[11px] text-muted-foreground">
                {t("import.subtitle")}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

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
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInput.current?.click()}
          >
            <Upload className="size-3.5" />
            {t("import.pickFile")}
          </Button>
          <Button size="sm" variant="ghost" onClick={downloadTemplate}>
            <Download className="size-3.5" />
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

        {/* Действия */}
        <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/30 px-5 py-3">
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
              disabled={!result.ok || validCount === 0}
              onClick={doImport}
            >
              {t("import.doImport", { n: validCount > 0 ? validCount : "" })}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

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
      <p className="mt-3 text-center text-xs text-muted-foreground">
        {t("import.emptyHint")}
      </p>
    );
  }

  if (result.ok === false && result.kind === "format") {
    return (
      <Alert title={t("import.err.format.title")}>{t(result.reasonKey)}</Alert>
    );
  }

  if (result.ok === false && result.kind === "columns") {
    const missing = result.missing.map((k) => t(`field.${k}`)).join(", ");
    const found = result.headers.filter(Boolean).join(", ") || "—";
    return (
      <Alert title={t("import.err.columns.title")}>
        <p>{t("import.err.columns.missing", { missing })}</p>
        <p className="mt-1 opacity-80">
          {t("import.err.columns.found", { headers: found })}
        </p>
      </Alert>
    );
  }

  return (
    <div className="mt-3">
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full border-collapse text-xs">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="px-2 py-1.5 font-medium">{t("import.col.status")}</th>
              <th className="px-2 py-1.5 font-medium">{t("table.col.sku")}</th>
              <th className="px-2 py-1.5 font-medium">{t("table.col.name")}</th>
              <th className="px-2 py-1.5 font-medium">{t("table.col.category")}</th>
              <th className="px-2 py-1.5 font-medium">{t("import.col.dims")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.index} className="border-t border-border/60">
                <td className="px-2 py-1.5">
                  {r.ok ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
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
                </td>
                <td className="px-2 py-1.5 font-mono text-muted-foreground">
                  {r.sku || "—"}
                </td>
                <td className="px-2 py-1.5">{r.name || "—"}</td>
                <td className="px-2 py-1.5">
                  {r.category ? catLabel(t, r.category) : "—"}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-muted-foreground">
                  {[r.widthCm, r.heightCm, r.depthCm]
                    .map((v) => (v == null ? "?" : v))
                    .join(" × ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {validCount < rows.length && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {t("import.onlyOk", { valid: validCount, total: rows.length })}
        </p>
      )}
    </div>
  );
}

function Alert({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <div className="mt-0.5 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}
