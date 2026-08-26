import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEditor } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

/**
 * Изоляция сбоя по экранам — та самая «модульность», которая проекту нужна
 * (см. решения сессии): данные общие и должны такими остаться, а вот падение
 * рендера одного экрана не должно ронять всё приложение и мешать уйти в
 * соседний пункт меню.
 *
 * Границу ставим вокруг каждого экрана и сбрасываем ключом вида (`key={view}`
 * в App): при переходе на другой экран React пересоздаёт границу, и старая
 * ошибка не «залипает» на новом содержимом.
 */
interface Props {
  children: ReactNode;
  /** Что именно упало — попадает в лог, чтобы искать не наугад. */
  label?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[uklad] экран «${this.props.label ?? "?"}» упал:`, error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <ScreenCrash
        error={this.state.error}
        onRetry={() => this.setState({ error: null })}
      />
    );
  }
}

/**
 * Экран-заглушка. Отдельным функциональным компонентом, потому что переводы
 * живут в хуке, а хуки в классовых компонентах не работают.
 */
function ScreenCrash({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) {
  const t = useT();
  const goToDashboard = useEditor((s) => s.goToDashboard);

  return (
    <div className="flex h-full items-center justify-center bg-background p-6">
      <div className="flex max-w-md flex-col items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-6 py-8 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-destructive/15 text-destructive">
          <AlertTriangle className="size-5" />
        </span>
        <p className="text-sm font-semibold">{t("crash.title")}</p>
        <p className="text-xs text-muted-foreground">{t("crash.body")}</p>
        <code className="max-w-full overflow-x-auto rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground">
          {error.message}
        </code>
        <div className="mt-1 flex gap-2">
          <Button size="sm" onClick={onRetry}>
            <RotateCcw className="size-3.5" />
            {t("crash.retry")}
          </Button>
          <Button size="sm" variant="outline" onClick={goToDashboard}>
            {t("crash.toDashboard")}
          </Button>
        </div>
      </div>
    </div>
  );
}
