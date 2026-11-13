import { useMemo, useState } from "react";
import { Check, Eye, Layers, Loader2, Package, Printer, Search, Tag } from "lucide-react";
import { useEditor } from "@/lib/store";
import { fulfillmentRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import type { LabelTemplate, Product } from "@/lib/types";
import { useWarehouseProducts } from "@/lib/warehouseProducts";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Input } from "@/components/ui/input";
import { eyebrow } from "@/components/ui/eyebrow";
import { card } from "@/components/ui/card";
import { labelNumber } from "@/lib/barcode";
import { LabelCard, type LabelKind } from "./LabelCard";
import { printLabels } from "@/lib/printLabels";
import { LabelPrint } from "./LabelPrint";
import { FitToWidth } from "./FitToWidth";
import { LabelDesigner, type LabelDraft } from "./LabelDesigner";
import { ScreenShell } from "./ScreenShell";

/**
 * Наклейки тары и паллет (п.18, п.6). Тару подписывают ДО приёмки: печатают
 * пачку пустых наклеек, клеят на короба, а на приёмке просто сканируют.
 * Поэтому это отдельный экран, а не хвост мастера приёмки.
 *
 * Конструктор здесь — не редактор вёрстки, а параметры печати: размер ленты,
 * набор реквизитов и величина кода. Свободное расположение элементов на 58 мм
 * никому не нужно, а вот «не тот размер ленты» — ежедневная боль.
 */

type TareKind = Exclude<LabelKind, "custom">;

const MAX_BATCH = 999;

type Mode = TareKind | "product";

const EMPTY_DRAFT: LabelDraft = {
  name: "",
  widthMm: 58,
  heightMm: 40,
  layout: "vertical",
  codeType: "qr",
  elements: ["title", "seq", "code"],
  codeScale: 0.6,
};

const toDraft = (tpl: LabelTemplate): LabelDraft => ({
  name: tpl.name,
  widthMm: tpl.widthMm,
  heightMm: tpl.heightMm,
  layout: tpl.layout,
  codeType: tpl.codeType,
  elements: [...tpl.elements],
  codeScale: tpl.codeScale,
  note: tpl.note,
  logoUrl: tpl.logoUrl,
});

const sameDraft = (a: LabelDraft, b: LabelDraft) =>
  a.name === b.name &&
  a.widthMm === b.widthMm &&
  a.heightMm === b.heightMm &&
  a.layout === b.layout &&
  a.codeType === b.codeType &&
  a.codeScale === b.codeScale &&
  (a.note ?? "") === (b.note ?? "") &&
  (a.logoUrl ?? "") === (b.logoUrl ?? "") &&
  a.elements.length === b.elements.length &&
  a.elements.every((e) => b.elements.includes(e));

export function LabelsScreen() {
  const t = useT();
  const boxes = useEditor((s) => s.boxes);
  const pallets = useEditor((s) => s.pallets);
  const showToast = useEditor((s) => s.showToast);
  const warehouseName = useEditor((s) => s.warehouse.name);
  const templates = useEditor((s) => s.labelTemplates);
  const saveTemplate = useEditor((s) => s.saveLabelTemplate);
  const removeTemplate = useEditor((s) => s.removeLabelTemplate);

  const [mode, setMode] = useState<Mode>("box");
  const kind: TareKind = mode === "pallet" ? "pallet" : "box";
  const isProduct = mode === "product";
  const products = useWarehouseProducts();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Product | null>(null);
  const [count, setCount] = useState(12);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  /** Коды текущей пачки — то, что уйдёт на печать. */
  const [taraBatch, setBatch] = useState<string[]>([]);
  const n = Math.max(1, Math.min(MAX_BATCH, Math.round(count)));
  // Этикетки товара не создают номеров: это один и тот же штрихкод n раз.
  const batch = useMemo(
    () => (isProduct ? (picked ? Array<string>(n).fill(picked.barcode) : []) : taraBatch),
    [isProduct, picked, n, taraBatch],
  );

  // Поиск по названию, артикулу (код производителя) и штрихкоду.
  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.barcode.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [products, query]);
  // Скан/ввод точного штрихкода или артикула выбирает товар сразу.
  const pickExact = () => {
    const q = query.trim().toLowerCase();
    const hit = products.find((p) => p.barcode.toLowerCase() === q || p.sku.toLowerCase() === q);
    const one = hit ?? (found.length === 1 ? found[0] : undefined);
    if (one) {
      setPicked(one);
      setQuery("");
    }
  };

  const [selectedId, setSelectedId] = useState<string | null>(templates[0]?.id ?? null);
  const [draft, setDraft] = useState<LabelDraft>(
    templates[0] ? toDraft(templates[0]) : EMPTY_DRAFT,
  );

  // Шаблон могли удалить в другой вкладке (стор общий) — не оставляем экран с
  // выбранным «призраком». Подгоняем прямо в рендере, а не эффектом: всё, что
  // ниже, считается от `selectedId`, и эффект успел бы отрисовать кадр с
  // формой несуществующего шаблона. Условие само себя снимает — после правки
  // выбран либо существующий шаблон, либо ничего.
  if (selectedId && !templates.some((tpl) => tpl.id === selectedId)) {
    const first = templates[0] ?? null;
    setSelectedId(first?.id ?? null);
    setDraft(first ? toDraft(first) : EMPTY_DRAFT);
  }

  const selected = templates.find((tpl) => tpl.id === selectedId) ?? null;
  const dirty = !selected || !sameDraft(draft, toDraft(selected));

  const previewTpl: LabelTemplate = useMemo(
    () => ({
      ...draft,
      elements: isProduct ? draft.elements.filter((e) => e !== "seq") : draft.elements,
      // Пустое поле размера в процессе набора не должно ронять предпросмотр.
      widthMm: draft.widthMm || 1,
      heightMm: draft.heightMm || 1,
      id: selectedId ?? "draft",
      createdAt: 0,
    }),
    [draft, selectedId, isProduct],
  );

  // Вся тара выбранного вида по возрастанию номера, со статусом печати.
  const all = useMemo(() => {
    const src = kind === "box" ? boxes : pallets;
    return src
      .map((x) => ({
        code: x.barcode,
        n: labelNumber(x.barcode),
        printedAt: x.printedAt,
        used:
          kind === "box"
            ? !!(x as (typeof boxes)[number]).address ||
              (x as (typeof boxes)[number]).lines.length > 0
            : (x as (typeof pallets)[number]).boxIds.length > 0,
      }))
      .sort((a, b) => (a.n ?? 0) - (b.n ?? 0));
  }, [kind, boxes, pallets]);
  const byCode = useMemo(() => new Map(all.map((x) => [x.code, x])), [all]);
  const unprinted = all.filter((x) => !x.printedAt && !x.used);

  /**
   * Пачка номеров через репозиторий (п.3.2.1). Формы здесь нет — есть кнопка,
   * поэтому отказ уходит тостом, а сама кнопка на время команды занята: пачка
   * на сотню наклеек по сети не мгновенна, и второе нажатие выдало бы вторую
   * сотню пустых номеров.
   *
   * Уже выданные номера при обрыве на середине НЕ отменяются: тара с такими
   * номерами существует, и отменять её значило бы потерять их из виду. Пачка
   * показывается неполной — человек допечатает недостающие.
   */
  const create = useCommand(async (n: number, k: TareKind) => {
    const codes: string[] = [];
    for (let i = 0; i < n; i++) {
      const res = await (k === "box"
        ? fulfillmentRepository.createBox()
        : fulfillmentRepository.createPallet());
      if (!res.ok) {
        setBatch(codes);
        return res;
      }
      codes.push(res.data.barcode);
    }
    return { ok: true as const, data: codes };
  });

  const generate = async () => {
    const res = await create.run(n, kind);
    if (res.ok) setBatch(res.data);
    else showToast(res.error, undefined, undefined, "error");
  };

  /** Выбрать уже созданные номера «с … по …» — для перепечатки порванных. */
  const pickRange = () => {
    const a = Number(from.replace(/\D/g, ""));
    const b = to.trim() ? Number(to.replace(/\D/g, "")) : a;
    if (!a || !b) return;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const found = all.filter((x) => x.n !== null && x.n >= lo && x.n <= hi);
    if (found.length === 0) return showToast("labels.rangeEmpty");
    if (found.length > MAX_BATCH) return showToast("labels.tooMany");
    setBatch(found.map((x) => x.code));
  };

  const pickUnprinted = () => setBatch(unprinted.slice(0, MAX_BATCH).map((x) => x.code));

  const print = () => {
    const codes = batch;
    // У товара статуса «напечатан» нет: он не тара, а штрихкод из каталога.
    printLabels(
      isProduct ? undefined : () => void fulfillmentRepository.markLabelsPrinted(kind, codes),
    );
  };

  const applyTemplate = (id: string) => {
    const tpl = templates.find((x) => x.id === id);
    if (!tpl) return;
    setSelectedId(id);
    setDraft(toDraft(tpl));
  };

  const save = () => {
    const id = saveTemplate({ ...draft, id: selectedId ?? undefined });
    setSelectedId(id);
  };

  const saveAsNew = () => {
    const id = saveTemplate({ ...draft, name: draft.name.trim() });
    setSelectedId(id);
  };

  const remove = () => {
    if (!selectedId) return;
    removeTemplate(selectedId);
  };

  // Заглушка предпросмотра — латиницей, как настоящие номера: Code128 B
  // кириллицу не кодирует, и на «УК-…» предпросмотр показывал бы ошибку там,
  // где реальная печать сработает.
  const previewCode =
    batch[0] ?? (isProduct ? "4600000000017" : kind === "box" ? "UK-BOX-1234" : "UK-PLT-1234");

  const num = (v: string, set: (s: string) => void) => (
    <Input
      maxLength={7}
      inputMode="numeric"
      value={v}
      onChange={(e) => set(e.target.value.replace(/\D/g, "").slice(0, 7))}
      className="h-9 w-28 text-right tabular-nums"
    />
  );

  return (
    <ScreenShell title={t("labels.title")} subtitle={t("labels.subtitle")} wide>
      {/* Две колонки: слева настройки, справа то, что получится, и кнопка
          печати. Правая колонка едет за прокруткой — наклейку видно, пока
          крутишь настройки. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
        <div className="flex flex-col gap-4">
          <div className={card({ className: "flex flex-wrap items-end gap-x-6 gap-y-4" })}>
            <Segmented
              size="md"
              value={mode}
              onChange={(k) => {
                setMode(k);
                setBatch([]);
              }}
              options={[
                { value: "box" as Mode, label: t("labels.kind.box"), icon: <Package /> },
                {
                  value: "pallet" as Mode,
                  label: t("labels.kind.pallet"),
                  icon: <Layers />,
                },
                { value: "product" as Mode, label: t("labels.kind.product"), icon: <Tag /> },
              ]}
            />

            {isProduct ? (
              <>
                <div className="flex min-w-48 flex-1 flex-col gap-1">
                  <span className={eyebrow()}>{t("labels.kind.product")}</span>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && pickExact()}
                      placeholder={t("labels.searchProduct")}
                      className="h-9 pl-8"
                    />
                  </div>
                </div>
                <div className="flex items-end gap-2">
                  <label className="flex flex-col gap-1">
                    <span className={eyebrow()}>{t("labels.count")}</span>
                    <Input
                      type="number"
                      min={1}
                      max={MAX_BATCH}
                      value={count}
                      onChange={(e) => setCount(+e.target.value || 1)}
                      className="h-9 w-24 text-right"
                    />
                  </label>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-end gap-2">
                  <label className="flex flex-col gap-1">
                    <span className={eyebrow()}>{t("labels.count")}</span>
                    <Input
                      type="number"
                      min={1}
                      max={MAX_BATCH}
                      value={count}
                      onChange={(e) => setCount(+e.target.value || 1)}
                      className="h-9 w-24 text-right"
                    />
                  </label>
                  {/* Не главная кнопка: главное действие экрана — «Печать»
                      справа, а это подготовка к нему (Кирилл 12 ноя). */}
                  <Button
                    className="h-9"
                    variant="outline"
                    onClick={() => void generate()}
                    disabled={create.pending}
                  >
                    {create.pending && <Loader2 className="animate-spin" />}
                    {create.pending ? t("data.busy") : t("labels.generate")}
                  </Button>
                </div>

                <div className="flex items-end gap-2">
                  <label className="flex flex-col gap-1">
                    <span className={eyebrow()}>{t("labels.from")}</span>
                    {num(from, setFrom)}
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className={eyebrow()}>{t("labels.to")}</span>
                    {num(to, setTo)}
                  </label>
                  <Button className="h-9" variant="outline" onClick={pickRange} disabled={!from}>
                    {t("labels.pick")}
                  </Button>
                </div>

                {unprinted.length > 0 && (
                  <Button className="h-9" variant="ghost" onClick={pickUnprinted}>
                    {t("labels.unprinted", { n: unprinted.length })}
                  </Button>
                )}
              </>
            )}
            {isProduct && (query.trim() || picked) && (
              <div className="flex basis-full flex-col gap-1">
                {picked && !query.trim() && (
                  <div className="flex items-center justify-between rounded-md bg-primary/10 px-2.5 py-1.5 text-xs text-primary">
                    <span className="font-medium">{picked.name}</span>
                    <span className="font-mono tabular-nums">{picked.barcode}</span>
                  </div>
                )}
                {query.trim() && found.length === 0 && (
                  <p className="text-xs text-muted-foreground">{t("labels.noProduct")}</p>
                )}
                {found.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setPicked(p);
                      setQuery("");
                    }}
                    className="flex items-center justify-between gap-3 rounded-md bg-muted px-2.5 py-1.5 text-left text-xs hover:bg-accent"
                  >
                    <span className="truncate font-medium">{p.name}</span>
                    <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                      {p.sku} · {p.barcode}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={card()}>
            <LabelDesigner
              draft={draft}
              onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
              templates={templates}
              selectedId={selectedId}
              onSelect={applyTemplate}
              onSave={save}
              onSaveAsNew={saveAsNew}
              onDelete={remove}
              dirty={dirty}
            />
          </div>
        </div>

        <div className={card({ className: "flex flex-col gap-3 lg:sticky lg:top-4" })}>
          <div className="flex items-center justify-between gap-2">
            <h3 className={cn(eyebrow(), "flex items-center gap-1.5")}>
              <Eye className="size-3.5" />
              {t("labels.preview")}
            </h3>
            <span className="text-xs tabular-nums text-muted-foreground">
              {t("labels.previewScale", {
                w: previewTpl.widthMm,
                h: previewTpl.heightMm,
              })}
            </span>
          </div>
          {/* Крупный ярлык (150×100) в натуральную величину шире колонки —
              предпросмотр ужимается под ширину, печать идёт в размер. */}
          <FitToWidth widthMm={previewTpl.widthMm} heightMm={previewTpl.heightMm}>
            <LabelCard
              tpl={previewTpl}
              code={previewCode}
              kind={isProduct ? "custom" : kind}
              headline={isProduct ? picked?.name : undefined}
              warehouseName={warehouseName}
              index={1}
              total={batch.length || Math.max(1, Math.round(count))}
            />
          </FitToWidth>

          <Button disabled={batch.length === 0} onClick={print}>
            <Printer className="size-3.5" />
            {batch.length > 0 ? t("labels.printN", { n: batch.length }) : t("labels.print")}
          </Button>

          {batch.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {isProduct ? t("labels.pickProduct") : t("labels.hint")}
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {t("labels.ready", { n: batch.length })}
              </p>
              {/* Список — не копии наклеек: проверить нужно номер и статус. */}
              {!isProduct && (
                <div className="grid max-h-60 grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-1.5 overflow-y-auto scrollbar-thin">
                  {batch.map((code) => {
                    const info = byCode.get(code);
                    return (
                      <div
                        key={code}
                        className="flex items-center justify-between gap-2 rounded-md bg-muted px-2 py-1 text-xs"
                      >
                        <span className="font-mono tabular-nums">{code}</span>
                        {info?.printedAt ? (
                          <span
                            className="flex items-center gap-0.5 text-success"
                            title={t("labels.printedAt", {
                              date: new Date(info.printedAt).toLocaleDateString(),
                            })}
                          >
                            <Check className="size-3" />
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{t("labels.notPrinted")}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <LabelPrint
        tpl={previewTpl}
        items={batch.map((code) => ({ code, headline: isProduct ? picked?.name : undefined }))}
        kind={isProduct ? "custom" : kind}
        warehouseName={warehouseName}
      />
    </ScreenShell>
  );
}
