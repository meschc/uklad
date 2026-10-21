import { useEffect, useState } from "react";

/**
 * Текущее время, обновляемое раз в полминуты. Часы смены и срок входа по
 * бейджу идут сами, без действий человека, — экран обязан это видеть.
 */
export function useNow(stepMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), stepMs);
    return () => window.clearInterval(id);
  }, [stepMs]);
  return now;
}

export function formatTime(at: number, lang: string): string {
  return new Date(at).toLocaleTimeString(lang === "en" ? "en-GB" : "ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Номер заказа для глаз: хвост id, как на этикетке. */
export function shortId(id: string | undefined): string {
  return id ? id.slice(-6).toUpperCase() : "";
}
