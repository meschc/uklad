import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, RotateCw } from "lucide-react";
import { MODULE_SPECS, type PlacedModule, type XY } from "@/lib/types";
import { clamp, cn } from "@/lib/utils";
import { selectRole, useEditor } from "@/lib/store";
import { overlappingIds } from "@/lib/overlap";
import { rowNumbers } from "@/lib/numbering";
import { useT } from "@/lib/i18n";
import {
  CELL,
  MODULE_GAP,
  MODULE_RADIUS,
  MODULE_STYLES,
  ZOOM_MAX,
  ZOOM_MIN,
} from "./constants";
import { ModuleNode } from "./ModuleNode";
import { CanvasMenu, type CanvasMenuState } from "./CanvasMenu";

type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

type DragState =
  | { kind: "pan"; startClient: XY; startPan: XY }
  | {
      kind: "place";
      type: PlacedModule["type"];
      startCell: XY;
      moved: boolean;
    }
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
  | {
      kind: "resize";
      id: string;
      handle: Handle;
      startRect: Rect;
      startCell: XY;
    }
  | { kind: "marquee"; startWorld: XY; additive: boolean };

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Запас (экранные px) вокруг ряда, в котором подсветка и «плюсик» не гаснут. */
const ROW_HOVER_PAD_PX = 36;

const HANDLES: { h: Handle; cursor: string; cx: number; cy: number }[] = [
  { h: "nw", cursor: "nwse-resize", cx: 0, cy: 0 },
  { h: "n", cursor: "ns-resize", cx: 0.5, cy: 0 },
  { h: "ne", cursor: "nesw-resize", cx: 1, cy: 0 },
  { h: "e", cursor: "ew-resize", cx: 1, cy: 0.5 },
  { h: "se", cursor: "nwse-resize", cx: 1, cy: 1 },
  { h: "s", cursor: "ns-resize", cx: 0.5, cy: 1 },
  { h: "sw", cursor: "nesw-resize", cx: 0, cy: 1 },
  { h: "w", cursor: "ew-resize", cx: 0, cy: 0.5 },
];

export function Canvas() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [menu, setMenu] = useState<CanvasMenuState | null>(null);
  // Ряд под курсором (по секции) — для подсветки его фрейma.
  const [hoverRow, setHoverRow] = useState<number | null>(null);

  // Транзиентный контур во время размещения/рамки (в мировых клетках / px).
  const [preview, setPreview] = useState<
    | { kind: "place"; rect: Rect }
    | { kind: "marquee"; rect: Rect } // в мировых px
    | null
  >(null);


  const tool = useEditor((s) => s.tool);
  const zoom = useEditor((s) => s.zoom);
  const pan = useEditor((s) => s.pan);
  const floor = useEditor((s) => s.activeFloor());
  const modules = floor.modules;
  const selection = useEditor((s) => s.selection);
  const activeShelf = useEditor((s) => s.activeShelf);
  const shelvesVisible = useEditor((s) => s.profile.showShelves !== false);
  const rowProposal = useEditor((s) => s.rowProposal);
  // Продавец план только смотрит: ни «плюсиков» продолжения ряда, ни
  // контекстного меню правки у него нет (п.1).
  const readOnly = useEditor((s) => selectRole(s) === "seller");
  const pasteAnchor = useEditor((s) => s.pasteAnchor);
  // Метку места вставки показываем только когда есть что вставлять — иначе
  // она была бы просто следом от любого клика по пустому холсту.
  const hasClipboard = useEditor((s) => s.clipboard.length > 0);
  const stampTemplateId = useEditor((s) => s.stampTemplateId);
  const stampTemplate = useEditor((s) =>
    s.stampTemplateId
      ? s.layoutTemplates.find((tp) => tp.id === s.stampTemplateId) ?? null
      : null,
  );
  // Клетка под курсором — левый верхний угол призрака штампа (#38).
  const [stampCell, setStampCell] = useState<XY | null>(null);
  const t = useT();

  // --- координатные преобразования ------------------------------------------

  const clientToWorld = useCallback(
    (clientX: number, clientY: number): XY => {
      const r = viewportRef.current!.getBoundingClientRect();
      return {
        x: (clientX - r.left - pan.x) / zoom / CELL,
        y: (clientY - r.top - pan.y) / zoom / CELL,
      };
    },
    [pan, zoom],
  );

  // `gap` (мировые px) поджимает прямоугольник со всех сторон — чтобы контуры,
  // отслеживающие модуль (выделение, ручки, наложение), совпадали с его
  // заливкой, которая теперь стоит с зазором (п.4b). Слот-индикаторы (превью,
  // якорь, призрак) зовут без gap и остаются во всю клетку.
  const worldRectToScreen = useCallback(
    (rect: Rect, gap = 0) => ({
      left: pan.x + (rect.x * CELL + gap) * zoom,
      top: pan.y + (rect.y * CELL + gap) * zoom,
      width: (rect.w * CELL - gap * 2) * zoom,
      height: (rect.h * CELL - gap * 2) * zoom,
    }),
    [pan, zoom],
  );

  // Габаритные рамки рядов. Ряд берём по ДЕЙСТВУЮЩЕМУ номеру (rowNumbers) —
  // тогда в рамку и в выделение попадают и лестницы линии (п.13). Показываем
  // рамки только для рядов, закреплённых пользователем (есть pinned `m.row`).
  const rowFrames = useMemo(() => {
    const rowMap = rowNumbers(floor);
    const pinned = new Set<number>();
    for (const m of modules) if (m.row != null) pinned.add(m.row);
    const boxes = new Map<
      number,
      { minX: number; minY: number; maxX: number; maxY: number; ids: Set<string> }
    >();
    for (const m of modules) {
      const r = rowMap.get(m.id);
      if (r == null || !pinned.has(r)) continue;
      const b = boxes.get(r);
      if (!b) {
        boxes.set(r, {
          minX: m.x,
          minY: m.y,
          maxX: m.x + m.w,
          maxY: m.y + m.h,
          ids: new Set([m.id]),
        });
      } else {
        b.minX = Math.min(b.minX, m.x);
        b.minY = Math.min(b.minY, m.y);
        b.maxX = Math.max(b.maxX, m.x + m.w);
        b.maxY = Math.max(b.maxY, m.y + m.h);
        b.ids.add(m.id);
      }
    }
    return [...boxes.entries()]
      .map(([row, b]) => ({
        row,
        ids: b.ids,
        rect: { x: b.minX, y: b.minY, w: b.maxX - b.minX, h: b.maxY - b.minY },
      }))
      .sort((a, b) => a.row - b.row);
  }, [modules, floor]);

  // --- зум к курсору --------------------------------------------------------

  const zoomAt = useCallback(
    (factor: number, clientX: number, clientY: number) => {
      const r = viewportRef.current!.getBoundingClientRect();
      const st = useEditor.getState();
      const newZoom = clamp(st.zoom * factor, ZOOM_MIN, ZOOM_MAX);
      if (newZoom === st.zoom) return;
      const mx = clientX - r.left;
      const my = clientY - r.top;
      // Мировая точка под курсором должна остаться на месте.
      const wx = (mx - st.pan.x) / st.zoom;
      const wy = (my - st.pan.y) / st.zoom;
      st.setView(newZoom, { x: mx - wx * newZoom, y: my - wy * newZoom });
    },
    [],
  );

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      // Пинч (ctrlKey на трекпаде Mac) или Cmd+колесо — зум; иначе — пан.
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.01);
        zoomAt(factor, e.clientX, e.clientY);
      } else {
        const st = useEditor.getState();
        st.setPan({ x: st.pan.x - e.deltaX, y: st.pan.y - e.deltaY });
      }
    },
    [zoomAt],
  );

  // --- вписать содержимое в экран (fit) -------------------------------------

  const fitView = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const st = useEditor.getState();
    const mods = st.activeFloor().modules;
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    if (mods.length === 0) {
      st.setView(1, { x: vw / 2 - 6 * CELL, y: vh / 2 - 4 * CELL });
      return;
    }
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const m of mods) {
      minX = Math.min(minX, m.x);
      minY = Math.min(minY, m.y);
      maxX = Math.max(maxX, m.x + m.w);
      maxY = Math.max(maxY, m.y + m.h);
    }
    const pad = 2; // клетки вокруг
    const cw = (maxX - minX + pad * 2) * CELL;
    const ch = (maxY - minY + pad * 2) * CELL;
    const z = clamp(Math.min(vw / cw, vh / ch), ZOOM_MIN, ZOOM_MAX);
    const contentCx = ((minX + maxX) / 2) * CELL;
    const contentCy = ((minY + maxY) / 2) * CELL;
    st.setView(z, {
      x: vw / 2 - contentCx * z,
      y: vh / 2 - contentCy * z,
    });
  }, []);

  // Вписать один раз — когда вьюпорт впервые получит реальный размер.
  const didFit = useRef(false);
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const tryFit = () => {
      if (didFit.current) return;
      if (vp.clientWidth > 40 && vp.clientHeight > 40) {
        didFit.current = true;
        fitView();
      }
    };
    tryFit();
    const ro = new ResizeObserver(tryFit);
    ro.observe(vp);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Экспонируем fit / zoom / reset наружу (тулбар зума) через кастомные события.
  useEffect(() => {
    const onFit = () => fitView();
    const onZoom = (e: Event) => {
      const vp = viewportRef.current;
      if (!vp) return;
      const r = vp.getBoundingClientRect();
      const factor = (e as CustomEvent<number>).detail;
      zoomAt(factor, r.left + r.width / 2, r.top + r.height / 2);
    };
    const onReset = () => {
      const vp = viewportRef.current;
      if (!vp) return;
      const r = vp.getBoundingClientRect();
      zoomAt(1 / useEditor.getState().zoom, r.left + r.width / 2, r.top + r.height / 2);
    };
    window.addEventListener("uklad:fit", onFit);
    window.addEventListener("uklad:zoom", onZoom);
    window.addEventListener("uklad:reset", onReset);
    return () => {
      window.removeEventListener("uklad:fit", onFit);
      window.removeEventListener("uklad:zoom", onZoom);
      window.removeEventListener("uklad:reset", onReset);
    };
  }, [fitView, zoomAt]);

  // --- пробел = временный режим пана ----------------------------------------

  useEffect(() => {
    const isField = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.tagName === "INPUT" ||
        t.tagName === "TEXTAREA" ||
        t.isContentEditable);
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isField(e.target)) {
        e.preventDefault();
        setSpaceHeld(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceHeld(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // --- pointer down ---------------------------------------------------------

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
      // Продавцу доступен только просмотр: любое нажатие тащит холст, а не
      // модули — правки плана из его роли не существует (п.26).
      const panMode =
        spaceHeld ||
        e.button === 1 ||
        st.tool === "pan" ||
        selectRole(st) === "seller";

      if (panMode) {
        dragRef.current = {
          kind: "pan",
          startClient: { x: e.clientX, y: e.clientY },
          startPan: { ...st.pan },
        };
        return;
      }

      // Режим штампа шаблона раскладки (#38): клик ставит группу левым верхним
      // углом в клетку под курсором. Остаёмся в режиме — можно штамповать серию.
      if (st.stampTemplateId) {
        const w = clientToWorld(e.clientX, e.clientY);
        st.stampLayoutTemplate(st.stampTemplateId, {
          x: Math.floor(w.x),
          y: Math.floor(w.y),
        });
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
        dragRef.current = {
          kind: "place",
          type: tool,
          startCell: cell,
          moved: false,
        };
        const spec = MODULE_SPECS[tool];
        const size = spec.fixed ?? spec.defaultSize;
        setPreview({
          kind: "place",
          rect: { x: cell.x, y: cell.y, w: size.w, h: size.h },
        });
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
      {
        const rf = rowFrames.find(
          (f) =>
            w.x >= f.rect.x &&
            w.x < f.rect.x + f.rect.w &&
            w.y >= f.rect.y &&
            w.y < f.rect.y + f.rect.h,
        );
        // С Shift ряд добавляется к выделению и не тащится: пользователь
        // набирает несколько рядов, а не двигает этот (п.4).
        if (rf && e.shiftKey) {
          const cur = st.selection;
          const ids = [...rf.ids];
          const whole = ids.every((id) => cur.includes(id));
          st.select(
            whole
              ? cur.filter((id) => !rf.ids.has(id))
              : [...new Set([...cur, ...ids])],
          );
          return;
        }
        if (rf) {
          st.select([...rf.ids]);
          const origins: Record<string, XY> = {};
          for (const m of st.activeFloor().modules) {
            if (rf.ids.has(m.id)) origins[m.id] = { x: m.x, y: m.y };
          }
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
      }

      // 5) пустое место → рамка выделения
      if (!e.shiftKey) st.clearSelection();
      dragRef.current = {
        kind: "marquee",
        startWorld: w,
        additive: e.shiftKey,
      };
      setPreview({
        kind: "marquee",
        rect: { x: w.x * CELL, y: w.y * CELL, w: 0, h: 0 },
      });
    },
    [clientToWorld, spaceHeld, tool, rowFrames],
  );

  // Esc выходит из режима штампа (дублирует Esc из useShortcuts на случай,
  // когда фокус на холсте перехватывает клавишу). При выходе гасим призрак,
  // чтобы он не застыл на месте последнего курсора.
  useEffect(() => {
    if (!stampTemplateId) {
      setStampCell(null);
      return;
    }
    // Первый вход в режим штампа — подсказка про серию кликов и Esc (8.2.3).
    useEditor.getState().showHint("stamp");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") useEditor.getState().setStampTemplate(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stampTemplateId]);

  // --- pointer move ---------------------------------------------------------

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      // Призрак штампа следует за курсором и без зажатой кнопки (#38).
      if (!drag && useEditor.getState().stampTemplateId) {
        const w = clientToWorld(e.clientX, e.clientY);
        setStampCell({ x: Math.floor(w.x), y: Math.floor(w.y) });
        return;
      }
      if (!drag) {
        // Продавцу план показывается как схема, а не как редактор: наведение
        // ничего не подсвечивает — подсветка обещает действие, которого у него
        // нет (п.26).
        if (readOnly) return;
        // Подсветка ряда — по положению курсора над его габаритом, включая
        // проход внутри ряда (а не только секции). Точное попадание — в
        // приоритете; иначе засчитываем зону с запасом вокруг ряда, чтобы
        // «плюсик» снаружи рамки не пропадал по пути курсора к нему.
        const w = clientToWorld(e.clientX, e.clientY);
        const inside = (f: (typeof rowFrames)[number], pad: number) =>
          w.x >= f.rect.x - pad &&
          w.x < f.rect.x + f.rect.w + pad &&
          w.y >= f.rect.y - pad &&
          w.y < f.rect.y + f.rect.h + pad;
        setHoverRow((prev) => {
          let r: number | null = null;
          for (const f of rowFrames) {
            if (inside(f, 0)) {
              r = f.row;
              break;
            }
          }
          if (r === null) {
            const pad = ROW_HOVER_PAD_PX / zoom / CELL;
            const near = rowFrames.filter((f) => inside(f, pad));
            // Среди «почти попавших» держим прежний ряд — без мигания между
            // соседями, когда курсор идёт по проходу.
            if (near.length > 0)
              r = near.find((f) => f.row === prev)?.row ?? near[0].row;
          }
          return prev === r ? prev : r;
        });
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
            rect: {
              x: drag.startCell.x,
              y: drag.startCell.y,
              w: spec.fixed.w,
              h: spec.fixed.h,
            },
          });
          return;
        }
        const cur = { x: Math.floor(w.x), y: Math.floor(w.y) };
        const x = Math.min(drag.startCell.x, cur.x);
        const y = Math.min(drag.startCell.y, cur.y);
        const rawW = Math.abs(cur.x - drag.startCell.x) + 1;
        const rawH = Math.abs(cur.y - drag.startCell.y) + 1;
        drag.moved = drag.moved || rawW > 1 || rawH > 1;
        setPreview({
          kind: "place",
          rect: {
            x,
            y,
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
          const cur = useEditor.getState().activeFloor().modules;
          const origins: Record<string, XY> = {};
          for (const m of cur) {
            if (ids.includes(m.id)) origins[m.id] = { x: m.x, y: m.y };
          }
          drag.origins = origins;
          drag.pendingDuplicate = false;
          drag.copy = true;
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
        const s = drag.startRect;
        const sp = MODULE_SPECS[m.type];
        const dx = Math.round(w.x - drag.startCell.x);
        const dy = Math.round(w.y - drag.startCell.y);
        let { x, y, w: nw, h: nh } = s;
        const H = drag.handle;
        if (H.includes("e")) nw = s.w + dx;
        if (H.includes("s")) nh = s.h + dy;
        if (H.includes("w")) {
          nw = s.w - dx;
          x = s.x + dx;
        }
        if (H.includes("n")) {
          nh = s.h - dy;
          y = s.y + dy;
        }
        // Клампим и заякориваем противоположную сторону.
        const cw = clamp(nw, sp.min, sp.max);
        const ch = clamp(nh, sp.min, sp.max);
        if (H.includes("w")) x = s.x + s.w - cw;
        if (H.includes("n")) y = s.y + s.h - ch;
        st.setModuleRect(drag.id, { x, y, w: cw, h: ch });
        return;
      }

      if (drag.kind === "marquee") {
        const x0 = Math.min(drag.startWorld.x, w.x) * CELL;
        const y0 = Math.min(drag.startWorld.y, w.y) * CELL;
        const x1 = Math.max(drag.startWorld.x, w.x) * CELL;
        const y1 = Math.max(drag.startWorld.y, w.y) * CELL;
        setPreview({
          kind: "marquee",
          rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
        });
      }
    },
    [clientToWorld, rowFrames, zoom],
  );

  // --- pointer up -----------------------------------------------------------

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      dragRef.current = null;
      try {
        viewportRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      if (!drag) return;
      const st = useEditor.getState();

      if (drag.kind === "place") {
        const spec = MODULE_SPECS[drag.type];
        if (spec.fixed) {
          st.addModule(drag.type, drag.startCell.x, drag.startCell.y);
        } else if (preview && preview.kind === "place" && drag.moved) {
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
        if (r && (r.w > 3 || r.h > 3)) {
          const x0 = r.x / CELL,
            y0 = r.y / CELL,
            x1 = (r.x + r.w) / CELL,
            y1 = (r.y + r.h) / CELL;
          const hit = st
            .activeFloor()
            .modules.filter(
              (m) =>
                m.x < x1 && m.x + m.w > x0 && m.y < y1 && m.y + m.h > y0,
            )
            .map((m) => m.id);
          const base = drag.additive ? st.selection : [];
          st.select(Array.from(new Set([...base, ...hit])));
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

      // Перенёс модуль руками, но ещё не знает про копию по Alt — подсказываем.
      if (drag.kind === "move" && drag.moved && !drag.copy) {
        st.showHint("dup");
      }

      // Клик без перетаскивания по модулю внутри групповой рамки (например,
      // по секции выделенного ряда) — сузить выделение до этого модуля (8.1).
      if (
        drag.kind === "move" &&
        !drag.moved &&
        drag.clickedId &&
        Object.keys(drag.origins).length > 1
      ) {
        st.select([drag.clickedId]);
      }
    },
    [preview],
  );

  // --- курсор ---------------------------------------------------------------

  const cursor = useMemo(() => {
    // У продавца любое нажатие тащит холст — курсор должен обещать ровно это.
    if (readOnly) return "grab";
    if (spaceHeld || tool === "pan") return "grab";
    if (stampTemplateId) return "copy";
    if (tool !== "select") return "crosshair";
    return "default";
  }, [readOnly, spaceHeld, tool, stampTemplateId]);

  // --- grid background ------------------------------------------------------

  const cell = CELL * zoom;
  // Точечный фон вместо сетки линий (п.4a, ref image-1784544171850): спокойнее,
  // «бумажная» эстетика. Одна точка на клетку = на модуль — точки служат
  // линейкой для оценки размера на глаз. Радиус фиксированный (не растёт с
  // зумом), меняется только шаг. При сильном отдалении, когда клетка мельче
  // ~7px, точки слились бы в кашу — тогда прячем их вовсе, а не показываем
  // редкую крупную сетку.
  const showDots = cell >= 7;
  const gridStyle: React.CSSProperties = {
    backgroundColor: "hsl(var(--canvas-bg))",
    backgroundImage: showDots
      ? "radial-gradient(circle, hsl(var(--grid-major)) 0.5px, transparent 1px)"
      : "none",
    backgroundSize: `${cell}px ${cell}px`,
    // −cell/2, чтобы точки стояли в узлах сетки (на стыках клеток), а не в
    // центрах — так они совпадают с границами модулей, которые лежат по клеткам.
    backgroundPosition: `${pan.x - cell / 2}px ${pan.y - cell / 2}px`,
  };

  const singleSel =
    selection.length === 1
      ? modules.find((m) => m.id === selection[0])
      : undefined;

  // Наложения пересчитываем от списка модулей (правка X/Y идёт мимо драга).
  const overlaps = useMemo(() => overlappingIds(modules), [modules]);

  // Выделен РОВНО целый ряд → показываем только рамку ряда, без колец у отдельных
  // модулей (п.8): ряд читается как единая деталь.
  const rowSelectionIds = useMemo(() => {
    if (!selection.length) return null;
    const set = new Set(selection);
    const fr = rowFrames.find(
      (f) => f.ids.size === set.size && [...f.ids].every((id) => set.has(id)),
    );
    return fr ? fr.ids : null;
  }, [rowFrames, selection]);

  // Габариты плана в клетках + отступ — плита-пол под секциями. Проход = пол,
  // проглядывающий в зазорах между модулями (модель «пол как проход»).
  const floorRect = useMemo(() => {
    if (!modules.length) return null;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const m of modules) {
      minX = Math.min(minX, m.x);
      minY = Math.min(minY, m.y);
      maxX = Math.max(maxX, m.x + m.w);
      maxY = Math.max(maxY, m.y + m.h);
    }
    const pad = 1; // клетка запаса по краю пола
    return {
      x: minX - pad,
      y: minY - pad,
      w: maxX - minX + pad * 2,
      h: maxY - minY + pad * 2,
    };
  }, [modules]);

  // Фреймы рядов: секции с одним `m.row` собираются в габаритный прямоугольник
  // с ярлыком «Ряд N» сверху (как фрейм в Figma). Ряд задаётся пользователем
  // (панель «Назначить ряд»), поэтому источник истины — само поле row, а не
  // автогруппировка. Наведение на любую секцию ряда подсвечивает его фрейм.

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
      style={{
        ...gridStyle,
        cursor:
          dragRef.current?.kind === "pan"
            ? "grabbing"
            : dragRef.current?.kind === "move"
              ? dragRef.current.copy
                ? "copy"
                : "move"
              : cursor,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onWheel={onWheel}
      onMouseLeave={() => setHoverRow(null)}
      onContextMenu={(e) => {
        e.preventDefault();
        if (readOnly) return;
        const st = useEditor.getState();
        const modEl = (e.target as HTMLElement).closest(
          "[data-module-id]",
        ) as HTMLElement | null;
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
            activeShelfIndex={
              activeShelf?.moduleId === m.id ? activeShelf.index : undefined
            }
            sectionNo={sectionNos.get(m.id)}
            shelvesVisible={shelvesVisible}
          />
        ))}
      </div>

      {/* Экранный оверлей: выделение, ручки, превью, рамка */}
      <div className="pointer-events-none absolute inset-0">
        {/* Фреймы рядов: габаритная рамка вокруг секций одного ряда + ярлык
            «Ряд N». Наведение на секцию ряда усиливает его рамку. Сама рамка не
            перехватывает клики (pointer-events-none) — секции под ней кликаются. */}
        {rowFrames.map((f) => {
          const s = worldRectToScreen(f.rect);
          const rowSelected =
            f.ids.size > 0 && [...f.ids].every((id) => selection.includes(id));
          // Ряд — функциональная единица: подсвечиваем при наведении ИЛИ когда
          // он целиком выделен (тогда открыт редактор ряда и виден «плюсик»).
          const active = hoverRow === f.row || rowSelected;
          return (
            <div
              key={`row-${f.row}`}
              className="absolute"
              style={{ left: s.left, top: s.top, width: s.width, height: s.height }}
            >
              {/* Рамку ряда показываем при наведении/выделении — иначе план чище.
                  Радиус масштабируем зумом: модули лежат в scale-слое, их углы
                  растут с приближением — фиксированный радиус рамки на их фоне
                  «плыл» бы при каждом изменении масштаба. */}
              {active && (
                <div
                  className={cn(
                    "absolute inset-0 border border-dashed",
                    rowSelected
                      ? "border-primary bg-primary/10"
                      : "border-primary/60 bg-primary/5",
                  )}
                  style={{ borderRadius: MODULE_RADIUS * zoom }}
                />
              )}
              {/* Ярлык без фона, по центру над рядом: клик выделяет его секции
                  (открывает редактор ряда). Подсветку ведёт курсор над рядом.
                  Продавцу тот же ярлык достаётся простой подписью — номер ряда
                  ему нужен, а выделение секций уже нет. */}
              {readOnly ? (
                <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-full whitespace-nowrap px-1 py-0.5 text-[10px] font-semibold leading-none tabular-nums text-primary/55">
                  {t("canvas.rowFrame", { n: f.row })}
                </span>
              ) : (
              <button
                type="button"
                // Гасим pointerdown: иначе он всплывает на холст, тот считает
                // это кликом по пустому месту и сбрасывает выделение ещё до
                // того, как сработает onClick кнопки.
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  // Shift копит ряды: несколько рядов правятся вместе (п.4).
                  const st = useEditor.getState();
                  const ids = [...f.ids];
                  if (e.shiftKey) {
                    const cur = st.selection;
                    const whole = ids.every((id) => cur.includes(id));
                    st.select(
                      whole
                        ? cur.filter((id) => !f.ids.has(id))
                        : [...new Set([...cur, ...ids])],
                    );
                    return;
                  }
                  st.select(ids);
                }}
                className={cn(
                  "pointer-events-auto absolute left-1/2 top-0 -translate-x-1/2 -translate-y-full cursor-pointer whitespace-nowrap px-1 py-0.5 text-[10px] font-semibold leading-none tabular-nums transition-colors",
                  active ? "text-primary" : "text-primary/55 hover:text-primary",
                )}
              >
                {t("canvas.rowFrame", { n: f.row })}
              </button>
              )}
              {/* «Плюсик» — продолжить ряд копией (п.6). Появляется ТОЛЬКО с той
                  стороны, где рядом нет другого ряда: если слева и справа уже
                  есть ряды — плюсиков нет. Кладёт копию в свободную сторону. */}
              {active &&
                !readOnly &&
                (() => {
                  const vert = f.rect.h >= f.rect.w;
                  const cross = (o: (typeof rowFrames)[number]) =>
                    vert
                      ? f.rect.y < o.rect.y + o.rect.h &&
                        f.rect.y + f.rect.h > o.rect.y
                      : f.rect.x < o.rect.x + o.rect.w &&
                        f.rect.x + f.rect.w > o.rect.x;
                  const gap = (vert ? f.rect.w : f.rect.h) + 4;
                  const before = f.rect[vert ? "x" : "y"];
                  const after =
                    f.rect[vert ? "x" : "y"] + f.rect[vert ? "w" : "h"];
                  const hasBefore = rowFrames.some((o) => {
                    if (o === f || !cross(o)) return false;
                    const oa = o.rect[vert ? "x" : "y"] + o.rect[vert ? "w" : "h"];
                    return oa <= before + 1 && before - oa <= gap;
                  });
                  const hasAfter = rowFrames.some((o) => {
                    if (o === f || !cross(o)) return false;
                    const ob = o.rect[vert ? "x" : "y"];
                    return ob >= after - 1 && ob - after <= gap;
                  });
                  const btn = (side: "before" | "after", cls: string) => (
                    <button
                      type="button"
                      title={t("canvas.rowExtend", { n: f.row })}
                      // Без stopPropagation холст успевает обработать
                      // pointerdown как клик по пустому месту, снимает
                      // выделение и размонтирует кнопку до её onClick.
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() =>
                        useEditor.getState().cloneRow(f.row, side)
                      }
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
                      {!hasBefore &&
                        btn(
                          "before",
                          vert
                            ? "left-0 top-1/2 -translate-x-[calc(100%+4px)] -translate-y-1/2"
                            : "left-1/2 top-0 -translate-x-1/2 -translate-y-[calc(100%+4px)]",
                        )}
                      {!hasAfter &&
                        btn(
                          "after",
                          vert
                            ? "right-0 top-1/2 translate-x-[calc(100%+4px)] -translate-y-1/2"
                            : "left-1/2 bottom-0 -translate-x-1/2 translate-y-[calc(100%+4px)]",
                        )}
                    </>
                  );
                })()}
            </div>
          );
        })}
        {/* Продолжение по образцу: призрачные рамки-кандидаты с галочкой и
            предлагаемым номером ряда. Отмеченные применяются одним действием
            из плавающей панели «Продолжить ряды?». */}
        {rowProposal?.candidates.map((c, i) => {
          const s = worldRectToScreen(c.rect);
          return (
            <div
              key={`prop-${i}`}
              className="absolute"
              style={{ left: s.left, top: s.top, width: s.width, height: s.height }}
            >
              <div
                className={cn(
                  "absolute inset-0 rounded-md border border-dashed transition-colors",
                  c.checked
                    ? "border-primary/70 bg-primary/10"
                    : "border-muted-foreground/30 bg-transparent",
                )}
              />
              <button
                type="button"
                onClick={() => useEditor.getState().toggleRowProposal(i)}
                className={cn(
                  "pointer-events-auto absolute left-1/2 top-0 flex -translate-x-1/2 -translate-y-full items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums shadow-sm transition-colors",
                  c.checked
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground ring-1 ring-inset ring-border",
                )}
              >
                <span
                  className={cn(
                    "flex size-3 items-center justify-center rounded-[3px] border",
                    c.checked
                      ? "border-primary-foreground/70 bg-primary-foreground/20"
                      : "border-muted-foreground/50",
                  )}
                >
                  {c.checked && <Check className="size-2.5" />}
                </span>
                {t("canvas.rowFrame", { n: c.number })}
              </button>
            </div>
          );
        })}
        {/* Наложение модулей — янтарный пунктир (позицию можно ввести числом) */}
        {modules
          .filter((m) => overlaps.has(m.id))
          .map((m) => {
            const s = worldRectToScreen(m, MODULE_GAP);
            return (
              <div
                key={`ov-${m.id}`}
                className="absolute rounded-[4px] border-2 border-dashed border-amber-500/80"
                style={{
                  left: s.left,
                  top: s.top,
                  width: s.width,
                  height: s.height,
                }}
              />
            );
          })}

        {/* Призрак штампа шаблона раскладки под курсором (#38) */}
        {stampTemplate &&
          stampCell &&
          stampTemplate.modules.map((lm, i) => {
            const s = worldRectToScreen({
              x: stampCell.x + lm.dx,
              y: stampCell.y + lm.dy,
              w: lm.w,
              h: lm.h,
            });
            return (
              <div
                key={`stamp-${i}`}
                className={cn(
                  // Призрак штампа — та же геометрия, что у модуля (4px).
                  "absolute rounded-[4px] opacity-70 ring-1 ring-inset",
                  MODULE_STYLES[lm.type].fill,
                  MODULE_STYLES[lm.type].ring,
                )}
                style={{ left: s.left, top: s.top, width: s.width, height: s.height }}
              />
            );
          })}

        {/* Место вставки: куда ляжет копия по Cmd+V (#37) */}
        {pasteAnchor && hasClipboard && (
          <div
            className="absolute rounded-[3px] border-2 border-dashed border-primary/70 bg-primary/10"
            style={{
              ...(() => {
                const s = worldRectToScreen({
                  x: pasteAnchor.x,
                  y: pasteAnchor.y,
                  w: 1,
                  h: 1,
                });
                return { left: s.left, top: s.top, width: s.width, height: s.height };
              })(),
            }}
          />
        )}

        {/* Контур выделенных (кроме случая, когда выделен целый ряд — п.8) */}
        {modules
          .filter((m) => selection.includes(m.id) && !rowSelectionIds?.has(m.id))
          .map((m) => {
            const s = worldRectToScreen(m, MODULE_GAP);
            return (
              <div
                key={m.id}
                className="absolute animate-fade-in rounded-[4px] ring-2 ring-primary"
                style={{
                  left: s.left,
                  top: s.top,
                  width: s.width,
                  height: s.height,
                }}
              />
            );
          })}

        {/* Ручки ресайза (только для одиночного нефиксированного) */}
        {!readOnly &&
          singleSel &&
          !MODULE_SPECS[singleSel.type].fixed &&
          (() => {
            const s = worldRectToScreen(singleSel, MODULE_GAP);
            return HANDLES.map((h) => (
              <div
                key={h.h}
                data-handle={h.h}
                className="pointer-events-auto absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-primary bg-background shadow-sm"
                style={{
                  left: s.left + h.cx * s.width,
                  top: s.top + h.cy * s.height,
                  cursor: h.cursor,
                }}
              />
            ));
          })()}

        {/* Бейдж размера у выделенного */}
        {!readOnly &&
          singleSel &&
          (() => {
            const s = worldRectToScreen(singleSel, MODULE_GAP);
            return (
              <div
                className="absolute -translate-x-1/2 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground shadow-sm"
                style={{ left: s.left + s.width / 2, top: s.top + s.height + 6 }}
              >
                {singleSel.w}×{singleSel.h}
              </div>
            );
          })()}

        {/* Ручка поворота над выделенным (одиночный нефиксированный модуль) */}
        {!readOnly &&
          singleSel &&
          !MODULE_SPECS[singleSel.type].fixed &&
          (() => {
            const s = worldRectToScreen(singleSel, MODULE_GAP);
            const cx = s.left + s.width / 2;
            return (
              <>
                <div
                  className="absolute w-px -translate-x-1/2 bg-primary/50"
                  style={{ left: cx, top: s.top - 15, height: 15 }}
                />
                <button
                  className="pointer-events-auto absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-primary bg-background text-primary shadow-sm transition-colors hover:bg-primary hover:text-primary-foreground"
                  style={{ left: cx, top: s.top - 22 }}
                  title={t("editor.rotate")}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => useEditor.getState().rotateModule(singleSel.id)}
                >
                  <RotateCw className="size-3.5" />
                </button>
              </>
            );
          })()}

        {/* Превью размещения */}
        {preview?.kind === "place" &&
          (() => {
            const s = worldRectToScreen(preview.rect);
            return (
              <div
                className="absolute rounded-[4px] border-2 border-dashed border-primary bg-primary/10"
                style={{
                  left: s.left,
                  top: s.top,
                  width: s.width,
                  height: s.height,
                }}
              >
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-semibold text-primary">
                  {preview.rect.w}×{preview.rect.h}
                </span>
              </div>
            );
          })()}

        {/* Рамка выделения */}
        {preview?.kind === "marquee" &&
          (() => {
            const s = worldRectToScreen({
              x: preview.rect.x / CELL,
              y: preview.rect.y / CELL,
              w: preview.rect.w / CELL,
              h: preview.rect.h / CELL,
            });
            return (
              <div
                className="absolute rounded-[2px] border border-primary bg-primary/10"
                style={{
                  left: s.left,
                  top: s.top,
                  width: s.width,
                  height: s.height,
                }}
              />
            );
          })()}
      </div>

      {menu && <CanvasMenu state={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}
