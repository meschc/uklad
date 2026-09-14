import { useState } from "react";
import { cn } from "@/lib/utils";
import { ConsentChecks, type ConsentState } from "../ConsentChecks";
import { LeadSubmit } from "../LeadSubmit";
import { VolumeFields } from "./VolumeFields";
import {
  EMPTY_REQUEST,
  MAX_TEXT,
  requestGaps,
  todayISO,
  type RequestDraft,
} from "../../lib/request";
import { EMPTY_VOLUME, type SellerVolume } from "../../lib/estimate";
import { c, useT, type Copy } from "../../lib/copy";
import { volumeText } from "../../lib/volume";
import { useLeadSend } from "../../lib/useLeadSend";

/**
 * Форма заявки складу — одна на витрину.
 *
 * Заявку оставляют из двух мест: со страницы склада — одному, и из таблицы
 * сравнения — сразу всем отмеченным. Поля в обоих случаях те же самые, и
 * держать их двумя формами значит однажды поправить одну. Различаются места
 * только словами: заголовок, пояснение и подпись кнопки приходят снаружи.
 *
 * Что спрашиваем и почему именно это — в `lib/request`. Здесь важно другое:
 * кнопка заблокирована, пока заявка неполная, и рядом с ней написано, чего не
 * хватает. Заблокированная кнопка без причины — тупик: человек нажимает,
 * ничего не происходит, и он уходит со страницы, а не заполняет поле.
 *
 * Куда уходит заполненное — в `lib/leads`: настроен приёмник, значит заявка
 * улетает запросом; не настроен — открывается письмо с теми же полями. Здесь
 * заявка только собирается из `draft`, а подписи кнопки на все состояния живут
 * в `LeadSubmit`, одни на обе формы витрины.
 */

const T = {
  goods: c("Тип товара", "Type of goods"),
  goodsPlaceholder: c("Одежда и обувь", "Clothing and footwear"),
  volume: c("Объём", "Volume"),
  date: c("Желаемая дата", "Preferred date"),
  city: c("Город отгрузки", "Dispatch city"),
  cityPlaceholder: c("Казань", "Kazan"),
  gaps: {
    goods: c("Напишите, какой товар везёте.", "Say what goods you are shipping."),
    volume: c("Впишите объём — хотя бы одно число.", "Enter your volume — at least one number."),
    date: c("Укажите желаемую дату поставки.", "Pick a delivery date."),
    past: c("Дата поставки уже прошла.", "That delivery date has passed."),
    city: c("Укажите город, откуда поедет товар.", "Say which city the goods ship from."),
    consent: c("Отметьте согласие на обработку данных.", "Tick the consent to data processing."),
  },
};

export function RequestForm({
  title,
  note,
  submit,
  mailSubmit,
  subject,
  initialVolume = EMPTY_VOLUME,
  className,
}: {
  title: string;
  note: string;
  /** Подпись кнопки до отправки; в сравнении в неё входит число складов. */
  submit: string;
  /** Та же подпись для случая, когда приёмника нет и откроется письмо. */
  mailSubmit?: string;
  /**
   * Тема письма: кому заявка. Со страницы склада — его название, из сравнения —
   * перечисление отмеченных. По ней заявку находят в почте через полгода.
   */
  subject: string;
  /**
   * Объём из расчёта витрины — начальное значение, дальше поля живут своей
   * жизнью. Расчёт и заявка так не расходятся: человек не вводит одно и то же
   * дважды и не ошибается во второй раз.
   */
  initialVolume?: SellerVolume;
  className?: string;
}) {
  const t = useT();
  const [draft, setDraft] = useState<RequestDraft>(() => ({
    ...EMPTY_REQUEST,
    volume: initialVolume,
  }));
  const [consent, setConsent] = useState<ConsentState>({ data: false, ads: false });
  const lead = useLeadSend();

  const gaps = requestGaps(draft, todayISO());
  // Согласие — последнее в очереди подсказок: сперва заявка, потом разрешение
  // её отправить. Иначе галочка просит отметить себя над пустыми полями.
  const blocker: Copy | null =
    gaps.length > 0 ? T.gaps[gaps[0]] : consent.data ? null : T.gaps.consent;

  // Заявка отправлена или ушла письмом — полей больше нет: править их здесь
  // некуда, дальше разговор идёт в переписке.
  const done = lead.state === "sent" || lead.state === "mailed";

  const send = () => {
    if (blocker) return;
    lead.send({
      kind: "request",
      lang: t.lang,
      subject,
      fields: [
        { label: t(T.goods), value: draft.goods },
        { label: t(T.volume), value: volumeText(t, draft.volume) },
        { label: t(T.date), value: draft.date },
        { label: t(T.city), value: draft.city },
      ],
      consent,
    });
  };

  return (
    <div className={cn("r-window border border-border bg-card p-4 sm:p-5", className)}>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted-foreground">{note}</p>

      {!done && (
        <div className="mt-4 space-y-4">
          <Text
            id="request-goods"
            label={t(T.goods)}
            placeholder={t(T.goodsPlaceholder)}
            value={draft.goods}
            onChange={(goods) => setDraft({ ...draft, goods })}
          />

          <fieldset>
            <legend className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t(T.volume)}
            </legend>
            <VolumeFields
              idPrefix="request"
              value={draft.volume}
              onChange={(volume) => setDraft({ ...draft, volume })}
              className="mt-1.5 grid-cols-2"
            />
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <Text
              id="request-date"
              type="date"
              label={t(T.date)}
              value={draft.date}
              onChange={(date) => setDraft({ ...draft, date })}
            />
            <Text
              id="request-city"
              label={t(T.city)}
              placeholder={t(T.cityPlaceholder)}
              value={draft.city}
              onChange={(city) => setDraft({ ...draft, city })}
            />
          </div>

          <ConsentChecks value={consent} onChange={setConsent} />
        </div>
      )}

      <LeadSubmit
        lead={lead}
        idle={submit}
        mailIdle={mailSubmit}
        blocker={blocker ? t(blocker) : null}
        onClick={send}
        className="mt-4"
      />
    </div>
  );
}

/**
 * Строка ввода — подпись, поле, ничего сверх.
 *
 * Длина ограничена не из вредности: заявка уходит складу письмом, и поле, в
 * которое вставили половину прайса, письмо ломает. Поле даты ограничивать
 * незачем — его формат держит браузер.
 */
function Text({
  id,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  type?: "text" | "date";
  placeholder?: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[11px] uppercase tracking-wide text-muted-foreground"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        maxLength={type === "text" ? MAX_TEXT : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 h-10 w-full rounded-full border border-border bg-background px-3.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary"
      />
    </div>
  );
}
