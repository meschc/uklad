import { ArrowLeft, BadgeCheck, Building2, Check, Clock, MapPin, Ruler, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandMark } from "../BrandMark";
import { ChatPanel } from "../ChatPanel";
import { NotFoundScreen } from "../NotFoundScreen";
import { Block } from "./Block";
import { Footnote } from "./Footnote";
import { RequestForm } from "./RequestForm";
import { WarehouseAvatar } from "./WarehouseAvatar";
import { WarehouseReputation } from "./WarehouseReputation";
import { WarehouseCover } from "./WarehouseCover";
import { MARKETPLACE_BY_ID, SCHEMES, SERVICE_BY_ID } from "../../data/marketplaces";
import { money, monthlyPerPlace, occupancy } from "../../data/warehouses";
import { warehousesRepository } from "../../data/warehousesRepository";
import { PAGE_NOW, shortDate } from "../../lib/date";
import { freshness } from "../../lib/freshness";
import { warehouseSeoText } from "../../lib/warehouseSeoText";
import { PREVIEW_ID, readCabinetShowcase } from "../../lib/cabinetShowcase";
import { href } from "../../lib/route";
import { Reveal } from "../Reveal";
import { c, useT, type Copy, type TFunc } from "../../lib/copy";
import type { Warehouse } from "../../data/warehouses";

/**
 * Регион и город одной строкой.
 *
 * У Москвы и Петербурга регион совпадает с городом — они сами себе субъекты
 * федерации, — и без этой проверки в шапке карточки печаталось «Москва,
 * Москва».
 */
function place(t: TFunc, w: Warehouse): string {
  const region = t(w.region);
  const city = t(w.cityTitle);
  return region === city ? city : `${region}, ${city}`;
}

/** Шаги до первой поставки — одинаковые у всех складов витрины. */
const START: { title: Copy; body: Copy }[] = [
  {
    title: c("Заявка", "Request"),
    body: c(
      "Оставляете объём, тип товара и дату. Звонить и договариваться лично не нужно.",
      "You leave the volume, the type of goods and a date. No calls, no personal deals.",
    ),
  },
  {
    title: c("Подтверждение склада", "The warehouse confirms"),
    body: c(
      "Склад отвечает, сможет ли принять, и присылает условия под ваш товар: габариты, режим хранения, упаковка.",
      "It says whether it can take the goods and sends terms for them: sizes, storage mode, packing.",
    ),
  },
  {
    title: c("Документы", "Documents"),
    body: c(
      "Договор и приложение с прайсом подписываются в ЭДО, из кабинета. Бумагу возить не нужно.",
      "The contract and the price annex are signed electronically, from your account. No paper to carry.",
    ),
  },
  {
    title: c("Поставка", "Delivery"),
    body: c(
      "Согласуете дату отгрузки, склад принимает товар и присылает отчёт о приёмке — с расхождениями, если были.",
      "You agree a date, the warehouse takes the goods and sends an intake report — with any discrepancies.",
    ),
  },
];

const T = {
  back: c("Все склады", "All warehouses"),
  photo: c("Фото для примера", "Sample photo"),
  previewBar: c(
    "Предпросмотр: так селлеры увидят ваш склад на витрине. Данные берутся из кабинета, обновите страницу после правок.",
    "Preview: this is how sellers will see your warehouse. Data comes from your account; reload after edits.",
  ),
  noPreviewTitle: c("Нечего показать", "Nothing to preview"),
  noPreviewBody: c(
    "Предпросмотр собирается из кабинета в этом же браузере. Откройте кабинет и нажмите «Посмотреть на витрине».",
    "The preview is built from your account in this browser. Open the account and press “View on the marketplace”.",
  ),
  photoNote: c(
    "Фотография из открытых источников: так выглядит склад вообще, а не эта площадка.",
    "A stock photo: this is what a warehouse looks like, not this particular site.",
  ),
  verified: c("Проверен Укладом", "Verified by Uklad"),
  meta: c("{legal} · на рынке с {y} года · {place}", "{legal} · since {y} · {place}"),
  reviews: c("{n} {word}", "{n} {word}"),
  noReviews: c("отзывов пока нет", "no reviews yet"),
  hours: c("{n} ч", "{n} h"),
  sqm: c("{n} м²", "{n} m²"),
  answer: c("средний ответ", "average reply"),
  area: c("площадь склада", "warehouse floor"),
  free: c("свободно из {n}", "free of {n}"),
  checked: c("Что проверил Уклад", "What Uklad checked"),
  // У непроверенного склада заголовок другой: «Что проверил Уклад» над словами
  // «Уклад его не проверял» — это вопрос, на который тут же отвечают «ничего».
  notCheckedTitle: c("Склад не проверен", "Not checked by Uklad"),
  regLine: c(
    "{legal} — {form}, регистрация сверена по {registry}.",
    "{legal} — {form}, registration verified against {registry}.",
  ),
  useLine: c(
    "Право пользования площадкой по адресу {addr} — подтверждено документами.",
    "The right to use the site at {addr} is confirmed by documents.",
  ),
  ukladLine: c(
    "Склад работает на учётной системе Уклада: свободные места и статусы поставок берутся из неё, а не со слов склада.",
    "The warehouse runs on Uklad’s system: free slots and delivery statuses come from it, not from the warehouse’s word.",
  ),
  notChecked: c(
    "Этот склад Уклад не проверял. Всё в карточке склад сообщил о себе сам. Выписку из реестра и документы на помещение стоит запросить у него до договора.",
    "Uklad has not checked this warehouse. Everything here it says about itself. Ask it for the register extract and the premises documents before you sign.",
  ),
  notGuarantee: c(
    "Проверка — не поручительство. Договор вы заключаете напрямую со складом, и за услуги, сроки и сохранность товара отвечает он. Уклад не берёт комиссию и не принимает за склад деньги.",
    "A check is not a guarantee. You contract directly with the warehouse, and it answers for the service, the deadlines and your goods. Uklad takes no commission and holds no money for it.",
  ),
  how: c("Как это устроено", "How this works"),
  start: c("Как начнётся работа", "How work starts"),
  eSign: c(
    "Договор, приложения и акты приёмки подписываются электронной подписью — через Диадок или СБИС, к которым подключён склад.",
    "The contract, annexes and intake reports are signed electronically — via Diadoc or SBIS, whichever the warehouse uses.",
  ),
  priceTitle: c("Прайс", "Price list"),
  storage: c("Хранение", "Storage"),
  storageUnit: c("место в сутки", "slot a day"),
  receiving: c("Приёмка", "Intake"),
  receivingUnit: c("за короб", "per box"),
  picking: c("Сборка заказа", "Order picking"),
  pickingUnit: c("за заказ", "per order"),
  marking: c("Маркировка", "Labelling"),
  markingUnit: c("за единицу", "per item"),
  perMonth: c("Одно место в месяц", "One slot a month"),
  base: c(
    "Это базовые ставки — по ним склады сравниваются между собой. Хрупкий, негабаритный или требующий режима товар склад считает отдельно: условия под ваш товар приходят вместе с подтверждением заявки, до договора.",
    "These are the base rates warehouses are compared by. Fragile, oversized or climate-controlled goods are priced separately: terms for your goods arrive with the request confirmation, before any contract.",
  ),
  noMin: c(
    "Минимального объёма нет — можно начать с одного места.",
    "No minimum volume — one slot is enough to start.",
  ),
  min: c("Минимальный объём — от {n} мест хранения.", "Minimum volume — {n} storage slots."),
  freshLive: c(
    "Свободные места и тарифы идут из системы склада: он работает на Укладе, и числа здесь меняются вместе с приёмками.",
    "Free slots and rates come from the warehouse's own system: it runs on Uklad, so the numbers here change with every intake.",
  ),
  freshOk: c(
    "Склад подтвердил тарифы и свободные места {date}.",
    "The warehouse confirmed its rates and free slots on {date}.",
  ),
  freshStale: c(
    "Склад не подтверждал тарифы и свободные места с {date}: цену стоит переспросить в заявке.",
    "The warehouse has not confirmed its rates or free slots since {date}: worth asking about the price in your request.",
  ),
  payment: c(
    "Оплата — по факту месяца, постоплатой, без депозита. Загрузка склада — {busy}%.",
    "Payment is monthly in arrears, no deposit. The warehouse is {busy}% full.",
  ),
  schemes: c("Схемы работы", "Fulfilment models"),
  ships: c("Отгружает на площадки", "Ships to marketplaces"),
  services: c("Услуги", "Services"),
  address: c("Адрес", "Address"),
  requestTitle: c("Оставить заявку", "Send a request"),
  requestNote: c(
    "Склад отвечает в среднем за {h} ч. Заявка ни к чему не обязывает: условия и договор — следующим шагом.",
    "The warehouse replies in {h} h on average. A request commits you to nothing: terms and contract come next.",
  ),
  send: c("Отправить заявку", "Send the request"),
  requestSubject: c("Заявка складу «{name}»", "Request to {name}"),
  chatSubject: c("условия и приёмка", "terms and intake"),
  presets: [
    c("Возьмёте товар с режимом хранения?", "Can you take climate-controlled goods?"),
    c("Какой срок приёмки после выгрузки?", "How long is intake after unloading?"),
    c("Считаете упаковку отдельно?", "Is packing billed separately?"),
  ],
  notFoundCaption: c("Ошибка 404", "Error 404"),
  notFoundTitle: c("Такого склада на витрине нет", "No such warehouse here"),
  notFoundBody: c(
    "Ссылка могла устареть — склад снимают с витрины, когда у него не остаётся свободных мест.",
    "The link may be stale: a warehouse leaves the marketplace when it runs out of free slots.",
  ),
};

/** Форма склада и реестр, по которому сверена регистрация. */
const FORMS = {
  ip: {
    form: c("действующий индивидуальный предприниматель", "an active sole trader"),
    registry: c("ЕГРИП", "the EGRIP register"),
  },
  ooo: {
    form: c("действующее юридическое лицо", "an active legal entity"),
    registry: c("ЕГРЮЛ", "the EGRUL register"),
  },
};

/**
 * Страница склада.
 *
 * Раньше это был поповер поверх витрины, и обоснование звучало разумно:
 * человек сравнивает склады, после закрытия он должен вернуться в тот же
 * список на то же место. Но сравнивают склады не так. Их открывают по одному
 * в соседних вкладках и переключаются между ними — а поповер не умеет ничего
 * из того, что для этого нужно: ни своей ссылки, которую можно переслать, ни
 * средней кнопки мыши, ни истории браузера. Плюс у карточки склада появилось
 * то, чему в поповере тесно: порядок согласования, документы, чат.
 *
 * Возврат в список решён явной ссылкой «Все склады» — она честнее, чем
 * крестик, и работает одинаково для того, кто пришёл из витрины, и для того,
 * кто открыл склад по присланной ссылке.
 */
export function WarehouseScreen({ id }: { id?: string }) {
  const t = useT();
  const preview = id === PREVIEW_ID;
  // Предпросмотр из кабинета: склад собирается из его сохранения при каждом
  // открытии, а не берётся из демо-набора витрины.
  const w = preview ? readCabinetShowcase() : id ? warehousesRepository.get(id) : undefined;

  if (!w) return preview ? <NoPreview /> : <NotFound />;

  const busy = Math.round(occupancy(w) * 100);
  // На странице склада свежесть подписана всегда, всеми тремя состояниями. В
  // списке хватает предупреждения о несвежем, потому что там карточки
  // сравнивают; сюда приходят решать по одному складу, и «когда эти цены
  // последний раз подтверждали» — такая же часть прайса, как сами числа.
  const fresh = freshness(w.confirmedAt, PAGE_NOW, w.uklad);
  const freshLine =
    fresh === "live"
      ? t(T.freshLive)
      : t(fresh === "stale" ? T.freshStale : T.freshOk, {
          date: shortDate(t.lang, w.confirmedAt),
        });

  return (
    <>
      {/* Паспорт склада (22 окт): без синего первого экрана — синим здесь
          только плитка цены, единственное, что сравнивают между складами
          с первого взгляда. Слева кто это и чем отличается, справа — сколько
          стоит место и сколько их свободно. */}
      {preview && (
        <div className="bg-[var(--wh-blue)] text-white">
          <p className="mx-auto max-w-[1280px] px-5 py-3 text-sm sm:px-10">{t(T.previewBar)}</p>
        </div>
      )}
      <section className="mx-auto max-w-[1280px] px-5 pt-8 sm:px-10 sm:pt-12">
        <a
          href={href("/market")}
          className="group inline-flex items-center gap-1.5 text-sm text-[var(--wh-muted)] transition-colors hover:text-[var(--wh-ink)]"
        >
          <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
          {t(T.back)}
        </a>

        <Reveal className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-stretch lg:gap-14">
          <div className="flex flex-col">
            <div className="flex items-center gap-4">
              <WarehouseAvatar warehouse={w} className="size-16 shrink-0" />
              <p className="text-sm leading-relaxed text-[var(--wh-muted)]">
                {t(T.meta, { legal: t(w.legal), y: w.since, place: place(t, w) })}
              </p>
            </div>
            <h1 className="mt-6 text-[clamp(40px,4.8vw,72px)] font-normal leading-[0.98] tracking-[-0.045em] [text-wrap:balance]">
              {t(w.name)}
              {w.verified && (
                <BadgeCheck
                  className="ml-3 inline size-[0.6em] align-[0.05em] text-[var(--wh-blue)]"
                  aria-label={t(T.verified)}
                />
              )}
            </h1>
            <p className="wh-statement mt-6 max-w-[28ch] text-[var(--wh-muted)] lg:mt-auto lg:pt-8">
              {t(w.pitch)}
            </p>
          </div>

          <div className="flex flex-col justify-between gap-8 rounded-[22px] bg-[var(--wh-blue)] p-7 text-[var(--wh-on-blue)]">
            <div>
              <p className="text-sm text-white/75">{t(T.perMonth)}</p>
              <p className="mt-2 whitespace-nowrap text-[clamp(48px,5vw,72px)] font-light leading-none tracking-[-0.05em] tabular-nums">
                ≈ {money(monthlyPerPlace(w))} ₽
              </p>
            </div>
            <div>
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className="text-white/75">{t(T.free, { n: money(w.cellsTotal) })}</span>
                <span className="text-2xl tabular-nums tracking-[-0.03em]">
                  {money(w.cellsFree)}
                </span>
              </div>
              {/* Полоса свободного: белая часть — свободно, тёмная — занято. */}
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/20">
                <div
                  className="wh-grow h-full rounded-full bg-white"
                  style={{ width: `${100 - busy}%` }}
                />
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <div className="mx-auto max-w-[1280px] px-5 pb-24 pt-10 sm:px-10 sm:pt-14">
        {w.photo && (
          <figure className="relative mb-14">
            <WarehouseCover
              warehouse={w}
              className="aspect-[16/5] overflow-hidden rounded-[22px]"
            />
            <figcaption className="absolute bottom-3 left-3 rounded-full bg-white/90 px-2.5 py-1 text-xs text-[var(--wh-muted)] backdrop-blur">
              {t(T.photo)}
              <Footnote n={1}>{t(T.photoNote)}</Footnote>
            </figcaption>
          </figure>
        )}

        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-14">
          <div className="min-w-0">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {/* У склада без отзывов в этой клетке стоит прочерк, а не ноль:
                нолём в ряду с площадью и временем ответа читается «оценка
                нулевая», хотя оценки просто нет. */}
              <Fact
                icon={Star}
                value={w.reputation.rating === null ? "—" : w.reputation.rating.toFixed(1)}
                label={
                  w.reputation.rating === null
                    ? t(T.noReviews)
                    : t(T.reviews, {
                        n: w.reputation.reviews,
                        word: t.plural(
                          w.reputation.reviews,
                          ["отзыв", "отзыва", "отзывов"],
                          ["review", "reviews"],
                        ),
                      })
                }
              />
              <Fact icon={Clock} value={t(T.hours, { n: w.responseHours })} label={t(T.answer)} />
              <Fact icon={Ruler} value={t(T.sqm, { n: money(w.areaM2) })} label={t(T.area)} />
              <Fact
                icon={Building2}
                value={money(w.cellsFree)}
                label={t(T.free, { n: money(w.cellsTotal) })}
              />
            </div>

            {/* Галочка «проверен» без расшифровки обещает больше, чем мы делаем,
              поэтому рядом список того, что за ней стоит, а оговорка о том,
              чего за ней нет, — сноской у заголовка. */}
            <div className="mt-14">
              <Block
                title={t(w.verified ? T.checked : T.notCheckedTitle)}
                note={{
                  n: 2,
                  body: (
                    <>
                      {t(T.notGuarantee)}{" "}
                      <a
                        href={href("/legal/requisites")}
                        className="text-[var(--wh-blue)] transition-opacity hover:opacity-75"
                      >
                        {t(T.how)}
                      </a>
                    </>
                  ),
                }}
              >
                {w.verified ? (
                  <ul className="flex flex-col gap-3">
                    <TrustItem>
                      {t(T.regLine, {
                        legal: t(w.legal),
                        form: t(registration(w.legal.ru).form),
                        registry: t(registration(w.legal.ru).registry),
                      })}
                    </TrustItem>
                    <TrustItem>
                      {t(T.useLine, { addr: `${t(w.cityTitle)}, ${t(w.address)}` })}
                    </TrustItem>
                    {w.uklad && <TrustItem>{t(T.ukladLine)}</TrustItem>}
                  </ul>
                ) : (
                  <p className="text-[15px] leading-relaxed text-[var(--wh-muted)]">
                    {t(T.notChecked)}
                  </p>
                )}
              </Block>
            </div>

            {/* Отзывы сразу под проверкой: оба отвечают на вопрос «можно ли
              складу верить», только отзывы писали те, кто уже вёз. */}
            <WarehouseReputation warehouse={w} />

            <Block title={t(T.priceTitle)} note={{ n: 4, body: t(T.base) }}>
              <div className="overflow-hidden rounded-[22px] bg-[var(--wh-soft)]">
                <Row label={t(T.storage)} value={`${w.price.storage} ₽`} unit={t(T.storageUnit)} />
                <Row
                  label={t(T.receiving)}
                  value={`${w.price.receiving} ₽`}
                  unit={t(T.receivingUnit)}
                />
                <Row label={t(T.picking)} value={`${w.price.picking} ₽`} unit={t(T.pickingUnit)} />
                <Row label={t(T.marking)} value={`${w.price.marking} ₽`} unit={t(T.markingUnit)} />
                <div className="flex items-baseline justify-between gap-3 bg-[var(--wh-blue)] px-6 py-4 text-white">
                  <span className="text-[15px] font-medium">
                    {t(T.perMonth)}
                    <Footnote n={5}>
                      {w.minPlaces === 0 ? t(T.noMin) : t(T.min, { n: w.minPlaces })}{" "}
                      {t(T.payment, { busy })}
                    </Footnote>
                  </span>
                  <span className="text-xl tabular-nums tracking-[-0.02em]">
                    ≈ {money(monthlyPerPlace(w))} ₽
                  </span>
                </div>
              </div>
              {/* Несвежие цены — предупреждение, а не пояснение: его не прячем. */}
              <p
                className={cn(
                  "mt-4 flex items-start gap-2 text-sm leading-relaxed",
                  fresh === "stale" ? "text-warning" : "text-[var(--wh-muted)]",
                )}
              >
                <Clock className="mt-0.5 size-4 shrink-0" />
                <span>{freshLine}</span>
              </p>
            </Block>

            <Block title={t(T.start)} note={{ n: 6, body: t(T.eSign) }}>
              <ol className="grid gap-3 sm:grid-cols-2">
                {START.map((s, i) => (
                  <li key={s.title.ru} className="rounded-[22px] bg-[var(--wh-soft)] p-6">
                    <span className="font-mono text-sm tabular-nums text-[var(--wh-blue)]">
                      0{i + 1}
                    </span>
                    <span className="mt-3 block text-[17px] font-medium tracking-[-0.01em]">
                      {t(s.title)}
                    </span>
                    <span className="mt-1.5 block text-[15px] leading-relaxed text-[var(--wh-muted)]">
                      {t(s.body)}
                    </span>
                  </li>
                ))}
              </ol>
            </Block>

            <Block title={t(T.schemes)}>
              <div className="flex flex-col gap-3">
                {SCHEMES.filter((s) => w.schemes.includes(s.id)).map((s) => (
                  <div key={s.id} className="flex items-center gap-3 text-[15px]">
                    <span className="w-14 shrink-0 rounded-full bg-[var(--wh-blue)] py-1 text-center text-xs font-semibold text-white">
                      {s.title}
                    </span>
                    <span className="text-[var(--wh-muted)]">{t(s.hint)}</span>
                  </div>
                ))}
              </div>
            </Block>

            <Block title={t(T.ships)}>
              <div className="flex flex-wrap gap-2">
                {w.marketplaces.map((id) => {
                  const brand = MARKETPLACE_BY_ID[id];
                  if (!brand) return null;
                  return (
                    // Отступы со всех сторон одинаковые (Кирилл 26 окт):
                    // значок и текст стоят в пилюле ровно.
                    <span
                      key={id}
                      className="inline-flex items-center gap-2 rounded-full bg-[var(--wh-soft)] px-4 py-2.5 text-sm"
                    >
                      <BrandMark brand={brand} className="size-5" />
                      {t(brand.title)}
                    </span>
                  );
                })}
              </div>
            </Block>

            <Block title={t(T.services)}>
              <div className="flex flex-wrap gap-2">
                {w.services.map((id) => {
                  const service = SERVICE_BY_ID[id];
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-2 rounded-full bg-[var(--wh-soft)] px-4 py-2.5 text-sm"
                    >
                      <Check className="size-3.5 text-[var(--wh-blue)]" strokeWidth={3} />
                      {/* Запасной вариант — сам идентификатор: услуга у склада
                        есть, а в справочнике её ещё нет. */}
                      {service ? t(service.title) : id}
                    </span>
                  );
                })}
              </div>
            </Block>

            <Block title={t(T.address)}>
              <p className="flex items-start gap-3 text-[15px] leading-relaxed">
                <MapPin className="mt-0.5 size-5 shrink-0 text-[var(--wh-blue)]" />
                <span>
                  {place(t, w)}, {t(w.address)}
                  <br />
                  <span className="font-mono text-xs text-[var(--wh-muted)]">
                    {w.lat.toFixed(4)}, {w.lng.toFixed(4)}
                  </span>
                </span>
              </p>
            </Block>
          </div>

          {/* Заявка и чат — рядом с текстом: вопрос к складу возникает, пока
            читаешь прайс. Колонка не липкая: форма выше экрана, и липкий блок
            не дал бы доскроллить до кнопки. */}
          <aside className="flex flex-col gap-4">
            <RequestForm
              title={t(T.requestTitle)}
              note={t(T.requestNote, { h: w.responseHours })}
              submit={t(T.send)}
              subject={t(T.requestSubject, { name: t(w.name) })}
            />

            <ChatPanel
              to={t(w.name)}
              subject={t(T.chatSubject)}
              responseHours={w.responseHours}
              presets={T.presets.map((p) => t(p))}
            />
          </aside>
        </div>

        {/* Текст для поиска: собран из карточки, серый и мелкий — читают его
            поисковики, а не люди (Кирилл 22 окт, как у Циана). */}
        <section className="mt-20 max-w-4xl border-t border-[var(--wh-line)] pt-6">
          {warehouseSeoText(t, w).map((line, i) => (
            <p key={i} className="mt-2 text-xs leading-relaxed text-[var(--wh-muted)] opacity-80">
              {line}
            </p>
          ))}
        </section>
      </div>
    </>
  );
}

function NoPreview() {
  const t = useT();
  return (
    <NotFoundScreen
      caption={t(T.notFoundCaption)}
      title={t(T.noPreviewTitle)}
      action={{ label: "Кабинет", to: "/app/" }}
    >
      {t(T.noPreviewBody)}
    </NotFoundScreen>
  );
}

function NotFound() {
  const t = useT();

  return (
    <NotFoundScreen caption={t(T.notFoundCaption)} title={t(T.notFoundTitle)}>
      {t(T.notFoundBody)}
    </NotFoundScreen>
  );
}

/**
 * Как называть форму склада и где сверялась его регистрация.
 *
 * Треть складов на витрине — предприниматели, а не общества, и написать про
 * них «действующее юридическое лицо, сверено по ЕГРЮЛ» значит соврать дважды:
 * ИП юридическим лицом не является и в ЕГРЮЛ его нет — он в ЕГРИП. Селлер,
 * который такие строки читает в договорах каждую неделю, споткнётся об это
 * первым же взглядом и после этого не поверит остальному списку — а список
 * здесь ровно за тем, чтобы ему верили.
 */
function registration(legal: string): { form: Copy; registry: Copy } {
  // Разбирается русское название: оно и есть запись в реестре, английское —
  // только подпись на странице.
  return legal.trim().startsWith("ИП ") ? FORMS.ip : FORMS.ooo;
}

/** Строка списка проверок: галочка и одно проверенное утверждение. */
function TrustItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-[15px] leading-relaxed">
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[var(--wh-blue)]">
        <Check className="size-3 text-white" strokeWidth={3} />
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

function Fact({ icon: Icon, value, label }: { icon: typeof Star; value: string; label: string }) {
  return (
    <div className="rounded-[22px] bg-[var(--wh-soft)] p-5">
      <Icon className="size-5 text-[var(--wh-blue)]" strokeWidth={1.8} />
      <span className="mt-4 block text-[28px] leading-none tabular-nums tracking-[-0.03em]">
        {value}
      </span>
      <span className="mt-2 block text-sm leading-snug text-[var(--wh-muted)]">{label}</span>
    </div>
  );
}

function Row({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--wh-line)] px-6 py-4">
      <span className="text-[15px]">{label}</span>
      <span className="flex items-baseline gap-2">
        <span className="text-[17px] tabular-nums tracking-[-0.01em]">{value}</span>
        <span className="w-24 text-right text-sm text-[var(--wh-muted)]">{unit}</span>
      </span>
    </div>
  );
}
