import { forwardRef } from "react";
import { fixEmailLayout, suggestEmailDomains } from "@/lib/emailTyping";
import { useT } from "@/lib/i18n";
import { Input } from "@/components/ui/input";

type Props = Omit<React.ComponentProps<typeof Input>, "type" | "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
};

/**
 * Поле почты: набранное в русской раскладке становится латиницей на лету,
 * а после «@» под полем списком — популярные почтовые сервисы
 * (`lib/emailTyping.ts`). Список в потоке страницы, а не всплывающий: в
 * кабинете нет всплывающих окон.
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
        // Список прямо под полем, как в почтовых сервисах: набранное — синим,
        // подставляемый домен — обычным цветом. В потоке страницы, не поверх.
        <ul aria-label={t("login.emailHints")} className="-mt-1 flex flex-col py-1">
          {hints.map((h) => {
            const at = h.indexOf("@");
            return (
              <li key={h}>
                <button
                  type="button"
                  onClick={() => onValueChange(h)}
                  className="flex h-8 w-full items-center rounded-md px-3 text-left text-sm hover:bg-accent"
                >
                  <span className="text-primary">{h.slice(0, at + 1)}</span>
                  <span>{h.slice(at + 1)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
});
