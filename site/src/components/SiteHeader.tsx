import { Boxes, Moon, Sun } from "lucide-react";
import { Button, LinkButton } from "./ui";
import { useTheme } from "@/lib/theme";

/**
 * Шапка витрины. Липкая, потому что борд длинный: с середины роадмапа человек
 * должен уходить на другой раздел одним движением, а не скроллом наверх.
 */
const SECTIONS = [
  { href: "#status", label: "Статус" },
  { href: "#roadmap", label: "Роадмап" },
  { href: "#releases", label: "Обновления" },
];

export function SiteHeader({ demoHref }: { demoHref: string }) {
  const { theme, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <a href="#top" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Boxes className="size-[18px]" />
          </span>
          Уклад
        </a>

        <nav className="ml-4 hidden items-center gap-1 sm:flex">
          {SECTIONS.map((s) => (
            <a
              key={s.href}
              href={s.href}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {s.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            aria-label={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
            title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
          >
            {theme === "dark" ? <Sun /> : <Moon />}
          </Button>
          <LinkButton href={demoHref} size="sm" className="h-8" target="_blank" rel="noreferrer">
            Запустить у себя
          </LinkButton>
        </div>
      </div>
    </header>
  );
}
