import { useState } from "react";
import { cn } from "@/lib/utils";
import { CONTACT_ERROR, contactKind, domainHints, maskContact } from "../lib/contact";
import { useT } from "../lib/copy";

/**
 * Поле «Телефон или почта» — одно на формы витрины. Телефон маскируется по
 * ходу ввода, ошибка появляется, когда человек ушёл из поля с неверным
 * значением или нажал «Отправить» (`tried`), — не с первой буквы: подсказка
 * под ещё не дописанной почтой читается как упрёк.
 *
 * Значение держит форма: ей нужно и отправить его, и не пустить неверное.
 */
export function ContactField({
  id,
  label,
  placeholder,
  value,
  onChange,
  tried,
  inputClassName,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  /** Нажимали «Отправить» — показываем ошибку и у нетронутого поля. */
  tried: boolean;
  inputClassName: string;
}) {
  const t = useT();
  const [left, setLeft] = useState(false);
  const bad = (tried || (left && value.trim() !== "")) && contactKind(value) === null;
  const hints = domainHints(value.trim());
  const local = value.trim().split("@")[0];

  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        <span className="ml-0.5 text-primary">*</span>
      </label>
      <input
        id={id}
        name="contact"
        required
        inputMode="email"
        autoComplete="on"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(maskContact(e.target.value))}
        onBlur={() => setLeft(true)}
        aria-invalid={bad || undefined}
        aria-describedby={bad ? `${id}-error` : undefined}
        className={cn(inputClassName, bad && "!border-destructive !ring-destructive")}
      />
      {hints.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {hints.map((d) => (
            <button
              key={d}
              type="button"
              // mousedown, а не click: иначе поле теряет фокус раньше и
              // успевает показать ошибку под недописанной почтой.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onChange(`${local}@${d}`)}
              className="h-7 rounded-full bg-muted px-2.5 text-xs text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
            >
              {local}@{d}
            </button>
          ))}
        </div>
      )}
      {bad && (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1.5 text-xs leading-relaxed text-destructive"
        >
          {t(CONTACT_ERROR)}
        </p>
      )}
    </div>
  );
}
