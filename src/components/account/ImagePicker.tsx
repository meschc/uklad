import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { imageToDataUrl } from "@/lib/image";
import { useT } from "@/lib/i18n";
import { FieldError } from "@/components/ui/field";

/**
 * Квадратная картинка с кнопками «Загрузить / Убрать»: фото человека или
 * логотип компании. Пока картинки нет, на её месте стоит `fallback`.
 */
export function ImagePicker({
  value,
  fallback,
  onChange,
  large = false,
}: {
  value?: string;
  fallback: React.ReactNode;
  onChange: (url: string | undefined) => void;
  /** Крупное фото слева, кнопки столбиком — в панели сотрудника. */
  large?: boolean;
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
    <div className={large ? "flex flex-col gap-1" : "flex flex-col items-end gap-1"}>
      <div className="flex items-center gap-3">
        {/* Картинка и кнопка — одной высоты 36, как поле рядом: иначе кнопка
            «Загрузить» встаёт на пару пикселей ниже имени (Кирилл 12 ноя). */}
        {/* shrink-0: в узкой строке картинка иначе сжималась в ноль, и
            загруженное фото «не появлялось» (Кирилл 14.11). */}
        {value ? (
          <img
            src={value}
            alt=""
            className={
              large
                ? "size-24 shrink-0 rounded-2xl object-cover"
                : "size-9 shrink-0 rounded-lg object-cover"
            }
          />
        ) : (
          fallback
        )}
        <div className={large ? "flex flex-col items-start gap-2" : "contents"}>
          <Button
            size="sm"
            variant="outline"
            className="h-9"
            onClick={() => input.current?.click()}
          >
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
        </div>
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
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
