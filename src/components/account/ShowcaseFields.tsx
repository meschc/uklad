import { Eye, EyeOff } from "lucide-react";
import { SHOWCASE_FIELDS, type ShowcaseField } from "@/lib/types";
import { useT, type MsgKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const LABEL: Record<ShowcaseField, MsgKey> = {
  address: "showcase.f.address",
  since: "showcase.f.since",
  area: "showcase.f.area",
  cells: "showcase.f.cells",
  prices: "showcase.f.prices",
  services: "showcase.f.services",
  marketplaces: "showcase.f.marketplaces",
};

/**
 * Что ещё видят селлеры на витрине, кроме полей паспорта (у тех глаз стоит
 * прямо на плитке): цены, услуги, площадки. Пилюля с глазом: нажал — скрыто,
 * нажал ещё раз — видно. Предпросмотр показывает ровно этот выбор.
 */
export function ShowcaseFields({
  hidden,
  onChange,
  only = SHOWCASE_FIELDS,
}: {
  /** Поля, которых нет в плитках паспорта (цены, услуги, площадки). */
  only?: readonly ShowcaseField[];
  hidden: readonly ShowcaseField[];
  onChange: (next: ShowcaseField[]) => void;
}) {
  const t = useT();
  const toggle = (f: ShowcaseField) =>
    onChange(hidden.includes(f) ? hidden.filter((x) => x !== f) : [...hidden, f]);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">{t("showcase.title")}</h2>
      <div className="flex flex-wrap gap-2">
        {only.map((f) => {
          const off = hidden.includes(f);
          const Icon = off ? EyeOff : Eye;
          return (
            <button
              key={f}
              type="button"
              aria-pressed={!off}
              onClick={() => toggle(f)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-full px-3 text-sm transition-colors",
                off
                  ? "bg-muted text-muted-foreground line-through"
                  : "bg-primary/10 text-primary hover:bg-primary/15",
              )}
            >
              <Icon className="size-3.5" />
              {t(LABEL[f])}
            </button>
          );
        })}
      </div>
    </section>
  );
}
