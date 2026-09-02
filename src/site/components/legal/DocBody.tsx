import { Info } from "lucide-react";
import type { LegalBlock, LegalSection } from "../../data/legal/types";

/**
 * Типографика правовых документов — в одном месте на все семь.
 *
 * Юридический текст читают не подряд, а поиском по странице: человек пришёл
 * узнать срок хранения и ищет слово «срок». Поэтому длина строки ограничена,
 * абзацы разрежены, а таблицы и врезки визуально выбиваются из потока — по ним
 * глаз цепляется быстрее, чем по абзацу.
 */
function Block({ block }: { block: LegalBlock }) {
  switch (block.kind) {
    case "p":
      return <p className="mt-4 leading-[1.75] text-foreground/85">{block.text}</p>;

    case "list":
      return (
        <ul className="mt-4 flex flex-col gap-2.5">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3 leading-[1.7] text-foreground/85">
              {/* Маркер — точка, набранная вручную: у ul с list-style маркер
                  прилипает к первой строке и разъезжается на переносах. */}
              <span className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-primary/50" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );

    case "ordered":
      return (
        <ol className="mt-4 flex flex-col gap-2.5">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3 leading-[1.7] text-foreground/85">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold tabular-nums text-primary">
                {i + 1}
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      );

    case "note":
      return (
        <div className="r-inset mt-5 flex gap-3 border border-primary/25 bg-primary/[0.05] p-4">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-[14px] leading-[1.7] text-foreground/85">{block.text}</p>
        </div>
      );

    case "table":
      return (
        // Обёртка со своей прокруткой: в таблице реквизитов строки длинные, и
        // без неё на телефоне горизонтально уезжала бы вся страница.
        <div className="r-inset mt-5 overflow-x-auto border border-border">
          <table className="w-full min-w-[520px] border-collapse text-[14px]">
            <thead>
              <tr className="bg-muted/60">
                {block.head.map((h) => (
                  <th
                    key={h}
                    className="border-b border-border px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {row.map((cell, j) => (
                    <td
                      key={j}
                      className={
                        j === 0
                          ? "px-4 py-3 align-top font-medium leading-[1.6]"
                          : "px-4 py-3 align-top leading-[1.6] text-foreground/80"
                      }
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export function DocSection({ section }: { section: LegalSection }) {
  return (
    <section id={section.id} className="scroll-mt-28 border-t border-border pt-8 first:border-0 first:pt-0">
      <h2 className="font-display text-[21px] font-medium leading-snug tracking-tight">
        {section.title}
      </h2>
      {section.blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </section>
  );
}
