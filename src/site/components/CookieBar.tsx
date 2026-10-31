import { useEffect } from "react";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  text: c("Уклад использует cookie.", "Uklad uses cookies."),
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

  // Компактная плашка в углу (Кирилл 19 окт: большая карточка внизу
  // закрывала полэкрана). Что и зачем собираем, подробно — на странице
  // политики по ссылке «Подробнее».
  // Плашка в стиле страниц витрины (Кирилл 23 окт): белая карточка с мягкой
  // тенью, выезжает снизу с пружиной, печенье «откусывается» один раз.
  return (
    <div
      data-print="hide"
      className="fixed inset-x-3 bottom-3 z-[80] sm:inset-x-auto sm:bottom-5 sm:left-5 sm:w-[380px]"
    >
      <div className="wh cookie-in flex flex-col gap-4 rounded-[20px] bg-[var(--wh-tile)] p-5 shadow-[0_18px_50px_-12px_rgba(16,24,40,0.25),0_0_0_1px_rgba(16,24,40,0.06)] dark:shadow-[0_18px_50px_-12px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.08)]">
        <div className="flex items-start gap-3">
          <span className="cookie-bite grid size-10 shrink-0 place-items-center rounded-full bg-[hsl(var(--primary))] text-white">
            <Cookie className="size-5" />
          </span>
          <p className="pt-0.5 text-[15px] leading-snug text-[var(--wh-ink)]">
            {t(T.text)}{" "}
            {/* Баннер остаётся на экране: человек ушёл читать политику именно
                затем, чтобы решить, и кнопки выбора должны ждать его там же. */}
            <a
              href={href("/legal/cookies")}
              className="text-[hsl(var(--primary))] transition-opacity hover:opacity-75"
            >
              {t(T.more)}
            </a>
          </p>
        </div>

        <div className="flex gap-2">
          {/* Обе кнопки одного размера и стоят рядом: выбор здесь
              равноправный, а не «согласиться и мелким шрифтом отказаться». */}
          <Button
            variant="ghost"
            size="sm"
            shape="pill"
            onClick={() => decide("necessary")}
            className="flex-1 bg-[#FAFAFA] text-[var(--wh-ink)] hover:bg-[#F0F0F0] dark:bg-white/10 dark:hover:bg-white/15"
          >
            {t(T.necessary)}
          </Button>
          <Button size="sm" shape="pill" onClick={() => decide("all")} className="flex-1">
            {t(T.all)}
          </Button>
        </div>
      </div>
    </div>
  );
}
