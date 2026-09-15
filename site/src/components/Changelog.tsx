import { Check } from "lucide-react";
import { RELEASES } from "@/data/roadmap";
import { formatDate } from "@/lib/roadmap";
import { noOrphans } from "@/lib/typography";
import { Badge, STATUS_STYLE } from "./ui";

/**
 * Журнал обновлений. Роадмап обещает, журнал отчитывается — поэтому он стоит
 * отдельной секцией, а не вкладкой внутри борда: человек, который выбирает
 * систему, читает именно его, чтобы понять, живой продукт или брошенный.
 */
export function Changelog() {
  return (
    <section id="releases" className="border-t border-border">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Обновления</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          {noOrphans("Что уже вышло — в том виде, в каком это видно в продукте.")}
        </p>

        <ol className="mt-8 space-y-4">
          {RELEASES.map((r) => (
            <li
              key={r.version}
              className="grid gap-4 rounded-xl border border-border bg-card p-5 md:grid-cols-[12rem_1fr]"
            >
              <div>
                <div className="flex items-center gap-2">
                  <Badge className={STATUS_STYLE.done.chip}>v{r.version}</Badge>
                  <span className="text-xs text-muted-foreground">{formatDate(r.date)}</span>
                </div>
                <h3 className="mt-2 font-medium tracking-tight">{r.title}</h3>
              </div>

              <ul className="space-y-2">
                {r.highlights.map((h) => (
                  <li key={h} className="flex gap-2 text-sm text-muted-foreground">
                    <Check className="mt-0.5 size-4 shrink-0 text-[hsl(var(--st-done))]" />
                    <span>{noOrphans(h)}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
