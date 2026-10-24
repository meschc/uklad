import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

/**
 * Скан камерой телефона — для склада, где вместо ТСД обычные телефоны.
 * Основной путь по-прежнему HID-сканер; камера — кнопка рядом с полем, видна
 * только на сенсорных экранах с камерой.
 *
 * Распознаёт встроенный `BarcodeDetector` (Chrome на Android). Где его нет
 * (Safari на iPhone), подгружается ZXing — отдельным куском и только по
 * нажатию, чтобы кабинет не тяжелел для тех, кто сканирует сканером.
 */

function canUseCamera(): boolean {
  if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) return false;
  return window.matchMedia?.("(pointer: coarse)").matches ?? false;
}

export function CameraScanButton({
  disabled,
  onCode,
}: {
  disabled?: boolean;
  onCode: (code: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (!canUseCamera()) return null;
  return (
    <>
      <Button
        variant="outline"
        className="h-11 shrink-0 px-3"
        disabled={disabled}
        aria-label={t("scan.camera")}
        onClick={() => setOpen(true)}
      >
        <Camera />
      </Button>
      {open && (
        <CameraPanel
          onClose={() => setOpen(false)}
          onCode={(c) => {
            setOpen(false);
            onCode(c);
          }}
        />
      )}
    </>
  );
}

type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

function CameraPanel({ onClose, onCode }: { onClose: () => void; onCode: (c: string) => void }) {
  const t = useT();
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState(false);
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let stopZxing: (() => void) | null = null;
    const done = (code: string) => {
      if (stopped) return;
      stopped = true;
      onCodeRef.current(code);
    };

    (async () => {
      try {
        const Native = (window as unknown as { BarcodeDetector?: new () => Detector })
          .BarcodeDetector;
        if (Native) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
          });
          const el = video.current;
          if (!el || stopped) return;
          el.srcObject = stream;
          await el.play();
          const detector = new Native();
          const tick = async () => {
            if (stopped) return;
            const found = await detector.detect(el).catch(() => []);
            if (found[0]?.rawValue) return done(found[0].rawValue);
            requestAnimationFrame(() => void tick());
          };
          void tick();
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          if (stopped || !video.current) return;
          const controls = await new BrowserMultiFormatReader().decodeFromConstraints(
            { video: { facingMode: "environment" } },
            video.current,
            (result) => {
              if (result) done(result.getText());
            },
          );
          stopZxing = () => controls.stop();
          if (stopped) stopZxing();
        }
      } catch {
        setError(true);
      }
    })();

    return () => {
      stopped = true;
      stream?.getTracks().forEach((tr) => tr.stop());
      stopZxing?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex animate-slide-in-right flex-col bg-black text-white">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm">{t("scan.cameraHint")}</span>
        <Button variant="ghost" size="sm" className="text-white" onClick={onClose}>
          <X />
          {t("scan.cameraClose")}
        </Button>
      </div>
      <div className="relative flex-1">
        <video ref={video} className="size-full object-cover" playsInline muted />
        <div className="pointer-events-none absolute inset-x-10 top-1/2 h-40 -translate-y-1/2 rounded-xl border-2 border-white/80" />
        {error && (
          <p className="absolute inset-x-4 bottom-8 rounded-lg bg-black/70 p-3 text-center text-sm">
            {t("scan.cameraError")}
          </p>
        )}
      </div>
    </div>
  );
}
