import { Maximize, Minimize } from "lucide-react";
import { useT } from "@/lib/i18n";
import { fullscreenSupported, toggleFullscreen, useIsFullscreen } from "@/lib/fullscreen";
import { Button } from "@/components/ui/button";

/** Во весь экран и обратно — в шапке стола. */
export function FullscreenButton() {
  const t = useT();
  const on = useIsFullscreen();
  if (!fullscreenSupported()) return null;
  const label = t(on ? "ws.fullscreen.exit" : "ws.fullscreen.enter");
  return (
    // На телефоне кнопки нет (Кирилл 18.11): iPhone полный экран для страницы
    // не даёт, а на ТСД стол разворачивается сам при входе по бейджу.
    <Button
      variant="ghost"
      size="sm"
      className="max-md:hidden"
      aria-label={label}
      title={label}
      onClick={toggleFullscreen}
    >
      {on ? <Minimize /> : <Maximize />}
    </Button>
  );
}
