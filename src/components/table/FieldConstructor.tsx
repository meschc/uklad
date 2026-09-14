import { useMemo, useState } from "react";
import { AlertTriangle, Loader2, Plus, Settings2, Trash2, X } from "lucide-react";
import { type FieldType, type ProductCategory } from "@/lib/types";
import { useEditor } from "@/lib/store";
import { catalogRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import { catLabel, useT, type TFunc } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { DialogHeader, DialogShell } from "@/components/ui/dialog-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { eyebrow } from "@/components/ui/eyebrow";
import { CategoryTools } from "./CategoryTools";

/** Слово «товаре/товарах» (предложный) / «product/products». */
function productsWord(t: TFunc, n: number): string {
  return t.plural(n, ["товаре", "товарах", "товарах"], ["product", "products"]);
}

/**
 * Конструктор полей категории (ТЗ, разд. 3.8): «имя + тип поля», название
 * уникально в категории. Здесь живут два алерта (ТЗ, разд. 4):
 *   — поле с существующим именем → ошибка создания;
 *   — удаление поля, уже используемого в товарах → предупреждение о потере данных.
 */
export function FieldConstructor({
  initialCategory,
  onClose,
}: {
  initialCategory?: ProductCategory;
  onClose: () => void;
}) {
  const categoryFields = useEditor((s) => s.categoryFields);
  const fieldValues = useEditor((s) => s.fieldValues);
  const t = useT();

  // Удаление поля идёт через репозиторий (п.3.2.1). Подвала у окна нет —
  // снизу стоит форма добавления, — поэтому отказ встаёт строкой прямо над ней.
  const del = useCommand((id: string) => catalogRepository.removeField(id));

  const categories = useEditor((s) => s.categories);
  const [category, setCategory] = useState<ProductCategory>(initialCategory ?? categories[0]);

  const fields = useMemo(
    () => categoryFields.filter((f) => f.category === category),
    [categoryFields, category],
  );

  // Сколько товаров используют поле — для предупреждения о потере данных.
  const usageOf = (fieldId: string) =>
    Object.keys(fieldValues).filter((k) => k.endsWith(`:${fieldId}`)).length;

  return (
    <DialogShell size="lg" scroll onClose={onClose}>
      <DialogHeader align="start">
        <div className="flex items-center gap-2">
          <Settings2 className="size-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-semibold">{t("fields.title")}</p>
            <p className="text-[11px] text-muted-foreground">{t("fields.subtitle")}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </DialogHeader>

      {/* Выбор категории + правка самого списка категорий (п.15) */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-5 py-2.5">
        {categories.map((c) => {
          const n = categoryFields.filter((f) => f.category === c).length;
          return (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                c === category
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {catLabel(t, c)}
              {n > 0 && <span className="ml-1 opacity-60 tabular-nums">{n}</span>}
            </button>
          );
        })}
        <CategoryTools category={category} onPick={setCategory} t={t} />
      </div>

      {/* Список полей */}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-3">
        {fields.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {t("fields.emptyCat", { cat: catLabel(t, category) })}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {fields.map((f) => (
              <FieldRow
                key={f.id}
                name={f.name}
                type={f.type}
                options={f.options}
                usage={usageOf(f.id)}
                busy={del.pending}
                onDelete={() => del.run(f.id)}
                t={t}
              />
            ))}
          </ul>
        )}
      </div>

      {del.error && (
        <p
          role="alert"
          className="shrink-0 border-t border-border bg-destructive/10 px-5 py-2 text-xs text-destructive"
        >
          {t(del.error)}
        </p>
      )}

      {/* Добавление поля */}
      <AddFieldForm category={category} t={t} />
    </DialogShell>
  );
}

function FieldRow({
  name,
  type,
  options,
  usage,
  busy,
  onDelete,
  t,
}: {
  name: string;
  type: FieldType;
  options?: string[];
  usage: number;
  /** Идёт удаление какого-то поля: второе нажатие по сети ушло бы вслед. */
  busy: boolean;
  onDelete: () => void;
  t: TFunc;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <li className="rounded-md border border-border bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">{name}</span>
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {t(`ftype.${type}`)}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {type === "select" && options?.length
              ? `${t("fields.optionsLabel")}: ${options.join(", ")} · `
              : ""}
            {usage > 0
              ? t("fields.usedIn", { n: usage, word: productsWord(t, usage) })
              : t("fields.notUsed")}
          </p>
        </div>
        <button
          onClick={() => (usage > 0 ? setConfirming(true) : onDelete())}
          disabled={busy}
          title={t("fields.delete")}
          className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {/* Удаление используемого поля → предупреждение о потере данных (ТЗ, разд. 4) */}
      {confirming && (
        <div className="mt-2 flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <div className="min-w-0">
            <p>
              {t("fields.deleteConfirm", {
                name,
                n: usage,
                word: productsWord(t, usage),
              })}
            </p>
            <div className="mt-1.5 flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                className="h-7"
                disabled={busy}
                onClick={() => {
                  setConfirming(false);
                  onDelete();
                }}
              >
                {t("fields.deleteWithData")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                onClick={() => setConfirming(false)}
              >
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

function AddFieldForm({ category, t }: { category: ProductCategory; t: TFunc }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [optionsRaw, setOptionsRaw] = useState("");
  /** Готовый текст отказа: сюда сходятся обе его причины (см. `submit`). */
  const [error, setError] = useState<string | null>(null);

  // Поле заводится через репозиторий (п.3.2.1). Отказа тут два разных рода:
  // «имя занято» приходит ОТВЕТОМ домена (`ok: true` с разбором внутри), а
  // «не получилось» — настоящим сбоем. Человеку они выглядят одинаково —
  // красной строкой под полем, — но кнопка становится «Повторить» только во
  // втором случае: повторять занятое имя бессмысленно.
  const add = useCommand((n: string, ty: FieldType, options?: string[]) =>
    catalogRepository.addField(category, n, ty, options),
  );

  const submit = async () => {
    const options =
      type === "select"
        ? optionsRaw
            .split(",")
            .map((o) => o.trim())
            .filter(Boolean)
        : undefined;
    const res = await add.run(name, type, options);
    if (!res.ok) {
      setError(t(res.error));
      return;
    }
    if (!res.data.ok) {
      setError(res.data.errorKey ? t(res.data.errorKey, res.data.errorVars) : "");
      return;
    }
    setName("");
    setOptionsRaw("");
    setType("text");
    setError(null);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="shrink-0 border-t border-border bg-muted/30 px-5 py-3"
    >
      <p className={eyebrow({ className: "mb-2" })}>
        {t("fields.newField", { cat: catLabel(t, category) })}
      </p>
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError(null);
          }}
          placeholder={t("fields.namePlaceholder")}
          className={cn("h-9 flex-1", error && "border-destructive")}
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as FieldType)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="text">{t("ftype.text")}</option>
          <option value="number">{t("ftype.number")}</option>
          <option value="select">{t("ftype.select")}</option>
        </select>
      </div>

      {type === "select" && (
        <Input
          value={optionsRaw}
          onChange={(e) => setOptionsRaw(e.target.value)}
          placeholder={t("fields.optionsPlaceholder")}
          className="mt-2 h-9"
        />
      )}

      {error && (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-destructive">
          <AlertTriangle className="size-3" />
          {error}
        </p>
      )}

      <Button
        type="submit"
        size="sm"
        className="mt-2 h-9 w-full"
        disabled={!name.trim() || add.pending}
      >
        {add.pending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Plus className="size-3.5" />
        )}
        {add.pending ? t("data.busy") : add.error ? t("data.retry") : t("fields.addField")}
      </Button>
    </form>
  );
}
