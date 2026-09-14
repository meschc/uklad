import type { ReactNode } from "react";

/**
 * Общая рамка экранов фулфилмента: заголовок, подпись, слот под действия и
 * прокручиваемое тело. Отдельный компонент, чтобы приёмка, задания, сборка,
 * персонал и аналитика не расходились по отступам и типографике.
 */
export function ScreenShell({
  title,
  subtitle,
  actions,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  /** Широкая колонка — для таблиц и дашборда; узкая — для мастера приёмки. */
  wide?: boolean;
}) {
  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className={`mx-auto flex ${wide ? "max-w-5xl" : "max-w-2xl"} flex-col gap-5 px-6 py-7`}>
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
        {children}
      </div>
    </div>
  );
}

/** Пустое состояние экрана — единый вид для всех списков фулфилмента. */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </span>
      <p className="text-sm font-medium">{title}</p>
      {body && <p className="max-w-sm text-xs text-muted-foreground">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
