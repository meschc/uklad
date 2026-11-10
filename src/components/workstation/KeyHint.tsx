/** Подпись кнопки ТСД (F1–F4) на экранной кнопке, которую она нажимает. */
export function KeyHint({ k }: { k: string }) {
  return (
    <kbd className="rounded bg-muted px-1 font-sans text-2xs font-medium text-muted-foreground">
      {k}
    </kbd>
  );
}
