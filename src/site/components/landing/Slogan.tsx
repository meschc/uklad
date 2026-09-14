import { MARKETPLACES } from "../../data/marketplaces";
import { warehousesRepository } from "../../data/warehousesRepository";
import { Reveal } from "../Reveal";
import { c, useT } from "../../lib/copy";

const schemes = ["FBO", "FBS", "DBS"];

const T = {
  titleTop: c("Диверсификация товара —", "Spreading your goods —"),
  titleAccent: c("будущее продаж", "the future of selling"),
  why: c(
    "Один канал сбыта — один риск: площадка меняет правила, и выручка уходит следом. Товар на нескольких площадках так не проседает.",
    "One channel is one risk: the marketplace changes the rules and the revenue follows. Goods spread across several marketplaces don’t sag like that.",
  ),
  catchStart: c(
    "Упирается это в склад: у площадок разная маркировка, окна поставки и требования к коробке. Склады с витрины отгружают на",
    "It comes down to the warehouse: every marketplace has its own labelling, delivery windows and box rules. Warehouses here ship to",
  ),
  catchEnd: c("из одной партии — по одной заявке.", "from a single batch — on one request."),
  listed: c("на витрине", "listed"),
};

/**
 * Слоган — единственное место на странице, где сказано не «что мы делаем», а
 * «зачем это вообще».
 *
 * Одной фразой обойтись было нельзя. «Диверсификация товара — будущее продаж»
 * сама по себе — тезис без опоры: с ней невозможно ни спорить, ни согласиться,
 * потому что непонятно, о чём речь. Поэтому под слоганом стоит его причина
 * (один канал — один риск) и то, обо что диверсификация спотыкается на
 * практике, — склад. Так фраза перестаёт быть лозунгом и становится переходом
 * к витрине, которая идёт следом.
 *
 * Секция намеренно почти пустая: ни рамки, ни подложки, ни картинки. Это пауза
 * между демонстрацией продукта и каталогом складов — единственное место, где
 * воздух работает сам.
 */
export function Slogan() {
  const t = useT();
  const count = MARKETPLACES.length;
  const { total } = warehousesRepository.stats();

  return (
    <section id="slogan" className="mx-auto max-w-4xl px-4 py-28 text-center sm:px-6 sm:py-36">
      <Reveal>
        <p className="font-display text-[30px] font-medium leading-[1.08] tracking-[-0.025em] sm:text-[46px]">
          {t(T.titleTop)}
          <br />
          <span className="text-brand-strong">{t(T.titleAccent)}</span>
        </p>
      </Reveal>

      <Reveal delay={100}>
        <p className="mx-auto mt-7 max-w-2xl text-[15px] leading-relaxed text-muted-foreground sm:text-[17px]">
          {t(T.why)}
        </p>
      </Reveal>

      <Reveal delay={160}>
        <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-muted-foreground sm:text-[17px]">
          {t(T.catchStart)} {count}{" "}
          {t.plural(count, ["площадку", "площадки", "площадок"], ["marketplace", "marketplaces"])}{" "}
          {t(T.catchEnd)}
        </p>
      </Reveal>

      {/* Три схемы работы строкой: слоган заканчивается не восклицательным
          знаком, а фактом, который можно проверить на витрине через экран. */}
      <Reveal delay={220} className="mt-10 flex flex-wrap items-center justify-center gap-2">
        {schemes.map((s) => (
          <span
            key={s}
            className="inline-flex h-8 items-center rounded-full border border-border px-3.5 font-mono text-[11px] tracking-wide text-muted-foreground"
          >
            {s}
          </span>
        ))}
        <span className="inline-flex h-8 items-center rounded-full border border-border px-3.5 text-[12px] text-muted-foreground">
          {total} {t.plural(total, ["склад", "склада", "складов"], ["warehouse", "warehouses"])}{" "}
          {t(T.listed)}
        </span>
      </Reveal>
    </section>
  );
}
