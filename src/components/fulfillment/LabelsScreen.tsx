import { useEffect, useMemo, useState } from "react";
import { Layers, Package, Printer } from "lucide-react";
import { useEditor } from "@/lib/store";
import type { LabelTemplate } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Input } from "@/components/ui/input";
import { LabelCard, type LabelKind } from "./LabelCard";
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

const MAX_BATCH = 100;

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
  const createBox = useEditor((s) => s.createBox);
  const createPallet = useEditor((s) => s.createPallet);
  const warehouseName = useEditor((s) => s.warehouse.name);
  const templates = useEditor((s) => s.labelTemplates);
  const saveTemplate = useEditor((s) => s.saveLabelTemplate);
  const removeTemplate = useEditor((s) => s.removeLabelTemplate);

  const [kind, setKind] = useState<LabelKind>("box");
  const [count, setCount] = useState(12);
  /** Коды текущей пачки — то, что уйдёт на печать. */
  const [batch, setBatch] = useState<string[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(
    templates[0]?.id ?? null,
  );
  const [draft, setDraft] = useState<LabelDraft>(
    templates[0] ? toDraft(templates[0]) : EMPTY_DRAFT,
  );

  // Шаблон могли удалить в другой вкладке (стор общий) — не оставляем экран с
  // выбранным «призраком».
  useEffect(() => {
    if (selectedId && !templates.some((tpl) => tpl.id === selectedId)) {
      const first = templates[0] ?? null;
      setSelectedId(first?.id ?? null);
      setDraft(first ? toDraft(first) : EMPTY_DRAFT);
    }
  }, [templates, selectedId]);

  const selected = templates.find((tpl) => tpl.id === selectedId) ?? null;
  const dirty = !selected || !sameDraft(draft, toDraft(selected));

  const previewTpl: LabelTemplate = useMemo(
    () => ({
      ...draft,
      // Пустое поле размера в процессе набора не должно ронять предпросмотр.
      widthMm: draft.widthMm || 1,
      heightMm: draft.heightMm || 1,
      id: selectedId ?? "draft",
      createdAt: 0,
    }),
    [draft, selectedId],
  );

  // Пустые наклейки прошлых пачек: тара без товара и без адреса ещё не в деле,
  // её можно распечатать заново, не плодя новых номеров.
  const unused =
    kind === "box"
      ? boxes.filter((b) => !b.address && b.lines.length === 0).map((b) => b.barcode)
      : pallets.filter((p) => p.boxIds.length === 0).map((p) => p.barcode);

  const generate = () => {
    const n = Math.max(1, Math.min(MAX_BATCH, Math.round(count)));
    const codes: string[] = [];
    for (let i = 0; i < n; i++) {
      codes.push(kind === "box" ? createBox().barcode : createPallet().barcode);
    }
    setBatch(codes);
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
    batch[0] ?? (kind === "box" ? "UK-BOX-000000" : "UK-PLT-000000");

  return (
    <ScreenShell title={t("labels.title")} subtitle={t("labels.subtitle")} wide>
      {/* Размер страницы = размер наклейки: печать идёт на рулон, а не на A4.
          Стиль живёт здесь, а не в index.css, потому что зависит от макета. */}
      <style>{`@page { size: ${previewTpl.widthMm}mm ${previewTpl.heightMm}mm; margin: 0; }`}</style>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <Segmented
          size="md"
          value={kind}
          onChange={(k) => {
            setKind(k);
            setBatch([]);
          }}
          options={[
            { value: "box" as LabelKind, label: t("labels.kind.box"), icon: <Package /> },
            {
              value: "pallet" as LabelKind,
              label: t("labels.kind.pallet"),
              icon: <Layers />,
            },
          ]}
        />

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("labels.count")}
          </span>
          <Input
            type="number"
            min={1}
            max={MAX_BATCH}
            value={count}
            onChange={(e) => setCount(+e.target.value || 1)}
            className="h-9 w-24 text-right"
          />
        </label>

        <Button className="h-9" onClick={generate}>
          {t("labels.generate")}
        </Button>
        <Button
          className="h-9"
          variant="outline"
          disabled={batch.length === 0}
          onClick={() => window.print()}
        >
          <Printer className="size-3.5" />
          {t("labels.print")}
        </Button>

        {unused.length > 0 && (
          <Button className="h-9" variant="ghost" onClick={() => setBatch(unused)}>
            {t("labels.reuse", { n: unused.length })}
          </Button>
        )}
      </div>

      {/* Настройки сверху, предпросмотр снизу. Колонками они не уживались:
          наклейка 58×40 занимает ладонь, а рядом с ней пустовала половина
          экрана — при том что настройки внизу той же колонки не помещались. */}
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
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

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("labels.preview")}
            </h3>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {t("labels.previewScale", {
                w: previewTpl.widthMm,
                h: previewTpl.heightMm,
              })}
            </span>
          </div>
          <div className="flex flex-wrap items-start justify-center gap-4 rounded-lg bg-muted/40 p-4">
            <LabelCard
              tpl={previewTpl}
              code={previewCode}
              kind={kind}
              warehouseName={warehouseName}
              index={1}
              total={batch.length || Math.max(1, Math.round(count))}
            />
          </div>

          {batch.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("labels.hint")}</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {t("labels.ready", { n: batch.length })}
              </p>
              <div className="flex max-h-[22rem] flex-wrap gap-3 overflow-y-auto scrollbar-thin">
                {batch.map((code, i) => (
                  <LabelCard
                    key={code}
                    tpl={previewTpl}
                    code={code}
                    kind={kind}
                    warehouseName={warehouseName}
                    index={i + 1}
                    total={batch.length}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Печатная версия: только наклейки, каждая — отдельной страницей. */}
      {batch.length > 0 && (
        <div className="print-root print-flow hidden print:block">
          {batch.map((code, i) => (
            <LabelCard
              key={code}
              tpl={previewTpl}
              code={code}
              kind={kind}
              warehouseName={warehouseName}
              index={i + 1}
              total={batch.length}
              className="border-0"
            />
          ))}
        </div>
      )}
    </ScreenShell>
  );
}
