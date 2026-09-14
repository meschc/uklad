// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ChatMessage, Partner, UserRole } from "@/lib/types";
import { ChatThread } from "../ChatThread";

/**
 * Лента переписки в кабинете.
 *
 * Проверяем здесь одно свойство, и оно не про вёрстку: в прототипе собеседник
 * отвечает сам через несколько секунд (`useChatDemoReply`), и человек, которому
 * показывают систему, обязан узнать об этом из экрана, а не из комментария в
 * коде, который он никогда не откроет. Без пометки единственный доступный ему
 * вывод — «склады на Укладе отвечают за семь секунд», и этот вывод он унесёт с
 * собой.
 *
 * Когда появится сервер, `useChatDemoReply` и `ChatDemoNote` удаляются парой —
 * и этот тест уходит вместе с ними.
 */
const PARTNER: Partner = { id: "p-1", name: "Ромашка", contact: "+7 900 000-00-00" };

const MESSAGES: ChatMessage[] = [
  { id: "m-1", from: "seller", text: "Во сколько у вас приёмка?", at: 1_757_000_000_000 },
];

/**
 * Роль вынесена в переменную, а не написана в разметке строкой: `role` у
 * `ChatThread` — это сторона переписки, но правило `jsx-a11y/aria-role` видит
 * атрибут с таким именем и требует от него настоящую ARIA-роль.
 */
const ROLE: UserRole = "warehouse";

describe("ChatThread — честность демо-режима", () => {
  test("лента сразу говорит, что ответ собеседника приходит сам", () => {
    // Arrange · Act
    render(<ChatThread partner={PARTNER} messages={MESSAGES} role={ROLE} />);

    // Assert
    expect(screen.getByText("Демо-режим")).toBeInTheDocument();
    expect(screen.getByText(/ответ приходит сам/i)).toBeInTheDocument();
  });
});
