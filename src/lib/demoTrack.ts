import { demoRepository, type DemoEvent } from "@/lib/data/demoRepository";

/**
 * Что человек делает в демо по личной ссылке (Кирилл 2.11: «отследить все
 * действия: перешёл, во сколько, с каких устройств, что делал»).
 *
 * Пишем только действия интерфейса: открытый экран, подпись нажатой кнопки
 * или ссылки, «пульс» раз в 15 секунд, пока вкладка на виду (из него сервер
 * считает время), и уход со страницы. Что человек вводит в поля, не пишем
 * никогда. Устройство и «сколько человек» сервер определяет сам, по
 * заголовку браузера и своей куке. Включается, только когда сервер
 * подтвердил демо-пропуск (`App.tsx`).
 */
const BEAT_MS = 15_000;
const FLUSH_MS = 10_000;
const LABEL_MAX = 60;

/** Подпись нажатого: aria-label или текст кнопки, коротко и одной строкой. */
function clickLabel(target: EventTarget | null): string | null {
  const el =
    target instanceof Element ? target.closest("button,a,[role=tab],[role=menuitem]") : null;
  if (!el) return null;
  const text = (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, LABEL_MAX) : null;
}

export function startDemoTrack(
  view: () => string,
  onView: (cb: (v: string) => void) => () => void,
) {
  let queue: DemoEvent[] = [];
  const push = (e: DemoEvent) => {
    queue.push(e);
    if (queue.length >= 40) flush();
  };
  const flush = () => {
    if (!queue.length) return;
    const batch = queue;
    queue = [];
    void demoRepository.track(batch);
  };

  push({ k: "start", v: `${window.screen.width}×${window.screen.height}` });
  push({ k: "view", v: view() });
  const offView = onView((v) => push({ k: "view", v }));
  const onClick = (e: MouseEvent) => {
    const label = clickLabel(e.target);
    if (label) push({ k: "click", v: label });
  };
  document.addEventListener("click", onClick, true);
  const beat = window.setInterval(() => {
    if (document.visibilityState === "visible") push({ k: "beat", v: view() });
  }, BEAT_MS);
  const tick = window.setInterval(flush, FLUSH_MS);
  const onHide = () => {
    push({ k: "leave", v: view() });
    flush();
  };
  window.addEventListener("pagehide", onHide);

  return () => {
    offView();
    document.removeEventListener("click", onClick, true);
    window.clearInterval(beat);
    window.clearInterval(tick);
    window.removeEventListener("pagehide", onHide);
    flush();
  };
}
