import { useState } from "react";
import type { Status } from "@/data/types";
import { ITEMS } from "@/data/roadmap";
import { SITE } from "@/data/site";
import { SiteHeader } from "@/components/SiteHeader";
import { Hero } from "@/components/Hero";
import { StatusDashboard } from "@/components/StatusDashboard";
import { RoadmapSection } from "@/components/RoadmapSection";
import { Changelog } from "@/components/Changelog";
import { SiteFooter } from "@/components/SiteFooter";

/**
 * Витрина Уклада: статус работ сверху, роадмап под ним, журнал обновлений в
 * конце. Одна страница без роутера — разделов три, и разносить их по адресам
 * значило бы заставить человека возвращаться назад за общей картиной.
 *
 * Выбранная стадия живёт здесь, потому что её переключают из двух мест:
 * плиткой дашборда и кнопкой сброса в роадмапе.
 */
export function App() {
  const [status, setStatus] = useState<Status | null>(null);

  /** Плитка дашборда сама по себе ничего не покажет: борд ниже по странице. */
  const pickStatus = (next: Status | null) => {
    setStatus(next);
    if (next) document.getElementById("roadmap")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-full bg-background">
      <SiteHeader demoHref={SITE.demoUrl} />
      <main>
        <Hero
          demoHref={SITE.demoUrl}
          repoHref={SITE.repoUrl}
          version={SITE.version}
          updatedAt={SITE.updatedAt}
        />
        <StatusDashboard items={ITEMS} active={status} onPick={pickStatus} />
        <RoadmapSection items={ITEMS} status={status} onStatusChange={setStatus} />
        <Changelog />
      </main>
      <SiteFooter />
    </div>
  );
}
