// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import {
  closeDialog,
  logout,
  port,
  resetRoadmapStore,
  submitIdea,
  toggleVote,
  useRoadmap,
  verifyCode,
} from "../store";
import { renderHook, act, waitFor } from "@testing-library/react";

/**
 * Сценарий дорожной карты на локальном порту: голос без входа ведёт ко входу,
 * после входа ставится сам; неверный код не пускает; идея уходит только от
 * вошедшего. Эти обещания даны человеку на странице — их и проверяем.
 */

const EMAIL = "sklad@example.ru";

async function login(): Promise<void> {
  const res = await port.requestCode(EMAIL, { data: true, ads: false });
  if (!res.ok || !res.data.devCode) throw new Error("код не выдан");
  await act(async () => {
    expect(await verifyCode(EMAIL, res.data.devCode!)).toBeNull();
  });
}

beforeEach(() => {
  localStorage.clear();
  resetRoadmapStore();
});

describe("дорожная карта", () => {
  test("голос без входа открывает вход, а после входа засчитывается сам", async () => {
    const { result } = renderHook(() => useRoadmap());

    act(() => toggleVote("database"));
    expect(result.current.dialog).toEqual({ kind: "login" });
    expect(result.current.counts.database ?? 0).toBe(0);

    await login();

    await waitFor(() => expect(result.current.counts.database).toBe(1));
    expect(result.current.mine.has("database")).toBe(true);
    expect(result.current.dialog).toBeNull();
  });

  test("повторное нажатие снимает голос", async () => {
    const { result } = renderHook(() => useRoadmap());
    await login();

    act(() => toggleVote("database"));
    await waitFor(() => expect(result.current.counts.database).toBe(1));
    act(() => toggleVote("database"));
    await waitFor(() => expect(result.current.counts.database).toBe(0));
    expect(result.current.mine.has("database")).toBe(false);
  });

  test("неверный код не пускает", async () => {
    renderHook(() => useRoadmap());
    await port.requestCode(EMAIL, { data: true, ads: false });

    expect(await verifyCode(EMAIL, "000000")).toBe("code");
  });

  test("идея без входа не уходит, после входа — видна автору на рассмотрении", async () => {
    const { result } = renderHook(() => useRoadmap());
    expect(await submitIdea({ title: "Печать пачкой", details: "", track: null })).toBe("auth");

    await login();
    await act(async () => {
      await submitIdea({ title: "Печать пачкой", details: "", track: "plan" });
    });

    expect(result.current.ideas[0]).toMatchObject({ title: "Печать пачкой", status: "review" });
  });

  test("выход стирает свои голоса с экрана, но не чужие счётчики", async () => {
    const { result } = renderHook(() => useRoadmap());
    await login();
    act(() => toggleVote("rights"));
    await waitFor(() => expect(result.current.counts.rights).toBe(1));

    act(() => {
      logout();
      closeDialog();
    });

    expect(result.current.mine.size).toBe(0);
    expect(result.current.counts.rights).toBe(1);
  });
});
