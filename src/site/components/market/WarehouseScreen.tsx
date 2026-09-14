import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  Check,
  Clock,
  FileSignature,
  MapPin,
  Ruler,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandMark } from "../BrandMark";
import { ChatPanel } from "../ChatPanel";
import { NotFoundScreen } from "../NotFoundScreen";
import { Block } from "./Block";
import { RequestForm } from "./RequestForm";
import { WarehouseAvatar } from "./WarehouseAvatar";
import { WarehouseReputation } from "./WarehouseReputation";
import { WarehouseCover } from "./WarehouseCover";
import { MARKETPLACE_BY_ID, SCHEMES, SERVICE_BY_ID } from "../../data/marketplaces";
import { money, monthlyPerPlace, occupancy } from "../../data/warehouses";
import { warehousesRepository } from "../../data/warehousesRepository";
import { PAGE_NOW, shortDate } from "../../lib/date";
import { freshness } from "../../lib/freshness";
import { href } from "../../lib/route";
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
  const w = id ? warehousesRepository.get(id) : undefined;

  if (!w) return <NotFound />;

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
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-28 sm:px-6 sm:pt-32">
      <a
        href={href("/market")}
        className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        {t(T.back)}
      </a>

      {/* Обложка — только у складов, чью площадку мы подключали; плиту с
          буквой здесь не рисуем: знак склада стоит строкой ниже, и второй раз
          та же буква во весь экран ничего не добавляет. */}
      {w.photo && (
        <figure className="mt-5">
          <WarehouseCover warehouse={w} className="r-window aspect-[16/5] border border-border" />
          <figcaption className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            {t(T.photoNote)}
          </figcaption>
        </figure>
      )}

      <header className="mt-5 flex items-start gap-4">
        <WarehouseAvatar warehouse={w} className="size-14 shrink-0" />
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 font-display text-[26px] font-medium leading-tight tracking-[-0.02em] sm:text-[34px]">
            {t(w.name)}
            {w.verified && (
              <BadgeCheck className="size-5 shrink-0 text-primary" aria-label={t(T.verified)} />
            )}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {t(T.meta, { legal: t(w.legal), y: w.since, place: place(t, w) })}
          </p>
        </div>
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <p className="max-w-2xl text-[15px] leading-relaxed">{t(w.pitch)}</p>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* У склада без отзывов в этой клетке стоит прочерк, а не ноль:
                нолём в ряду с площадью и временем ответа читается «оценка
                нулевая», хотя оценки просто нет. Что это значит, объяснено
                ниже, в блоке отзывов. */}
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

          {/* Галочка «проверен» без расшифровки обещает больше, чем мы делаем:
              человек читает её как «Уклад отвечает за этот склад», а мы
              сверяли регистрацию и право на помещение — и только. Поэтому
              рядом с галочкой стоит список того, что за ней стоит, и прямая
              оговорка о том, чего за ней нет. Непроверенный склад говорит об
              этом теми же словами: отметка чего-то стоит лишь тогда, когда её
              отсутствие тоже видно. */}
          <Block title={t(w.verified ? T.checked : T.notCheckedTitle)}>
            {w.verified ? (
              <ul className="flex flex-col gap-2.5">
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
              <p className="text-[13px] leading-relaxed text-muted-foreground">{t(T.notChecked)}</p>
            )}

            <p className="mt-3.5 text-[12px] leading-relaxed text-muted-foreground">
              {t(T.notGuarantee)}{" "}
              <a
                href={href("/legal/requisites")}
                className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
              >
                {t(T.how)}
              </a>
            </p>
          </Block>

          {/* Отзывы стоят сразу под проверкой и до рассказа о том, как пойдёт
              работа: и то и другое отвечает на один вопрос — можно ли этому
              складу верить, — только проверку делали мы, а отзывы писали те,
              кто уже вёз. Второе весит больше, и прятать его в конец страницы
              значит притворяться, что это не так. */}
          <WarehouseReputation warehouse={w} />

          <Block title={t(T.start)}>
            <ol className="border-t border-border">
              {START.map((s, i) => (
                <li key={s.title.ru} className="flex gap-4 border-b border-border py-3.5">
                  <span className="mt-0.5 shrink-0 font-mono text-[11px] tabular-nums text-primary">
                    0{i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{t(s.title)}</span>
                    <span className="mt-0.5 block text-[13px] leading-relaxed text-muted-foreground">
                      {t(s.body)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-muted-foreground">
              <FileSignature className="mt-0.5 size-3.5 shrink-0 text-primary" />
              {t(T.eSign)}
            </p>
          </Block>

          <Block title={t(T.priceTitle)}>
            <div className="r-inset overflow-hidden border border-border">
              <Row label={t(T.storage)} value={`${w.price.storage} ₽`} unit={t(T.storageUnit)} />
              <Row
                label={t(T.receiving)}
                value={`${w.price.receiving} ₽`}
                unit={t(T.receivingUnit)}
              />
              <Row label={t(T.picking)} value={`${w.price.picking} ₽`} unit={t(T.pickingUnit)} />
              <Row label={t(T.marking)} value={`${w.price.marking} ₽`} unit={t(T.markingUnit)} />
              <div className="flex items-baseline justify-between gap-3 bg-primary/[0.06] px-4 py-3">
                <span className="text-sm font-semibold text-primary">{t(T.perMonth)}</span>
                <span className="font-display text-lg font-medium tabular-nums text-primary">
                  ≈ {money(monthlyPerPlace(w))} ₽
                </span>
              </div>
            </div>
            <p className="mt-2.5 text-[12px] leading-relaxed text-muted-foreground">{t(T.base)}</p>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
              {w.minPlaces === 0 ? t(T.noMin) : t(T.min, { n: w.minPlaces })}{" "}
              {t(T.payment, { busy })}
            </p>
            <p
              className={cn(
                "mt-2 flex items-start gap-1.5 text-[12px] leading-relaxed",
                fresh === "stale" ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground",
              )}
            >
              <Clock className="mt-0.5 size-3.5 shrink-0" />
              <span>{freshLine}</span>
            </p>
          </Block>

          <Block title={t(T.schemes)}>
            <div className="flex flex-col gap-1.5">
              {SCHEMES.filter((s) => w.schemes.includes(s.id)).map((s) => (
                <div key={s.id} className="flex items-center gap-2.5 text-sm">
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                    {s.title}
                  </span>
                  <span className="text-muted-foreground">{t(s.hint)}</span>
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
                  <span
                    key={id}
                    className="inline-flex items-center gap-2 rounded-full border border-border py-1 pl-2.5 pr-3 text-xs font-medium"
                  >
                    <BrandMark brand={brand} className="size-4" />
                    {t(brand.title)}
                  </span>
                );
              })}
            </div>
          </Block>

          <Block title={t(T.services)}>
            <div className="flex flex-wrap gap-1.5">
              {w.services.map((id) => {
                const service = SERVICE_BY_ID[id];
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground"
                  >
                    <Check className="size-3 text-primary" strokeWidth={3} />
                    {/* Запасной вариант — сам идентификатор: услуга у склада
                        есть, а в справочнике её ещё нет. Показать «marking»
                        честнее, чем молча выбросить строку. */}
                    {service ? t(service.title) : id}
                  </span>
                );
              })}
            </div>
          </Block>

          <Block title={t(T.address)}>
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 size-4 shrink-0" />
              <span>
                {place(t, w)}, {t(w.address)}
                <br />
                <span className="font-mono text-[11px]">
                  {w.lat.toFixed(4)}, {w.lng.toFixed(4)}
                </span>
              </span>
            </p>
          </Block>
        </div>

        {/* Заявка и чат — рядом с текстом, а не под ним: вопрос к складу
            возникает ровно в тот момент, когда читаешь прайс, и уходить за
            ним в конец страницы человек не станет.

            Колонка при этом не липкая, хотя была. В заявке появились поля, и
            колонка переросла экран: липкий блок выше окна встаёт наверху и
            больше не двигается — до кнопки под полями доскроллить нельзя.

            Под кнопкой заявки стояла ещё одна — «Посмотреть кабинет», ссылка
            в демонстрацию системы. Место для неё худшее из возможных: это
            единственная точка сайта, где человек уже решился написать складу,
            и рядом с решением стояла дверь наружу. Что у склада есть кабинет,
            сказано выше значком «Уклад». */}
        <aside>
          <RequestForm
            title={t(T.requestTitle)}
            note={t(T.requestNote, { h: w.responseHours })}
            submit={t(T.send)}
            subject={t(T.requestSubject, { name: t(w.name) })}
          />

          <ChatPanel
            className="mt-4"
            to={t(w.name)}
            subject={t(T.chatSubject)}
            responseHours={w.responseHours}
            presets={T.presets.map((p) => t(p))}
          />
        </aside>
      </div>
    </div>
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
    <li className="flex items-start gap-2.5 text-[13px] leading-relaxed">
      <Check className="mt-0.5 size-3.5 shrink-0 text-primary" strokeWidth={3} />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

function Fact({ icon: Icon, value, label }: { icon: typeof Star; value: string; label: string }) {
  return (
    <div className="r-inset border border-border px-3 py-2.5">
      <span className="flex items-center gap-1.5">
        <Icon className="size-3.5 text-muted-foreground" />
        <span className="font-display text-base font-medium tabular-nums tracking-tight">
          {value}
        </span>
      </span>
      <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{label}</span>
    </div>
  );
}

function Row({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-2.5 last:border-0">
      <span className="text-sm">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <span className="font-semibold tabular-nums">{value}</span>
        <span className="text-[11px] text-muted-foreground">{unit}</span>
      </span>
    </div>
  );
}
