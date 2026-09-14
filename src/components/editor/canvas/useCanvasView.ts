import { useCallback, useEffect, useRef, type RefObject } from "react";
import { planBounds } from "@/lib/planGeometry";
import { useEditor } from "@/lib/store";
import type { XY } from "@/lib/types";
import { clamp } from "@/lib/utils";
import { CELL, ZOOM_MAX, ZOOM_MIN } from "../constants";
import type { ToScreen } from "./screen";

/**
 * Вид холста: масштаб, смещение и перевод координат.
 *
 * Всё, что отвечает на вопрос «где это на экране», собрано здесь и ничего не
 * знает про инструменты и выделение. Обратное тоже верно: перетаскиванию хватает
 * `clientToWorld`, и оно не лезет в зум.
 */

/** Клетки запаса вокруг плана при вписывании в экран. */
const FIT_PAD_CELLS = 2;

export interface CanvasView {
  zoom: number;
  pan: XY;
  /** Точка окна (clientX/clientY) → мировые клетки. */
  clientToWorld: (clientX: number, clientY: number) => XY;
  worldRectToScreen: ToScreen;
  onWheel: (e: React.WheelEvent) => void;
}

export function useCanvasView(viewportRef: RefObject<HTMLDivElement | null>): CanvasView {
  const zoom = useEditor((s) => s.zoom);
  const pan = useEditor((s) => s.pan);

  const clientToWorld = useCallback(
    (clientX: number, clientY: number): XY => {
      const r = viewportRef.current!.getBoundingClientRect();
      return {
        x: (clientX - r.left - pan.x) / zoom / CELL,
        y: (clientY - r.top - pan.y) / zoom / CELL,
      };
    },
    [viewportRef, pan, zoom],
  );

  const worldRectToScreen = useCallback<ToScreen>(
    (rect, gap = 0) => ({
      left: pan.x + (rect.x * CELL + gap) * zoom,
      top: pan.y + (rect.y * CELL + gap) * zoom,
      width: (rect.w * CELL - gap * 2) * zoom,
      height: (rect.h * CELL - gap * 2) * zoom,
    }),
    [pan, zoom],
  );

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
    [viewportRef],
  );

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      // Пинч (ctrlKey на трекпаде Mac) или Cmd+колесо — зум; иначе — пан.
      if (e.ctrlKey || e.metaKey) {
        zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
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
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    const b = planBounds(st.activeFloor().modules, FIT_PAD_CELLS);
    if (!b) {
      // Пустой этаж вписывать не во что: ставим начало координат чуть левее и
      // выше центра, чтобы первый же модуль лёг примерно посередине экрана.
      st.setView(1, { x: vw / 2 - 6 * CELL, y: vh / 2 - 4 * CELL });
      return;
    }
    const z = clamp(Math.min(vw / (b.w * CELL), vh / (b.h * CELL)), ZOOM_MIN, ZOOM_MAX);
    st.setView(z, {
      x: vw / 2 - (b.x + b.w / 2) * CELL * z,
      y: vh / 2 - (b.y + b.h / 2) * CELL * z,
    });
  }, [viewportRef]);

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
  }, [viewportRef, fitView]);

  // Экспонируем fit / zoom / reset наружу (тулбар зума) через кастомные события.
  useEffect(() => {
    const onFit = () => fitView();
    const centerOf = () => {
      const vp = viewportRef.current;
      if (!vp) return null;
      const r = vp.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const onZoom = (e: Event) => {
      const c = centerOf();
      if (c) zoomAt((e as CustomEvent<number>).detail, c.x, c.y);
    };
    const onReset = () => {
      const c = centerOf();
      if (c) zoomAt(1 / useEditor.getState().zoom, c.x, c.y);
    };
    window.addEventListener("uklad:fit", onFit);
    window.addEventListener("uklad:zoom", onZoom);
    window.addEventListener("uklad:reset", onReset);
    return () => {
      window.removeEventListener("uklad:fit", onFit);
      window.removeEventListener("uklad:zoom", onZoom);
      window.removeEventListener("uklad:reset", onReset);
    };
  }, [viewportRef, fitView, zoomAt]);

  return { zoom, pan, clientToWorld, worldRectToScreen, onWheel };
}
