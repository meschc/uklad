import { useCallback, useState } from "react";
import { hasLeadsEndpoint, leadMailto, sendLead, type Lead } from "./leads";

/**
 * Состояние одной отправки формы витрины.
 *
 * Хук нужен обеим формам — контактам и заявке складу — и держит ровно то, что
 * им нужно знать: чем сейчас занята кнопка и чем всё кончилось. Сам транспорт
 * в `leads.ts`, здесь только состояние экрана.
 *
 * Пять состояний вместо привычного «отправлено / не отправлено» появились из-за
 * одного честного различия: пока приёмник не настроен, нажатие открывает
 * почтовую программу — письмо **подготовлено**, но не отправлено. Написать
 * после этого «Отправлено» значило бы соврать: человек может закрыть окно
 * почты, и никакой заявки не будет.
 */
export type LeadSendState =
  /** Ничего не нажимали. */
  | "idle"
  /** Запрос в пути. */
  | "sending"
  /** Приёмник принял заявку. */
  | "sent"
  /** Открыто письмо в почтовой программе — отправит его человек, не мы. */
  | "mailed"
  /** Не ушло: сеть или приёмник. Кнопка предлагает повторить. */
  | "failed";

export interface LeadSend {
  state: LeadSendState;
  /** Настроен ли приёмник: от этого зависит и подпись кнопки, и пояснение. */
  online: boolean;
  send: (lead: Lead) => void;
}

export function useLeadSend(): LeadSend {
  const [state, setState] = useState<LeadSendState>("idle");
  const online = hasLeadsEndpoint();

  const send = useCallback(
    (lead: Lead) => {
      // Второй клик по кнопке, пока идёт первый запрос, отправил бы заявку
      // дважды — склад получил бы два одинаковых письма.
      if (state === "sending") return;

      if (!online) {
        window.location.href = leadMailto(lead);
        setState("mailed");
        return;
      }

      setState("sending");
      void sendLead(lead).then((result) => setState(result.ok ? "sent" : "failed"));
    },
    [online, state],
  );

  return { state, online, send };
}
