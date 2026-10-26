import { c, useT } from "../../lib/copy";

const T = { label: c("Пояснение {n}", "Note {n}") };

/**
 * Сноска (Кирилл 26 окт): вместо серой подписи под блоком — маленькая цифра
 * у заголовка, пояснение всплывает при наведении или фокусе. Подпись не
 * пропала, просто не занимает место у тех, кому она не нужна. С клавиатуры и
 * на телефоне открывается фокусом (касанием), ссылки внутри доступны.
 */
export function Footnote({ n, children }: { n: number; children: React.ReactNode }) {
  const t = useT();
  return (
    <span className="group/note relative ml-1 inline-block align-super text-[13px] font-normal leading-none tracking-normal">
      <button
        type="button"
        aria-label={t(T.label, { n })}
        className="grid size-[18px] place-items-center rounded-full bg-[var(--wh-soft)] text-[11px] font-medium tabular-nums text-[var(--wh-blue)] transition-colors hover:bg-[var(--wh-blue)] hover:text-white focus-visible:bg-[var(--wh-blue)] focus-visible:text-white focus-visible:outline-none"
      >
        {n}
      </button>
      <span
        role="tooltip"
        className="invisible absolute left-0 top-full z-50 mt-2 w-[min(20rem,80vw)] translate-y-1 rounded-2xl bg-white p-4 text-left text-[13px] leading-relaxed text-[var(--wh-ink)] opacity-0 shadow-[0_18px_50px_-12px_rgba(16,24,40,0.25),0_0_0_1px_rgba(16,24,40,0.06)] transition-[opacity,transform,visibility] duration-200 group-focus-within/note:visible group-focus-within/note:translate-y-0 group-focus-within/note:opacity-100 group-hover/note:visible group-hover/note:translate-y-0 group-hover/note:opacity-100"
      >
        {children}
      </span>
    </span>
  );
}
