import { fireEvent } from "@testing-library/react";
import { todayISO } from "../../../lib/request";

/**
 * Заполнение заявки в тестах — одним местом на оба экрана.
 *
 * Заявку оставляют и со страницы склада, и из таблицы сравнения, форма там одна
 * и та же, и списывать заполнение в каждый файл значит однажды поправить одно
 * место из двух. Файл не называется `*.test.ts` нарочно: Vitest собирает только
 * такие имена, и помощник, попавший под маску, считался бы набором без тестов.
 *
 * Поля ищутся по `id`, а не по подписи: подпись проходит через типографику
 * витрины, которая склеивает короткие слова неразрывным пробелом, и образец в
 * тесте начинает зависеть от правил переносов. `id` полей заявки задан в
 * `RequestForm` и в `VolumeFields` и от слов не зависит.
 */

/** На сколько вперёд берём дату поставки — лишь бы она не оказалась вчерашней. */
const DAYS_AHEAD = 30;
const MS_IN_DAY = 24 * 60 * 60 * 1000;

export interface RequestValues {
  goods: string;
  /** Объём: одного числа заявке достаточно, остальные поля остаются пустыми. */
  places: string;
  date: string;
  city: string;
}

/**
 * Дата, которая заведомо ещё не прошла.
 *
 * Считается от нынешнего дня, а не записана строкой: записанная строка
 * когда-нибудь наступит, и тест начнёт падать без единой правки в коде.
 */
export function futureDate(): string {
  return todayISO(new Date(Date.now() + DAYS_AHEAD * MS_IN_DAY));
}

export function pastDate(): string {
  return todayISO(new Date(Date.now() - MS_IN_DAY));
}

/** Заполнить заявку целиком; в `over` — то, что нужно оставить пустым или иным. */
export function fillRequest(over: Partial<RequestValues> = {}): void {
  const values: RequestValues = {
    goods: "Одежда и обувь",
    places: "120",
    date: futureDate(),
    city: "Казань",
    ...over,
  };

  type(`request-goods`, values.goods);
  type(`request-places`, values.places);
  type(`request-date`, values.date);
  type(`request-city`, values.city);
}

function type(id: string, value: string): void {
  const field = document.getElementById(id);
  if (!(field instanceof HTMLInputElement)) throw new Error(`Нет поля заявки #${id}`);
  fireEvent.change(field, { target: { value } });
}
