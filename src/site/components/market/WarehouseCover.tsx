import { cn } from "@/lib/utils";
import { warehouseTint } from "../../lib/warehouseTint";
import { useT } from "../../lib/copy";
import type { Warehouse } from "../../data/warehouses";

/**
 * Обложка склада: фотография, если она есть, иначе — плита в собственном
 * оттенке склада с первой буквой названия.
 *
 * Слот один и той же высоты у всех складов, и это главное решение. Список, где
 * у одной карточки картинка, а у соседней на её месте пусто, читается не как
 * «разные склады», а как «часть изображений не загрузилась». Плита — не
 * заглушка на время, пока не приехало фото, а второй полноправный вид обложки:
 * тот же приём, что и у знака склада, только крупно.
 *
 * Снимки — общедоступные фотографии складов (авторы и лицензии в
 * `public/photos/warehouses/CREDITS.md`), а не съёмка этих компаний: витрина
 * демонстрационная, компаний за ней нет. Поэтому `alt` пустой — для читалки
 * это оформление, а не факт о складе; произносить «фотография склада Куб
 * Логистик» было бы прямым враньём в озвучке.
 */
export function WarehouseCover({
  warehouse: w,
  className,
}: {
  warehouse: Warehouse;
  className?: string;
}) {
  const t = useT();
  const shape = cn("aspect-[5/2] w-full shrink-0 overflow-hidden", className);

  if (!w.photo) {
    return (
      <div
        aria-hidden="true"
        className={cn(shape, "relative grid place-items-center")}
        style={warehouseTint(w.hue)}
      >
        <span className="font-display text-5xl font-medium">{t(w.name).slice(0, 1)}</span>
        {/* Ровная заливка рядом с фотографиями читается как дырка в вёрстке.
            Слабая диагональ из угла в угол даёт плите тот же один источник
            света, что и снимкам, — этого хватает, чтобы она встала в ряд. */}
        <span className="absolute inset-0 bg-gradient-to-br from-white/[0.06] to-black/25" />
      </div>
    );
  }

  return (
    <div className={cn(shape, "bg-muted")}>
      <img
        // BASE_URL, а не «/photos/…»: при сборке в подкаталог абсолютный путь
        // от корня ведёт в никуда.
        src={`${import.meta.env.BASE_URL}photos/warehouses/${w.photo}`}
        alt=""
        loading="lazy"
        decoding="async"
        width={1200}
        height={675}
        className="size-full object-cover"
      />
    </div>
  );
}
