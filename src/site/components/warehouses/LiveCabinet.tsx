import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { EMBED_VIEW_MESSAGE } from "@/lib/appViews";
import type { AppView } from "@/lib/types";
import { cn } from "@/lib/utils";

/*
 * Живые экраны на первом экране — настоящий кабинет `/app/` во фрейме
 * (Кирилл 31 окт: «живые экраны должны быть как реальные у нас»). Макет в
 * HTML расходился бы с продуктом на каждой правке, а фрейм показывает ровно
 * то, что увидит склад: тот же план, приёмку, чат и сотрудников на демо-данных.
 *
 * Фрейм тяжёлый, поэтому до него стоит снимок того же экрана: кабинет
 * грузится, только когда окно попало в кадр и страница уже отрисована, и
 * проявляется поверх снимка, когда успел отрисоваться сам. Экраны дальше
 * переключаются сообщением во фрейм (`EMBED_VIEW_MESSAGE`), без перезагрузки.
 * Окно нарисовано в 1240×640 и масштабируется под колонку, как картинка.
 */

export const LIVE_W = 1240;
export const LIVE_H = 640;
/** Сколько ждать после загрузки фрейма, пока кабинет отрисуется. */
const SETTLE_MS = 700;

export function CabinetFrame({
  view,
  title,
  fallback,
  fallbackAlt,
}: {
  view: AppView;
  title: string;
  fallback: string;
  fallbackAlt: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(1);
  const [mount, setMount] = useState(false);
  const [ready, setReady] = useState(false);
  // Экран, с которым фрейм открыли: дальше адрес не меняем, иначе React
  // перезагружал бы кабинет на каждой вкладке.
  const [first] = useState(view);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / LIVE_W || 1);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Грузим кабинет, только когда окно в кадре и страница уже загрузилась.
  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let timer = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const go = () => {
        timer = window.setTimeout(() => setMount(true), 400);
      };
      if (document.readyState === "complete") go();
      else window.addEventListener("load", go, { once: true });
    });
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    frame.current?.contentWindow?.postMessage(
      { type: EMBED_VIEW_MESSAGE, view },
      window.location.origin,
    );
  }, [view, ready]);

  return (
    <div ref={box} className="relative aspect-[1240/640] w-full overflow-hidden bg-white">
      <img
        src={fallback}
        alt={fallbackAlt}
        width={LIVE_W}
        height={LIVE_H}
        className={cn(
          "absolute inset-0 block size-full object-cover object-left-top transition-opacity duration-500",
          ready && "opacity-0",
        )}
      />
      {mount && (
        <iframe
          ref={frame}
          src={`/app/?role=warehouse&view=${first}&embed=1`}
          title={title}
          width={LIVE_W}
          height={LIVE_H}
          onLoad={() => window.setTimeout(() => setReady(true), SETTLE_MS)}
          style={{ transform: `scale(${scale})` }}
          className={cn(
            "absolute left-0 top-0 origin-top-left border-0 transition-opacity duration-500",
            ready ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        />
      )}
    </div>
  );
}
