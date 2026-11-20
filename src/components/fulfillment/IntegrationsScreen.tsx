import { useEffect, useState } from "react";
import { ChevronDown, ExternalLink, MessageCircleQuestion, ShieldAlert } from "lucide-react";
import { useEditor } from "@/lib/store";
import {
  INTEGRATIONS,
  INTEGRATION_CATEGORIES,
  type BrandMarkSpec,
  type IntegrationConfig,
  type IntegrationSpec,
} from "@/lib/integrations";
import { useT, type TFunc } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { eyebrow } from "@/components/ui/eyebrow";
import { card } from "@/components/ui/card";
import { ScreenShell } from "./ScreenShell";
import { ServerConnections } from "./ServerConnections";
import { hasCabinetServer } from "@/lib/data/api";
import { SERVER_CONNECTOR_SYSTEMS, connectorsRepository } from "@/lib/data/connectorsRepository";
import { ReportProblemDialog } from "@/components/support/ReportProblemDialog";

/**
 * Интеграции с внешними системами (п.22, п.9). По каждой системе указано, какой
 * это API, какая авторизация и какие поля она требует. Системы без готового
 * адаптера (`soon`) видны с пометкой «В следующих обновлениях» и не
 * настраиваются (Кирилл 19.11: полный список привлекает склад; скрыли их в
 * #181 без его «да»). Подключить можно только то, что работает.
 *
 * Список разбит по разделам: продавцу важно увидеть «мой маркетплейс здесь
 * есть» за секунду, а сплошной перечень из двадцати карточек этого не даёт.
 */
export function IntegrationsScreen() {
  const t = useT();
  const integrations = useEditor((s) => s.integrations);
  const updateIntegration = useEditor((s) => s.updateIntegration);

  const [asking, setAsking] = useState(false);
  const live = useConnectedSystems();
  const isOn = (spec: IntegrationSpec) =>
    hasCabinetServer ? live.has(spec.id) : !!integrations[spec.id]?.enabled;
  const connected = INTEGRATIONS.filter(isOn).length;
  const soon = INTEGRATIONS.filter(isSoon).length;

  return (
    <ScreenShell
      title={t("integr.title")}
      subtitle={t("integr.subtitleN", { total: INTEGRATIONS.length - soon, n: connected, soon })}
      wide
      actions={
        <Button size="sm" variant="outline" onClick={() => setAsking(true)}>
          <MessageCircleQuestion className="size-3.5" />
          {t("support.integration.ask")}
        </Button>
      }
    >
      {asking && <ReportProblemDialog preset="integration" onClose={() => setAsking(false)} />}
      <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
        <ShieldAlert className="mt-px size-3.5 shrink-0" />
        <span>{t("integr.securityNote")}</span>
      </div>

      {INTEGRATION_CATEGORIES.map((cat) => {
        // Готовые к подключению — выше: «в следующих обновлениях» не должно
        // заслонять рабочее. Нужную систему, которой нет, склад просит
        // кнопкой «Задать вопрос».
        const items = INTEGRATIONS.filter((s) => s.category === cat.id).sort(
          (a, b) => Number(isSoon(a)) - Number(isSoon(b)),
        );
        if (!items.length) return null;
        return (
          <section key={cat.id} className="flex flex-col gap-2">
            <h2 className={eyebrow()}>
              {t(cat.key)} · {items.length}
            </h2>
            <div className="flex flex-col gap-2">
              {items.map((spec) => (
                <IntegrationCard
                  key={spec.id}
                  spec={spec}
                  config={integrations[spec.id] ?? {}}
                  on={isOn(spec)}
                  soon={isSoon(spec)}
                  onChange={(patch) => updateIntegration(spec.id, patch)}
                  t={t}
                />
              ))}
            </div>
          </section>
        );
      })}
    </ScreenShell>
  );
}

/**
 * Знак партнёра: логотип вендора из `public/brands`, если он у нас есть, иначе
 * монограмма на фирменном цвете. Карточка перестаёт быть «ещё одной розеткой» —
 * свой маркетплейс продавец находит в списке за долю секунды.
 *
 * Плитка под логотипом всегда белая: часть знаков идёт со своей подложкой (WB,
 * Lamoda), часть без неё (Авито), и на общем белом они выравниваются в один ряд
 * в обеих темах.
 *
 * Знак всегда в полном цвете, даже у неподключённой системы. Приглушать его
 * незачем: подключение видно по бейджу «вкл» и по счётчику заполненных полей, а
 * выцветший логотип мешает ровно тому, ради чего он здесь, — найти свою систему
 * в списке из двадцати одной, не читая подписи.
 */
function BrandMark({ brand }: { brand: BrandMarkSpec }) {
  // Логотип не загрузился — остаётся монограмма: битая картинка в списке
  // подключений читается как сломанная интеграция, хотя сломан только файл.
  const [logoFailed, setLogoFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const withLogo = brand.logo && !logoFailed;

  return (
    <span
      aria-hidden
      // Монограмма на фирменном цвете — сразу, а логотип проявляется поверх,
      // когда загрузится (Кирилл 12 ноя: «пролаг есть, поставь заглушку»).
      // Тонкая обводка: у тёмных марок (Lamoda) плитка иначе сливается с
      // карточкой в тёмной теме и читается как дырка в вёрстке.
      className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold tracking-tight ring-1 ring-black/10 dark:ring-white/15"
      style={{ backgroundColor: brand.bg, color: brand.fg ?? "#ffffff" }}
    >
      {brand.short}
      {withLogo && (
        <img
          // BASE_URL, а не «/brands/…»: при сборке в подкаталог (GitHub Pages)
          // абсолютный путь от корня ведёт в никуда. Без lazy: знаков два
          // десятка, все в первом экране, и ленивая загрузка только добавляла
          // задержку перед показом.
          src={`${import.meta.env.BASE_URL}brands/${brand.logo}`}
          alt=""
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setLogoFailed(true)}
          // У части знаков (Яндекс Маркет) в файле широкие белые поля —
          // увеличиваем их, чтобы знак заполнял круг.
          style={brand.logoScale ? { transform: `scale(${brand.logoScale})` } : undefined}
          className={cn(
            "absolute inset-0 size-full bg-white object-contain transition-opacity duration-base",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      )}
    </span>
  );
}

/**
 * Площадки, ключ которых в сборке с сервером хранит сервер: у них вместо
 * полей в браузере — список подключений на сервере (`ServerConnections`).
 */
const onServer = (spec: IntegrationSpec) =>
  hasCabinetServer && (SERVER_CONNECTOR_SYSTEMS as readonly string[]).includes(spec.id);

/**
 * Система ещё не подключается. В сборке с сервером это и те, у кого адаптер
 * есть, а серверного прокси нет: галочка «Включить обмен» в браузере ничего
 * не включала, а бейдж «вкл» обещал обмен, которого нет (ревизия 14.11).
 */
const isSoon = (spec: IntegrationSpec) => !!spec.soon || (hasCabinetServer && !onServer(spec));

/**
 * Какие системы подключены на сервере. Галочка `enabled` в снимке для них не
 * правда: правда — есть ли подключение с ключом на сервере.
 */
function useConnectedSystems(): ReadonlySet<string> {
  const [systems, setSystems] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    if (!hasCabinetServer) return;
    let alive = true;
    void connectorsRepository.list().then((res) => {
      if (alive && res.ok) setSystems(new Set(res.data.map((c) => c.system)));
    });
    return () => {
      alive = false;
    };
  }, []);
  return systems;
}

function IntegrationCard({
  spec,
  config,
  on,
  soon,
  onChange,
  t,
}: {
  spec: IntegrationSpec;
  config: IntegrationConfig;
  on: boolean;
  soon: boolean;
  onChange: (patch: IntegrationConfig) => void;
  t: TFunc;
}) {
  const [open, setOpen] = useState(false);
  const filled = spec.fields.filter((f) => String(config[f.id] ?? "") !== "").length;
  const ready = filled === spec.fields.length;

  return (
    <section className={card({ pad: "none", className: "overflow-hidden" })}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <BrandMark brand={spec.brand} />
        {/* basis-48: на телефоне описанию не хватает места рядом со
            значком и кнопкой — они уходят строкой ниже, а не сжимают текст
            в столбик по слову. */}
        <div className="min-w-0 flex-1 basis-48">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            {spec.title}
            {on && (
              <span className="rounded bg-success/15 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-success">
                {t("integr.on")}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {t(spec.descriptionKey)}
          </p>
        </div>
        {soon ? (
          // Не кнопка и не ссылка: подключить нельзя, а серый текст рядом с
          // «Настроить» у соседей читается как «ещё не готово», а не как сбой.
          <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {t("integr.soon")}
          </span>
        ) : (
          <>
            <span
              className={eyebrow({
                size: "xs",
                weight: "medium",
                className: "shrink-0 rounded bg-muted px-2 py-0.5",
              })}
            >
              {t(`integr.auth.${spec.auth}`)}
            </span>
            {/* У площадок на сервере поля в браузере не заполняются: счётчик
                старых полей снимка тут только путал. */}
            {!onServer(spec) && (
              <span
                className={cn(
                  "shrink-0 text-xs tabular-nums",
                  ready ? "text-success" : "text-muted-foreground",
                )}
              >
                {t("integr.filled", { n: filled, total: spec.fields.length })}
              </span>
            )}
            <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
              {t(open ? "integr.hide" : "integr.setup")}
            </Button>
          </>
        )}
      </div>

      {open && !soon && onServer(spec) && (
        <div className="flex flex-col gap-3 border-t border-border bg-muted/20 px-4 py-3">
          <ServerConnections spec={spec} t={t} />
          <HowToAndDocs spec={spec} t={t} />
        </div>
      )}

      {open && !soon && !onServer(spec) && (
        <div className="flex flex-col gap-3 border-t border-border bg-muted/20 px-4 py-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {spec.fields.map((f) => (
              <label key={f.id} className="flex flex-col gap-1">
                <span className={eyebrow()}>{t(f.labelKey)}</span>
                <Input
                  type={f.secret ? "password" : "text"}
                  autoComplete="off"
                  value={String(config[f.id] ?? "")}
                  placeholder={f.id === "baseUrl" ? spec.defaultBaseUrl : undefined}
                  onChange={(e) => onChange({ [f.id]: e.target.value })}
                  className="h-9"
                />
              </label>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={!!config.enabled}
                onChange={(e) => onChange({ enabled: e.target.checked })}
                className="size-4 accent-[hsl(var(--primary))]"
              />
              {t("integr.enable")}
            </label>
          </div>
          <HowToAndDocs spec={spec} t={t} />

          <p className="text-xs text-muted-foreground">{t("integr.pendingNote")}</p>
        </div>
      )}
    </section>
  );
}

/**
 * «Инструкция» и «Документация системы» одной строкой (Кирилл 19.11):
 * сначала короткие шаги «где взять ключ», раскрываются по нажатию, потом
 * ссылка на документацию площадки. Шагов нет — только ссылка.
 */
function HowToAndDocs({ spec, t }: { spec: IntegrationSpec; t: TFunc }) {
  const [open, setOpen] = useState(false);
  const steps = spec.howToKey ? t(spec.howToKey).split("\n") : [];
  const link =
    "inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {steps.length > 0 && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className={cn(link, "cursor-pointer")}
          >
            <ChevronDown
              className={cn("size-3 transition-transform duration-base", open && "rotate-180")}
            />
            {t("integr.howTo")}
          </button>
        )}
        <a href={spec.docsUrl} target="_blank" rel="noopener noreferrer" className={link}>
          <ExternalLink className="size-3" />
          {t("integr.docs")}
        </a>
      </div>
      {open && (
        <ol className="flex list-decimal flex-col gap-1 rounded-md bg-background px-4 py-2 pl-8 text-xs leading-relaxed">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}
    </div>
  );
}
