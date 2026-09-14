import { useEffect } from "react";
import { Cookie } from "lucide-react";
import { href } from "../lib/route";
import {
  REOPEN_EVENT,
  readChoice,
  setCookieBannerOpen,
  useCookieBannerOpen,
  writeChoice,
  type CookieChoice,
} from "../lib/cookieConsent";
import { c, useT } from "../lib/copy";

const T = {
  text: c(
    "Уклад использует cookie. Без технических не работают вход и фильтры. Аналитические включаются только с вашего согласия и собирают обезличенную статистику.",
    "Uklad uses cookies. Without the technical ones sign-in and filters break. Analytics cookies are switched on only with your consent and collect anonymous statistics.",
  ),
  more: c("Подробнее", "Details"),
  necessary: c("Только необходимые", "Necessary only"),
  all: c("Принять все", "Accept all"),
};

/**
 * Баннер согласия на cookie.
 *
 * Две равнозначные кнопки, а не «Принять» рядом с серой ссылкой: отказ должен
 * стоить ровно столько же кликов, сколько согласие, иначе согласие перестаёт
 * быть свободным. Крестика «закрыть» нет намеренно — закрытие без выбора это
 * ни да, ни нет, и трактовать его как согласие было бы враньём.
 *
 * Появляется с задержкой: баннер, выехавший одновременно с первым экраном,
 * человек закрывает не читая, ещё до того, как понял, куда попал.
 */
const APPEAR_DELAY = 1200;

export function CookieBar() {
  const t = useT();
  // Состояние баннера — общее, а не своё: пока выбор не сделан, низ экрана
  // занят им одним, и соседи по этажу (полоса сравнения) должны это видеть.
  const open = useCookieBannerOpen();

  useEffect(() => {
    // Выбор уже сделан — баннер не показываем, пока его не позовут из подвала.
    if (readChoice() === null) {
      const timer = window.setTimeout(() => setCookieBannerOpen(true), APPEAR_DELAY);
      return () => window.clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    const onReopen = () => setCookieBannerOpen(true);
    window.addEventListener(REOPEN_EVENT, onReopen);
    return () => window.removeEventListener(REOPEN_EVENT, onReopen);
  }, []);

  if (!open) return null;

  const decide = (choice: CookieChoice) => {
    writeChoice(choice);
    setCookieBannerOpen(false);
  };

  return (
    <div data-print="hide" className="fixed inset-x-0 bottom-0 z-[80] px-3 pb-3 sm:px-4 sm:pb-4">
      <div className="r-window mx-auto flex max-w-3xl animate-slide-up flex-col gap-4 border border-border bg-card/95 p-4 shadow-2xl backdrop-blur-xl sm:flex-row sm:items-center sm:p-5">
        <Cookie className="size-5 shrink-0 text-primary" />

        <p className="flex-1 text-[13px] leading-relaxed text-muted-foreground">
          {t(T.text)}{" "}
          {/* Баннер остаётся на экране: человек ушёл читать политику именно
              затем, чтобы решить, и кнопки выбора должны ждать его там же. */}
          <a
            href={href("/legal/cookies")}
            className="font-medium text-primary underline underline-offset-2"
          >
            {t(T.more)}
          </a>
        </p>

        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => decide("necessary")}
            className="h-10 flex-1 rounded-full border border-border px-4 text-[13px] font-medium transition-colors hover:bg-muted sm:flex-none"
          >
            {t(T.necessary)}
          </button>
          <button
            onClick={() => decide("all")}
            className="h-10 flex-1 rounded-full bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:flex-none"
          >
            {t(T.all)}
          </button>
        </div>
      </div>
    </div>
  );
}
