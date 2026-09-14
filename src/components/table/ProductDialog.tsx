import { useState } from "react";
import { Barcode, Loader2, RefreshCw, Trash2, X } from "lucide-react";
import type { Product } from "@/lib/types";
import { useEditor, fieldValueKey, selectRole } from "@/lib/store";
import { catalogRepository, type Result } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import { cm } from "@/lib/address";
import { generateEan13 } from "@/lib/barcode";
import { catLabel, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { DialogFooter, DialogHeader, DialogShell } from "@/components/ui/dialog-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { eyebrow } from "@/components/ui/eyebrow";
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
  // Доп.поля копим локально и записываем при сохранении — как и все остальные
  // поля формы. Раньше карточка существующего товара писала их сразу по
  // нажатию клавиши: «Отмена» отменяла всё, кроме них.
  const [draftFields, setDraftFields] = useState<Record<string, string>>(() => {
    if (!product) return {};
    const out: Record<string, string> = {};
    for (const f of categoryFields) {
      const value = fieldValues[fieldValueKey(product.id, f.id)];
      if (value != null) out[f.id] = value;
    }
    return out;
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const touch = (k: string) => setTouched((prev) => ({ ...prev, [k]: true }));

  const fields = categoryFields.filter((f) => f.category === form.category);
  const fieldValue = (fieldId: string) => draftFields[fieldId] ?? "";
  const setField = (fieldId: string, value: string) =>
    setDraftFields((prev) => ({ ...prev, [fieldId]: value }));

  /**
   * Id уже заведённой карточки. Нужен для повтора: если товар создался, а
   * доп.поля не доехали, второй заход обязан ДОПИСАТЬ поля этой карточке, а не
   * завести вторую с тем же артикулом.
   *
   * Именно состоянием, а не ссылкой: на этот id смотрит ещё и проверка
   * артикула ниже, а её считает рендер.
   */
  const [createdId, setCreatedId] = useState<string | null>(null);

  const skuTrim = form.sku.trim();
  const nameErr = !form.name.trim();
  // «Свои» карточки из проверки исключаем обе: и ту, что правим, и ту, что
  // завёл неудавшийся заход. Иначе после частичного отказа форма упёрлась бы в
  // собственный артикул и повторить сохранение стало бы нечем.
  const own = new Set([product?.id, createdId]);
  const skuErr = !skuTrim
    ? "empty"
    : products.some((p) => !own.has(p.id) && p.sku.toLowerCase() === skuTrim.toLowerCase())
      ? "dup"
      : null;
  const valid = !nameErr && !skuErr;
  const showNameErr = nameErr && touched.name;
  const showSkuErr = skuErr && (touched.sku || skuErr === "dup");

  // Сохранение через репозиторий (п.3.2.1): здесь появится сервер. Форма при
  // отказе остаётся открытой с набранным — кнопка становится «Повторить».
  const save = useCommand(async (data: Omit<Product, "id">): Promise<Result<void>> => {
    const id = product?.id ?? createdId;
    if (id) {
      const updated = await catalogRepository.update(id, data);
      if (!updated.ok) return updated;
      return catalogRepository.setFields(id, draftFields);
    }
    const created = await catalogRepository.create(data);
    if (!created.ok) return created;
    setCreatedId(created.data);
    return catalogRepository.setFields(created.data, draftFields);
  });

  const del = useCommand((id: string) => catalogRepository.remove([id]));

  const submit = async () => {
    if (!valid) {
      setTouched({ name: true, sku: true });
      return;
    }
    const res = await save.run({
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
    });
    if (res.ok) onClose();
  };

  const remove = async (id: string) => {
    const res = await del.run(id);
    if (res.ok) onClose();
  };

  const busy = save.pending || del.pending;
  const error = save.error ?? del.error;

  return (
    <DialogShell size="lg" onClose={onClose}>
      <DialogHeader>
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
      </DialogHeader>

      <div className="flex flex-col gap-3 px-5 py-4">
        <Field label={t("product.name")} error={showNameErr ? t("product.errName") : undefined}>
          <Input
            // eslint-disable-next-line jsx-a11y/no-autofocus -- диалог открыт по действию пользователя: фокус обязан уйти в первое поле
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
                onChange={(e) => set({ barcode: e.target.value.replace(/\D/g, "").slice(0, 13) })}
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
          <span className={eyebrow()}>{t("product.category")}</span>
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
          <span className={eyebrow({ className: "mb-1 block" })}>{t("product.dims")}</span>
          <div className="grid grid-cols-3 gap-2">
            <NumInput
              value={form.widthCm}
              onChange={(v) => set({ widthCm: v })}
              suffix={t("product.dimW")}
            />
            <NumInput
              value={form.heightCm}
              onChange={(v) => set({ heightCm: v })}
              suffix={t("product.dimH")}
            />
            <NumInput
              value={form.depthCm}
              onChange={(v) => set({ depthCm: v })}
              suffix={t("product.dimD")}
            />
          </div>
        </div>

        <Field label={`${t("product.weight")} · ${t("product.weightOpt")}`}>
          <NumInput
            value={form.weightKg}
            onChange={(v) => set({ weightKg: v })}
            className="max-w-32"
          />
        </Field>
      </div>

      {/* Отказ отдельной строкой над подвалом, а не слева в нём, как у
          `fulfillment/Modal`: слева тут уже стоит «Удалить», а на подтверждении
          удаления — ещё и «Удалить товар? Да / Нет». Втискивать сообщение
          четвёртым в тот же ряд значило бы обрезать его до многоточия. */}
      {error && (
        <p
          role="alert"
          className="shrink-0 border-t border-border bg-destructive/10 px-5 py-2 text-xs text-destructive"
        >
          {t(error)}
        </p>
      )}

      <DialogFooter spread>
        {product && canDelete ? (
          confirmDel ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-destructive">{t("product.deleteConfirm")}</span>
              <Button
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={() => remove(product.id)}
              >
                {del.pending && <Loader2 className="animate-spin" />}
                {del.pending ? t("data.busy") : del.error ? t("data.retry") : t("common.yes")}
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
          {/* Отмену не блокируем даже во время команды: если запрос повис,
              единственный выход из окна не должен быть заперт вместе с ним. */}
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button size="sm" disabled={!valid || busy} onClick={submit}>
            {save.pending && <Loader2 className="animate-spin" />}
            {save.pending
              ? t("data.busy")
              : save.error
                ? t("data.retry")
                : product
                  ? t("product.save")
                  : t("product.add")}
          </Button>
        </div>
      </DialogFooter>
    </DialogShell>
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
      <span className={eyebrow()}>{label}</span>
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
