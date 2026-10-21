import { ru, useT } from "../../lib/copy";
import { href } from "../../lib/route";
import { LogoMark } from "../Logo";

const T = {
  brand: ru("Уклад"),
  forWarehouses: ru("Для складов"),
  pricing: ru("Тарифы"),
  roadmap: ru("Дорожная карта"),
  connect: ru("Подключить склад"),
};

/**
 * Шапка дорожной карты — та же, что выезжает на странице для складов
 * (`warehouses/StickyNav`), только закреплена всегда: первого синего экрана
 * здесь нет, прятать её не за чем. Общая шапка витрины здесь не выводится —
 * страница в новом стиле целиком (Кирилл, 20 окт).
 */
export function RoadmapHeader() {
  const t = useT();
  return (
    <header className="sticky top-0 z-40 h-16 border-b border-[var(--wh-line)] bg-[color-mix(in_srgb,var(--wh-ground)_88%,transparent)] backdrop-blur-md">
      <div className="flex h-full items-center justify-between gap-6 px-4 lg:px-8">
        <a
          href={href("/")}
          className="flex items-center gap-2 text-lg font-semibold tracking-tight"
        >
          <LogoMark className="rounded-lg" />
          {t(T.brand)}
          <span className="hidden font-normal text-[var(--wh-muted)] sm:inline">
            · {t(T.roadmap)}
          </span>
        </a>
        <nav className="flex items-center gap-8 text-sm">
          <a
            href={href("/warehouses/")}
            className="wh-muted hidden hover:text-[var(--wh-ink)] md:inline"
          >
            {t(T.forWarehouses)}
          </a>
          <a
            href={`${href("/warehouses/")}#tariffs`}
            className="wh-muted hidden hover:text-[var(--wh-ink)] md:inline"
          >
            {t(T.pricing)}
          </a>
          <a
            href={`${href("/warehouses/")}#connect`}
            className="wh-btn wh-btn--blue !h-10 !px-[18px] !text-sm"
          >
            {t(T.connect)}
          </a>
        </nav>
      </div>
    </header>
  );
}
