import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { RowFrame } from "@/lib/planGeometry";
import { selectRole, useEditor } from "@/lib/store";
import { MODULE_SPECS, type CellRect, type PlacedModule, type XY } from "@/lib/types";
import { clamp } from "@/lib/utils";
import { CELL } from "../constants";
import { MARQUEE_MIN_CELLS, marqueeRect, modulesInRect, resizeRect } from "./dragMath";
import type { Handle } from "./screen";

/**
 * Мышь на холсте: один жест от нажатия до отпускания.
 *
 * Пять разных жестов начинаются одним и тем же нажатием, и разводит их только
 * порядок проверок в `onPointerDown` — он и есть главное содержание файла.
 * Промежуточное состояние жеста живёт в ref, а не в состоянии: за курсором
 * тянется каждое движение мыши, и перерисовывать на нём React незачем. Наружу
 * выходит лишь то, что видно глазом, — контур, подсветка, курсор.
 */

type DragState =
  | { kind: "pan"; startClient: XY; startPan: XY }
  | { kind: "place"; type: PlacedModule["type"]; startCell: XY; moved: boolean }
  | {
      kind: "move";
      startCell: XY;
      origins: Record<string, XY>;
      moved: boolean;
      /** Alt/Cmd зажат: при первом сдвиге клонируем выделение и тащим копии. */
      pendingDuplicate: boolean;
      /** Копии уже созданы — показываем курсор «copy». */
      copy: boolean;
      /** Модуль под курсором при обычном клике — для сужения выделения (8.1). */
      clickedId?: string;
    }
  | { kind: "resize"; id: string; handle: Handle; startRect: CellRect; startCell: XY }
  | { kind: "marquee"; startWorld: XY; additive: boolean };

/** Транзиентный контур: что появится, если отпустить кнопку сейчас. */
export type CanvasPreview = { kind: "place" | "marquee"; rect: CellRect } | null;

/** Запас (экранные px) вокруг ряда, в котором подсветка и «плюсик» не гаснут. */
const ROW_HOVER_PAD_PX = 36;

export interface CanvasPointer {
  preview: CanvasPreview;
  hoverRow: number | null;
  clearHoverRow: () => void;
  /** Левый верхний угол призрака шаблона под курсором (#38). */
  stampCell: XY | null;
  /** Готовый CSS-курсор: жест в руке важнее режима инструмента. */
  cursor: string;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
}

export interface CanvasPointerOptions {
  viewportRef: RefObject<HTMLDivElement | null>;
  clientToWorld: (clientX: number, clientY: number) => XY;
  zoom: number;
  rows: RowFrame[];
  spaceHeld: boolean;
}

export function useCanvasPointer({
  viewportRef,
  clientToWorld,
  zoom,
  rows,
  spaceHeld,
}: CanvasPointerOptions): CanvasPointer {
  const dragRef = useRef<DragState | null>(null);
  const [preview, setPreview] = useState<CanvasPreview>(null);
  const [hoverRow, setHoverRow] = useState<number | null>(null);
  const [stampCell, setStampCell] = useState<XY | null>(null);

  const tool = useEditor((s) => s.tool);
  const stampTemplateId = useEditor((s) => s.stampTemplateId);
  // Продавец план только смотрит: правки плана из его роли не существует (п.26).
  const readOnly = useEditor((s) => selectRole(s) === "seller");

  /**
   * Курсор на время перетаскивания. Раньше он считался прямо из `dragRef` при
   * отрисовке — а запись в ref перерисовку не запускает, и курсор менялся лишь
   * потому, что рядом обновлялось что-то другое. При панорамировании по пустому
   * холсту обновлять было нечего, и «схваченная рука» появлялась через раз.
   * Отдельное состояние ставится там же, где начинается жест: два лишних
   * рендера на жест, не на каждое движение мыши.
   */
  const [dragCursor, setDragCursor] = useState<"grabbing" | "move" | "copy" | null>(null);

  // --- нажатие --------------------------------------------------------------

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 && e.button !== 1) return;
      const vp = viewportRef.current!;
      try {
        vp.setPointerCapture(e.pointerId);
      } catch {
        /* синтетические указатели могут не поддерживать capture */
      }
      const st = useEditor.getState();
      // У продавца любое нажатие тащит холст, а не модули (п.26).
      const panMode =
        spaceHeld || e.button === 1 || st.tool === "pan" || selectRole(st) === "seller";

      if (panMode) {
        dragRef.current = {
          kind: "pan",
          startClient: { x: e.clientX, y: e.clientY },
          startPan: { ...st.pan },
        };
        setDragCursor("grabbing");
        return;
      }

      // Режим штампа шаблона раскладки (#38): клик ставит группу левым верхним
      // углом в клетку под курсором. Остаёмся в режиме — можно штамповать серию.
      if (st.stampTemplateId) {
        const w = clientToWorld(e.clientX, e.clientY);
        st.stampLayoutTemplate(st.stampTemplateId, { x: Math.floor(w.x), y: Math.floor(w.y) });
        return;
      }

      const target = e.target as HTMLElement;
      const handleEl = target.closest("[data-handle]") as HTMLElement | null;
      const moduleEl = target.closest("[data-module-id]") as HTMLElement | null;

      // 1) ресайз за ручку
      if (handleEl && st.selection.length === 1) {
        const id = st.selection[0];
        const m = st.activeFloor().modules.find((x) => x.id === id);
        if (m && !MODULE_SPECS[m.type].fixed) {
          dragRef.current = {
            kind: "resize",
            id,
            handle: handleEl.dataset.handle as Handle,
            startRect: { x: m.x, y: m.y, w: m.w, h: m.h },
            startCell: clientToWorld(e.clientX, e.clientY),
          };
          return;
        }
      }

      // 2) инструмент размещения
      if (tool !== "select" && tool !== "pan") {
        const w = clientToWorld(e.clientX, e.clientY);
        const cell = { x: Math.floor(w.x), y: Math.floor(w.y) };
        dragRef.current = { kind: "place", type: tool, startCell: cell, moved: false };
        const spec = MODULE_SPECS[tool];
        const size = spec.fixed ?? spec.defaultSize;
        setPreview({ kind: "place", rect: { x: cell.x, y: cell.y, w: size.w, h: size.h } });
        return;
      }

      // 3) клик по модулю → выбрать + начать перенос
      if (moduleEl) {
        const id = moduleEl.dataset.moduleId!;
        const additive = e.shiftKey;
        // Alt (везде) или Cmd/Ctrl — перенос с дублированием (как в Figma).
        const duplicate = !additive && (e.altKey || e.metaKey || e.ctrlKey);
        let sel = st.selection;
        if (!sel.includes(id)) {
          st.toggleSelect(id, additive);
          sel = useEditor.getState().selection;
        } else if (additive) {
          st.toggleSelect(id, true);
          sel = useEditor.getState().selection;
        }
        // Первый выбор секции — намекаем про раскрытие полок по зуму.
        const picked = st.activeFloor().modules.find((m) => m.id === id);
        if (picked?.type === "section") st.showHint("lod");

        const origins: Record<string, XY> = {};
        for (const m of st.activeFloor().modules) {
          if (sel.includes(m.id)) origins[m.id] = { x: m.x, y: m.y };
        }
        setDragCursor("move");
        dragRef.current = {
          kind: "move",
          startCell: clientToWorld(e.clientX, e.clientY),
          origins,
          moved: false,
          pendingDuplicate: duplicate,
          copy: false,
          clickedId: !additive && !duplicate ? id : undefined,
        };
        return;
      }

      // 4) клик в пространство ряда (пустое место внутри габарита) — выделяем
      // весь ряд и готовимся тащить его КАК ЕДИНИЦУ (п.1, п.5).
      const w = clientToWorld(e.clientX, e.clientY);
      const rf = rows.find(
        (f) =>
          w.x >= f.rect.x &&
          w.x < f.rect.x + f.rect.w &&
          w.y >= f.rect.y &&
          w.y < f.rect.y + f.rect.h,
      );
      // С Shift ряд добавляется к выделению и не тащится: пользователь набирает
      // несколько рядов, а не двигает этот (п.4).
      if (rf && e.shiftKey) {
        const cur = st.selection;
        const ids = [...rf.ids];
        const whole = ids.every((id) => cur.includes(id));
        st.select(whole ? cur.filter((id) => !rf.ids.has(id)) : [...new Set([...cur, ...ids])]);
        return;
      }
      if (rf) {
        st.select([...rf.ids]);
        const origins: Record<string, XY> = {};
        for (const m of st.activeFloor().modules) {
          if (rf.ids.has(m.id)) origins[m.id] = { x: m.x, y: m.y };
        }
        setDragCursor("move");
        dragRef.current = {
          kind: "move",
          startCell: w,
          origins,
          moved: false,
          pendingDuplicate: false,
          copy: false,
        };
        return;
      }

      // 5) пустое место → рамка выделения
      if (!e.shiftKey) st.clearSelection();
      dragRef.current = { kind: "marquee", startWorld: w, additive: e.shiftKey };
      setPreview({ kind: "marquee", rect: marqueeRect(w, w) });
    },
    [viewportRef, clientToWorld, spaceHeld, tool, rows],
  );

  // --- движение -------------------------------------------------------------

  /**
   * Ряд под курсором. Точное попадание в габарит — в приоритете; иначе
   * засчитываем зону с запасом вокруг ряда, чтобы «плюсик» снаружи рамки не
   * пропадал по пути курсора к нему.
   */
  const pickHoverRow = useCallback(
    (w: XY) => {
      const inside = (f: RowFrame, pad: number) =>
        w.x >= f.rect.x - pad &&
        w.x < f.rect.x + f.rect.w + pad &&
        w.y >= f.rect.y - pad &&
        w.y < f.rect.y + f.rect.h + pad;
      setHoverRow((prev) => {
        const exact = rows.find((f) => inside(f, 0));
        if (exact) return prev === exact.row ? prev : exact.row;
        const pad = ROW_HOVER_PAD_PX / zoom / CELL;
        const near = rows.filter((f) => inside(f, pad));
        // Среди «почти попавших» держим прежний ряд — без мигания между
        // соседями, когда курсор идёт по проходу.
        const r = near.length > 0 ? (near.find((f) => f.row === prev)?.row ?? near[0].row) : null;
        return prev === r ? prev : r;
      });
    },
    [rows, zoom],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;

      if (!drag) {
        // Призрак штампа следует за курсором и без зажатой кнопки (#38).
        if (useEditor.getState().stampTemplateId) {
          const w = clientToWorld(e.clientX, e.clientY);
          setStampCell({ x: Math.floor(w.x), y: Math.floor(w.y) });
          return;
        }
        // Продавцу план показывается как схема, а не как редактор: наведение
        // ничего не подсвечивает — подсветка обещает действие, которого у него
        // нет (п.26).
        if (readOnly) return;
        pickHoverRow(clientToWorld(e.clientX, e.clientY));
        return;
      }

      const st = useEditor.getState();

      if (drag.kind === "pan") {
        st.setPan({
          x: drag.startPan.x + (e.clientX - drag.startClient.x),
          y: drag.startPan.y + (e.clientY - drag.startClient.y),
        });
        return;
      }

      const w = clientToWorld(e.clientX, e.clientY);

      if (drag.kind === "place") {
        const spec = MODULE_SPECS[drag.type];
        if (spec.fixed) {
          setPreview({
            kind: "place",
            rect: { ...drag.startCell, w: spec.fixed.w, h: spec.fixed.h },
          });
          return;
        }
        const cur = { x: Math.floor(w.x), y: Math.floor(w.y) };
        const rawW = Math.abs(cur.x - drag.startCell.x) + 1;
        const rawH = Math.abs(cur.y - drag.startCell.y) + 1;
        drag.moved = drag.moved || rawW > 1 || rawH > 1;
        setPreview({
          kind: "place",
          rect: {
            x: Math.min(drag.startCell.x, cur.x),
            y: Math.min(drag.startCell.y, cur.y),
            w: clamp(rawW, spec.min, spec.max),
            h: clamp(rawH, spec.min, spec.max),
          },
        });
        return;
      }

      if (drag.kind === "move") {
        const dx = Math.round(w.x - drag.startCell.x);
        const dy = Math.round(w.y - drag.startCell.y);
        // Первый реальный сдвиг при зажатом Alt/Cmd — клонируем и тащим копии.
        if ((dx !== 0 || dy !== 0) && drag.pendingDuplicate) {
          const ids = st.cloneSelectionInPlace();
          const origins: Record<string, XY> = {};
          for (const m of useEditor.getState().activeFloor().modules) {
            if (ids.includes(m.id)) origins[m.id] = { x: m.x, y: m.y };
          }
          drag.origins = origins;
          drag.pendingDuplicate = false;
          drag.copy = true;
          setDragCursor("copy");
        }
        if (dx !== 0 || dy !== 0) drag.moved = true;
        for (const [id, o] of Object.entries(drag.origins)) {
          st.updateModule(id, { x: o.x + dx, y: o.y + dy });
        }
        return;
      }

      if (drag.kind === "resize") {
        const m = st.activeFloor().modules.find((x) => x.id === drag.id);
        if (!m) return;
        const spec = MODULE_SPECS[m.type];
        const d = {
          x: Math.round(w.x - drag.startCell.x),
          y: Math.round(w.y - drag.startCell.y),
        };
        st.setModuleRect(drag.id, resizeRect(drag.startRect, drag.handle, d, spec));
        return;
      }

      if (drag.kind === "marquee") {
        setPreview({ kind: "marquee", rect: marqueeRect(drag.startWorld, w) });
      }
    },
    // `readOnly` здесь не для порядка: роль меняется на живом экране (владелец
    // открывает план глазами продавца), и без этой зависимости обработчик
    // остался бы с ролью, которая была на момент его создания.
    [clientToWorld, pickHoverRow, readOnly],
  );

  // --- отпускание -----------------------------------------------------------

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      dragRef.current = null;
      setDragCursor(null);
      try {
        viewportRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      if (!drag) return;
      const st = useEditor.getState();

      if (drag.kind === "place") {
        const spec = MODULE_SPECS[drag.type];
        // Растянули на несколько клеток — берём размер из контура; простой клик
        // ставит модуль его размером по умолчанию.
        if (!spec.fixed && drag.moved && preview?.kind === "place") {
          const r = preview.rect;
          st.addModule(drag.type, r.x, r.y, { w: r.w, h: r.h });
        } else {
          st.addModule(drag.type, drag.startCell.x, drag.startCell.y);
        }
        setPreview(null);
        st.setTool("select"); // после размещения — возвращаемся к выбору
        return;
      }

      if (drag.kind === "marquee") {
        const r = preview?.kind === "marquee" ? preview.rect : null;
        setPreview(null);
        if (r && (r.w > MARQUEE_MIN_CELLS || r.h > MARQUEE_MIN_CELLS)) {
          const hit = modulesInRect(st.activeFloor().modules, r);
          const base = drag.additive ? st.selection : [];
          st.select([...new Set([...base, ...hit])]);
          // Первое успешное выделение рамкой — намекаем про Shift (8.2.1).
          if (hit.length > 0) st.showHint("marquee");
        } else {
          // Не рамка, а простой клик по пустому месту — отмечаем точку вставки.
          // Иначе «вставить сюда» работало бы только поверх модуля (#37).
          st.setPasteAnchor({
            x: Math.floor(drag.startWorld.x),
            y: Math.floor(drag.startWorld.y),
          });
        }
        return;
      }

      if (drag.kind !== "move") return;

      // Перенёс модуль руками, но ещё не знает про копию по Alt — подсказываем.
      if (drag.moved && !drag.copy) st.showHint("dup");

      // Клик без перетаскивания по модулю внутри групповой рамки (например, по
      // секции выделенного ряда) — сузить выделение до этого модуля (8.1).
      if (!drag.moved && drag.clickedId && Object.keys(drag.origins).length > 1) {
        st.select([drag.clickedId]);
      }
    },
    [viewportRef, preview],
  );

  // --- режим штампа ---------------------------------------------------------

  // Выход из режима гасит призрак, иначе он застыл бы на месте последнего
  // курсора. Правим состояние прямо в рендере, а не эффектом: это подгонка под
  // изменившийся вход, и React повторит рендер до отрисовки.
  const [lastStampId, setLastStampId] = useState(stampTemplateId);
  if (stampTemplateId !== lastStampId) {
    setLastStampId(stampTemplateId);
    if (!stampTemplateId) setStampCell(null);
  }

  // Esc выходит из режима штампа. Дублирует Esc из useShortcuts на случай,
  // когда фокус на холсте перехватывает клавишу.
  useEffect(() => {
    if (!stampTemplateId) return;
    // Первый вход в режим штампа — подсказка про серию кликов и Esc (8.2.3).
    useEditor.getState().showHint("stamp");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") useEditor.getState().setStampTemplate(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stampTemplateId]);

  // --- курсор ---------------------------------------------------------------

  const idleCursor = (() => {
    // У продавца любое нажатие тащит холст — курсор обещает ровно это.
    if (readOnly || spaceHeld || tool === "pan") return "grab";
    if (stampTemplateId) return "copy";
    if (tool !== "select") return "crosshair";
    return "default";
  })();

  const clearHoverRow = useCallback(() => setHoverRow(null), []);

  return {
    preview,
    hoverRow,
    clearHoverRow,
    stampCell,
    cursor: dragCursor ?? idleCursor,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
}
