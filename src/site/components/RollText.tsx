import type { CSSProperties } from "react";

/**
 * Надпись, буквы которой волной прокатываются вверх и встают на место
 * (Кирилл 31 окт: живая кнопка «Подключить склад», но без градиента).
 * Раз в несколько секунд — сама, под курсором — сразу. Копия каждой буквы
 * стоит под ней, поэтому возврат в начало незаметен. Экранный диктор читает
 * надпись целиком, а не по буквам. Без анимаций (`prefers-reduced-motion`) —
 * обычный текст.
 */
export function RollText({ text }: { text: string }) {
  return (
    <span className="wh-roll-text">
      <span className="sr-only">{text}</span>
      {Array.from(text).map((ch, i) => {
        const glyph = ch === " " ? " " : ch;
        return (
          <span
            key={i}
            aria-hidden
            className="wh-roll-ch"
            data-ch={glyph}
            style={{ "--i": i } as CSSProperties}
          >
            {glyph}
          </span>
        );
      })}
    </span>
  );
}
