import { Footnote } from "./Footnote";

/**
 * Блок страницы склада: заголовок в стиле страниц витрины и содержимое под
 * ним. Пояснение к блоку — сноской у заголовка (`note`), а не серой
 * подписью внизу (Кирилл 26 окт).
 *
 * Общий для страницы склада и отзывов: два одинаковых заголовка в двух файлах
 * разъезжаются на первой же правке отступа.
 */
export function Block({
  title,
  note,
  children,
}: {
  title: string;
  note?: { n: number; body: React.ReactNode };
  children: React.ReactNode;
}) {
  return (
    <section className="mt-14 first:mt-0">
      <h2 className="mb-5 text-[22px] font-medium leading-tight tracking-[-0.02em]">
        {title}
        {note && <Footnote n={note.n}>{note.body}</Footnote>}
      </h2>
      {children}
    </section>
  );
}
