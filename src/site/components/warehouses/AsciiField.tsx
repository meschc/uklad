import { useEffect, useRef, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { createAsciiField, FPS, type FieldMessage, type FieldSize } from "./asciiFieldCore";

/**
 * Поле ASCII-знаков на синем: по нему медленно идут волны, сверху вниз
 * проходит полоса «сканера», а курсор расталкивает знаки вокруг себя и
 * подсвечивает их. Только на синих фонах — первый экран и карточка тарифа
 * «Склад» (Кирилл 19 окт: без фигур из знаков, поле на весь фон и живое).
 *
 * Canvas, а не DOM: несколько тысяч знаков 24 раза в секунду DOM не потянет.
 * Рисует поле воркер на OffscreenCanvas (`asciiField.worker.ts`): тогда кадры
 * поля не мешают прокрутке, и паузы на время прокрутки не нужны. Где воркера
 * с OffscreenCanvas нет, тот же расчёт (`asciiFieldCore.ts`) идёт здесь.
 * Поле лежит под всем блоком целиком; под текстом из `quiet` знаки те же, но
 * прозрачнее — текст читается, а поле не обрывается дырой. Кадры не рисуются,
 * пока поле вне экрана или вкладка скрыта; при `prefers-reduced-motion`
 * рисуется один неподвижный кадр и курсор на поле не влияет.
 */

type Port = {
  resize: (size: FieldSize) => void;
  pointer: (x: number, y: number, on: boolean) => void;
  visible: (on: boolean) => void;
  dispose: () => void;
};

/** Воркер с OffscreenCanvas: поле рисуется вне основного потока. */
function workerPort(
  canvas: HTMLCanvasElement,
  init: Omit<Extract<FieldMessage, { type: "init" }>, "type" | "canvas">,
): Port | null {
  if (typeof Worker === "undefined" || !("transferControlToOffscreen" in canvas)) return null;
  let worker: Worker;
  let off: OffscreenCanvas;
  try {
    off = canvas.transferControlToOffscreen();
    worker = new Worker(new URL("./asciiField.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
  const send = (m: FieldMessage, transfer: Transferable[] = []) => worker.postMessage(m, transfer);
  send({ type: "init", canvas: off, ...init }, [off]);
  return {
    resize: (size) => send({ type: "resize", ...size }),
    pointer: (x, y, on) => send({ type: "ptr", x, y, on }),
    visible: (on) => send({ type: "vis", on }),
    dispose: () => worker.terminate(),
  };
}

/** Запасной путь: тот же расчёт в основном потоке. */
function mainPort(
  canvas: HTMLCanvasElement,
  init: Omit<Extract<FieldMessage, { type: "init" }>, "type" | "canvas">,
): Port | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const field = createAsciiField(ctx, canvas, init.font, init.strength);
  field.resize(init);
  field.draw(2400, true);
  let visible = true;
  let last = 0;
  let raf = 0;
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (!visible || now - last < 1000 / FPS) return;
    last = now;
    field.draw(now);
  };
  if (!init.still) raf = requestAnimationFrame(loop);
  return {
    resize: (size) => {
      field.resize(size);
      field.draw(last || 2400, true);
    },
    pointer: field.pointer,
    visible: (on) => {
      visible = on;
    },
    dispose: () => cancelAnimationFrame(raf),
  };
}

export function AsciiField({
  quiet,
  strength = 1,
  font = 14,
  className,
}: {
  /** Блоки текста, под которыми поле прозрачнее. */
  quiet?: RefObject<HTMLElement | null>[];
  /** Множитель яркости: на карточке тарифа поле тише, чем на первом экране. */
  strength?: number;
  font?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    // Холст создаётся здесь, а не разметкой: отданный воркеру холст второй
    // раз не отдать, а StrictMode и смена свойств запускают эффект заново.
    const canvas = document.createElement("canvas");
    canvas.className = "absolute inset-0 size-full";
    host.appendChild(canvas);

    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const measure = (): FieldSize => {
      const box = canvas.getBoundingClientRect();
      return {
        w: canvas.clientWidth,
        h: canvas.clientHeight,
        dpr: Math.min(window.devicePixelRatio || 1, 1.5),
        rects: (quiet ?? [])
          .map((q) => q.current?.getBoundingClientRect())
          .filter((r): r is DOMRect => !!r)
          .map((r) => ({
            l: r.left - box.left,
            r: r.right - box.left,
            t: r.top - box.top,
            b: r.bottom - box.top,
          })),
      };
    };
    const init = { font, strength, still, ...measure() };
    const port = workerPort(canvas, init) ?? mainPort(canvas, init);
    if (!port) {
      canvas.remove();
      return;
    }

    let seen = true;
    const vis = () => port.visible(seen && !document.hidden);
    const ro = new ResizeObserver(() => port.resize(measure()));
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      seen = e.isIntersecting;
      vis();
    });
    io.observe(canvas);

    // Canvas не ловит указатель (под ним кнопки), поэтому слушаем окно и
    // проверяем, попал ли курсор в прямоугольник поля.
    const move = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      port.pointer(x, y, x >= 0 && y >= 0 && x <= r.width && y <= r.height);
    };
    const leave = () => port.pointer(0, 0, false);

    if (!still) {
      window.addEventListener("pointermove", move, { passive: true });
      document.documentElement.addEventListener("pointerleave", leave);
      document.addEventListener("visibilitychange", vis);
    }
    return () => {
      port.dispose();
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
      document.removeEventListener("visibilitychange", vis);
      canvas.remove();
    };
  }, [quiet, strength, font]);

  return (
    <div
      ref={ref}
      aria-hidden
      className={cn("wh-ascii pointer-events-none absolute inset-0 overflow-hidden", className)}
    />
  );
}
