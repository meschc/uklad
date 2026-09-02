import { useState } from "react";
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
import { ConsentChecks, type ConsentState } from "../ConsentChecks";
import { NotFoundScreen } from "../NotFoundScreen";
import { WarehouseAvatar } from "./WarehouseAvatar";
import { WarehouseCover } from "./WarehouseCover";
import { MARKETPLACE_BY_ID, SCHEMES, SERVICE_BY_ID } from "../../data/marketplaces";
import { WAREHOUSES, money, monthlyPerPlace, occupancy } from "../../data/warehouses";
import { goMarket } from "../../lib/route";

/** Шаги до первой поставки — одинаковые у всех складов витрины. */
const START = [
  {
    title: "Заявка",
    body: "Вы оставляете объём, тип товара и желаемую дату. Звонить и договариваться лично не нужно.",
  },
  {
    title: "Подтверждение склада",
    body: "Склад отвечает, сможет ли принять, и присылает условия под ваш товар — с учётом габаритов, режима хранения и упаковки.",
  },
  {
    title: "Документы",
    body: "Договор и приложение с прайсом подписываются в электронном документообороте, из личного кабинета. Бумагу возить не нужно.",
  },
  {
    title: "Поставка",
    body: "Вы согласуете дату отгрузки, склад принимает товар и отправляет отчёт о приёмке — с расхождениями, если они были.",
  },
];

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
  const w = id ? WAREHOUSES.find((x) => x.id === id) : undefined;

  const [sent, setSent] = useState(false);
  const [consent, setConsent] = useState<ConsentState>({ data: false, ads: false });

  if (!w) return <NotFound />;

  const busy = Math.round(occupancy(w) * 100);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-28 sm:px-6 sm:pt-32">
      <button
        onClick={goMarket}
        className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Все склады
      </button>

      {/* Обложка — только у складов, чью площадку мы подключали; плиту с
          буквой здесь не рисуем: знак склада стоит строкой ниже, и второй раз
          та же буква во весь экран ничего не добавляет. */}
      {w.photo && (
        <figure className="mt-5">
          <WarehouseCover
            warehouse={w}
            className="r-window aspect-[16/5] border border-border"
          />
          <figcaption className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Фотография из открытых источников: так выглядит склад вообще, а не
            эта площадка.
          </figcaption>
        </figure>
      )}

      <header className="mt-5 flex items-start gap-4">
        <WarehouseAvatar warehouse={w} className="size-14 shrink-0" />
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 font-display text-[26px] font-medium leading-tight tracking-[-0.02em] sm:text-[34px]">
            {w.name}
            {w.verified && (
              <BadgeCheck
                className="size-5 shrink-0 text-primary"
                aria-label="Проверен Укладом"
              />
            )}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {w.legal} · на рынке с {w.since} года · {w.region}, {w.city}
          </p>
        </div>
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <p className="max-w-2xl text-[15px] leading-relaxed">{w.pitch}</p>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Fact icon={Star} value={w.rating.toFixed(1)} label={`${w.reviews} отзывов`} />
            <Fact icon={Clock} value={`${w.responseHours} ч`} label="средний ответ" />
            <Fact icon={Ruler} value={`${money(w.areaM2)} м²`} label="площадь склада" />
            <Fact
              icon={Building2}
              value={money(w.cellsFree)}
              label={`свободно из ${money(w.cellsTotal)}`}
            />
          </div>

          {/* Галочка «проверен» без расшифровки обещает больше, чем мы делаем:
              человек читает её как «Уклад отвечает за этот склад», а мы
              сверяли регистрацию и право на помещение — и только. Поэтому
              рядом с галочкой стоит список того, что за ней стоит, и прямая
              оговорка о том, чего за ней нет. Непроверенный склад говорит об
              этом теми же словами: отметка чего-то стоит лишь тогда, когда её
              отсутствие тоже видно. */}
          <Block title="Что проверил Уклад">
            {w.verified ? (
              <ul className="flex flex-col gap-2.5">
                <TrustItem>
                  {w.legal} — {registration(w.legal).form}, регистрация сверена по{" "}
                  {registration(w.legal).registry}.
                </TrustItem>
                <TrustItem>
                  Право пользования площадкой по адресу {w.city}, {w.address} —
                  подтверждено документами.
                </TrustItem>
                {w.uklad && (
                  <TrustItem>
                    Склад работает на учётной системе Уклада: свободные места и
                    статусы поставок берутся из неё, а не со слов склада.
                  </TrustItem>
                )}
              </ul>
            ) : (
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Этот склад Уклад не проверял. Всё, что в карточке, склад сообщил о
                себе сам. Выписку из ЕГРЮЛ и документы на помещение стоит
                запросить у него до подписания договора.
              </p>
            )}

            <p className="mt-3.5 text-[12px] leading-relaxed text-muted-foreground">
              Проверка — не поручительство. Договор вы заключаете напрямую со
              складом, и за качество услуг, сроки и сохранность товара отвечает
              он. Уклад не берёт комиссию с этого договора и не принимает за склад
              деньги.{" "}
              <a
                href="#/legal/requisites"
                className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
              >
                Как это устроено
              </a>
            </p>
          </Block>

          <Block title="Как начнётся работа">
            <ol className="border-t border-border">
              {START.map((s, i) => (
                <li
                  key={s.title}
                  className="flex gap-4 border-b border-border py-3.5"
                >
                  <span className="mt-0.5 shrink-0 font-mono text-[11px] tabular-nums text-primary">
                    0{i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{s.title}</span>
                    <span className="mt-0.5 block text-[13px] leading-relaxed text-muted-foreground">
                      {s.body}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-muted-foreground">
              <FileSignature className="mt-0.5 size-3.5 shrink-0 text-primary" />
              Договор, приложения и акты приёмки подписываются электронной
              подписью — через Диадок или СБИС, к которым подключён склад.
            </p>
          </Block>

          <Block title="Прайс">
            <div className="r-inset overflow-hidden border border-border">
              <Row label="Хранение" value={`${w.price.storage} ₽`} unit="место в сутки" />
              <Row label="Приёмка" value={`${w.price.receiving} ₽`} unit="за короб" />
              <Row label="Сборка заказа" value={`${w.price.picking} ₽`} unit="за заказ" />
              <Row label="Маркировка" value={`${w.price.marking} ₽`} unit="за единицу" />
              <div className="flex items-baseline justify-between gap-3 bg-primary/[0.06] px-4 py-3">
                <span className="text-sm font-semibold text-primary">
                  Одно место в месяц
                </span>
                <span className="font-display text-lg font-medium tabular-nums text-primary">
                  ≈ {money(monthlyPerPlace(w))} ₽
                </span>
              </div>
            </div>
            <p className="mt-2.5 text-[12px] leading-relaxed text-muted-foreground">
              Это базовые ставки — по ним склады сравниваются между собой.
              Хрупкий, негабаритный или требующий режима хранения товар склад
              считает отдельно: индивидуальные условия под ваш товар приходят
              вместе с подтверждением заявки, до подписания договора.
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
              {w.minPlaces === 0
                ? "Минимального объёма нет — можно начать с одного места."
                : `Минимальный объём — от ${w.minPlaces} мест хранения.`}{" "}
              Оплата — по факту месяца, постоплатой, без депозита. Загрузка
              склада — {busy}%.
            </p>
          </Block>

          <Block title="Схемы работы">
            <div className="flex flex-col gap-1.5">
              {SCHEMES.filter((s) => w.schemes.includes(s.id)).map((s) => (
                <div key={s.id} className="flex items-center gap-2.5 text-sm">
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                    {s.title}
                  </span>
                  <span className="text-muted-foreground">{s.hint}</span>
                </div>
              ))}
            </div>
          </Block>

          <Block title="Отгружает на площадки">
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
                    {brand.title}
                  </span>
                );
              })}
            </div>
          </Block>

          <Block title="Услуги">
            <div className="flex flex-wrap gap-1.5">
              {w.services.map((id) => (
                <span
                  key={id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground"
                >
                  <Check className="size-3 text-primary" strokeWidth={3} />
                  {SERVICE_BY_ID[id]?.title ?? id}
                </span>
              ))}
            </div>
          </Block>

          <Block title="Адрес">
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 size-4 shrink-0" />
              <span>
                {w.region}, {w.city}, {w.address}
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
            ним в конец страницы человек не станет. */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="r-window border border-border bg-card p-4">
            <p className="text-sm font-medium">Оставить заявку</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              Склад отвечает в среднем за {w.responseHours} ч. Заявка ни к чему
              не обязывает: условия и договор — следующим шагом.
            </p>

            {!sent && (
              <ConsentChecks value={consent} onChange={setConsent} className="mt-4" />
            )}

            <button
              onClick={() => setSent(true)}
              disabled={sent || !consent.data}
              className={cn(
                "mt-4 inline-flex h-11 w-full items-center justify-center rounded-full px-5 text-sm font-medium transition-colors",
                sent
                  ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                  : "bg-primary text-primary-foreground enabled:hover:bg-primary/90 disabled:opacity-45",
              )}
            >
              {sent ? "Заявка отправлена" : "Отправить заявку"}
            </button>

            {/* Под кнопкой заявки стояла вторая — «Посмотреть кабинет», ссылка
                в демонстрацию системы. Место для неё худшее из возможных: это
                единственная точка сайта, где человек уже решился написать
                складу, и рядом с решением стояла дверь наружу. Что у склада
                есть кабинет, сказано выше значком «Уклад». */}
          </div>

          <ChatPanel
            className="mt-4"
            to={w.name}
            subject="условия и приёмка"
            responseHours={w.responseHours}
            presets={[
              "Возьмёте товар с режимом хранения?",
              "Какой срок приёмки после выгрузки?",
              "Считаете упаковку отдельно?",
            ]}
          />
        </aside>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <NotFoundScreen caption="Ошибка 404" title="Такого склада на витрине нет">
      Ссылка могла устареть — склад снимают с витрины, когда у него не
      остаётся свободных мест.
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
function registration(legal: string): { form: string; registry: string } {
  return legal.trim().startsWith("ИП ")
    ? { form: "действующий индивидуальный предприниматель", registry: "ЕГРИП" }
    : { form: "действующее юридическое лицо", registry: "ЕГРЮЛ" };
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

function Fact({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Star;
  value: string;
  label: string;
}) {
  return (
    <div className="r-inset border border-border px-3 py-2.5">
      <span className="flex items-center gap-1.5">
        <Icon className="size-3.5 text-muted-foreground" />
        <span className="font-display text-base font-medium tabular-nums tracking-tight">
          {value}
        </span>
      </span>
      <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
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
