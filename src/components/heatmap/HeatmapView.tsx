import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Boxes } from "lucide-react";
import { useEditor } from "@/lib/store";
import { planBounds, rowFrames } from "@/lib/planGeometry";
import type { Box, CellAddress, Floor, PlacedModule } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { CELL, MODULE_GAP, ZOOM_MAX, ZOOM_MIN } from "@/components/editor/constants";

/**
 * Тепловая карта загруженности (ТЗ-план, п.9): отдельное view-only окно с 2D
 * планом этажа, где секции/ячейки раскрашены по занятости, а не по категории.
 * Открывается через `?heatmap=1`, данные читает из того же localStorage, что и
 * редактор; изменения в основном окне прилетают событием `storage`.
 */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Клетки запаса вокруг плана при вписывании — как в редакторе. */
const FIT_PAD_CELLS = 2;

/** Цвет шкалы «свободно → занято»: 120° (зелёный) → 0° (красный).
 *  Приглушённая насыщенность — карта обзорная, не должна «кричать». */
function heatColor(ratio: number): string {
  const hue = Math.round(120 * (1 - clamp(ratio, 0, 1)));
  // Полностью занятое — чуть темнее, чтобы читалось как «стоп» издалека.
  const light = ratio >= 1 ? 48 : 62;
  return `hsl(${hue} 42% ${light}%)`;
}

/**
 * Занятые ячейки этажа: moduleId → набор ключей "полка:ячейка".
 * Считаем оба пути попадания товара на место: прямое размещение из таблицы и
 * коробку приёмки, стоящую на полке. Иначе карта показывала бы свободным то,
 * что уже занято принятым товаром (см. п. 2.1 плана фулфилмента).
 */
function occupancyOf(
  floor: Floor,
  placements: Record<string, CellAddress>,
  boxes: Box[],
): Map<string, Set<string>> {
  const occ = new Map<string, Set<string>>();
  const mark = (a: CellAddress) => {
    if (a.floorId !== floor.id) return;
    const set = occ.get(a.moduleId) ?? new Set<string>();
    set.add(`${a.shelfIndex}:${a.cellIndex}`);
    occ.set(a.moduleId, set);
  };
  for (const a of Object.values(placements)) mark(a);
  for (const b of boxes) if (b.address && b.lines.length) mark(b.address);
  return occ;
}

export function HeatmapView() {
  const warehouse = useEditor((s) => s.warehouse);
  const placements = useEditor((s) => s.placements);
  const boxes = useEditor((s) => s.boxes);
  const t = useT();

  const [floorIdx, setFloorIdx] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; pan: { x: number; y: number } } | null>(
    null,
  );

  const floor = warehouse.floors[Math.min(floorIdx, warehouse.floors.length - 1)];
  const occ = useMemo(() => occupancyOf(floor, placements, boxes), [floor, placements, boxes]);

  // Подписи рядов ставим по тем же рамкам, что рисует редактор: подпись должна
  // стоять над тем же прямоугольником, что человек видел на плане.
  const rowLabels = useMemo(
    () =>
      rowFrames(floor).map((f) => ({
        row: f.row,
        cx: f.rect.x + f.rect.w / 2,
        top: f.rect.y,
      })),
    [floor],
  );

  // Правки в основном окне → persist пишет localStorage → здесь событие
  // `storage`: перечитываем состояние без перезагрузки страницы (п.9.5).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "uklad-store-v1") void useEditor.persist.rehydrate();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Вписать план этажа в окно при старте и при смене этажа.
  //
  // Окно карты открывается отдельной вкладкой, и на первом проходе эффекта
  // контейнер может ещё не иметь размеров (нулевые clientWidth/Height). Тогда
  // масштаб схлопывался в ZOOM_MIN, и план оказывался крошечным в углу.
  // Поэтому ждём кадра, на котором размеры появились, — но не бесконечно.
  useEffect(() => {
    if (floor.modules.length === 0) return;
    let raf = 0;
    let attempts = 0;
    const fit = () => {
      const vp = viewportRef.current;
      if (!vp) return;
      if ((vp.clientWidth === 0 || vp.clientHeight === 0) && attempts < 30) {
        attempts++;
        raf = requestAnimationFrame(fit);
        return;
      }
      const b = planBounds(floor.modules, FIT_PAD_CELLS);
      if (!b) return;
      const z = clamp(
        Math.min(vp.clientWidth / (b.w * CELL), vp.clientHeight / (b.h * CELL)),
        ZOOM_MIN,
        ZOOM_MAX,
      );
      setZoom(z);
      setPan({
        x: vp.clientWidth / 2 - (b.x + b.w / 2) * CELL * z,
        y: vp.clientHeight / 2 - (b.y + b.h / 2) * CELL * z,
      });
    };
    raf = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(raf);
  }, [floor.id, floor.modules.length === 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomAt = useCallback((factor: number, clientX: number, clientY: number) => {
    const r = viewportRef.current!.getBoundingClientRect();
    setZoom((z) => {
      const nz = clamp(z * factor, ZOOM_MIN, ZOOM_MAX);
      if (nz === z) return z;
      const mx = clientX - r.left;
      const my = clientY - r.top;
      setPan((p) => ({
        x: mx - ((mx - p.x) / z) * nz,
        y: my - ((my - p.y) / z) * nz,
      }));
      return nz;
    });
  }, []);

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
    else setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
  };
  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, pan };
    viewportRef.current?.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setPan({ x: d.pan.x + (e.clientX - d.startX), y: d.pan.y + (e.clientY - d.startY) });
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
            <Boxes className="size-4" />
          </div>
          <span className="truncate text-sm font-semibold">
            {warehouse.name} · {t("heat.title")}
          </span>
        </div>
        {warehouse.floors.length > 1 && (
          <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
            {warehouse.floors.map((f, i) => (
              <button
                key={f.id}
                onClick={() => setFloorIdx(i)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  i === floorIdx
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f.name}
              </button>
            ))}
          </div>
        )}
        {/* Легенда шкалы (п.9.4) */}
        <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
          <span>{t("heat.free")}</span>
          <div
            className="h-2 w-28 rounded-full"
            style={{
              background:
                "linear-gradient(to right, hsl(120 42% 62%), hsl(60 42% 62%), hsl(0 42% 48%))",
            }}
          />
          <span>{t("heat.full")}</span>
        </div>
      </header>

      <div
        ref={viewportRef}
        className="relative flex-1 cursor-grab touch-none select-none overflow-hidden active:cursor-grabbing"
        style={{ backgroundColor: "hsl(var(--canvas-bg))" }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          {floor.modules.map((m) => (
            <HeatModule key={m.id} m={m} occupied={occ.get(m.id)} />
          ))}
          {/* Подписи лестниц и лифтов — чтобы инфраструктура читалась на карте */}
          {floor.modules
            .filter((m) => m.type === "stairs" || m.type === "elevator")
            .map((m) => (
              <div
                key={`lbl-${m.id}`}
                className="absolute flex items-center justify-center"
                style={{
                  left: m.x * CELL,
                  top: m.y * CELL,
                  width: m.w * CELL,
                  height: m.h * CELL,
                }}
              >
                <span
                  className="whitespace-nowrap font-semibold uppercase tracking-wide text-muted-foreground"
                  style={{ fontSize: 10, transform: `scale(${1 / zoom})` }}
                >
                  {t(`module.${m.type}.short`)}
                </span>
              </div>
            ))}
          {/* Подписи рядов над их габаритом; масштаб компенсируем, чтобы
              текст не раздувался и не исчезал вместе с зумом. */}
          {rowLabels.map((r) => (
            <div
              key={r.row}
              className="absolute whitespace-nowrap font-semibold tabular-nums text-muted-foreground"
              style={{
                left: r.cx * CELL,
                top: r.top * CELL,
                transform: `translate(-50%, -100%) scale(${1 / zoom})`,
                transformOrigin: "center bottom",
                fontSize: 11,
              }}
            >
              {t("canvas.rowFrame", { n: r.row })}
            </div>
          ))}
        </div>
        {/* Подпись этажа поверх холста */}
        <div className="pointer-events-none absolute left-3 top-2 rounded-md bg-card/80 px-2 py-1 text-xs font-semibold text-foreground shadow-sm backdrop-blur">
          {floor.name}
        </div>
      </div>
    </div>
  );
}

function HeatModule({ m, occupied }: { m: PlacedModule; occupied?: Set<string> }) {
  const style: React.CSSProperties = {
    left: m.x * CELL + MODULE_GAP,
    top: m.y * CELL + MODULE_GAP,
    width: m.w * CELL - MODULE_GAP * 2,
    height: m.h * CELL - MODULE_GAP * 2,
  };

  // Не-секции (проходы, лестницы, лифты) — нейтральные, метрики у них нет.
  if (m.type !== "section") {
    return (
      <div className="absolute rounded-[3px] border border-border/60 bg-muted/50" style={style} />
    );
  }

  // Без разбивки на полки/ячейки: секция всегда одним агрегированным цветом
  // по своей занятости — карта читается как общая картина этажа.
  const total = (m.shelves ?? []).reduce((s, sh) => s + sh.cells, 0);
  const used = occupied?.size ?? 0;
  const ratio = total > 0 ? used / total : 0;

  return (
    <div
      className="absolute rounded-[3px]"
      style={{ ...style, backgroundColor: heatColor(ratio) }}
      title={`${used}/${total}`}
    />
  );
}
