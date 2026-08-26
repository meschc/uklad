import { useState } from "react";
import { ExternalLink, ShieldAlert } from "lucide-react";
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
import { ScreenShell } from "./ScreenShell";

/**
 * Интеграции с внешними системами (п.22, п.9). Обмена данными в прототипе нет —
 * есть подготовленная площадка: по каждой системе указано, какой это API, какая
 * авторизация и какие поля она требует. Владелец склада заполняет их заранее, а
 * подключение включается вместе с backend.
 *
 * Список разбит по разделам: продавцу важно увидеть «мой маркетплейс здесь
 * есть» за секунду, а сплошной перечень из двадцати карточек этого не даёт.
 */
export function IntegrationsScreen() {
  const t = useT();
  const integrations = useEditor((s) => s.integrations);
  const updateIntegration = useEditor((s) => s.updateIntegration);

  const connected = INTEGRATIONS.filter((s) => integrations[s.id]?.enabled).length;

  return (
    <ScreenShell
      title={t("integr.title")}
      subtitle={t("integr.subtitleN", {
        total: INTEGRATIONS.length,
        n: connected,
      })}
      wide
    >
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
        <ShieldAlert className="mt-px size-3.5 shrink-0" />
        <span>{t("integr.securityNote")}</span>
      </div>

      {INTEGRATION_CATEGORIES.map((cat) => {
        const items = INTEGRATIONS.filter((s) => s.category === cat.id);
        if (!items.length) return null;
        return (
          <section key={cat.id} className="flex flex-col gap-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t(cat.key)} · {items.length}
            </h2>
            <div className="flex flex-col gap-2">
              {items.map((spec) => (
                <IntegrationCard
                  key={spec.id}
                  spec={spec}
                  config={integrations[spec.id] ?? {}}
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
 */
function BrandMark({ brand, muted }: { brand: BrandMarkSpec; muted: boolean }) {
  // Логотип не загрузился — показываем монограмму: битая картинка в списке
  // подключений читается как сломанная интеграция, хотя сломан только файл.
  const [logoFailed, setLogoFailed] = useState(false);

  if (brand.logo && !logoFailed) {
    return (
      <span
        aria-hidden
        className={cn(
          "flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-black/10 transition-opacity dark:ring-white/15",
          muted && "opacity-60",
        )}
      >
        <img
          // BASE_URL, а не «/brands/…»: при сборке в подкаталог (GitHub Pages)
          // абсолютный путь от корня ведёт в никуда.
          src={`${import.meta.env.BASE_URL}brands/${brand.logo}`}
          alt=""
          loading="lazy"
          onError={() => setLogoFailed(true)}
          className="size-full object-contain"
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        // Тонкая обводка: у тёмных марок (Lamoda) плитка иначе сливается с
        // карточкой в тёмной теме и читается как дырка в вёрстке.
        "flex size-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold tracking-tight ring-1 ring-black/10 transition-opacity dark:ring-white/15",
        muted && "opacity-60",
      )}
      style={{ backgroundColor: brand.bg, color: brand.fg ?? "#ffffff" }}
    >
      {brand.short}
    </span>
  );
}

function IntegrationCard({
  spec,
  config,
  onChange,
  t,
}: {
  spec: IntegrationSpec;
  config: IntegrationConfig;
  onChange: (patch: IntegrationConfig) => void;
  t: TFunc;
}) {
  const [open, setOpen] = useState(false);
  const filled = spec.fields.filter((f) => String(config[f.id] ?? "") !== "").length;
  const ready = filled === spec.fields.length;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <BrandMark brand={spec.brand} muted={!config.enabled} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            {spec.title}
            {config.enabled && (
              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                {t("integr.on")}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            {t(spec.descriptionKey)}
          </p>
        </div>
        <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {t(`integr.auth.${spec.auth}`)}
        </span>
        <span
          className={cn(
            "shrink-0 text-[11px] tabular-nums",
            ready ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
          )}
        >
          {t("integr.filled", { n: filled, total: spec.fields.length })}
        </span>
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
          {t(open ? "integr.hide" : "integr.setup")}
        </Button>
      </div>

      {open && (
        <div className="flex flex-col gap-3 border-t border-border bg-muted/20 px-4 py-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {spec.fields.map((f) => (
              <label key={f.id} className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(f.labelKey)}
                </span>
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
            <a
              href={spec.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
            >
              <ExternalLink className="size-3" />
              {t("integr.docs")}
            </a>
          </div>

          <p className="text-[11px] text-muted-foreground">
            {t("integr.pendingNote")}
          </p>
        </div>
      )}
    </section>
  );
}
