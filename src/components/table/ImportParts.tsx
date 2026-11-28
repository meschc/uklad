import { AlertTriangle, Check } from "lucide-react";
import { dimsText } from "@/lib/address";
import { IMPORT_FIELDS, type ColumnMap, type FieldKey, type ImportRow } from "@/lib/importProducts";
import { catLabel, type TFunc } from "@/lib/i18n";
import { Select } from "@/components/ui/select";
import { FormError } from "@/components/ui/field";
import { Table, TableHeader, Th, Tr, Td } from "@/components/ui/table";

/**
 * Части панели импорта: «что в колонках» и предпросмотр строк. Сама панель,
 * чтение файла и загрузка — в `ImportDialog`.
 */

/** Колонки файла → поле Уклада. Поле занято другой колонкой — переезжает сюда. */
export function ColumnPicker({
  headers,
  sample,
  columns,
  headerLine,
  onChange,
  t,
}: {
  headers: string[];
  /** Первая строка данных — подсказка, что в колонке. */
  sample: string[];
  columns: ColumnMap;
  headerLine: number;
  onChange: (next: ColumnMap) => void;
  t: TFunc;
}) {
  const pick = (i: number, f: FieldKey | null) =>
    onChange(columns.map((c, j) => (j === i ? f : c === f ? null : c)));
  return (
    <section className="mt-3">
      <p className="text-sm font-semibold">{t("import.columns.title")}</p>
      <p className="text-xs text-muted-foreground">
        {t("import.columns.hint", { line: headerLine })}
      </p>
      <div className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {headers.map((h, i) => (
          <div key={i} className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{h || t("import.columns.empty")}</p>
              <p className="truncate text-xs text-muted-foreground">{sample[i] || "—"}</p>
            </div>
            <Select
              size="sm"
              className="w-36 shrink-0"
              value={columns[i] ?? ""}
              aria-label={h}
              onChange={(e) => pick(i, (e.target.value || null) as FieldKey | null)}
            >
              <option value="">{t("import.columns.skip")}</option>
              {IMPORT_FIELDS.map((f) => (
                <option key={f} value={f}>
                  {t(`field.${f}`)}
                </option>
              ))}
            </Select>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Строк в предпросмотре: остальные тоже грузятся, просто не рисуются. */
const PREVIEW_ROWS = 200;

const STATUS = {
  create: { key: "import.status.create", cls: "text-success" },
  update: { key: "import.status.update", cls: "text-primary" },
  skip: { key: "import.status.skip", cls: "text-muted-foreground" },
} as const;

function Status({ row, t }: { row: ImportRow; t: TFunc }) {
  if (row.action === "error") {
    const [first] = row.errors;
    return (
      <span
        className="inline-flex items-center gap-1 text-destructive"
        title={row.errors.map((e) => t(e.key, e.vars)).join("; ")}
      >
        <AlertTriangle className="size-3 shrink-0" />
        {t(first.key, first.vars)}
        {row.errors.length > 1 ? ` +${row.errors.length - 1}` : ""}
      </span>
    );
  }
  const s = STATUS[row.action];
  return (
    <span className={`inline-flex items-center gap-1 ${s.cls}`}>
      {row.action === "create" && <Check className="size-3" />}
      {t(s.key)}
    </span>
  );
}

export function ImportPreview({ rows, t }: { rows: ImportRow[]; t: TFunc }) {
  return (
    <section className="mt-4">
      <Table size="sm" fill>
        <TableHeader>
          <Th>{t("import.col.status")}</Th>
          <Th>{t("import.col.line")}</Th>
          <Th>{t("table.col.sku")}</Th>
          <Th>{t("table.col.name")}</Th>
          <Th>{t("table.col.category")}</Th>
          <Th>{t("table.col.dims")}</Th>
        </TableHeader>
        <tbody>
          {rows.slice(0, PREVIEW_ROWS).map((r) => (
            <Tr key={r.line}>
              <Td>
                <Status row={r} t={t} />
              </Td>
              <Td className="tabular-nums text-muted-foreground">{r.line}</Td>
              <Td className="font-mono text-muted-foreground">{r.sku || "—"}</Td>
              <Td>{r.name || "—"}</Td>
              <Td>
                {!r.category
                  ? "—"
                  : r.newCategory
                    ? t("import.newCategory", { cat: r.category })
                    : catLabel(t, r.category)}
              </Td>
              <Td className="whitespace-nowrap tabular-nums text-muted-foreground">
                {dimsText(r) ?? "—"}
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
    </section>
  );
}

export function ImportAlert({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <FormError className="mt-3">
      <span className="font-semibold">{title}</span>
      <span className="mt-0.5 block text-xs leading-relaxed">{children}</span>
    </FormError>
  );
}
