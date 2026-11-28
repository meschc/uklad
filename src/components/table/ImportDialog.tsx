import { useMemo, useRef, useState } from "react";
import { FileOutput, FileSpreadsheet, Loader2, Paperclip, X } from "lucide-react";
import { useEditor } from "@/lib/store";
import { EMPTY_ARRAY } from "@/lib/utils";
import { useWarehouseProducts } from "@/lib/warehouseProducts";
import { catalogRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import { downloadSheet } from "@/lib/sheets";
import {
  MAX_IMPORT_BYTES,
  decodeImportText,
  fileToMatrix,
  textToMatrix,
  type MatrixResult,
} from "@/lib/importSheet";
import {
  EXAMPLE_ROWS,
  IMPORT_EXAMPLE,
  TEMPLATE_HEADERS,
  buildRows,
  findHeaderRow,
  guessColumns,
  importPlan,
  type ColumnMap,
  type ImportMode,
  type ImportPlan,
} from "@/lib/importProducts";
import { useT } from "@/lib/i18n";
import { DialogFooter, DialogHeader, DialogShell } from "@/components/ui/dialog-shell";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Segmented } from "@/components/ui/segmented";
import { ColumnPicker, ImportAlert, ImportPreview } from "./ImportParts";

/**
 * Импорт товаров (ТЗ, разд. 2.5; Кирилл 27.11 — сопоставление колонок).
 * Основной путь — загрузка .xlsx (SheetJS), вторичный — вставка CSV/TSV.
 * Уклад сам находит строку заголовка и угадывает колонки, человек правит;
 * артикул, который уже есть, — пропустить или обновить; весь файл можно
 * отдать одному продавцу.
 */
export function ImportDialog({ onClose }: { onClose: () => void }) {
  // Дубли ищем среди товаров этого склада: тот же артикул на соседнем складе — не дубль.
  const products = useWarehouseProducts();
  const categories = useEditor((s) => s.categories);
  const partners = useEditor((s) => s.warehouse.partners ?? EMPTY_ARRAY);
  const notify = useEditor((s) => s.notify);
  const t = useT();

  const [text, setText] = useState("");
  const [fileMatrix, setFileMatrix] = useState<MatrixResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ of: string[][]; columns: ColumnMap } | null>(null);
  const [mode, setMode] = useState<ImportMode>("skip");
  const [partnerId, setPartnerId] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  // Файл имеет приоритет; иначе разбираем вставленный текст.
  const source = useMemo(() => fileMatrix ?? textToMatrix(text), [fileMatrix, text]);
  const matrix = source.ok ? source.matrix : null;
  const headerRow = useMemo(() => (matrix ? findHeaderRow(matrix) : 0), [matrix]);
  const headers = useMemo(() => matrix?.[headerRow] ?? [], [matrix, headerRow]);
  // Правка колонок держится, пока не сменился файл: новый файл — новая догадка.
  const columns = useMemo(
    () => (picked && picked.of === matrix ? picked.columns : guessColumns(headers)),
    [picked, matrix, headers],
  );
  const result = useMemo(
    () => (matrix ? buildRows(matrix, headerRow, columns, { products, categories, mode }) : null),
    [matrix, headerRow, columns, products, categories, mode],
  );
  const rows = result?.ok ? result.rows : [];
  const counts = result?.ok ? result.counts : null;
  const ready = counts ? counts.create + counts.update : 0;
  const hasExisting = rows.some((r) => r.existingId);

  const onFile = async (file: File) => {
    setFileName(file.name);
    setText("");
    if (file.size > MAX_IMPORT_BYTES) {
      setFileMatrix({ ok: false, kind: "format", reasonKey: "import.msg.tooBig" });
      return;
    }
    const buf = await file.arrayBuffer();
    // .csv/.txt/.tsv — как текст; остальное (в т.ч. .xlsx) — через SheetJS.
    // Ошибки разбора приходят результатом, а не исключением.
    const isText = /\.(csv|tsv|txt)$/i.test(file.name);
    setFileMatrix(isText ? textToMatrix(decodeImportText(buf)) : await fileToMatrix(buf));
  };

  const clearFile = () => {
    setFileMatrix(null);
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

  /**
   * Загрузка идёт через репозиторий (п.3.2.1) одним вызовом на весь файл:
   * сервер примет её одним запросом, а не тысячей. При отказе окно НЕ
   * закрывается — разобранный файл остаётся на экране вместе с предпросмотром,
   * и повтор не требует выбирать файл заново.
   */
  const load = useCommand((plan: ImportPlan) => catalogRepository.importMany(plan), {
    // Двойной щелчок раньше, чем кнопка погасла, не должен завести товары дважды.
    exclusive: true,
  });

  const doImport = async () => {
    if (!result?.ok) return;
    const res = await load.run(importPlan(result.rows, partnerId || undefined));
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

        {source.ok === false && source.kind === "empty" && (
          <p className="mt-3 text-center text-xs text-muted-foreground">{t("import.emptyHint")}</p>
        )}
        {source.ok === false && source.kind === "format" && (
          <ImportAlert title={t("import.err.format.title")}>{t(source.reasonKey)}</ImportAlert>
        )}
        {matrix && (
          <ColumnPicker
            headers={headers}
            sample={matrix[headerRow + 1] ?? []}
            columns={columns}
            headerLine={headerRow + 1}
            onChange={(next) => setPicked({ of: matrix, columns: next })}
            t={t}
          />
        )}
        {(hasExisting || partners.length > 0) && (
          <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3">
            {hasExisting && (
              <div>
                <p className="mb-1 text-xs text-muted-foreground">{t("import.mode.label")}</p>
                <Segmented
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: "skip", label: t("import.mode.skip") },
                    {
                      value: "update",
                      label: t("import.mode.update"),
                      title: t("import.mode.updateHint"),
                    },
                  ]}
                />
              </div>
            )}
            {partners.length > 0 && (
              <div>
                <p className="mb-1 text-xs text-muted-foreground">{t("import.partner.label")}</p>
                <Select
                  size="sm"
                  className="w-56"
                  value={partnerId}
                  onChange={(e) => setPartnerId(e.target.value)}
                >
                  <option value="">{t("import.partner.none")}</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>
        )}
        {result?.ok === false && result.kind === "columns" && (
          <ImportAlert title={t("import.err.columns.title")}>
            {t("import.err.columns.missing", {
              missing: result.missing.map((k) => t(`field.${k}`)).join(", "),
            })}
          </ImportAlert>
        )}
        {result?.ok === false && result.kind === "format" && (
          <ImportAlert title={t("import.err.format.title")}>{t(result.reasonKey)}</ImportAlert>
        )}
        {result?.ok && <ImportPreview rows={rows} t={t} />}
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
          {counts
            ? t("import.footer", {
                create: counts.create,
                update: counts.update,
                skip: counts.skip,
                errors: counts.error,
              })
            : " "}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button size="sm" disabled={ready === 0 || load.pending} onClick={doImport}>
            {load.pending && <Loader2 className="animate-spin" />}
            {load.pending
              ? t("data.busy")
              : load.error
                ? t("data.retry")
                : t("import.doImport", { n: ready > 0 ? ready : "" })}
          </Button>
        </div>
      </DialogFooter>
    </DialogShell>
  );
}
