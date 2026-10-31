import { useState } from "react";
import { CornerDownLeft } from "lucide-react";
import { c, useT } from "../lib/copy";
import { go, href } from "../lib/route";
import { suggestPages } from "../lib/suggestPath";

const T = {
  label: c("Адрес страницы", "Page address"),
  go: c("Перейти", "Go"),
  maybe: c("Например:", "Try:"),
};

/** Домен в строке адреса — только подпись, его не правят. */
const HOST = "u-klad.ru/";

/**
 * Строка адреса на 404 (идея Кирилла 30 окт). Сверху — адрес, который не
 * открылся: домен серым, путь синим, и путь правится прямо здесь — опечатку
 * в `/pricng` проще исправить, чем искать страницу в меню. Enter переходит.
 * Под строкой — живые страницы, похожие на набранное; они пересчитываются по
 * ходу ввода, поэтому строка сама подсказывает, что можно ввести.
 *
 * Путь берётся из адреса браузера: 404 предрендерена одним файлом на все
 * неизвестные адреса, и на сборке пути ещё нет.
 */
export function AddressBar() {
  const t = useT();
  // Витрина в браузере не гидратируется, а рисуется заново (`createRoot`),
  // поэтому адрес можно прочесть сразу; на сборке окна нет — пусто.
  const [path, setPath] = useState(() =>
    typeof window === "undefined"
      ? ""
      : window.location.pathname.replace(/^\/+/, "").replace(/^en(\/|$)/, ""),
  );

  const hints = suggestPages(path);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // Только буквы, цифры и `-_./%`: обратный слеш и табы браузер читает
    // как `//`, и pushState на «чужой» адрес бросил бы исключение.
    const clean = path.replace(/[^\p{L}\p{N}\-_./%]/gu, "").replace(/^\/+/, "");
    try {
      go(`/${clean}`);
    } catch {
      go("/");
    }
  };

  return (
    <div className="wh-swap">
      <form
        onSubmit={submit}
        className="flex h-14 items-center gap-1 rounded-full bg-[var(--wh-soft)] pl-5 pr-2 font-mono text-[15px] transition-shadow focus-within:shadow-[0_0_0_2px_var(--wh-blue)] sm:text-base"
      >
        <label htmlFor="address-path" className="shrink-0 text-[var(--wh-muted)]">
          <span className="sr-only">{t(T.label)}: </span>
          {HOST}
        </label>
        <input
          id="address-path"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          placeholder="pricing"
          className="min-w-0 flex-1 bg-transparent text-[var(--wh-blue)] outline-none placeholder:text-[var(--wh-muted)]/50"
        />
        <button
          type="submit"
          aria-label={t(T.go)}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--wh-blue)] text-white transition-colors hover:bg-[var(--wh-blue-deep)]"
        >
          <CornerDownLeft className="size-4" />
        </button>
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-2 pl-1 text-sm">
        <span className="text-[var(--wh-muted)]">{t(T.maybe)}</span>
        {hints.map((h) => (
          <a
            key={h.to}
            href={href(h.to)}
            onMouseEnter={() => setPath(h.to.replace(/^\//, ""))}
            className="inline-flex h-8 items-center gap-2 rounded-full bg-[var(--wh-soft)] px-3 transition-colors hover:bg-[var(--wh-line)]"
          >
            {t(h.label)}
            <span className="font-mono text-xs text-[var(--wh-muted)]">{h.to}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
