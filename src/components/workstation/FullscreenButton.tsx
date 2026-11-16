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
    <Button variant="ghost" size="sm" aria-label={label} title={label} onClick={toggleFullscreen}>
      {on ? <Minimize /> : <Maximize />}
    </Button>
  );
}
