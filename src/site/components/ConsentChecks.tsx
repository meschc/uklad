import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { href } from "../lib/route";
import { c, useT } from "../lib/copy";

const T = {
  give: c("Даю", "I give"),
  consentLink: c(
    "согласие на обработку персональных данных",
    "consent to the processing of personal data",
  ),
  and: c("и подтверждаю, что ознакомлен с", "and confirm I have read the"),
  privacyLink: c("политикой обработки", "privacy policy"),
  ads: c(
    "Хочу получать письма о новых складах и возможностях сервиса. Необязательно.",
    "I’d like emails about new warehouses and features. Optional.",
  ),
};

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
  const t = useT();

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Row checked={value.data} onToggle={() => onChange({ ...value, data: !value.data })}>
        {t(T.give)} <Link to="/legal/consent">{t(T.consentLink)}</Link> {t(T.and)}{" "}
        <Link to="/legal/privacy">{t(T.privacyLink)}</Link>.
      </Row>

      <Row checked={value.ads} onToggle={() => onChange({ ...value, ads: !value.ads })}>
        {t(T.ads)}
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
 * Ссылка на документ внутри подписи к галочке.
 *
 * Открывается в новой вкладке, и это тот редкий случай, когда `_blank` уместен:
 * галочки стоят в заполненной наполовину заявке, и уход на оферту в этой же
 * вкладке стёр бы всё, что человек успел напечатать. Ровно затем он на оферту и
 * идёт — чтобы вернуться и отправить.
 *
 * Клик по ссылке внутри `label` галочку не переключает: по стандарту метка не
 * передаёт нажатие полю, если нажали по интерактивному содержимому внутри неё,
 * а ссылка с адресом — как раз оно.
 */
function Link({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <a
      href={href(to)}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
    >
      {children}
    </a>
  );
}
