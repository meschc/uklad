import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { useEditor } from "@/lib/store";
import { sectionNumber } from "@/lib/address";
import { rowNumbers } from "@/lib/numbering";
import { planBounds } from "@/lib/planGeometry";
import { MODULE_SPECS, type Floor, type PlacedModule } from "@/lib/types";
import { useT, type TFunc } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { DialogHeader, DialogShell } from "@/components/ui/dialog-shell";
import { Button } from "@/components/ui/button";

/**
 * Печатная версия плана этажа (п.9) и её предпросмотр (п.6).
 *
 * Печать вслепую — плохая идея: лист дорогой, а план большой. Поэтому иконка
 * печати открывает предпросмотр — ту же самую разметку, что уйдёт на бумагу,
 * в модальном окне. Один и тот же `PlanSheet` рисует и превью, и печать: два
 * отдельных рендера рано или поздно разъехались бы.
 *
 * Конструкции подписаны словом («Лестница», «Лифт»), а не пустым
 * прямоугольником: на бумаге по цвету их не отличить. Номер секции
 * масштабируется под ширину секции, чтобы не выпирал за её границы.
 */

/** Доля ширины символа от размера шрифта у обычной гарнитуры. */
const CHAR_WIDTH_RATIO = 0.62;

/**
 * Лист A4 в миллиметрах и поля печати. Из них считается, сколько высоты
 * остаётся рисунку: план обязан уместиться на ОДНУ страницу (п.2).
 */
const A4 = { short: 210, long: 297 };
const PAGE_MARGIN = 10;
/** Шапка с названием склада и легенда под планом. */
const HEADER_MM = 14;
const LEGEND_MM = 8;

/** Клетка запаса по краю листа: план не должен упираться в поля печати. */
const SHEET_PAD_CELLS = 1;

export function PrintPlan() {
  const previewOpen = useEditor((s) => s.printPreviewOpen);
  const setPreview = useEditor((s) => s.setPrintPreview);
  const floor = useEditor((s) => s.activeFloor());
  const t = useT();

  // Ориентацию выбираем по пропорциям плана: широкий этаж на книжной странице
  // ужимается вдвое сильнее, чем нужно.
  const page = pageFor(floor);

  return (
    <>
      {/* Размер страницы задаётся здесь, а не в index.css: он зависит от плана. */}
      <style>{`@page { size: A4 ${page.orientation}; margin: ${PAGE_MARGIN}mm; }`}</style>
      {/* Скрытая копия для принтера: видна только в @media print. */}
      <div
        className="print-root hidden print:block"
        style={{ ["--print-plan-h" as string]: `${page.planHeightMm}mm` }}
      >
        <PlanSheet t={t} />
      </div>

      {previewOpen && <PrintPreview onClose={() => setPreview(false)} page={page} t={t} />}
    </>
  );
}

function PrintPreview({ onClose, page, t }: { onClose: () => void; page: PageFit; t: TFunc }) {
  // Предпросмотр показывает лист целиком в тех же пропорциях, что уйдёт в
  // принтер: иначе «умещается на страницу» приходилось бы проверять печатью.
  const contentH = (page.orientation === "landscape" ? A4.short : A4.long) - PAGE_MARGIN * 2;
  const contentW = (page.orientation === "landscape" ? A4.long : A4.short) - PAGE_MARGIN * 2;
  return createPortal(
    <DialogShell size="3xl" scroll onClose={onClose} className="print:hidden">
      <DialogHeader>
        <div>
          <p className="text-sm font-semibold">{t("print.previewTitle")}</p>
          <p className="text-[11px] text-muted-foreground">{t("print.hint")}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="size-3.5" />
            {t("print.doPrint")}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
      </DialogHeader>
      {/* Белый лист внутри тёмной темы тоже белый: печатают на бумаге. */}
      {/* Лист виден целиком: он вписывается в высоту окна, а не прокручивается
            — иначе «влезает ли план на страницу» приходится проверять глазами
            по кусочкам. */}
      <div className="flex min-h-0 flex-1 justify-center overflow-hidden bg-muted/40 p-4">
        {/* Коробка листа держит пропорции A4 и не даёт содержимому её
              растянуть: если рисунок не влезает — он ужимается, а не уезжает
              на вторую страницу. */}
        <div
          className="flex h-full max-w-full flex-col overflow-hidden bg-white text-black shadow-sm"
          style={{
            aspectRatio: `${contentW} / ${contentH}`,
            padding: `${(PAGE_MARGIN / contentW) * 100}%`,
          }}
        >
          <PlanSheet t={t} fill />
        </div>
      </div>
    </DialogShell>,
    document.body,
  );
}

/**
 * Ориентация страницы и свободная высота под рисунок. Считаем по габаритам
 * этажа: план шире, чем выше → альбомная.
 */
interface PageFit {
  orientation: "portrait" | "landscape";
  /** Сколько миллиметров высоты остаётся рисунку на листе. */
  planHeightMm: number;
}

function pageFor(floor: Floor): PageFit {
  const box = planBounds(floor.modules);
  if (!box) return { orientation: "portrait", planHeightMm: 240 };
  const landscape = box.w > box.h;
  const pageHeight = landscape ? A4.short : A4.long;
  return {
    orientation: landscape ? "landscape" : "portrait",
    planHeightMm: pageHeight - PAGE_MARGIN * 2 - HEADER_MM - LEGEND_MM,
  };
}

/** Сам лист: заголовок, план этажа, легенда. */
function PlanSheet({ t, fill }: { t: TFunc; fill?: boolean }) {
  const floor = useEditor((s) => s.activeFloor());
  const warehouse = useEditor((s) => s.warehouse);
  const selection = useEditor((s) => s.selection);

  const mods = floor.modules;
  const box = planBounds(mods, SHEET_PAD_CELLS);
  if (!box) return null;

  const rows = rowNumbers(floor);
  const floorIndex = warehouse.floors.findIndex((f) => f.id === floor.id);
  const floorNum = warehouse.floors[floorIndex]?.number ?? floorIndex + 1;
  const selectedCount = mods.filter((m) => selection.includes(m.id)).length;

  return (
    <div className={cn("print-sheet", fill && "flex min-h-0 flex-1 flex-col")}>
      <header className="mb-3 flex items-baseline justify-between">
        <h1 className="text-base font-bold">
          {warehouse.name} · {t("floor.word")} {floorNum}
        </h1>
        <span className="text-[10px]">{new Date().toLocaleString()}</span>
      </header>

      <svg
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
        preserveAspectRatio="xMidYMid meet"
        className={cn("print-plan w-full", fill ? "min-h-0 flex-1" : "h-auto")}
      >
        {mods.map((m) => (
          <ModuleShape
            key={m.id}
            module={m}
            floor={floor}
            row={rows.get(m.id)}
            selected={selection.includes(m.id)}
            t={t}
          />
        ))}
      </svg>

      <p className="mt-2 text-[10px]">
        {selectedCount > 0 ? t("print.legendSelected", { n: selectedCount }) : t("print.legend")}
      </p>
    </div>
  );
}

function ModuleShape({
  module: m,
  floor,
  row,
  selected,
  t,
}: {
  module: PlacedModule;
  floor: Floor;
  row?: number;
  selected: boolean;
  t: TFunc;
}) {
  const isSection = m.type === "section";
  // Конструкцию подписываем словом: «ЛС» на бумаге читается как шифр (п.6).
  const full = isSection ? "" : t(`module.${m.type}.title`);
  const vertical = !isSection && m.h > m.w * 1.6;
  const label = isSection
    ? row != null
      ? `${row}-${sectionNumber(floor, m.id)}`
      : String(sectionNumber(floor, m.id))
    : full;

  // Подпись должна влезать: у повёрнутого текста «длина» идёт по высоте модуля,
  // а «толщина» — по ширине. Если даже так слово не помещается — короткий код.
  const along = vertical ? m.h : m.w;
  const across = vertical ? m.w : m.h;
  const byAcross = across * 0.5;
  const byAlong = (along * 0.9) / (label.length * CHAR_WIDTH_RATIO);
  let text = label;
  let fontSize = Math.min(byAcross, byAlong);
  if (!isSection && fontSize < 0.3) {
    text = MODULE_SPECS[m.type].short;
    fontSize = Math.min(byAcross, (along * 0.9) / (text.length * CHAR_WIDTH_RATIO));
  }
  fontSize = Math.max(0.22, fontSize);

  return (
    <g>
      <rect
        x={m.x}
        y={m.y}
        width={m.w}
        height={m.h}
        rx={0.15}
        fill={selected ? "#d8d8d8" : isSection ? "#f2f2f2" : "#ffffff"}
        stroke="#000"
        strokeWidth={selected ? 0.14 : 0.04}
        // Конструкции — штриховой контур: их видно как «не стеллаж» сразу.
        strokeDasharray={isSection ? undefined : "0.2 0.12"}
      />
      <text
        x={m.x + m.w / 2}
        y={m.y + m.h / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fontSize}
        fontWeight={selected ? 700 : 400}
        // Вертикальную конструкцию подписываем вдоль неё — иначе слово вылезает.
        transform={vertical ? `rotate(-90 ${m.x + m.w / 2} ${m.y + m.h / 2})` : undefined}
      >
        {text}
      </text>
      {!isSection && <title>{t(`module.${m.type}.title`)}</title>}
    </g>
  );
}
