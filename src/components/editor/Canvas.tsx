import { useMemo, useRef, useState } from "react";
import { planBounds, rowFrames, rowOfSelection } from "@/lib/planGeometry";
import { selectRole, useEditor } from "@/lib/store";
import { CELL } from "./constants";
import { ModuleNode } from "./ModuleNode";
import { CanvasMenu, type CanvasMenuState } from "./CanvasMenu";
import { DragOverlay } from "./canvas/DragOverlay";
import { dotGridStyle } from "./canvas/grid";
import { OverlapMarks } from "./canvas/OverlapMarks";
import { RowFrames } from "./canvas/RowFrames";
import { RowProposals } from "./canvas/RowProposals";
import { SelectionOverlay } from "./canvas/SelectionOverlay";
import { useCanvasPointer } from "./canvas/useCanvasPointer";
import { useCanvasView } from "./canvas/useCanvasView";
import { useSpaceHeld } from "./canvas/useSpaceHeld";

/**
 * Холст плана: два слоя поверх одного вьюпорта.
 *
 * Нижний — мировой: пол и модули внутри `scale()`, поэтому их геометрия задана
 * в клетках сетки и растёт вместе с зумом. Верхний — экранный: выделение,
 * рамки рядов, контуры и подсказки, у которых толщина линий и размер ручек от
 * масштаба зависеть не должны. Единственный мост между слоями — `toScreen`.
 *
 * Сам компонент только раскладывает эти слои. Счёт вида живёт в `useCanvasView`,
 * жесты — в `useCanvasPointer`, каждый оверлей — в своём файле рядом.
 */

/** Клетка запаса по краю пола, чтобы плита не обрывалась по секциям. */
const FLOOR_PAD_CELLS = 1;

export function Canvas() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<CanvasMenuState | null>(null);

  const floor = useEditor((s) => s.activeFloor());
  const modules = floor.modules;
  const tool = useEditor((s) => s.tool);
  const selection = useEditor((s) => s.selection);
  const activeShelf = useEditor((s) => s.activeShelf);
  const shelvesVisible = useEditor((s) => s.profile.showShelves !== false);
  const rowProposal = useEditor((s) => s.rowProposal);
  // Продавец план только смотрит: ни «плюсиков» продолжения ряда, ни
  // контекстного меню правки у него нет (п.1).
  const readOnly = useEditor((s) => selectRole(s) === "seller");

  const spaceHeld = useSpaceHeld();
  const { zoom, pan, clientToWorld, worldRectToScreen, onWheel } = useCanvasView(viewportRef);
  const rows = useMemo(() => rowFrames(floor), [floor]);
  const pointer = useCanvasPointer({ viewportRef, clientToWorld, zoom, rows, spaceHeld });

  // Выделен РОВНО целый ряд → показываем только рамку ряда, без колец у
  // отдельных модулей (п.8): ряд читается как единая деталь. Счёт общий с
  // инспектором (`rowOfSelection`), иначе рамка и панель ряда разойдутся; рамка
  // при этом есть только у закреплённых рядов — их и ищем среди `rows`.
  const rowSelectionIds = useMemo(() => {
    const row = rowOfSelection(floor, selection);
    return (row != null && rows.find((f) => f.row === row)?.ids) || null;
  }, [floor, rows, selection]);

  // Плита-пол под секциями. Проход = пол, проглядывающий в зазорах между
  // модулями (модель «пол как проход»).
  const floorRect = useMemo(() => planBounds(modules, FLOOR_PAD_CELLS), [modules]);

  // Действующие номера секций: свой, если задан, иначе порядковый.
  const sectionNos = useMemo(() => {
    const map = new Map<string, number>();
    let ordinal = 0;
    for (const m of modules) {
      if (m.type !== "section") continue;
      ordinal++;
      map.set(m.id, m.number ?? ordinal);
    }
    return map;
  }, [modules]);

  return (
    <div
      ref={viewportRef}
      className="relative h-full w-full touch-none overflow-hidden no-select"
      style={{ ...dotGridStyle(zoom, pan), cursor: pointer.cursor }}
      onPointerDown={pointer.onPointerDown}
      onPointerMove={pointer.onPointerMove}
      onPointerUp={pointer.onPointerUp}
      onWheel={onWheel}
      onMouseLeave={pointer.clearHoverRow}
      onContextMenu={(e) => {
        e.preventDefault();
        if (readOnly) return;
        const st = useEditor.getState();
        const modEl = (e.target as HTMLElement).closest("[data-module-id]") as HTMLElement | null;
        // Клик по невыделенному модулю сначала выделяет его — как в офисных ui.
        if (modEl) {
          const id = modEl.dataset.moduleId!;
          if (!st.selection.includes(id)) st.toggleSelect(id, false);
        }
        const w = clientToWorld(e.clientX, e.clientY);
        setMenu({
          x: e.clientX,
          y: e.clientY,
          onModule: !!modEl,
          cell: { x: Math.floor(w.x), y: Math.floor(w.y) },
        });
      }}
    >
      {/* Мировой слой (масштабируется) */}
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
      >
        {/* Пол склада: светлая плита под всеми модулями. Зазоры между секциями
            = проход (пол проглядывает). Рисуется первым, под модулями. */}
        {floorRect && (
          <div
            className="absolute rounded-lg"
            style={{
              left: floorRect.x * CELL,
              top: floorRect.y * CELL,
              width: floorRect.w * CELL,
              height: floorRect.h * CELL,
              backgroundColor: "hsl(var(--floor))",
              boxShadow: "inset 0 0 0 1px hsl(var(--floor-edge))",
            }}
          />
        )}
        {modules.map((m) => (
          <ModuleNode
            key={m.id}
            module={m}
            selected={selection.includes(m.id)}
            zoom={zoom}
            interactive={!readOnly && tool === "select" && !spaceHeld}
            activeShelfIndex={activeShelf?.moduleId === m.id ? activeShelf.index : undefined}
            sectionNo={sectionNos.get(m.id)}
            shelvesVisible={shelvesVisible}
          />
        ))}
      </div>

      {/* Экранный оверлей. Клики он не перехватывает — иначе модули под ним
          перестали бы выделяться; кнопки внутри включают события поштучно. */}
      <div className="pointer-events-none absolute inset-0">
        <RowFrames
          rows={rows}
          toScreen={worldRectToScreen}
          zoom={zoom}
          selection={selection}
          hoverRow={pointer.hoverRow}
          readOnly={readOnly}
        />
        {rowProposal && (
          <RowProposals candidates={rowProposal.candidates} toScreen={worldRectToScreen} />
        )}
        <OverlapMarks modules={modules} toScreen={worldRectToScreen} />
        <SelectionOverlay
          modules={modules}
          selection={selection}
          rowSelectionIds={rowSelectionIds}
          toScreen={worldRectToScreen}
          readOnly={readOnly}
        />
        <DragOverlay
          preview={pointer.preview}
          stampCell={pointer.stampCell}
          toScreen={worldRectToScreen}
        />
      </div>

      {menu && <CanvasMenu state={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}
