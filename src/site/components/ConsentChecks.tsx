import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { go } from "../lib/route";
import { scrollPageTop } from "../lib/useSmoothScroll";

export interface ConsentState {
  /** Согласие на обработку персональных данных — без него форма не отправится. */
  data: boolean;
  /** Согласие на рекламные сообщения — необязательное, отдельное. */
  ads: boolean;
}

/**
 * Две галочки под формой — и они обязаны быть именно двумя.
 *
 * Закон требует, чтобы согласие на обработку данных было конкретным и
 * оформлялось отдельно от других условий: одна общая галочка «принимаю всё»
 * согласием не считается, как не считается и галочка, проставленная заранее.
 * Отсюда и устройство компонента: оба поля начинаются пустыми, реклама живёт
 * отдельным полем, а отказ от рекламы ничего не блокирует.
 *
 * Свой чекбокс, а не системный: нативный `input[type=checkbox]` не красится
 * под остальную форму в Safari, а согласие — не то место, где можно позволить
 * себе элемент, выглядящий чужим.
 */
export function ConsentChecks({
  value,
  onChange,
  className,
}: {
  value: ConsentState;
  onChange: (next: ConsentState) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Row
        checked={value.data}
        onToggle={() => onChange({ ...value, data: !value.data })}
      >
        Даю{" "}
        <Link to="/legal/consent">согласие на обработку персональных данных</Link> и
        подтверждаю, что ознакомлен с{" "}
        <Link to="/legal/privacy">политикой обработки</Link>.
      </Row>

      <Row checked={value.ads} onToggle={() => onChange({ ...value, ads: !value.ads })}>
        Хочу получать письма о новых складах и возможностях сервиса. Необязательно —
        на рассмотрение обращения не влияет.
      </Row>
    </div>
  );
}

function Row({
  checked,
  onToggle,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <span className="relative mt-0.5 flex size-[18px] shrink-0 items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="peer absolute inset-0 cursor-pointer opacity-0"
        />
        <span
          className={cn(
            "r-chip flex size-[18px] items-center justify-center border transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40",
            checked ? "border-primary bg-primary" : "border-border bg-background",
          )}
        >
          <Check
            className={cn(
              "size-3 text-primary-foreground transition-transform",
              checked ? "scale-100" : "scale-0",
            )}
            strokeWidth={3.5}
          />
        </span>
      </span>
      <span className="text-[12px] leading-[1.5] text-muted-foreground">{children}</span>
    </label>
  );
}

/**
 * Ссылка на документ внутри подписи к галочке. Кнопка, а не `a href`: клик по
 * ссылке внутри `label` переключил бы галочку заодно с переходом.
 */
function Link({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        go(to);
        scrollPageTop();
      }}
      className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
    >
      {children}
    </button>
  );
}
