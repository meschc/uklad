import { useRef } from "react";
import { Barcode, QrCode, RectangleHorizontal, RectangleVertical, Trash2 } from "lucide-react";
import {
  LABEL_CODE_MAX,
  LABEL_CODE_MIN,
  LABEL_LOGO_MAX_PX,
  LABEL_SIDE_MAX_MM,
  LABEL_SIDE_MIN_MM,
  LABEL_SIZE_PRESETS,
  type LabelCodeType,
  type LabelElement,
  type LabelLayout,
  type LabelTemplate,
} from "@/lib/types";
import { useT } from "@/lib/i18n";
import { clamp, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";

/**
 * Настройки наклейки (п.6): ориентация, тип кода, размер печати и набор
 * реквизитов. Отдельным файлом от экрана — экран отвечает за пачку и печать,
 * конструктор за один макет.
 */

const ELEMENTS: { id: LabelElement; key: string }[] = [
  { id: "logo", key: "labels.el.logo" },
  { id: "title", key: "labels.el.title" },
  { id: "seq", key: "labels.el.seq" },
  { id: "code", key: "labels.el.code" },
  { id: "warehouse", key: "labels.el.warehouse" },
  { id: "date", key: "labels.el.date" },
  { id: "fragile", key: "labels.el.fragile" },
  { id: "mark", key: "labels.el.mark" },
  { id: "note", key: "labels.el.note" },
];

export type LabelDraft = Omit<LabelTemplate, "id" | "createdAt">;

export function LabelDesigner({
  draft,
  onChange,
  templates,
  selectedId,
  onSelect,
  onSave,
  onSaveAsNew,
  onDelete,
  dirty,
}: {
  draft: LabelDraft;
  onChange: (patch: Partial<LabelDraft>) => void;
  templates: LabelTemplate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSave: () => void;
  onSaveAsNew: () => void;
  onDelete: () => void;
  /** Макет отличается от сохранённого шаблона — есть что сохранять. */
  dirty: boolean;
}) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);

  const toggle = (id: LabelElement) =>
    onChange({
      elements: draft.elements.includes(id)
        ? draft.elements.filter((e) => e !== id)
        : [...draft.elements, id],
    });

  const setSide = (key: "widthMm" | "heightMm", raw: string) => {
    const n = Number(raw.replace(/[^\d]/g, ""));
    if (!n) return onChange({ [key]: 0 } as Partial<LabelDraft>);
    onChange({
      [key]: clamp(n, LABEL_SIDE_MIN_MM, LABEL_SIDE_MAX_MM),
    } as Partial<LabelDraft>);
  };

  /** Смена ориентации меняет местами стороны — иначе «горизонтально» на
   *  вертикальной ленте выглядит как поломка, а не как выбор. */
  const setLayout = (layout: LabelLayout) => {
    const wide = draft.widthMm >= draft.heightMm;
    const swap = layout === "horizontal" ? !wide : wide;
    onChange(
      swap
        ? { layout, widthMm: draft.heightMm, heightMm: draft.widthMm }
        : { layout },
    );
  };

  const onLogo = async (file: File | undefined) => {
    if (!file) return;
    try {
      onChange({
        logoUrl: await readLogo(file),
        elements: draft.elements.includes("logo")
          ? draft.elements
          : [...draft.elements, "logo"],
      });
    } catch {
      // Битый или неподдерживаемый файл — молча его не берём, но и наклейку
      // не ломаем: старый логотип остаётся на месте.
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Шаблоны — сохранённые настройки печати, а не «дизайны»: у склада их
          два-три на все случаи, поэтому список плоский и всегда на виду. */}
      <Block title={t("labels.templates")}>
        <div className="flex flex-wrap gap-1.5">
          {templates.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => onSelect(tpl.id)}
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors",
                tpl.id === selectedId
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <span className="block font-medium">{tpl.name}</span>
              <span className="block text-[10px] tabular-nums opacity-70">
                {tpl.widthMm}×{tpl.heightMm} {t("labels.mm")}
              </span>
            </button>
          ))}
        </div>
      </Block>

      {/* Настройки идут строкой, а не колонкой: панель теперь во всю ширину
          экрана, и вытянутый столбик из девяти блоков в ней читался бы хуже,
          чем сетка. Колонок три, а не четыре: на четырёх ячейка становится
          уже переключателя «Вертикально / Горизонтально», и тот наезжает на
          соседний блок — сегменты не переносятся по словам. */}
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
        <Block title={t("labels.name")}>
          <Input
            value={draft.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder={t("labels.namePlaceholder")}
            className="h-8 text-sm"
          />
        </Block>

        <Block title={t("labels.layout")}>
          <Segmented
            // Без self-start контрол растягивается на всю ячейку сетки:
            // inline-flex всё равно тянется по поперечной оси flex-колонки,
            // и справа от двух кнопок остаётся мёртвая серая полоса.
            className="self-start"
            value={draft.layout}
            onChange={setLayout}
            options={[
              {
                value: "vertical" as LabelLayout,
                label: t("labels.layout.vertical"),
                icon: <RectangleVertical />,
              },
              {
                value: "horizontal" as LabelLayout,
                label: t("labels.layout.horizontal"),
                icon: <RectangleHorizontal />,
              },
            ]}
          />
        </Block>

        <Block title={t("labels.codeType")}>
          <Segmented
            className="self-start"
            value={draft.codeType}
            onChange={(codeType) => onChange({ codeType })}
            options={[
              {
                value: "qr" as LabelCodeType,
                label: t("labels.code.qr"),
                icon: <QrCode />,
              },
              {
                value: "barcode" as LabelCodeType,
                label: t("labels.code.barcode"),
                icon: <Barcode />,
              },
            ]}
          />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t(draft.codeType === "qr" ? "labels.code.qrHint" : "labels.code.barHint")}
          </p>
        </Block>

        <Block title={t("labels.codeSize")}>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={LABEL_CODE_MIN * 100}
              max={LABEL_CODE_MAX * 100}
              value={Math.round(draft.codeScale * 100)}
              onChange={(e) => onChange({ codeScale: Number(e.target.value) / 100 })}
              className="h-1 flex-1 accent-[hsl(var(--primary))]"
            />
            <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
              {Math.round(draft.codeScale * 100)}%
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t("labels.codeSizeHint")}
          </p>
        </Block>

        <Block title={t("labels.size")}>
          <div className="flex flex-wrap gap-1.5">
            {LABEL_SIZE_PRESETS.map((p) => {
              // Пресеты показываем в текущей ориентации: на альбомной ленте
              // «58×40» и «40×58» — это одна и та же лента, повёрнутая иначе.
              const w = draft.layout === "horizontal" ? Math.max(p.w, p.h) : p.w;
              const h = draft.layout === "horizontal" ? Math.min(p.w, p.h) : p.h;
              const active = draft.widthMm === w && draft.heightMm === h;
              return (
                <button
                  key={`${p.w}x${p.h}`}
                  onClick={() => onChange({ widthMm: w, heightMm: h })}
                  className={cn(
                    "rounded-md px-2 py-1 text-xs tabular-nums transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  {w}×{h}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={draft.widthMm || ""}
              inputMode="numeric"
              onChange={(e) => setSide("widthMm", e.target.value)}
              className="h-8 w-20 text-right text-sm tabular-nums"
            />
            <span className="text-xs text-muted-foreground">×</span>
            <Input
              value={draft.heightMm || ""}
              inputMode="numeric"
              onChange={(e) => setSide("heightMm", e.target.value)}
              className="h-8 w-20 text-right text-sm tabular-nums"
            />
            <span className="text-xs text-muted-foreground">{t("labels.mm")}</span>
          </div>
        </Block>

        <Block
          title={t("labels.elements")}
          className="sm:col-span-2 xl:col-span-3"
        >
          <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
            {ELEMENTS.map((el) => (
              <label
                key={el.id}
                className="flex cursor-pointer items-center gap-2 text-xs"
              >
                <input
                  type="checkbox"
                  checked={draft.elements.includes(el.id)}
                  onChange={() => toggle(el.id)}
                  className="size-3.5 accent-[hsl(var(--primary))]"
                />
                {t(el.key)}
              </label>
            ))}
          </div>

          {draft.elements.includes("note") && (
            <Input
              value={draft.note ?? ""}
              onChange={(e) => onChange({ note: e.target.value })}
              placeholder={t("labels.notePlaceholder")}
              className="h-8 text-sm"
            />
          )}

          {draft.elements.includes("logo") && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
              {draft.logoUrl ? (
                <img
                  src={draft.logoUrl}
                  alt=""
                  className="h-8 max-w-24 shrink-0 rounded bg-white object-contain p-0.5"
                />
              ) : (
                <span className="text-[11px] text-muted-foreground">
                  {t("labels.logoEmpty")}
                </span>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  void onLogo(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileRef.current?.click()}
              >
                {t(draft.logoUrl ? "labels.logoReplace" : "labels.logoAdd")}
              </Button>
              {draft.logoUrl && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onChange({ logoUrl: undefined })}
                >
                  {t("labels.logoRemove")}
                </Button>
              )}
            </div>
          )}
        </Block>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!dirty || !draft.name.trim()} onClick={onSave}>
          {t("labels.save")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!draft.name.trim()}
          onClick={onSaveAsNew}
        >
          {t("labels.saveAsNew")}
        </Button>
        {selectedId && templates.length > 1 && (
          <Button size="sm" variant="ghost" onClick={onDelete}>
            <Trash2 className="size-3.5" />
            {t("common.delete")}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Прочитать логотип в data-URL, ужав растр до `LABEL_LOGO_MAX_PX` по ширине.
 * Шаблоны лежат в localStorage вместе со всем складом: полноразмерная
 * фотография логотипа выбила бы квоту и утащила за собой план склада.
 * SVG не пережимаем — он и так лёгкий, а растеризация его только испортит.
 */
function readLogo(file: File): Promise<string> {
  const asDataUrl = new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });

  if (file.type === "image/svg+xml") return asDataUrl;

  return asDataUrl.then(
    (src) =>
      new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, LABEL_LOGO_MAX_PX / (img.width || 1));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("no 2d context"));
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/png"));
        };
        img.onerror = () => reject(new Error("decode failed"));
        img.src = src;
      }),
  );
}

function Block({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}
