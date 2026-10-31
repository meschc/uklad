/**
 * Перекрёстные ссылки между правовыми документами (Кирилл 26 окт: «ссылки на
 * документы нужно оформить ссылками»).
 *
 * Тексты документов — данные, а не разметка (см. `data/legal/types.ts`), и
 * вписывать в них ссылки руками значит размечать каждое упоминание в семи
 * файлах. Поэтому ссылки находит рендерер: по названию документа в любом
 * падеже. Шаблоны узкие нарочно — «согласие» или «оферта» без уточнения
 * в тексте чаще понятие, чем документ, и ссылка на них врала бы.
 */
const REFS: { re: RegExp; to: string }[] = [
  { re: /[Пп]олитик[а-я]* (?:в отношении )?обработки персональных данных/, to: "/legal/privacy" },
  { re: /[Пп]олитик[а-я]* использования (?:файлов )?cookie/, to: "/legal/cookies" },
  { re: /[Пп]ользовательск[а-я]+ соглашени[а-я]+/, to: "/legal/terms" },
  { re: /публичн[а-я]+ оферт[а-я]+/, to: "/legal/offer" },
  { re: /страниц[а-я]* «Тарифы»/, to: "/pricing" },
];

const ANY = new RegExp(REFS.map((r) => `(${r.re.source})`).join("|"), "g");

export interface LinkPart {
  text: string;
  /** Путь без языка; нет — обычный текст. */
  to?: string;
}

/**
 * Режет текст на куски со ссылками. `self` — путь открытого документа: ссылка
 * документа на самого себя («настоящей офертой») только сбивает с чтения.
 */
export function splitLinks(text: string, self?: string): LinkPart[] {
  const parts: LinkPart[] = [];
  let last = 0;
  for (const m of text.matchAll(ANY)) {
    const i = m.slice(1).findIndex(Boolean);
    const to = REFS[i].to;
    if (to === self) continue;
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ text: m[0], to });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
