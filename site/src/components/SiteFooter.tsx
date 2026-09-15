import { Github, MessageSquarePlus } from "lucide-react";
import { SITE } from "@/data/site";
import { noOrphans } from "@/lib/typography";
import { LinkButton } from "./ui";

/**
 * Подвал с оговоркой. Она обязательна: страница со статусами и процентами
 * выглядит как продукт, а Уклад пока прототип — умолчать об этом значит
 * продать то, чего нет.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-xl">
            <p className="font-medium tracking-tight">Уклад</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {noOrphans(
                "Это прототип, а не готовый продукт: бэкенда нет, данные живут в браузере и чистятся вместе с ним, интеграции — подготовленная площадка без реального обмена. Кварталы в роадмапе — ориентир, который двигается.",
              )}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <LinkButton
              href={SITE.issuesUrl}
              variant="outline"
              size="sm"
              target="_blank"
              rel="noreferrer"
            >
              <MessageSquarePlus />
              Предложить задачу
            </LinkButton>
            <LinkButton
              href={SITE.repoUrl}
              variant="ghost"
              size="sm"
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground"
            >
              <Github />
              Исходники
            </LinkButton>
          </div>
        </div>

        <p className="mt-8 text-xs text-muted-foreground">
          Уклад · прототип {SITE.version}
        </p>
      </div>
    </footer>
  );
}
