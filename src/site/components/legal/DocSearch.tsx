import { Search, X } from "lucide-react";
import { c, useT } from "../../lib/copy";
import type { DocHits } from "../../lib/legalSearch";

/**
 * Поле поиска над документом.
 *
 * Стоит над текстом, а не в боковом оглавлении: оглавление на телефоне скрыто,
 * а правовой документ на телефоне как раз и открывают — по ссылке из письма
 * или из формы. Поиск, доступный только на широком экране, был бы поиском для
 * тех, кому он нужен меньше всех.
 *
 * Под полем — не только число совпадений, но и список разделов, где они есть.
 * В этом весь смысл затеи: браузерный Ctrl+F перегоняет по совпадениям вслепую,
 * а здесь сразу видно, что «срок» стоит в двух местах, и на пункт можно
 * сослаться ссылкой.
 *
 * Обвязка двуязычна, документ — нет (см. `LegalScreen`). Поэтому подсказки
 * переводятся, а названия разделов в списке результатов остаются русскими и
 * помечены `lang="ru"`.
 */

const T = {
  label: c("Поиск по документу", "Search this document"),
  placeholder: c("Слово или фраза", "Word or phrase"),
  clear: c("Очистить поиск", "Clear search"),
  short: c("Наберите хотя бы два знака.", "Type at least two characters."),
  none: c(
    "Ничего не нашлось. Ищем по точному совпадению, без склонений, — попробуйте слово покороче, без окончания.",
    "Nothing found. The search matches text exactly, with no word forms — try a shorter word without its ending.",
  ),
  found: c("Нашлось {n} {word}:", "{n} {word} found:"),
};

export function DocSearch({
  value,
  onChange,
  hits,
}: {
  value: string;
  onChange: (next: string) => void;
  hits: DocHits;
}) {
  const t = useT();

  return (
    // `data-print="hide"`: на бумаге искать нечем, а место поле занимает.
    // Печать при этом не зависит от поиска — документ уходит на лист целиком.
    //
    // `lang` возвращает языку обвязки его собственный язык: блок стоит внутри
    // `<article lang="ru">`, и без этого экранный диктор читал бы английские
    // подсказки по-русски.
    <div data-print="hide" role="search" lang={t.lang} className="mt-8">
      <label htmlFor="doc-search" className="sr-only">
        {t(T.label)}
      </label>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id="doc-search"
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t(T.placeholder)}
          className="h-11 w-full rounded-full border border-border bg-background pl-11 pr-11 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary"
        />
        {value !== "" && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label={t(T.clear)}
            className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Ответ поиска читают голосом тоже: без `aria-live` человек, не видящий
          экрана, набирает слово и не узнаёт, нашлось ли хоть что-нибудь. */}
      <div aria-live="polite" className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
        {hits.tooShort && <p>{t(T.short)}</p>}

        {hits.query !== "" && hits.total === 0 && <p className="max-w-md">{t(T.none)}</p>}

        {hits.total > 0 && (
          <>
            <p>
              {t(T.found, {
                n: hits.total,
                word: t.plural(
                  hits.total,
                  ["совпадение", "совпадения", "совпадений"],
                  ["match", "matches"],
                ),
              })}
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {hits.sections.map((s) => (
                <li key={s.id}>
                  <a
                    lang="ru"
                    href={`#${s.id}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-[12px] leading-snug transition-colors hover:border-primary/50 hover:text-primary"
                  >
                    {s.title}
                    <span className="tabular-nums text-muted-foreground">{s.count}</span>
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
