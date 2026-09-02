import { ArrowLeft, Download, FileText } from "lucide-react";
import { LEGAL_BY_SLUG, LEGAL_DOCS } from "../../data/legal";
import { LEGAL_UPDATED } from "../../data/org";
import { go } from "../../lib/route";
import { scrollToSection } from "../../lib/useSmoothScroll";
import { NotFoundScreen } from "../NotFoundScreen";
import { DocSection } from "./DocBody";

/**
 * Правовой раздел: список документов и сам документ.
 *
 * Один экран на оба состояния, потому что отличаются они только содержимым —
 * заводить ради этого второй компонент со своей шапкой и своими отступами
 * значит развести два оформления одного и того же места.
 */
export function LegalScreen({ slug }: { slug?: string }) {
  const doc = slug ? LEGAL_BY_SLUG[slug] : undefined;

  // Документ назван, но такого у нас нет. Показать вместо него список — значит
  // сделать вид, что человек сам пришёл за списком: он читал договор, перешёл
  // по ссылке из своей переписки и должен понять, что ссылка устарела, а не
  // гадать, тот ли документ перед ним.
  if (slug && !doc) {
    return (
      <NotFoundScreen
        caption="Ошибка 404"
        title="Такого документа нет"
        action={{ label: "Все документы", onClick: () => go("/legal") }}
      >
        Ссылка могла устареть: документы мы переписываем, а коды у них
        постоянные. Действующая редакция каждого — в списке правового раздела.
      </NotFoundScreen>
    );
  }

  if (!doc) return <LegalIndex />;

  return (
    <div
      data-print="page"
      className="mx-auto max-w-[1100px] px-4 pb-24 pt-28 sm:px-6 sm:pt-32"
    >
      <div data-print="hide" className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={() => go("/legal")}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="size-3.5" />
          Все документы
        </button>

        {/*
         * PDF-версия документа собирается печатью браузера, а не лежит файлом.
         * Файл пришлось бы обновлять руками при каждой правке текста — и рано
         * или поздно скачанный PDF разошёлся бы с тем, что написано на
         * странице. Здесь источник один: печатается ровно то, что человек
         * только что прочитал, с датой редакции и реквизитами. Оформление
         * бумажной версии задано в `site.css`, блок `@media print`.
         */}
        <button
          onClick={() => window.print()}
          title="Откроется окно печати — выберите «Сохранить как PDF»"
          className="inline-flex h-9 items-center gap-2 rounded-full border border-border px-4 text-[13px] font-medium transition-colors hover:border-primary/50 hover:text-primary"
        >
          <Download className="size-3.5" />
          Скачать PDF
        </button>
      </div>

      <div data-print="doc" className="mt-8 grid gap-12 lg:grid-cols-[minmax(0,1fr)_240px]">
        <article className="min-w-0">
          <h1 className="font-display text-[28px] font-medium leading-[1.1] tracking-[-0.02em] sm:text-[34px]">
            {doc.title}
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">{doc.lead}</p>
          <p className="mt-5 border-l-2 border-border pl-4 text-[13px] leading-relaxed text-muted-foreground">
            {doc.basis}. Редакция от {LEGAL_UPDATED}.
          </p>

          <div className="mt-10 flex flex-col gap-10">
            {doc.sections.map((s) => (
              <DocSection key={s.id} section={s} />
            ))}
          </div>
        </article>

        {/* Оглавление липкое и только на широком экране: на телефоне оно
            превратилось бы в вертикальный список во весь первый экран, до
            которого пришлось бы прокручивать сам документ. */}
        <nav data-print="hide" className="hidden lg:block">
          <div className="sticky top-24">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              В документе
            </p>
            <div className="mt-3 flex flex-col gap-1.5 border-l border-border">
              {doc.sections.map((s) => (
                // Кнопка, а не ссылка с якорем: адрес страницы — это хэш, и
                // `href="#general"` увёл бы роутер с документа на лендинг.
                <button
                  key={s.id}
                  onClick={() => {
                    const target = document.getElementById(s.id);
                    if (target) scrollToSection(target);
                  }}
                  className="-ml-px border-l border-transparent pl-3 text-left text-[13px] leading-snug text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  {s.title}
                </button>
              ))}
            </div>
          </div>
        </nav>
      </div>
    </div>
  );
}

function LegalIndex() {
  return (
    <div className="mx-auto max-w-4xl px-4 pb-24 pt-28 sm:px-6 sm:pt-32">
      <h1 className="font-display text-[30px] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[40px]">
        Правовая информация
      </h1>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
        Семь документов, которые описывают Уклад с юридической стороны: кто
        владеет сервисом, на каких условиях им пользуются, что происходит с
        данными и по каким правилам сортируется витрина. Все редакции —
        от {LEGAL_UPDATED}.
      </p>

      {/*
       * Плотность здесь важнее красоты сетки. В карточке четыре строки текста
       * подряд: иконка, название документа, о чём он и на чём основан, — и на
       * поле в 20 точек они слипались в один серый прямоугольник. Поля выросли
       * до 28, промежутки между карточками — вдвое, а строка основания прижата
       * к низу карточки (`mt-auto`): в ряду они встают на одну линию, и между
       * текстом и ею появляется просвет, а не случайный отступ.
       */}
      <div className="mt-10 grid gap-5 sm:grid-cols-2 sm:gap-6">
        {LEGAL_DOCS.map((doc) => (
          <button
            key={doc.slug}
            onClick={() => go(`/legal/${doc.slug}`)}
            className="r-window group flex flex-col border border-border bg-card p-6 text-left transition-colors hover:border-primary/40 sm:p-7"
          >
            <FileText className="size-5 text-primary" />
            <h2 className="mt-5 font-display text-[16px] font-medium leading-snug tracking-tight">
              {doc.title}
            </h2>
            <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{doc.lead}</p>
            <p className="mt-auto pt-6 text-[11px] leading-snug text-muted-foreground/70">
              {doc.basis}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
