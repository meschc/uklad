import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { imageToDataUrl } from "@/lib/image";
import { useT } from "@/lib/i18n";

/**
 * Квадратная картинка с кнопками «Загрузить / Убрать»: фото человека или
 * логотип компании. Пока картинки нет, на её месте стоит `fallback`.
 */
export function ImagePicker({
  value,
  fallback,
  onChange,
}: {
  value?: string;
  fallback: React.ReactNode;
  onChange: (url: string | undefined) => void;
}) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const res = await imageToDataUrl(file);
    if ("error" in res) {
      setError(t(`profile.image.err.${res.error}`));
      return;
    }
    setError(null);
    onChange(res.url);
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-3">
        {value ? <img src={value} alt="" className="size-10 rounded-xl object-cover" /> : fallback}
        <Button size="sm" variant="outline" className="h-9" onClick={() => input.current?.click()}>
          <ImagePlus className="size-4" />
          {t(value ? "profile.image.replace" : "profile.image.upload")}
        </Button>
        {value && (
          <Button
            size="icon"
            variant="ghost"
            className="size-9"
            aria-label={t("profile.image.remove")}
            title={t("profile.image.remove")}
            onClick={() => onChange(undefined)}
          >
            <Trash2 className="size-4" />
          </Button>
        )}
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
