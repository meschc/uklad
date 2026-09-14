import { useState } from "react";
import { ArrowLeft, Download, FileText, Languages } from "lucide-react";
import { LEGAL_BY_SLUG, LEGAL_DOCS } from "../../data/legal";
import type { LegalDoc } from "../../data/legal/types";
import { LEGAL_UPDATED } from "../../data/org";
import { c, fill, useT } from "../../lib/copy";
import { searchDoc } from "../../lib/legalSearch";
import { href } from "../../lib/route";
import { NotFoundScreen } from "../NotFoundScreen";
import { DocSection } from "./DocBody";
import { DocSearch } from "./DocSearch";

/**
 * Обвязка правового раздела переведена, сами документы — нет, и это не
 * недоделка. Договор, оферта и политика обработки данных имеют силу в той
 * редакции, в которой написаны; перевод рядом с оригиналом читается как вторая
 * редакция того же документа, и первый же спор упрётся в вопрос, какая из них
 * настоящая. Поэтому английская версия честно предупреждает, что дальше —
 * русский текст, и не делает вид, что предлагает перевод.
 */
/** Подпись под документом. Одноязычна намеренно — см. место применения. */
const VERSION_LINE = "Редакция от {date}.";

const T = {
  notFoundCaption: c("Ошибка 404", "Error 404"),
  notFoundTitle: c("Такого документа нет", "No such document"),
  notFoundBody: c(
    "Ссылка могла устареть: документы мы переписываем, а коды у них постоянные. Действующая редакция каждого — в списке правового раздела.",
    "The link may be stale: we rewrite the documents, but their codes stay the same. The current version of each is in the list.",
  ),
  allDocs: c("Все документы", "All documents"),
  printHint: c(
    "Откроется окно печати — выберите «Сохранить как PDF»",
    "Opens the print dialog — choose “Save as PDF”",
  ),
  download: c("Скачать PDF", "Download PDF"),
  ruOnly: c(
    "",
    "The legal documents are in Russian: they are binding in the language they were written in, and a translation alongside would read as a second version.",
  ),
  inDoc: c("В документе", "In this document"),
  indexTitle: c("Правовая информация", "Legal information"),
  indexLead: c(
    "Семь документов, которые описывают Уклад с юридической стороны: кто владеет сервисом, на каких условиях им пользуются, что происходит с данными и по каким правилам сортируется витрина. Все редакции — от {date}.",
    "Seven documents describing Uklad from the legal side: who owns the service, on what terms it is used, what happens to data and how the catalogue is ordered. All of them are in Russian, version of {date}.",
  ),
};

/**
 * Правовой раздел: список документов и сам документ.
 *
 * Один экран на оба состояния, потому что отличаются они только содержимым —
 * заводить ради этого второй компонент со своей шапкой и своими отступами
 * значит развести два оформления одного и того же места.
 */
export function LegalScreen({ slug }: { slug?: string }) {
  const t = useT();
  const doc = slug ? LEGAL_BY_SLUG[slug] : undefined;

  // Документ назван, но такого у нас нет. Показать вместо него список — значит
  // сделать вид, что человек сам пришёл за списком: он читал договор, перешёл
  // по ссылке из своей переписки и должен понять, что ссылка устарела, а не
  // гадать, тот ли документ перед ним.
  if (slug && !doc) {
    return (
      <NotFoundScreen
        caption={t(T.notFoundCaption)}
        title={t(T.notFoundTitle)}
        action={{ label: t(T.allDocs), to: "/legal" }}
      >
        {t(T.notFoundBody)}
      </NotFoundScreen>
    );
  }

  if (!doc) return <LegalIndex />;

  // `key` по коду документа — не украшение. Переходы внутри витрины идут без
  // перезагрузки: с одного документа на другой компонент переживает, и набранный
  // запрос вместе с подсветкой переехал бы в чужой текст. `key` заставляет React
  // собрать вид заново, и поиск начинается с чистого поля.
  return <LegalDocView key={doc.slug} doc={doc} />;
}

function LegalDocView({ doc }: { doc: LegalDoc }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const hits = searchDoc(doc, query);

  return (
    <div data-print="page" className="mx-auto max-w-[1100px] px-4 pb-24 pt-28 sm:px-6 sm:pt-32">
      <div data-print="hide" className="flex flex-wrap items-center justify-between gap-3">
        <a
          href={href("/legal")}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="size-3.5" />
          {t(T.allDocs)}
        </a>

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
          title={t(T.printHint)}
          className="inline-flex h-9 items-center gap-2 rounded-full border border-border px-4 text-[13px] font-medium transition-colors hover:border-primary/50 hover:text-primary"
        >
          <Download className="size-3.5" />
          {t(T.download)}
        </button>
      </div>

      <div data-print="doc" className="mt-8 grid gap-12 lg:grid-cols-[minmax(0,1fr)_240px]">
        {/* `lang="ru"` не украшение: документ остаётся русским на английской
            версии, и без явной пометки браузер предложит прочитать его вслух
            по-английски, а поисковик посчитает страницу английской. */}
        <article className="min-w-0" lang="ru">
          <h1 className="font-display text-[28px] font-medium leading-[1.1] tracking-[-0.02em] sm:text-[34px]">
            {doc.title}
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">{doc.lead}</p>
          {/* Подпись под документом всегда русская: она стоит в одном
              предложении с основанием (`doc.basis`), и «…Гражданского кодекса
              Российской Федерации. Version of 27 August 2026» читалось бы как
              недоперевод. Английскому читателю ту же дату сообщает список
              документов и врезка ниже. */}
          <p className="mt-5 border-l-2 border-border pl-4 text-[13px] leading-relaxed text-muted-foreground">
            {doc.basis}. {fill(VERSION_LINE, { date: LEGAL_UPDATED.ru })}
          </p>

          {t.lang === "en" && (
            <p
              data-print="hide"
              lang="en"
              className="mt-5 flex items-start gap-2.5 border border-border bg-muted/40 p-4 text-[13px] leading-relaxed text-muted-foreground r-inset"
            >
              <Languages className="mt-0.5 size-4 shrink-0 text-primary" />
              {t(T.ruOnly)}
            </p>
          )}

          {/* Поиск стоит в колонке документа, а не в боковом оглавлении:
              оглавление скрыто на телефоне, а документ на телефоне читают
              чаще всего. */}
          <DocSearch value={query} onChange={setQuery} hits={hits} />

          <div className="mt-10 flex flex-col gap-10">
            {doc.sections.map((s) => (
              <DocSection key={s.id} section={s} query={hits.query} />
            ))}
          </div>
        </article>

        {/* Оглавление липкое и только на широком экране: на телефоне оно
            превратилось бы в вертикальный список во весь первый экран, до
            которого пришлось бы прокручивать сам документ. */}
        <nav data-print="hide" className="hidden lg:block">
          <div className="sticky top-24">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t(T.inDoc)}
            </p>
            <div lang="ru" className="mt-3 flex flex-col gap-1.5 border-l border-border">
              {/* Настоящие якоря: страница живёт на пути, и хэш свободен.
                  Раньше здесь стояли кнопки — из оглавления договора нельзя
                  было скопировать ссылку на пункт, а именно этим оглавление и
                  полезно, когда на пункт нужно сослаться. */}
              {doc.sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="-ml-px border-l border-transparent pl-3 text-left text-[13px] leading-snug text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  {s.title}
                </a>
              ))}
            </div>
          </div>
        </nav>
      </div>
    </div>
  );
}

function LegalIndex() {
  const t = useT();

  return (
    <div className="mx-auto max-w-4xl px-4 pb-24 pt-28 sm:px-6 sm:pt-32">
      <h1 className="font-display text-[30px] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[40px]">
        {t(T.indexTitle)}
      </h1>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
        {t(T.indexLead, { date: t(LEGAL_UPDATED) })}
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
          <a
            key={doc.slug}
            lang="ru"
            href={href(`/legal/${doc.slug}`)}
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
          </a>
        ))}
      </div>
    </div>
  );
}
