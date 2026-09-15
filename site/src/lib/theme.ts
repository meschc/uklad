import { useCallback, useEffect, useState } from "react";

/**
 * Тема витрины. Приложение хранит её в профиле, у витрины профиля нет —
 * поэтому выбор живёт в браузере, а по умолчанию берётся системный.
 */
const KEY = "uklad-site-theme";

export type Theme = "light" | "dark";

function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => readStored() ?? systemTheme());

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.classList.toggle("light", theme === "light");
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(KEY, next);
      } catch {
        // Выбор не сохранился — в этой сессии тема всё равно переключилась.
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
