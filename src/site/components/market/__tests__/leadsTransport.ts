import { vi } from "vitest";

/**
 * Подменённый приёмник заявок — для тестов форм витрины.
 *
 * Без переменной `VITE_LEADS_ENDPOINT` форма работает честным запасным путём:
 * открывает письмо в почтовой программе. Проверять этот путь в jsdom нечем —
 * навигации там нет, — и такую проверку делает браузерный тест (`e2e/`). А в
 * тестах компонентов приёмник настраивают: тогда нажатие уходит запросом, и
 * видно не только подпись кнопки, но и то, что именно уехало складу.
 *
 * Файл назван не `*.test.ts` нарочно: Vitest собирает только такие имена, и
 * помощник, попавший под маску, считался бы набором без единого теста.
 */

export const TEST_ENDPOINT = "https://example.test/leads";

/** Тело запроса, которое собирает `lib/leads` — ровно то, что увидит приёмник. */
export interface SentLead {
  kind: string;
  lang: string;
  subject: string;
  fields: Record<string, string>;
  message: string;
  consent: { data: boolean; ads: boolean };
}

export interface LeadsStub {
  /** Последняя ушедшая заявка; `null`, если не уходило ничего. */
  sent: () => SentLead | null;
  restore: () => void;
}

export function stubLeads(): LeadsStub {
  const fetchMock = vi.fn<(url: string, init: { body: string }) => Promise<unknown>>();
  fetchMock.mockResolvedValue({ ok: true, status: 200 });

  vi.stubEnv("VITE_LEADS_ENDPOINT", TEST_ENDPOINT);
  vi.stubGlobal("fetch", fetchMock);

  return {
    sent: () => {
      const call = fetchMock.mock.calls.at(-1);
      return call ? (JSON.parse(call[1].body) as SentLead) : null;
    },
    restore: () => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    },
  };
}
