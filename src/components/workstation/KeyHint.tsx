/**
 * Подпись клавиши ТСД (F1–F4) на экранной кнопке, которую она нажимает.
 * На компьютере не показываем (Кирилл 13.11).
 */
export function KeyHint({ k }: { k: string }) {
  return (
    <kbd className="rounded bg-foreground/10 px-1 font-sans text-2xs font-medium text-current opacity-80 md:hidden">
      {k}
    </kbd>
  );
}
