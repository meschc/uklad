import { useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { c, useT } from "../../lib/copy";

const T = { label: c("Пояснение {n}", "Note {n}") };

/** Ширина подсказки и поле до края экрана. */
const TIP_W = 320;
const EDGE = 16;

/**
 * Сноска (Кирилл 26 окт): вместо серой подписи под блоком — маленькая цифра
 * у заголовка, пояснение всплывает при наведении или фокусе. Подпись не
 * пропала, просто не занимает место у тех, кому она не нужна. С клавиатуры и
 * на телефоне открывается фокусом (касанием), ссылки внутри доступны.
 *
 * Закрытая подсказка не отрисовывается (`hidden`), а открытая сдвигается
 * влево, если не влезает: сноска у правого края телефона иначе раздвигала
 * страницу вбок. Текст остаётся в разметке — на него ссылается
 * `aria-describedby`, и предрендер отдаёт его поисковику. Зазор между цифрой
 * и подсказкой закрыт невидимым мостиком (`before:`), иначе курсор по пути к
 * ссылке внутри подсказки закрывал бы её.
 */
export function Footnote({ n, children }: { n: number; children: React.ReactNode }) {
  const t = useT();
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);

  const show = () => {
    const box = wrap.current?.getBoundingClientRect();
    if (box) {
      const room = document.documentElement.clientWidth - EDGE;
      const w = Math.min(TIP_W, room - EDGE);
      setShift(Math.min(0, room - (box.left + w)));
    }
    setOpen(true);
  };

  return (
    <span
      ref={wrap}
      onMouseEnter={show}
      onMouseLeave={() => setOpen(false)}
      onFocus={show}
      onBlur={(e) => {
        if (!wrap.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
      className="relative ml-1 inline-block align-super text-[13px] font-normal leading-none tracking-normal"
    >
      <button
        type="button"
        aria-label={t(T.label, { n })}
        aria-describedby={id}
        aria-expanded={open}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className={cn(
          "grid size-[18px] place-items-center rounded-full text-[11px] font-medium tabular-nums transition-colors focus-visible:outline-none",
          open
            ? "bg-[var(--wh-blue)] text-white"
            : "bg-[var(--wh-soft)] text-[var(--wh-blue)] hover:bg-[var(--wh-blue)] hover:text-white",
        )}
      >
        {n}
      </button>
      <span
        id={id}
        role="tooltip"
        style={{ left: shift, width: `min(${TIP_W}px, calc(100vw - ${EDGE * 2}px))` }}
        className={cn(
          "absolute top-full z-50 mt-2 rounded-2xl before:absolute before:inset-x-0 before:-top-2 before:h-2 before:content-[''] bg-white p-4 text-left text-[13px] leading-relaxed text-[var(--wh-ink)] shadow-[0_18px_50px_-12px_rgba(16,24,40,0.25),0_0_0_1px_rgba(16,24,40,0.06)]",
          open ? "wh-swap block" : "hidden",
        )}
      >
        {children}
      </span>
    </span>
  );
}
