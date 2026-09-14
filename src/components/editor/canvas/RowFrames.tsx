import { Plus } from "lucide-react";
import { useT } from "@/lib/i18n";
import { freeRowSides, type RowFrame } from "@/lib/planGeometry";
import { useEditor } from "@/lib/store";
import { cn } from "@/lib/utils";
import { MODULE_RADIUS } from "../constants";
import type { ToScreen } from "./screen";

/**
 * Ряд как единица плана: габаритная рамка с ярлыком «Ряд N» и «плюсиками»
 * продолжения — фрейм в понимании Figma.
 *
 * Рамка не перехватывает клики (`pointer-events-none` у оверлея), иначе секции
 * под ней перестали бы выделяться; кнопки внутри включают события обратно
 * поштучно. Показывается рамка только при наведении или полном выделении ряда:
 * постоянные рамки вокруг всего превратили бы план в решётку.
 */

interface RowFramesProps {
  rows: RowFrame[];
  toScreen: ToScreen;
  zoom: number;
  selection: string[];
  hoverRow: number | null;
  readOnly: boolean;
}

export function RowFrames({ rows, toScreen, zoom, selection, hoverRow, readOnly }: RowFramesProps) {
  return (
    <>
      {rows.map((f) => {
        const s = toScreen(f.rect);
        const rowSelected = f.ids.size > 0 && [...f.ids].every((id) => selection.includes(id));
        // Ряд — функциональная единица: подсвечиваем при наведении ИЛИ когда он
        // целиком выделен (тогда открыт редактор ряда и виден «плюсик»).
        const active = hoverRow === f.row || rowSelected;
        return (
          <div
            key={`row-${f.row}`}
            className="absolute"
            style={{ left: s.left, top: s.top, width: s.width, height: s.height }}
          >
            {active && (
              <div
                className={cn(
                  "absolute inset-0 border border-dashed",
                  rowSelected ? "border-primary bg-primary/10" : "border-primary/60 bg-primary/5",
                )}
                // Радиус масштабируем зумом: модули лежат в scale-слое, их углы
                // растут с приближением — фиксированный радиус рамки на их фоне
                // «плыл» бы при каждом изменении масштаба.
                style={{ borderRadius: MODULE_RADIUS * zoom }}
              />
            )}
            <RowLabel frame={f} active={active} readOnly={readOnly} />
            {active && !readOnly && <RowExtendButtons frame={f} rows={rows} />}
          </div>
        );
      })}
    </>
  );
}

/**
 * Ярлык «Ряд N» над рамкой. Владельцу это кнопка — клик выделяет секции ряда и
 * открывает его редактор; продавцу достаётся та же подпись без действия: номер
 * ряда ему нужен, а выделение секций уже нет.
 */
function RowLabel({
  frame,
  active,
  readOnly,
}: {
  frame: RowFrame;
  active: boolean;
  readOnly: boolean;
}) {
  const t = useT();
  const label = t("canvas.rowFrame", { n: frame.row });
  const base =
    "absolute left-1/2 top-0 -translate-x-1/2 -translate-y-full whitespace-nowrap px-1 py-0.5 text-[10px] font-semibold leading-none tabular-nums";

  if (readOnly) {
    return <span className={cn(base, "text-primary/55")}>{label}</span>;
  }

  return (
    <button
      type="button"
      // Гасим pointerdown: иначе он всплывает на холст, тот считает это кликом
      // по пустому месту и сбрасывает выделение ещё до того, как сработает
      // onClick кнопки.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        // Shift копит ряды: несколько рядов правятся вместе (п.4).
        const st = useEditor.getState();
        const ids = [...frame.ids];
        if (!e.shiftKey) {
          st.select(ids);
          return;
        }
        const cur = st.selection;
        const whole = ids.every((id) => cur.includes(id));
        st.select(whole ? cur.filter((id) => !frame.ids.has(id)) : [...new Set([...cur, ...ids])]);
      }}
      className={cn(
        base,
        "pointer-events-auto cursor-pointer transition-colors",
        active ? "text-primary" : "text-primary/55 hover:text-primary",
      )}
    >
      {label}
    </button>
  );
}

/**
 * «Плюсик» — продолжить ряд копией (п.6). Появляется только с той стороны, где
 * рядом нет другого ряда: если слева и справа уже стоят соседи, продолжать
 * некуда и кнопок нет.
 */
function RowExtendButtons({ frame, rows }: { frame: RowFrame; rows: RowFrame[] }) {
  const t = useT();
  const free = freeRowSides(frame, rows);
  const vertical = frame.rect.h >= frame.rect.w;

  const btn = (side: "before" | "after", cls: string) => (
    <button
      type="button"
      title={t("canvas.rowExtend", { n: frame.row })}
      // Без stopPropagation холст успевает обработать pointerdown как клик по
      // пустому месту, снимает выделение и размонтирует кнопку до её onClick.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => useEditor.getState().cloneRow(frame.row, side)}
      className={cn(
        "pointer-events-auto absolute flex size-5 items-center justify-center rounded-md border border-primary bg-card text-primary shadow-sm transition-colors hover:bg-primary hover:text-primary-foreground",
        cls,
      )}
    >
      <Plus className="size-3.5" />
    </button>
  );

  return (
    <>
      {free.before &&
        btn(
          "before",
          vertical
            ? "left-0 top-1/2 -translate-x-[calc(100%+4px)] -translate-y-1/2"
            : "left-1/2 top-0 -translate-x-1/2 -translate-y-[calc(100%+4px)]",
        )}
      {free.after &&
        btn(
          "after",
          vertical
            ? "right-0 top-1/2 translate-x-[calc(100%+4px)] -translate-y-1/2"
            : "left-1/2 bottom-0 -translate-x-1/2 translate-y-[calc(100%+4px)]",
        )}
    </>
  );
}
