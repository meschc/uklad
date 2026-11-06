import { forwardRef } from "react";
import { fixEmailLayout, suggestEmailDomains } from "@/lib/emailTyping";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = Omit<React.ComponentProps<typeof Input>, "type" | "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
};

/**
 * Поле почты: набранное в русской раскладке становится латиницей на лету,
 * а после «@» под полем строкой — популярные почтовые сервисы
 * (`lib/emailTyping.ts`). Строка, а не всплывающий список: в кабинете нет
 * всплывающих окон.
 */
export const EmailInput = forwardRef<HTMLInputElement, Props>(function EmailInput(
  { value, onValueChange, readOnly, ...rest },
  ref,
) {
  const t = useT();
  const hints = readOnly ? [] : suggestEmailDomains(value);
  return (
    <>
      <Input
        ref={ref}
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onValueChange(fixEmailLayout(e.target.value))}
        {...rest}
      />
      {hints.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label={t("login.emailHints")}>
          {hints.map((h) => (
            <Button
              key={h}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onValueChange(h)}
            >
              {h.slice(h.indexOf("@"))}
            </Button>
          ))}
        </div>
      )}
    </>
  );
});
