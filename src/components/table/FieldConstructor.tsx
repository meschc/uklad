import { useMemo, useState } from "react";
import { AlertTriangle, Pencil, Plus, Settings2, Trash2, X } from "lucide-react";
import {
  type FieldType,
  type ProductCategory,
} from "@/lib/types";
import { useEditor } from "@/lib/store";
import { catLabel, useT, type TFunc } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Слово «товаре/товарах» (предложный) / «product/products». */
function productsWord(t: TFunc, n: number): string {
  return t.plural(
    n,
    ["товаре", "товарах", "товарах"],
    ["product", "products"],
  );
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
  const addField = useEditor((s) => s.addCategoryField);
  const removeField = useEditor((s) => s.removeCategoryField);
  const t = useT();

  const categories = useEditor((s) => s.categories);
  const [category, setCategory] = useState<ProductCategory>(
    initialCategory ?? categories[0],
  );

  const fields = useMemo(
    () => categoryFields.filter((f) => f.category === category),
    [categoryFields, category],
  );

  // Сколько товаров используют поле — для предупреждения о потере данных.
  const usageOf = (fieldId: string) =>
    Object.keys(fieldValues).filter((k) => k.endsWith(`:${fieldId}`)).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 animate-fade-in bg-black/40 backdrop-blur-[1px]" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-lg animate-scale-in flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <Settings2 className="size-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold">{t("fields.title")}</p>
              <p className="text-[11px] text-muted-foreground">
                {t("fields.subtitle")}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

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
                {n > 0 && (
                  <span className="ml-1 opacity-60 tabular-nums">{n}</span>
                )}
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
                  onDelete={() => removeField(f.id)}
                  t={t}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Добавление поля */}
        <AddFieldForm
          category={category}
          onAdd={(name, type, options) => addField(category, name, type, options)}
          t={t}
        />
      </div>
    </div>
  );
}

function FieldRow({
  name,
  type,
  options,
  usage,
  onDelete,
  t,
}: {
  name: string;
  type: FieldType;
  options?: string[];
  usage: number;
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
          title={t("fields.delete")}
          className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
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

function AddFieldForm({
  category,
  onAdd,
  t,
}: {
  category: ProductCategory;
  onAdd: (
    name: string,
    type: FieldType,
    options?: string[],
  ) => {
    ok: boolean;
    errorKey?: string;
    errorVars?: Record<string, string | number>;
  };
  t: TFunc;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [optionsRaw, setOptionsRaw] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const options =
      type === "select"
        ? optionsRaw.split(",").map((o) => o.trim()).filter(Boolean)
        : undefined;
    const res = onAdd(name, type, options);
    if (!res.ok) {
      setError(res.errorKey ? t(res.errorKey, res.errorVars) : "");
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
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
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

      <Button type="submit" size="sm" className="mt-2 h-9 w-full" disabled={!name.trim()}>
        <Plus className="size-3.5" />
        {t("fields.addField")}
      </Button>
    </form>
  );
}

/**
 * Правка самого списка категорий (п.15): добавить, переименовать, удалить.
 * Живёт рядом с чипами категорий — там, где пользователь их и видит.
 */
function CategoryTools({
  category,
  onPick,
  t,
}: {
  category: ProductCategory;
  onPick: (c: ProductCategory) => void;
  t: TFunc;
}) {
  const addCategory = useEditor((s) => s.addCategory);
  const renameCategory = useEditor((s) => s.renameCategory);
  const removeCategory = useEditor((s) => s.removeCategory);
  const categories = useEditor((s) => s.categories);
  const [mode, setMode] = useState<"idle" | "add" | "rename">("idle");
  const [value, setValue] = useState("");

  const submit = () => {
    const ok =
      mode === "add" ? addCategory(value) : renameCategory(category, value);
    if (!ok) return;
    if (mode === "add") onPick(value.trim());
    else onPick(value.trim());
    setValue("");
    setMode("idle");
  };

  if (mode !== "idle") {
    return (
      <div className="flex w-full items-center gap-2 pt-1.5">
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") setMode("idle");
          }}
          placeholder={t(mode === "add" ? "cats.newName" : "cats.renameTo")}
          className="h-9 flex-1"
        />
        <Button size="sm" className="h-9" disabled={!value.trim()} onClick={submit}>
          {t("common.save")}
        </Button>
        <Button size="sm" variant="ghost" className="h-9" onClick={() => setMode("idle")}>
          {t("common.cancel")}
        </Button>
      </div>
    );
  }

  return (
    <div className="ml-auto flex items-center gap-0.5">
      <button
        title={t("cats.add")}
        onClick={() => {
          setValue("");
          setMode("add");
        }}
        className="flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Plus className="size-3.5" />
      </button>
      <button
        title={t("cats.rename")}
        onClick={() => {
          setValue(category);
          setMode("rename");
        }}
        className="flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Pencil className="size-3.5" />
      </button>
      <button
        title={t("cats.remove")}
        disabled={categories.length <= 1}
        onClick={() => removeCategory(category)}
        className="flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}
