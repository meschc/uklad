/**
 * Блок страницы склада: тихий заголовок и содержимое под ним.
 *
 * Жил внутри `WarehouseScreen`, пока был нужен только ей. Переехал сюда, когда
 * отзывы и жалобы стали отдельным файлом: два одинаковых заголовка в двух
 * файлах разъезжаются на первой же правке отступа, и страница начинает
 * выглядеть склеенной из кусков.
 */
export function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}
