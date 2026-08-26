import { useEffect, useState } from "react";
import { Barcode, RefreshCw, Trash2, X } from "lucide-react";
import type { Product } from "@/lib/types";
import { useEditor, fieldValueKey, selectRole } from "@/lib/store";
import { cm } from "@/lib/address";
import { generateEan13 } from "@/lib/barcode";
import { catLabel, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QrSvg } from "./QrSvg";

/**
 * Ручное добавление и редактирование товара (ТЗ, разд. 2.5): артикул, штрихкод,
 * название, категория, габариты Ш×В×Г в см, вес (необязательно). Артикул должен
 * быть уникальным. Удаление снимает товар с места хранения и стирает доп.поля.
 */

/** Пустой список партнёров — стабильная ссылка, чтобы селектор не дёргался. */
const EMPTY_PARTNERS: never[] = [];

/** Число из строки с десятичной запятой; отрицательные и мусор → 0. */
function num(s: string): number {
  const n = parseFloat(s.replace(",", ".").trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function ProductDialog({
  product,
  presetBarcode,
  onClose,
}: {
  product: Product | null;
  /**
   * Штрихкод, уже полученный со сканера (приёмка неучтённого товара, п.5.2):
   * поле заполнено заранее, оператору остаётся дописать название и габариты.
   */
  presetBarcode?: string;
  onClose: () => void;
}) {
  const products = useEditor((s) => s.products);
  const categories = useEditor((s) => s.categories);
  const partners = useEditor((s) => s.warehouse.partners ?? EMPTY_PARTNERS);
  const categoryFields = useEditor((s) => s.categoryFields);
  const fieldValues = useEditor((s) => s.fieldValues);
  const setFieldValue = useEditor((s) => s.setFieldValue);
  const addProduct = useEditor((s) => s.addProduct);
  const updateProduct = useEditor((s) => s.updateProduct);
  const deleteProduct = useEditor((s) => s.deleteProduct);
  // Правка карточки продавцу доступна, а удаление из номенклатуры — нет:
  // товар лежит на складе физически, и вычёркивать его из базы решает склад.
  const canDelete = useEditor((s) => selectRole(s) !== "seller");
  const t = useT();

  const [form, setForm] = useState(() => ({
    name: product?.name ?? "",
    sku: product?.sku ?? "",
    // Штрихкод НЕ выдумываем: случайный код в новом товаре выглядел как
    // настоящий и попадал на ярлык. Пустое поле + кнопка генерации (п.13).
    barcode: product?.barcode ?? presetBarcode ?? "",
    category: product?.category ?? categories[0] ?? "",
    partnerId: product?.partnerId ?? "",
    imageUrl: product?.imageUrl ?? "",
    widthCm: product ? cm(product.widthCm) : "",
    heightCm: product ? cm(product.heightCm) : "",
    depthCm: product ? cm(product.depthCm) : "",
    weightKg: product?.weightKg != null ? cm(product.weightKg) : "",
    url: product?.url ?? "",
  }));
  const [confirmDel, setConfirmDel] = useState(false);
  const [showBarcode, setShowBarcode] = useState(false);
  // Пустое поле — это ещё не ошибка: подсвечиваем красным только то, чего
  // коснулись, либо всё сразу при попытке сохранить (п.13).
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  // Доп.поля новой карточки копим локально: у товара ещё нет id.
  const [draftFields, setDraftFields] = useState<Record<string, string>>({});
  const set = (patch: Partial<typeof form>) =>
    setForm((f) => ({ ...f, ...patch }));
  const touch = (k: string) => setTouched((prev) => ({ ...prev, [k]: true }));

  const fields = categoryFields.filter((f) => f.category === form.category);
  const fieldValue = (fieldId: string) =>
    product
      ? (fieldValues[fieldValueKey(product.id, fieldId)] ?? "")
      : (draftFields[fieldId] ?? "");
  const setField = (fieldId: string, value: string) => {
    if (product) setFieldValue(product.id, fieldId, value);
    else setDraftFields((prev) => ({ ...prev, [fieldId]: value }));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const skuTrim = form.sku.trim();
  const nameErr = !form.name.trim();
  const skuErr = !skuTrim
    ? "empty"
    : products.some(
          (p) => p.id !== product?.id && p.sku.toLowerCase() === skuTrim.toLowerCase(),
        )
      ? "dup"
      : null;
  const valid = !nameErr && !skuErr;
  const showNameErr = nameErr && touched.name;
  const showSkuErr = skuErr && (touched.sku || skuErr === "dup");

  const submit = () => {
    if (!valid) {
      setTouched({ name: true, sku: true });
      return;
    }
    const data = {
      name: form.name.trim(),
      sku: skuTrim,
      barcode: form.barcode.trim(),
      category: form.category,
      widthCm: num(form.widthCm),
      heightCm: num(form.heightCm),
      depthCm: num(form.depthCm),
      weightKg: form.weightKg.trim() ? num(form.weightKg) : undefined,
      url: form.url.trim() || undefined,
      imageUrl: form.imageUrl.trim() || undefined,
      partnerId: form.partnerId || undefined,
    };
    if (product) {
      updateProduct(product.id, data);
    } else {
      const id = addProduct(data);
      // Доп.поля новой карточки переносим по её появившемуся id.
      for (const [fieldId, value] of Object.entries(draftFields)) {
        if (value.trim()) setFieldValue(id, fieldId, value);
      }
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 animate-fade-in bg-black/40 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg animate-scale-in overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <p className="text-sm font-semibold">
            {product
              ? t("product.editTitle")
              : presetBarcode
                ? t("product.scanTitle")
                : t("product.addTitle")}
          </p>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4">
          <Field
            label={t("product.name")}
            error={showNameErr ? t("product.errName") : undefined}
          >
            <Input
              autoFocus
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              onBlur={() => touch("name")}
              placeholder={t("product.namePlaceholder")}
              className={cn("h-9", showNameErr && "border-destructive")}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label={t("product.sku")}
              error={
                !showSkuErr
                  ? undefined
                  : skuErr === "empty"
                    ? t("product.errSku")
                    : t("product.errSkuDup")
              }
            >
              <Input
                value={form.sku}
                onChange={(e) => set({ sku: e.target.value })}
                onBlur={() => touch("sku")}
                placeholder="УК-0000"
                className={cn("h-9 font-mono", showSkuErr && "border-destructive")}
              />
            </Field>
            <Field label={t("product.barcode")}>
              <div className="relative">
                <Input
                  value={form.barcode}
                  onChange={(e) =>
                    set({ barcode: e.target.value.replace(/\D/g, "").slice(0, 13) })
                  }
                  placeholder={t("product.barcodePlaceholder")}
                  inputMode="numeric"
                  maxLength={13}
                  className="h-9 pr-16 font-mono"
                />
                <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center">
                  <button
                    type="button"
                    onClick={() => set({ barcode: generateEan13() })}
                    title={t("product.barcodeGen")}
                    className="flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <RefreshCw className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBarcode((v) => !v)}
                    title={t("product.barcodeShow")}
                    className="flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Barcode className="size-4" />
                  </button>
                </div>
              </div>
            </Field>
          </div>

          {showBarcode &&
            (form.barcode.trim() ? (
              <div className="rounded-md border border-border bg-white p-3">
                <QrSvg code={form.barcode} size={112} />
              </div>
            ) : (
              // Пустой белый прямоугольник вместо ярлыка выглядел как поломка.
              <div className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                {t("product.barcodeEmpty")}
              </div>
            ))}

          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("product.category")}
            </span>
            <div className="flex flex-wrap gap-1">
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set({ category: c })}
                  className={cn(
                    "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                    c === form.category
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  {catLabel(t, c)}
                </button>
              ))}
            </div>
          </div>

          {/* Доп.поля категории (у одежды — размер и цвет): необязательные,
              появляются вместе с выбором категории (п.13). */}
          {fields.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {fields.map((f) => (
                <Field key={f.id} label={`${f.name} · ${t("product.weightOpt")}`}>
                  {f.type === "select" ? (
                    <select
                      value={fieldValue(f.id)}
                      onChange={(e) => setField(f.id, e.target.value)}
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="">—</option>
                      {(f.options ?? []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      value={fieldValue(f.id)}
                      inputMode={f.type === "number" ? "decimal" : undefined}
                      onChange={(e) => setField(f.id, e.target.value)}
                      className="h-9"
                    />
                  )}
                </Field>
              ))}
            </div>
          )}

          <Field label={t("product.partner")}>
            <select
              value={form.partnerId}
              onChange={(e) => set({ partnerId: e.target.value })}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">{t("product.partnerNone")}</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t("product.imageUrl")}>
            <div className="flex items-center gap-2">
              <Input
                type="url"
                value={form.imageUrl}
                onChange={(e) => set({ imageUrl: e.target.value })}
                placeholder="https://…/photo.jpg"
                inputMode="url"
                className="h-9"
              />
              {form.imageUrl.trim() && (
                <img
                  src={form.imageUrl}
                  alt=""
                  className="size-9 shrink-0 rounded-md border border-border object-cover"
                  onError={(e) => {
                    e.currentTarget.style.visibility = "hidden";
                  }}
                />
              )}
            </div>
          </Field>

          <Field label={t("product.url")}>
            <Input
              type="url"
              value={form.url}
              onChange={(e) => set({ url: e.target.value })}
              placeholder="https://…"
              inputMode="url"
              className="h-9"
            />
          </Field>

          <div>
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("product.dims")}
            </span>
            <div className="grid grid-cols-3 gap-2">
              <NumInput value={form.widthCm} onChange={(v) => set({ widthCm: v })} suffix="Ш" />
              <NumInput value={form.heightCm} onChange={(v) => set({ heightCm: v })} suffix="В" />
              <NumInput value={form.depthCm} onChange={(v) => set({ depthCm: v })} suffix="Г" />
            </div>
          </div>

          <Field
            label={`${t("product.weight")} · ${t("product.weightOpt")}`}
          >
            <NumInput
              value={form.weightKg}
              onChange={(v) => set({ weightKg: v })}
              className="max-w-32"
            />
          </Field>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/30 px-5 py-3">
          {product && canDelete ? (
            confirmDel ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-destructive">{t("product.deleteConfirm")}</span>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    deleteProduct(product.id);
                    onClose();
                  }}
                >
                  {t("common.yes")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDel(false)}>
                  {t("common.no")}
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setConfirmDel(true)}
              >
                <Trash2 className="size-3.5" />
                {t("product.delete")}
              </Button>
            )
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" disabled={!valid} onClick={submit}>
              {product ? t("product.save") : t("product.add")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
      {error && <span className="text-[11px] text-destructive">{error}</span>}
    </label>
  );
}

function NumInput({
  value,
  onChange,
  suffix,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        inputMode="decimal"
        className={cn("h-9 tabular-nums", suffix && "pr-6")}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  );
}
