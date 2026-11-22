import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

/**
 * Мелкая ссылка под полем бейджа руководителя (Кирилл 22.11): пароль — не
 * отдельный блок рядом с полем, а запасной путь того же поля. «Нет бейджа?
 * Ввести пароль» меняет поле на пароль, «Есть бейдж? Отсканировать» — обратно.
 */
export function PasswordSwitch({
  byPassword,
  onChange,
}: {
  byPassword: boolean;
  onChange: (byPassword: boolean) => void;
}) {
  const t = useT();
  return (
    <Button
      type="button"
      variant="link"
      size="sm"
      className="h-auto self-start px-0 text-xs text-muted-foreground max-md:px-0 max-md:text-xs"
      onClick={() => onChange(!byPassword)}
    >
      {t(byPassword ? "devices.byBadge" : "devices.byPassword")}
    </Button>
  );
}
