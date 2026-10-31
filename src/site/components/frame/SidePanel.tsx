/**
 * Панель, выезжающая справа, — единственный вид всплывающего слоя на витрине
 * (правило Кирилла 24 окт: «никаких попапов, только сайдбар справа»). Окно по
 * центру закрывает страницу, с которой человек работает; панель оставляет её
 * видимой слева, и после закрытия он там же, где был.
 *
 * Оформление то же, что у шторки цены (`PriceWhy`): подложка, панель на всю
 * высоту, на телефоне — во всю ширину. Шапку и крестик рисует содержимое: у
 * каждой панели они свои (голос, значок идеи), а общая обёртка не должна
 * обрастать флагами. Esc и блокировку прокрутки фона даёт `useOverlay` у
 * вызывающего.
 */
export function SidePanel({
  onClose,
  label,
  children,
}: {
  onClose: () => void;
  /** Подпись для чтения с экрана. */
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[90]">
      <div
        aria-hidden
        className="absolute inset-0 animate-fade-in bg-black/15 dark:bg-white/10"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="wh absolute inset-y-0 right-0 flex w-full animate-slide-in-right flex-col bg-[var(--wh-ground)] text-[var(--wh-ink)] shadow-2xl sm:w-[min(560px,100vw)] sm:rounded-l-[22px]"
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
}
