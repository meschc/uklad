import { useEffect } from "react";

/**
 * Подложка модального окна: затемняет фон, ловит клик мимо и Escape.
 *
 * Отдельный компонент, потому что окон с такой подложкой в проекте дюжина, и
 * раньше каждое решало вопрос закрытия само: где-то Escape был, где-то нет, а
 * пользователю разница между окнами не видна. Теперь обе привычки живут в
 * одном месте, и забыть про клавиатуру в новом окне уже нельзя.
 *
 * Без `onClose` подложка глухая. Так ведут себя алерты, которые требуют
 * решения (расхождение при приёмке, товар на полке): закрыть их «мимо» —
 * значит потерять выбор, а не отменить его.
 *
 * Для скринридера подложка скрыта: это фон, а не элемент управления. Закрыть
 * окно с клавиатуры можно Escape или кнопкой «Отмена» внутри — оба пути ведут
 * туда же, куда клик по затемнению, поэтому у div'а нет ни роли, ни фокуса.
 */
export function Backdrop({ onClose }: { onClose?: () => void }) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      aria-hidden
      className="absolute inset-0 animate-fade-in bg-black/40 backdrop-blur-[1px]"
      onClick={onClose}
    />
  );
}
